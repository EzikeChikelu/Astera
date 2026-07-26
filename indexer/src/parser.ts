/**
 * Parse Stellar Horizon events into structured Astera event records.
 */

export interface IndexedEvent {
  id: string;
  contractId: string;
  eventType: string;
  topic: string[];
  value: any;
  actor: string | null;
  ledgerSequence: number;
  ledgerCloseAt: string;
  txHash: string;
  createdAt: string;
}

export function parseEvents(records: any[]): IndexedEvent[] {
  const events: IndexedEvent[] = [];

  for (const record of records) {
    try {
      if (record.type !== 'contract') continue;

      const topic = parseTopic(record);
      if (!topic) continue;

      const [contractType, eventType] = topic;

      const value = parseValue(record);
      events.push({
        id: record.id || `${record.paging_token}`,
        contractId: record.contract || '',
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

  return null;
}
