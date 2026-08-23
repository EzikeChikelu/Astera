/**
 * Postgres database layer for storing indexed Soroban events.
 *
 * Replaces the previous SQLite/better-sqlite3 layer (a single-writer file
 * database with a hand-rolled migration array) so the indexer can run
 * against a real Postgres instance with concurrent readers/writers, proper
 * migrations (see migrations/, run via node-pg-migrate), and a backfill
 * process that can run alongside the live-tail poller without contending
 * for writes (both write through INSERT ... ON CONFLICT DO NOTHING, so
 * concurrent inserts of the same event just dedupe).
 */

import path from "path";
import { Pool, PoolConfig } from "pg";
import { IndexedEvent } from "./parser";
import { logger } from "./logger";

export function createPool(config?: PoolConfig): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.PG_POOL_MAX || "10", 10),
    ...config,
  });

  pool.on("error", (err) => {
    logger.error({ err }, "[db] Unexpected error on idle Postgres client");
  });

  return pool;
}

/**
 * Applies all pending migrations in migrations/ using node-pg-migrate's
 * programmatic runner. Safe to call on every startup — it's a no-op once the
 * schema is current.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const runner = require("node-pg-migrate").default;

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runner({
        databaseUrl: connectionString,
        dir: path.join(__dirname, "..", "migrations"),
        direction: "up",
        migrationsTable: "pgmigrations",
        log: (msg: string) => logger.info(msg),
      });
      logger.info("[db] Migrations applied successfully");
      return;
    } catch (error) {
      lastError = error;
      logger.error(
        { err: error, attempt, maxRetries: MAX_RETRIES },
        "[db] Failed to run migrations",
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt),
        );
      }
    }
  }

  throw new Error(
    `[db] Failed to run migrations after ${MAX_RETRIES} attempts: ${lastError}`,
  );
}

export async function storeEvents(
  pool: Pool,
  events: IndexedEvent[],
): Promise<{ inserted: number; skipped: number }> {
  if (events.length === 0) return { inserted: 0, skipped: 0 };

  const ids = events.map((e) => e.id);
  const contractIds = events.map((e) => e.contractId);
  const contractTypes = events.map((e) => e.contractType || "unknown");
  const eventTypes = events.map((e) => e.eventType);
  const topics = events.map((e) => JSON.stringify(e.topic));
  const values = events.map((e) =>
    e.value === undefined ? null : JSON.stringify(e.value),
  );
  const actors = events.map((e) => e.actor);
  const ledgerSequences = events.map((e) => e.ledgerSequence);
  const ledgerCloseAts = events.map((e) => e.ledgerCloseAt);
  const txHashes = events.map((e) => e.txHash);
  const createdAts = events.map((e) => e.createdAt);

  const result = await pool.query(
    `INSERT INTO events
       (id, contract_id, contract_type, event_type, topic, value, actor_address, ledger_sequence, ledger_close_at, tx_hash, created_at)
     SELECT * FROM UNNEST(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::jsonb[], $6::jsonb[],
       $7::text[], $8::bigint[], $9::timestamptz[], $10::text[], $11::timestamptz[]
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      ids,
      contractIds,
      contractTypes,
      eventTypes,
      topics,
      values,
      actors,
      ledgerSequences,
      ledgerCloseAts,
      txHashes,
      createdAts,
    ],
  );

  const inserted = result.rowCount ?? 0;
  const skipped = events.length - inserted;
  if (skipped > 0) {
    logger.info({ inserted, skipped }, "[db] Deduplicated events");
  }

  return { inserted, skipped };
}

export interface GetEventsOptions {
  contractId?: string;
  contractType?: string;
  eventType?: string;
  actorAddress?: string;
  limit?: number;
  offset?: number;
  /** Cursor pagination: only events after this ledger, ordered ascending. */
  afterLedger?: number;
  beforeLedger?: number;
}

export async function getEvents(
  pool: Pool,
  options: GetEventsOptions = {},
): Promise<IndexedEvent[]> {
  const {
    contractId,
    contractType,
    eventType,
    actorAddress,
    limit = 50,
    offset = 0,
    afterLedger,
    beforeLedger,
  } = options;

  const clauses: string[] = [];
  const params: any[] = [];

  const addClause = (column: string, value: any) => {
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  };

  if (contractId) addClause("contract_id", contractId);
  if (contractType) addClause("contract_type", contractType);
  if (eventType) addClause("event_type", eventType);
  if (actorAddress) addClause("actor_address", actorAddress);
  if (afterLedger !== undefined) {
    params.push(afterLedger);
    clauses.push(`ledger_sequence > $${params.length}`);
  }
  if (beforeLedger !== undefined) {
    params.push(beforeLedger);
    clauses.push(`ledger_sequence < $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // Cursor pagination (afterLedger) reads oldest-to-newest so callers can
  // page forward through new events; everything else keeps the original
  // newest-first ordering.
  const order =
    afterLedger !== undefined
      ? "ORDER BY ledger_sequence ASC"
      : "ORDER BY ledger_sequence DESC";

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT * FROM events ${where} ${order} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  return rows.map(rowToEvent);
}

function rowToEvent(row: any): IndexedEvent {
  return {
    id: row.id,
    contractId: row.contract_id,
    contractType: (row.contract_type || "unknown") as IndexedEvent["contractType"],
    eventType: row.event_type,
    topic: row.topic,
    value: row.value,
    actor: row.actor_address,
    ledgerSequence: Number(row.ledger_sequence),
    ledgerCloseAt:
      row.ledger_close_at instanceof Date
        ? row.ledger_close_at.toISOString()
        : row.ledger_close_at,
    txHash: row.tx_hash,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

export async function getLatestLedger(pool: Pool): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT ledger_sequence FROM events ORDER BY ledger_sequence DESC LIMIT 1",
  );
  return rows[0] ? String(rows[0].ledger_sequence) : null;
}

// #862: historical realized APY per tranche per token.
//
// Each closed invoice contributes to the trailing realized yield of both
// tranches. From the indexed tranche events we reconstruct, per invoice:
//   fund   -> (invoice_id, token, senior_deployed, junior_deployed)
//   repay  -> (invoice_id, token, senior_payout,   junior_payout)
//   default-> (invoice_id, token, junior_loss,     senior_loss)
// Realized return for a tranche on an invoice is payout - deployed (a repaid
// invoice), or -loss (a defaulted invoice). Aggregated across every closed
// invoice for a token, realized_return / realized_principal is the trailing
// realized yield; we annualize crudely to basis points assuming the sampled
// invoices represent roughly one turnover. Callers wanting a time-weighted
// figure can derive it from the raw fields, which are exposed as strings to
// preserve i128 precision.
export interface TrancheApyRow {
  token: string;
  trancheClass: "Senior" | "Junior";
  realizedPrincipal: bigint;
  realizedReturn: bigint;
  closedPositions: number;
  realizedApyBps: number;
  updatedAt: string;
}

function toBigInt(v: unknown): bigint {
  try {
    return BigInt(String(v ?? 0));
  } catch {
    return 0n;
  }
}

/**
 * Recompute the tranche_apy table from scratch off the indexed tranche event
 * stream. Idempotent: safe to call after every ingest batch.
 */
export async function recomputeTrancheApy(
  pool: Pool,
  updatedAt: string,
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE contract_type = 'tranche' ORDER BY ledger_sequence ASC LIMIT 100000`,
  );
  const ordered = rows.map(rowToEvent);

  // token -> tranche -> accumulator
  type Acc = { principal: bigint; ret: bigint; closed: number };
  const agg = new Map<string, { Senior: Acc; Junior: Acc }>();
  const bucket = (token: string) => {
    let b = agg.get(token);
    if (!b) {
      b = {
        Senior: { principal: 0n, ret: 0n, closed: 0 },
        Junior: { principal: 0n, ret: 0n, closed: 0 },
      };
      agg.set(token, b);
    }
    return b;
  };

  // Deployed principal per invoice, from `fund` events, so repay/default can
  // net against it.
  const deployed = new Map<
    string,
    { token: string; senior: bigint; junior: bigint }
  >();

  for (const evt of ordered) {
    const v = evt.value;
    if (!Array.isArray(v) || v.length < 4) continue;
    const invoiceId = String(v[0]);
    const token = typeof v[1] === "string" ? v[1] : String(v[1]);

    switch (evt.eventType) {
      case "fund": {
        deployed.set(invoiceId, {
          token,
          senior: toBigInt(v[2]),
          junior: toBigInt(v[3]),
        });
        break;
      }
      case "repay": {
        const dep = deployed.get(invoiceId);
        if (!dep) break;
        const b = bucket(token);
        b.Senior.principal += dep.senior;
        b.Senior.ret += toBigInt(v[2]) - dep.senior;
        b.Senior.closed += 1;
        b.Junior.principal += dep.junior;
        b.Junior.ret += toBigInt(v[3]) - dep.junior;
        b.Junior.closed += 1;
        deployed.delete(invoiceId);
        break;
      }
      case "default": {
        const dep = deployed.get(invoiceId);
        const b = bucket(token);
        // default value tuple is (invoice_id, token, junior_loss, senior_loss)
        const juniorLoss = toBigInt(v[2]);
        const seniorLoss = toBigInt(v[3]);
        b.Junior.principal += dep ? dep.junior : juniorLoss;
        b.Junior.ret += -juniorLoss;
        b.Junior.closed += 1;
        b.Senior.principal += dep ? dep.senior : seniorLoss;
        b.Senior.ret += -seniorLoss;
        b.Senior.closed += 1;
        deployed.delete(invoiceId);
        break;
      }
      default:
        break;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [token, b] of agg) {
      for (const cls of ["Senior", "Junior"] as const) {
        const acc = b[cls];
        const apyBps =
          acc.principal > 0n ? Number((acc.ret * 10_000n) / acc.principal) : 0;
        await client.query(
          `INSERT INTO tranche_apy
             (token, tranche_class, realized_principal, realized_return, closed_positions, realized_apy_bps, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (token, tranche_class) DO UPDATE SET
             realized_principal = $3,
             realized_return = $4,
             closed_positions = $5,
             realized_apy_bps = $6,
             updated_at = $7`,
          [
            token,
            cls,
            acc.principal.toString(),
            acc.ret.toString(),
            acc.closed,
            apyBps,
            updatedAt,
          ],
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getTrancheApy(
  pool: Pool,
  token?: string,
): Promise<TrancheApyRow[]> {
  const params: any[] = [];
  let query = "SELECT * FROM tranche_apy";
  if (token) {
    query += " WHERE token = $1";
    params.push(token);
  }
  query += " ORDER BY token, tranche_class";

  const { rows } = await pool.query(query, params);
  return rows.map((r) => ({
    token: r.token,
    trancheClass: r.tranche_class,
    realizedPrincipal: toBigInt(r.realized_principal),
    realizedReturn: toBigInt(r.realized_return),
    closedPositions: r.closed_positions,
    realizedApyBps: r.realized_apy_bps,
    updatedAt:
      r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  }));
}
