export interface ComplianceConfig {
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  screenerSecretKey: string;
  complianceContractId: string;
  poolContractId: string;
  invoiceContractId: string;
  healthPort: number;
  /** Admin token required for POST /screen and GET /flags. Empty = open (dev only). */
  adminToken: string;
  /** Deposit amount (raw) at/above which structuring heuristics fire. */
  structuringThreshold: bigint;
  /** Window (ms) for counting near-threshold deposits. */
  structuringWindowMs: number;
  /** Max near-threshold deposits in the window before request_review. */
  structuringMaxCount: number;
}

export type RiskTier = 'Low' | 'Medium' | 'High';
export type ScreenDecision = 'Cleared' | 'Flagged' | 'Blocked';

export interface ScreenResult {
  address: string;
  status: ScreenDecision;
  reasonCode: number;
  riskTier: RiskTier;
  matchedList?: string;
  notes: string;
}

export interface MonitorAlert {
  id: string;
  address: string;
  reason: string;
  at: string;
  pattern: string;
}
