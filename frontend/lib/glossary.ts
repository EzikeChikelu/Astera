/**
 * Single source of truth for Stellar/Soroban terminology shown across the
 * app (inline tooltips + the /glossary page). Add a new term by adding an
 * entry here — no other file needs to change.
 */
export interface GlossaryEntry {
  /** Stable identifier used for lookups and #anchors on /glossary. */
  id: string;
  term: string;
  definition: string;
}

export const glossary: GlossaryEntry[] = [
  {
    id: 'stroops',
    term: 'Stroops',
    definition:
      'The smallest unit of XLM (like satoshis for Bitcoin). 1 XLM = 10,000,000 stroops. Token amounts on Stellar are stored and moved in stroops under the hood, even when the UI shows a rounded amount.',
  },
  {
    id: 'ledger',
    term: 'Ledger',
    definition:
      "A single block in Stellar's blockchain. A new ledger closes roughly every 5 seconds, and every transaction is recorded in exactly one ledger.",
  },
  {
    id: 'horizon',
    term: 'Horizon',
    definition:
      "Stellar's API server for querying blockchain data — account balances, transaction history, and ledger info. Astera's frontend talks to Horizon (or a compatible RPC) to read on-chain state.",
  },
  {
    id: 'soroban',
    term: 'Soroban',
    definition:
      "Stellar's smart contract platform. Astera's pool, invoice, and governance logic run as Soroban contracts, similar to how Ethereum uses the EVM.",
  },
  {
    id: 'ttl',
    term: 'TTL',
    definition:
      'Time-to-live: how long a piece of data stays stored on-chain before it needs to be renewed ("bumped") to avoid archival. Soroban contract data can expire if its TTL runs out.',
  },
  {
    id: 'collateral-ratio',
    term: 'Collateral Ratio',
    definition:
      'The value of the collateral you have posted compared to the amount you borrowed against an invoice. A higher ratio means more security for lenders and a larger cushion for the borrower.',
  },
  {
    id: 'factoring-fee',
    term: 'Factoring Fee',
    definition:
      "The protocol's fee for facilitating invoice financing — the cost of getting paid early on an invoice, deducted from the amount funded.",
  },
];

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return glossary.find((entry) => entry.id === id);
}
