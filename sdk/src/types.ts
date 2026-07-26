export type InvoiceStatus =
  | 'Pending'
  | 'AwaitingVerification'
  | 'Verified'
  | 'Disputed'
  | 'Funded'
  | 'Paid'
  | 'Defaulted';

export interface InvoiceMetadata {
  name: string;
  description: string;
  image: string;
  amount: bigint;
  debtor: string;
  dueDate: number;
  status: InvoiceStatus;
  symbol: string;
  decimals: number;
}

export interface Invoice {
  id: bigint;
  owner: string;
  debtor: string;
  amount: bigint;
  due_date: number;
  description: string;
  status: InvoiceStatus;
  created_at: number;
  funded_at: number;
  paid_at: number;
  pool_contract: string;
  verification_hash?: string;
  metadata_uri?: string;
  oracle_verified?: boolean;
}

export interface InvestorPosition {
  deposited: bigint;
  available: bigint;
  deployed: bigint;
  earned: bigint;
  depositCount: number;
}

export interface PoolConfig {
  invoiceContract: string;
  admin: string;
  yieldBps: number;
  factoringFeeBps: number;
  compoundInterest: boolean;
}

// #863: utilization-driven kinked interest-rate model

export interface RateModelConfig {
  /** Rate (bps) at 0% utilization. */
  baseRateBps: number;
  /** The "kink" point in bps (e.g. 8000 = 80%). */
  optimalUtilizationBps: number;
  /** Rate increase (bps) spread across the 0..optimal span. */
  slope1Bps: number;
  /** Rate increase (bps) spread across the optimal..100% span (steeper). */
  slope2Bps: number;
  /** Hard ceiling on the computed rate. */
  maxRateBps: number;
}

export interface RateSnapshot {
  timestamp: number;
  utilizationBps: number;
  rateBps: number;
}

// #865: withdrawal-queue completion + liquidity forecasting

export interface WithdrawalRequest {
  investor: string;
  token: string;
  shares: bigint;
  requestedAt: number;
  requestId: bigint;
}

export interface WaitEstimate {
  queuePosition: number;
  capitalAhead: bigint;
  nearestInvoiceDueDate: number;
  /** Predicted seconds until this request is likely to clear. An estimate, not a guarantee. */
  estimatedWaitSecs: number;
}

export interface LiquidityForecastPoint {
  /** Days from now (1-indexed). */
  day: number;
  projectedAvailable: bigint;
}

export interface PoolTokenTotals {
  totalDeposited: bigint;
  totalDeployed: bigint;
  totalPaidOut: bigint;
  totalFeeRevenue: bigint;
}

export interface FundedInvoice {
  invoiceId: bigint;
  sme: string;
  token: string;
  principal: bigint;
  committed: bigint;
  fundedAt: number;
  factoringFee: bigint;
  dueDate: number;
  repaidAmount: bigint;
  /** #860: set when this invoice was funded through a co-funding round. */
  coFundingRoundId?: bigint;
}

// #860: multi-investor co-funding rounds
export type CoFundingStatus = 'Open' | 'Filled' | 'Cancelled' | 'Expired';

export interface CoFundingRound {
  invoiceId: bigint;
  token: string;
  sme: string;
  dueDate: number;
  targetPrincipal: bigint;
  committedPrincipal: bigint;
  fundingDeadline: number;
  status: CoFundingStatus;
  minCommitment: bigint;
  maxInvestorBps: number;
  participants: string[];
}

export interface AsteraConfig {
  rpcUrl: string;
  network: string;
  invoiceContractId: string;
  poolContractId: string;
  creditScoreContractId?: string;
  // #861: N-of-M staked oracle consensus network
  oracleRegistryContractId?: string;
  // #867: on-chain compliance / sanctions screening registry
  complianceContractId?: string;
}

// #867: compliance registry types
export type ComplianceStatus =
  | 'Unscreened'
  | 'Cleared'
  | 'Flagged'
  | 'Blocked'
  | 'PendingReview';

export type RiskTier = 'Low' | 'Medium' | 'High';

export interface ComplianceRecord {
  address: string;
  status: ComplianceStatus;
  reasonCode: number;
  riskTier: RiskTier;
  screenedAt: number;
  screenedBy: string;
  expiresAt: number;
  notesHash: string;
}

export interface ScreeningHistoryEntry {
  status: ComplianceStatus;
  reasonCode: number;
  riskTier: RiskTier;
  screenedAt: number;
  screenedBy: string;
  expiresAt: number;
  notesHash: string;
}

// #861: N-of-M staked oracle consensus network
export type RoundStatus = 'Open' | 'ConsensusApproved' | 'ConsensusRejected' | 'Expired';

export interface OracleInfo {
  address: string;
  stakeAmount: bigint;
  stakeToken: string;
  isActive: boolean;
  totalVerifications: number;
  totalSlashes: number;
  registeredAt: number;
  deregisterRequestedAt?: number;
}

export interface VerificationRound {
  invoiceId: bigint;
  requiredVotes: number;
  totalRegisteredOracles: number;
  weightFor: bigint;
  weightAgainst: bigint;
  totalStakeSnapshot: bigint;
  quorumBps: number;
  status: RoundStatus;
  openedAt: number;
  deadline: number;
  oracleHash: string;
}

export interface TransactionProgress {
  status: 'pending' | 'confirmed' | 'failed';
  hash: string;
  error?: string;
}

// ── Event Types ──────────────────────────────────────────────────────────────

export interface PoolDepositEvent {
  depositor: string;
  token: string;
  amount: bigint;
  sharesMinted: bigint;
  timestamp: number;
}

export interface PoolWithdrawEvent {
  withdrawer: string;
  token: string;
  amount: bigint;
  sharesBurned: bigint;
  timestamp: number;
}

export interface PoolRepaidEvent {
  invoiceId: bigint;
  payer: string;
  principal: bigint;
  interest: bigint;
  timestamp: number;
}

export interface PoolPartPayEvent {
  invoiceId: bigint;
  payer: string;
  amount: bigint;
  totalRepaid: bigint;
  timestamp: number;
}

export interface InvoiceFundedEvent {
  invoiceId: bigint;
  funder: string;
  timestamp: number;
}

export interface InvoicePaidEvent {
  invoiceId: bigint;
  caller: string;
  timestamp: number;
}

export interface CreditPaymentEvent {
  caller: string;
  sme: string;
  invoiceId: bigint;
  status: string;
  score: number;
  timestamp: number;
}

export interface CreditDefaultEvent {
  caller: string;
  sme: string;
  invoiceId: bigint;
  score: number;
  timestamp: number;
}
