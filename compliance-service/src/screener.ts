/**
 * #867: mock sanctions / watchlist screening.
 *
 * Ships a small bundled fixture list (OFAC-SDN-style address stubs) and a
 * pluggable interface so a real provider can be swapped in later.
 */

import type { RiskTier, ScreenDecision, ScreenResult } from './types';

/** Demo fixture — Stellar-like public keys used only for local testing. */
export const SANCTIONS_FIXTURE: ReadonlyArray<{ id: string; note: string }> = [
  { id: 'SANCTIONED_ENTITY_ALPHA', note: 'Demo SDN entry A' },
  { id: 'SANCTIONED_ENTITY_BETA', note: 'Demo SDN entry B' },
  { id: 'GBLOCKEDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', note: 'Demo blocked G-address prefix' },
];

export interface ScreenerProvider {
  screen(address: string, context?: ScreenContext): Promise<ScreenResult>;
}

export interface ScreenContext {
  /** Optional free-text name / jurisdiction for heuristic tiering. */
  name?: string;
  jurisdiction?: string;
  recentVolume?: bigint;
  debtorConcentrationBps?: number;
}

const REASON_CLEAR = 0;
const REASON_SANCTIONS_HIT = 9001;
const REASON_HIGH_RISK_JURISDICTION = 2001;
const REASON_HIGH_VOLUME = 2002;
const REASON_DEBTOR_CONCENTRATION = 2003;

const HIGH_RISK_JURISDICTIONS = new Set(['XX', 'ZZ', 'UNKNOWN']);

export class MockScreener implements ScreenerProvider {
  private readonly blocked = new Set(
    SANCTIONS_FIXTURE.map((e) => e.id.toUpperCase()),
  );

  /** Extra addresses an operator can block at runtime (admin REST). */
  private readonly runtimeBlocked = new Set<string>();

  addRuntimeBlock(address: string): void {
    this.runtimeBlocked.add(address.toUpperCase());
  }

  async screen(address: string, context: ScreenContext = {}): Promise<ScreenResult> {
    const upper = address.toUpperCase();

    if (this.runtimeBlocked.has(upper) || this.blocked.has(upper)) {
      return {
        address,
        status: 'Blocked',
        reasonCode: REASON_SANCTIONS_HIT,
        riskTier: 'High',
        matchedList: 'OFAC-SDN-fixture',
        notes: 'Address matched bundled sanctions fixture or runtime block list',
      };
    }

    // Prefix match against fixture "G..." stubs for demo.
    for (const entry of SANCTIONS_FIXTURE) {
      if (entry.id.startsWith('G') && upper.startsWith(entry.id.slice(0, 8))) {
        return {
          address,
          status: 'Blocked',
          reasonCode: REASON_SANCTIONS_HIT,
          riskTier: 'High',
          matchedList: entry.id,
          notes: entry.note,
        };
      }
    }

    let riskTier: RiskTier = 'Low';
    let status: ScreenDecision = 'Cleared';
    let reasonCode = REASON_CLEAR;
    let notes = 'No sanctions hit';

    if (context.jurisdiction && HIGH_RISK_JURISDICTIONS.has(context.jurisdiction.toUpperCase())) {
      riskTier = 'High';
      status = 'Flagged';
      reasonCode = REASON_HIGH_RISK_JURISDICTION;
      notes = `High-risk jurisdiction: ${context.jurisdiction}`;
    }

    if (context.recentVolume !== undefined && context.recentVolume > 1_000_000_000n) {
      riskTier = riskTier === 'Low' ? 'Medium' : riskTier;
      if (status === 'Cleared') {
        status = 'Flagged';
        reasonCode = REASON_HIGH_VOLUME;
        notes = 'Elevated recent transaction volume';
      }
    }

    if (
      context.debtorConcentrationBps !== undefined &&
      context.debtorConcentrationBps > 5000
    ) {
      riskTier = 'High';
      if (status === 'Cleared') {
        status = 'Flagged';
        reasonCode = REASON_DEBTOR_CONCENTRATION;
        notes = 'High debtor concentration';
      }
    }

    return { address, status, reasonCode, riskTier, notes };
  }
}
