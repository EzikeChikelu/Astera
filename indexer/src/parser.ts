/**
 * Parse Stellar Horizon events into structured Astera event records.
 */

/**
 * Logical category of the source contract for an indexed event. Used to
 * route credit_score events (#700) separately from invoice/pool events so
 * the REST API can filter by contract type.
 */
export type ContractType =
  | 'invoice'
  | 'pool'
  | 'credit_score'
  | 'oracle_registry'
  | 'compliance'
  | 'tranche'
  | 'unknown';

export interface IndexedEvent {
  id: string;
  contractId: string;
  contractType: ContractType;
  eventType: string;
  topic: string[];
  value: any;
  actor: string | null;
  ledgerSequence: number;
  ledgerCloseAt: string;
  txHash: string;
  createdAt: string;
}

const CREDIT_SCORE_CONTRACT_ID = (process.env.CREDIT_SCORE_CONTRACT_ID || '').trim();
const INVOICE_CONTRACT_ID = (process.env.INVOICE_CONTRACT_ID || '').trim();
const POOL_CONTRACT_ID = (process.env.POOL_CONTRACT_ID || '').trim();
// #861: N-of-M staked oracle consensus network
const ORACLE_REGISTRY_CONTRACT_ID = (process.env.ORACLE_REGISTRY_CONTRACT_ID || '').trim();
// #867: on-chain compliance / sanctions screening registry
const COMPLIANCE_CONTRACT_ID = (process.env.COMPLIANCE_CONTRACT_ID || '').trim();
// #862: invoice tranching (senior/junior) with waterfall repayment and loss allocation
const TRANCHE_CONTRACT_ID = (process.env.TRANCHE_CONTRACT_ID || '').trim();

// #861: oracle_registry contract emits these event subtypes under the
// "ORACLE" topic (see `EVT` in contracts/oracle_registry/src/lib.rs).
const ORACLE_REGISTRY_EVENT_TYPES = new Set([
  'registrd',
  'dreg_req',
  'dreg_done',
  'slashed',
  'rnd_open',
  'voted',
  'consensus',
  'rnd_exp',
  'fallback',
  'inv_set',
  'cfg_upd',
  'paused',
  'unpaused',
]);

// #867: compliance contract emits under the "COMPLY" topic
const COMPLIANCE_EVENT_TYPES = new Set([
  'screened',
  'review',
  'scr_prop',
  'scr_reg',
  'scr_del',
  'scr_can',
  'int_set',
  'tl_set',
  'paused',
  'unpaused',
]);

// #862: tranche contract emits these event subtypes under the "TRANCHE" topic
const TRANCHE_EVENT_TYPES = new Set([
  'deposit',
  'withdraw',
  'fund',
  'repay',
  'default',
  'config',
]);

// #700: credit_score contract emits these event subtypes under the "CREDIT" topic
const CREDIT_SCORE_EVENT_TYPES = new Set([
  'payment',
  'default',
  'score_cfg',
  'thresh',
  'lt_upd',
  'hist_upd',
  // #868: external attestations + dispute mechanism
  'att_reg',
  'att_deact',
  'att_sub',
  'att_disp',
  'att_res',
]);

function classifyContract(contractId: string, contractType: string, eventType: string): ContractType {
  if (CREDIT_SCORE_CONTRACT_ID && contractId === CREDIT_SCORE_CONTRACT_ID) {
    return 'credit_score';
  }
  if (INVOICE_CONTRACT_ID && contractId === INVOICE_CONTRACT_ID) {
    return 'invoice';
  }
  if (POOL_CONTRACT_ID && contractId === POOL_CONTRACT_ID) {
    return 'pool';
  }
  if (ORACLE_REGISTRY_CONTRACT_ID && contractId === ORACLE_REGISTRY_CONTRACT_ID) {
    return 'oracle_registry';
  }
  if (COMPLIANCE_CONTRACT_ID && contractId === COMPLIANCE_CONTRACT_ID) {
    return 'compliance';
  }
  if (TRANCHE_CONTRACT_ID && contractId === TRANCHE_CONTRACT_ID) {
    return 'tranche';
  }
  // Fallback: infer from topic. credit_score events publish under "CREDIT",
  // oracle_registry events publish under "ORACLE" (#861),
  // compliance events publish under "COMPLY" (#867),
  // tranche events publish under "TRANCHE" (#862).
  if (contractType === 'CREDIT' || CREDIT_SCORE_EVENT_TYPES.has(eventType)) {
    return 'credit_score';
  }
  if (contractType === 'ORACLE' || ORACLE_REGISTRY_EVENT_TYPES.has(eventType)) {
    return 'oracle_registry';
  }
  if (contractType === 'COMPLY' || COMPLIANCE_EVENT_TYPES.has(eventType)) {
    return 'compliance';
  }
  if (contractType === 'TRANCHE' || TRANCHE_EVENT_TYPES.has(eventType)) {
    return 'tranche';
  }
  if (contractType === 'invoice') return 'invoice';
  if (contractType === 'pool') return 'pool';
  return 'unknown';
}

export function parseEvents(records: any[]): IndexedEvent[] {
  const events: IndexedEvent[] = [];

  for (const record of records) {
    try {
      if (record.type !== 'contract') continue;

      const topic = parseTopic(record);
      if (!topic) continue;

      const [contractType, eventType] = topic;
      const contractId = record.contract || '';

      const value = parseValue(record);
      events.push({
        id: record.id || `${record.paging_token}`,
        contractId,
        contractType: classifyContract(contractId, contractType, eventType || ''),
        eventType: eventType || 'unknown',
        topic: [contractType, eventType],
        value,
        actor: extractActor(contractType, eventType, value),
        ledgerSequence: record.ledger_sequence || 0,
        ledgerCloseAt: record.created_at || new Date().toISOString(),
        txHash: record.transaction_hash || '',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[parser] Failed to parse event:', err);
    }
  }

  return events;
}

function parseTopic(record: any): [string, string] | null {
  try {
    const topic = record.contract?.[0]?.topic;
    if (!topic || !Array.isArray(topic) || topic.length < 2) return null;
    // Topics are base64-encoded xdr.ScVal
    // For simplicity, we expect the topic to be an array of strings
    return [topic[0], topic[1]];
  } catch {
    return null;
  }
}

function parseValue(record: any): any {
  try {
    return record.contract?.[0]?.value || null;
  } catch {
    return null;
  }
}

/**
 * Extract the actor/caller address from event value based on event type.
 * The actor is always the first field in the value tuple for action events.
 */
function extractActor(contractType: string, eventType: string, value: any): string | null {
  if (!value || !Array.isArray(value) || value.length === 0) return null;

  // Pool action events: first field is the actor address
  if (contractType === 'POOL') {
    switch (eventType) {
      case 'deposit':
      case 'withdraw':
      case 'repaid':
      case 'part_pay':
      case 'yld_claim':
      case 'wd_full':
      case 'wd_queue':
      case 'wd_cncl':
      case 'col_dep':
        return value[0];
    }
  }

  // Invoice action events: first field is often the actor
  if (contractType === 'INVOICE') {
    switch (eventType) {
      case 'created':
        return value[1]; // owner
      case 'funded':
      case 'paid':
      case 'cancelled':
      case 'resolved':
        return value[1]; // caller/pool
      case 'paused':
      case 'unpaused':
        return value[0]; // admin
    }
  }

  // Credit score events: first field is the caller
  if (contractType === 'CREDIT') {
    switch (eventType) {
      case 'payment':
      case 'default':
        return value[0]; // caller
    }
  }

  // Tranche events: first field is usually the actor
  if (contractType === 'TRANCHE') {
    switch (eventType) {
      case 'deposit':
      case 'withdraw':
      case 'fund':
      case 'repay':
      case 'default':
        return value[0]; // investor or caller
      case 'config':
        return value[0]; // admin
    }
  }

  return null;
}
