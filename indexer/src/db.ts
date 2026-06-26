/**
 * SQLite database for storing indexed Soroban events.
 */

import Database from 'better-sqlite3';
import { IndexedEvent } from './parser';

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
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
  `);

  // #700: migration for pre-existing deployments that lack contract_type.
  const cols = db.prepare(`PRAGMA table_info(events)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'contract_type')) {
    db.exec(`ALTER TABLE events ADD COLUMN contract_type TEXT NOT NULL DEFAULT 'unknown'`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_contract_type ON events(contract_type)`);
  }

  return db;
}

export function storeEvents(db: Database.Database, events: IndexedEvent[]): void {
  if (events.length === 0) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, contract_id, contract_type, event_type, topic, value, ledger_sequence, ledger_close_at, tx_hash, created_at)
    VALUES
      (@id, @contractId, @contractType, @eventType, @topic, @value, @ledgerSequence, @ledgerCloseAt, @txHash, @createdAt)
  `);

  const insertMany = db.transaction((events: IndexedEvent[]) => {
    for (const event of events) {
      stmt.run({
        id: event.id,
        contractId: event.contractId,
        contractType: event.contractType || 'unknown',
        eventType: event.eventType,
        topic: JSON.stringify(event.topic),
        value: JSON.stringify(event.value),
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
    limit?: number;
    offset?: number;
  } = {}
): IndexedEvent[] {
  const { contractId, contractType, eventType, limit = 50, offset = 0 } = options;

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
