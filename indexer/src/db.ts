/**
 * SQLite database for storing indexed Soroban events.
 */

import Database from 'better-sqlite3';
import { IndexedEvent } from './parser';

const MIGRATIONS = [
  // v1: Initial schema
  () => {
    return `
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        contract_type TEXT NOT NULL DEFAULT 'unknown',
        event_type TEXT NOT NULL,
        topic TEXT NOT NULL,
        value TEXT,
        ledger_sequence INTEGER NOT NULL,
        ledger_close_at TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_contract
        ON events(contract_id);
      CREATE INDEX IF NOT EXISTS idx_events_type
        ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_ledger
        ON events(ledger_sequence);
      CREATE INDEX IF NOT EXISTS idx_events_contract_type
        ON events(contract_type);
    `;
  },
  // #862: derived table for historical realized APY per tranche per token.
  // Recomputed from indexed tranche fund/repay/default events (see
  // recomputeTrancheApy). One row per (token, tranche_class).
  () => {
    return `
      CREATE TABLE IF NOT EXISTS tranche_apy (
        token TEXT NOT NULL,
        tranche_class TEXT NOT NULL,
        realized_principal TEXT NOT NULL DEFAULT '0',
        realized_return TEXT NOT NULL DEFAULT '0',
        closed_positions INTEGER NOT NULL DEFAULT 0,
        realized_apy_bps INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (token, tranche_class)
      );
    `;
  },
];

function runMigrationsFrom(db: Database.Database, fromVersion: number): void {
  const toVersion = MIGRATIONS.length;

  for (let i = fromVersion; i < toVersion; i++) {
    const migration = MIGRATIONS[i];
    db.exec(migration());
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
  }
}

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');

  const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null } | undefined;
  const currentVersion = versionRow?.v ?? 0;

  runMigrationsFrom(db, currentVersion);

  return db;
}

export function storeEvents(db: Database.Database, events: IndexedEvent[]): void {
  if (events.length === 0) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, contract_id, contract_type, event_type, topic, value, actor_address, ledger_sequence, ledger_close_at, tx_hash, created_at)
    VALUES
      (@id, @contractId, @contractType, @eventType, @topic, @value, @actorAddress, @ledgerSequence, @ledgerCloseAt, @txHash, @createdAt)  `);

  const insertMany = db.transaction((events: IndexedEvent[]) => {
    for (const event of events) {
      stmt.run({
        id: event.id,
        contractId: event.contractId,
        contractType: event.contractType || 'unknown',
        eventType: event.eventType,
        topic: JSON.stringify(event.topic),
        value: JSON.stringify(event.value),
        actorAddress: event.actor,
        ledgerSequence: event.ledgerSequence,
        ledgerCloseAt: event.ledgerCloseAt,
        txHash: event.txHash,
        createdAt: event.createdAt,
      });
    }
  });

  insertMany(events);
}

export function getEvents(
  db: Database.Database,
  options: {
    contractId?: string;
    contractType?: string;
    eventType?: string;
    actorAddress?: string;
    limit?: number;
    offset?: number;
  } = {}
): IndexedEvent[] {
  const { contractId, contractType, eventType, actorAddress, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM events WHERE 1=1';
  const params: any[] = [];

  if (contractId) {
    query += ' AND contract_id = ?';
    params.push(contractId);
  }

  if (contractType) {
    query += ' AND contract_type = ?';
    params.push(contractType);
  }

  if (eventType) {
    query += ' AND event_type = ?';
    params.push(eventType);
  }

  if (actorAddress) {
    query += ' AND actor_address = ?';
    params.push(actorAddress);
  }

  query += ' ORDER BY ledger_sequence DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    contractType: (row.contract_type || 'unknown') as IndexedEvent['contractType'],
    eventType: row.event_type,
    topic: JSON.parse(row.topic),
    value: row.value ? JSON.parse(row.value) : null,
    actor: row.actor_address,
    ledgerSequence: row.ledger_sequence,
    ledgerCloseAt: row.ledger_close_at,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  }));
}

export function getLatestLedger(db: Database.Database): string | null {
  const row = db.prepare('SELECT ledger_sequence FROM events ORDER BY ledger_sequence DESC LIMIT 1').get() as
    | { ledger_sequence: number }
    | undefined;

  return row ? row.ledger_sequence.toString() : null;
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
  trancheClass: 'Senior' | 'Junior';
  realizedPrincipal: bigint;
  realizedReturn: bigint;
  closedPositions: number;
  realizedApyBps: number;
  updatedAt: string;
}

const TRANCHE_CLASS_LABEL: Record<number, 'Senior' | 'Junior'> = {
  0: 'Senior',
  1: 'Junior',
};

function trancheClassLabel(raw: unknown): 'Senior' | 'Junior' | null {
  if (raw === 'Senior' || raw === 'Junior') return raw;
  if (typeof raw === 'number' && raw in TRANCHE_CLASS_LABEL) return TRANCHE_CLASS_LABEL[raw];
  // soroban enum unit variants serialize as { Senior: [] } / ["Senior"]
  if (Array.isArray(raw) && (raw[0] === 'Senior' || raw[0] === 'Junior')) return raw[0];
  if (raw && typeof raw === 'object') {
    if ('Senior' in (raw as object)) return 'Senior';
    if ('Junior' in (raw as object)) return 'Junior';
  }
  return null;
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
export function recomputeTrancheApy(db: Database.Database, updatedAt: string): void {
  const rows = getEvents(db, { contractType: 'tranche', limit: 100_000, offset: 0 });

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
  const deployed = new Map<string, { token: string; senior: bigint; junior: bigint }>();

  // Process in chronological order so fund precedes its repay/default.
  const ordered = [...rows].sort((a, b) => a.ledgerSequence - b.ledgerSequence);

  for (const evt of ordered) {
    const v = evt.value;
    if (!Array.isArray(v) || v.length < 4) continue;
    const invoiceId = String(v[0]);
    const token = typeof v[1] === 'string' ? v[1] : String(v[1]);

    switch (evt.eventType) {
      case 'fund': {
        deployed.set(invoiceId, {
          token,
          senior: toBigInt(v[2]),
          junior: toBigInt(v[3]),
        });
        break;
      }
      case 'repay': {
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
      case 'default': {
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

  const upsert = db.prepare(`
    INSERT INTO tranche_apy
      (token, tranche_class, realized_principal, realized_return, closed_positions, realized_apy_bps, updated_at)
    VALUES (@token, @trancheClass, @principal, @ret, @closed, @apyBps, @updatedAt)
    ON CONFLICT(token, tranche_class) DO UPDATE SET
      realized_principal = @principal,
      realized_return = @ret,
      closed_positions = @closed,
      realized_apy_bps = @apyBps,
      updated_at = @updatedAt
  `);

  const writeAll = db.transaction(() => {
    for (const [token, b] of agg) {
      for (const cls of ['Senior', 'Junior'] as const) {
        const acc = b[cls];
        const apyBps =
          acc.principal > 0n
            ? Number((acc.ret * 10_000n) / acc.principal)
            : 0;
        upsert.run({
          token,
          trancheClass: cls,
          principal: acc.principal.toString(),
          ret: acc.ret.toString(),
          closed: acc.closed,
          apyBps,
          updatedAt,
        });
      }
    }
  });
  writeAll();
}

export function getTrancheApy(
  db: Database.Database,
  token?: string,
): TrancheApyRow[] {
  let query = 'SELECT * FROM tranche_apy';
  const params: any[] = [];
  if (token) {
    query += ' WHERE token = ?';
    params.push(token);
  }
  query += ' ORDER BY token, tranche_class';
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    token: r.token,
    trancheClass: r.tranche_class,
    realizedPrincipal: toBigInt(r.realized_principal),
    realizedReturn: toBigInt(r.realized_return),
    closedPositions: r.closed_positions,
    realizedApyBps: r.realized_apy_bps,
    updatedAt: r.updated_at,
  }));
}
