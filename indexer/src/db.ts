/**
 * SQLite database for storing indexed Soroban events.
 */

import Database from "better-sqlite3";
import { IndexedEvent } from "./parser";

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
];

function runMigrationsFrom(db: Database.Database, fromVersion: number): void {
  const toVersion = MIGRATIONS.length;

  for (let i = fromVersion; i < toVersion; i++) {
    const migration = MIGRATIONS[i];
    db.exec(migration());
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(i + 1);
  }
}

export function initDb(dbPath: string): Database.Database {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 1000;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const db = new Database(dbPath);

      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");

      db.exec(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
      );

      const versionRow = db
        .prepare("SELECT MAX(version) as v FROM schema_version")
        .get() as { v: number | null } | undefined;
      const currentVersion = versionRow?.v ?? 0;

      runMigrationsFrom(db, currentVersion);

      console.log(
        `[db] Database initialized successfully (attempt ${attempt}/${MAX_RETRIES})`,
      );
      return db;
    } catch (error: any) {
      lastError = error;
      console.error(
        `[db] Failed to initialize database (attempt ${attempt}/${MAX_RETRIES}):`,
        error.message,
      );

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`[db] Retrying in ${delay}ms...`);
        const sleepUntil = Date.now() + delay;
        while (Date.now() < sleepUntil) {
          // Busy wait for synchronous sleep
        }
      }
    }
  }

  throw new Error(
    `[db] Failed to initialize database after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}

export function withDbReconnect<T>(
  db: Database.Database,
  operation: (db: Database.Database) => T,
  dbPath: string,
): T {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return operation(db);
    } catch (error: any) {
      const isDbError =
        error.message?.includes("database") ||
        error.message?.includes("SQLITE") ||
        error.code === "SQLITE_BUSY" ||
        error.code === "SQLITE_LOCKED";

      if (isDbError && attempt < MAX_RETRIES) {
        console.error(
          `[db] Database operation failed (attempt ${attempt}/${MAX_RETRIES}):`,
          error.message,
        );
        console.log(`[db] Attempting to reconnect...`);

        try {
          db.close();
        } catch (closeError) {
          console.error("[db] Error closing database:", closeError);
        }

        const delay = RETRY_DELAY_MS * attempt;
        const sleepUntil = Date.now() + delay;
        while (Date.now() < sleepUntil) {
          // Busy wait
        }

        try {
          db = initDb(dbPath);
          console.log("[db] Reconnected successfully");
        } catch (reconnectError: any) {
          console.error("[db] Reconnection failed:", reconnectError.message);
          if (attempt === MAX_RETRIES) {
            throw reconnectError;
          }
        }
      } else {
        throw error;
      }
    }
  }

  throw new Error("[db] Operation failed after all retry attempts");
}

export function storeEvents(
  db: Database.Database,
  events: IndexedEvent[],
): void {
  if (events.length === 0) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, contract_id, contract_type, event_type, topic, value, actor_address, ledger_sequence, ledger_close_at, tx_hash, created_at)
    VALUES
      (@id, @contractId, @contractType, @eventType, @topic, @value, @actorAddress, @ledgerSequence, @ledgerCloseAt, @txHash, @createdAt)  `);

  const insertMany = db.transaction((events: IndexedEvent[]) => {
    let inserted = 0;
    let skipped = 0;

    for (const event of events) {
      const result = stmt.run({
        id: event.id,
        contractId: event.contractId,
        contractType: event.contractType || "unknown",
        eventType: event.eventType,
        topic: JSON.stringify(event.topic),
        value: JSON.stringify(event.value),
        actorAddress: event.actor,
        ledgerSequence: event.ledgerSequence,
        ledgerCloseAt: event.ledgerCloseAt,
        txHash: event.txHash,
        createdAt: event.createdAt,
      });

      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    if (skipped > 0) {
      console.log(`[db] Deduplicated ${skipped} events (${inserted} new)`);
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
  } = {},
): IndexedEvent[] {
  const {
    contractId,
    contractType,
    eventType,
    actorAddress,
    limit = 50,
    offset = 0,
  } = options;

  let query = "SELECT * FROM events WHERE 1=1";
  const params: any[] = [];

  if (contractId) {
    query += " AND contract_id = ?";
    params.push(contractId);
  }

  if (contractType) {
    query += " AND contract_type = ?";
    params.push(contractType);
  }

  if (eventType) {
    query += " AND event_type = ?";
    params.push(eventType);
  }

  if (actorAddress) {
    query += " AND actor_address = ?";
    params.push(actorAddress);
  }

  query += " ORDER BY ledger_sequence DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    contractType: (row.contract_type ||
      "unknown") as IndexedEvent["contractType"],
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
  const row = db
    .prepare(
      "SELECT ledger_sequence FROM events ORDER BY ledger_sequence DESC LIMIT 1",
    )
    .get() as { ledger_sequence: number } | undefined;

  return row ? row.ledger_sequence.toString() : null;
}
