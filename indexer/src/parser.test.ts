import assert from 'node:assert';
import { parseEvents } from './parser';

const TEST_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYCZTM6WPIXY6OROLET';

function runTests() {
  console.log('[indexer parser test] Running tests...');

  // Test 1: single-topic migration event
  const records1 = [
    {
      type: 'contract',
      id: '000000100',
      ledger_sequence: 12345,
      created_at: '2026-07-26T20:00:00Z',
      transaction_hash: 'txhash123',
      contract: [
        {
          topic: ['migrated'],
          value: [TEST_ADDRESS, 'v2.0.0'],
        },
      ],
    },
  ];

  const events1 = parseEvents(records1);
  assert.strictEqual(events1.length, 1);
  assert.deepStrictEqual(events1[0].topic, ['migrated', 'generic']);
  assert.strictEqual(events1[0].eventType, 'generic');
  assert.strictEqual(events1[0].actor, TEST_ADDRESS);

  // Test 2: object-shaped event emitted post-migration
  const records2 = [
    {
      type: 'contract',
      id: '000000101',
      ledger_sequence: 12346,
      created_at: '2026-07-26T20:01:00Z',
      transaction_hash: 'txhash456',
      contract: [
        {
          topic: ['INVOICE', 'created'],
          value: {
            id: 42,
            owner: TEST_ADDRESS,
            amount: '5000000000',
          },
        },
      ],
    },
  ];

  const events2 = parseEvents(records2);
  assert.strictEqual(events2.length, 1);
  assert.strictEqual(events2[0].eventType, 'created');
  assert.strictEqual(events2[0].actor, TEST_ADDRESS);

  // Test 3: tuple-shaped legacy event emitted pre-migration
  const records3 = [
    {
      type: 'contract',
      id: '000000102',
      ledger_sequence: 12347,
      created_at: '2026-07-26T20:02:00Z',
      transaction_hash: 'txhash789',
      contract: [
        {
          topic: ['POOL', 'deposit'],
          value: [TEST_ADDRESS, '1000000000', '1000', '1700000000'],
        },
      ],
    },
  ];

  const events3 = parseEvents(records3);
  assert.strictEqual(events3.length, 1);
  assert.strictEqual(events3[0].eventType, 'deposit');
  assert.strictEqual(events3[0].actor, TEST_ADDRESS);

  console.log('[indexer parser test] All parser tests passed!');
}

runTests();
