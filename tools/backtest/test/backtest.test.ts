import assert from 'node:assert';
import Database from 'better-sqlite3';
import { replay } from '../src/replay';
import { computePredictiveQuality } from '../src/metrics';

const SME_GOOD = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYCZTM6WPIXY6OROLET';
const SME_BAD = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

function makeFixtureDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      contract_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      topic TEXT NOT NULL,
      value TEXT,
      ledger_sequence INTEGER NOT NULL,
      ledger_close_at TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO events (id, contract_id, contract_type, event_type, topic, value, ledger_sequence, ledger_close_at, tx_hash, created_at)
    VALUES (@id, @contractId, @contractType, @eventType, @topic, @value, @ledgerSequence, @ledgerCloseAt, @txHash, @createdAt)
  `);

  let seq = 1;
  const row = (
    sme: string,
    eventType: 'payment' | 'default',
    invoiceId: number,
    status: string | null,
    score: number,
  ) => {
    const value =
      eventType === 'default'
        ? [sme, sme, invoiceId, score, 1_700_000_000]
        : [sme, sme, invoiceId, [status], score, 1_700_000_000];
    insert.run({
      id: `evt-${seq}`,
      contractId: 'CCREDIT',
      contractType: 'credit_score',
      eventType,
      topic: JSON.stringify(['CREDIT', eventType]),
      value: JSON.stringify(value),
      ledgerSequence: seq++,
      ledgerCloseAt: '2026-08-21T00:00:00Z',
      txHash: `tx-${seq}`,
      createdAt: '2026-08-21T00:00:00Z',
    });
  };

  // SME_GOOD: steady on-time payments, rising score, never defaults.
  row(SME_GOOD, 'payment', 1, 'PaidOnTime', 550);
  row(SME_GOOD, 'payment', 2, 'PaidOnTime', 580);
  row(SME_GOOD, 'payment', 3, 'PaidOnTime', 610);

  // SME_BAD: late payments, falling score, ends in default.
  row(SME_BAD, 'payment', 4, 'PaidLate', 480);
  row(SME_BAD, 'payment', 5, 'PaidLate', 450);
  row(SME_BAD, 'default', 6, null, 400);

  return db;
}

function runTests() {
  console.log('[backtest test] Running tests...');

  const db = makeFixtureDb();
  const trajectories = replay(db);

  assert.strictEqual(trajectories.length, 2);
  const good = trajectories.find((t) => t.sme === SME_GOOD)!;
  const bad = trajectories.find((t) => t.sme === SME_BAD)!;

  assert.ok(good, 'expected a trajectory for SME_GOOD');
  assert.strictEqual(good.everDefaulted, false);
  assert.strictEqual(good.scoreBeforeOutcome, 610);

  assert.ok(bad, 'expected a trajectory for SME_BAD');
  assert.strictEqual(bad.everDefaulted, true);
  assert.strictEqual(bad.scoreBeforeOutcome, 450, 'score from the sample before the default event');

  const quality = computePredictiveQuality(trajectories);
  assert.strictEqual(quality.cohortSize.defaulted, 1);
  assert.strictEqual(quality.cohortSize.nonDefaulted, 1);
  assert.strictEqual(
    quality.separationAuc,
    1.0,
    'the good cohort score (610) is strictly higher than the bad cohort score (450)',
  );

  console.log('[backtest test] All tests passed!');
}

runTests();
