import type { xdr } from '@stellar/stellar-sdk';

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

export interface RateModelConfig {
  baseRateBps: number;
  optimalUtilizationBps: number;
  slope1Bps: number;
  slope2Bps: number;
  maxRateBps: number;
}

export interface RateSnapshot {
  timestamp: number;
  utilizationBps: number;
  rateBps: number;
}

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
  estimatedWaitSecs: number;
}

export interface LiquidityForecastPoint {
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
  coFundingRoundId?: bigint;
}

/** #1037: seize/liquidation status for a funded invoice's posted collateral. */
export interface CollateralDeposit {
  invoiceId: bigint;
  depositor: string;
  token: string;
  amount: bigint;
  settled: boolean;
  postedAt: number;
  releasedAt: number;
  seizedAt: number;
}

export type CoFundingStatus = 'Open' | 'Filled' | 'Cancelled' | 'Expired';

// #1036: multi-asset, oracle-priced collateral risk response
export interface CollateralConfig {
  threshold: bigint;
  collateralBps: number;
}

export interface CollateralDeposit {
  invoiceId: bigint;
  depositor: string;
  token: string;
  amount: bigint;
  settled: boolean;
  postedAt: number;
  releasedAt: number;
  seizedAt: number;
  collateralBpsAtDeposit: number;
  thresholdAtDeposit: bigint;
  /** Ledger timestamp the live oracle-priced ratio first dropped below the
   * configured danger threshold, or undefined if not currently flagged. */
  atRiskSince?: number;
}

export interface CollateralRiskConfig {
  /** Live collateral ratio (bps) below which a position is flagged at-risk. */
  dangerBps: number;
  /** Seconds a depositor has to top up before liquidateCollateral is callable. */
  gracePeriodSecs: number;
}

// #1025: secondary market
export type ListingStatus = 'Open' | 'Filled' | 'Cancelled';
export type ListingKind = 'CoFunding' | 'SingleFunded';

export interface Listing {
  listingId: bigint;
  invoiceId: bigint;
  seller: string;
  token: string;
  kind: ListingKind;
  /** bps of CoFundShare (CoFunding) or raw token amount (SingleFunded) */
  amountOrBps: bigint;
  price: bigint;
  createdAt: number;
  status: ListingStatus;
}

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

export interface ClientConfig {
  rpcUrl: string;
  network: string;
  contractId: string;
  signer?: Signer;
}

export type Signer = (txXdr: string) => Promise<string>;

export interface AsteraConfig {
  rpcUrl: string;
  network: string;
  invoiceContractId: string;
  poolContractId: string;
  /** #1044: secondary-market listing + withdrawal-wait/liquidity-forecast satellite contract. */
  secondaryMarketContractId?: string;
  creditScoreContractId?: string;
  oracleRegistryContractId?: string;
  complianceContractId?: string;
  trancheContractId?: string;
  /** #864: role-based multisig access-control contract, if deployed. */
  accessControlContractId?: string;
}

// ─── #864: role-based multisig access control ──────────────────────────────
// Mirrors contracts/access_control/src/lib.rs's public types.

export type Role =
  | 'SuperAdmin'
  | 'RiskManager'
  | 'TreasuryManager'
  | 'ComplianceOfficer'
  | 'OracleManager';

export const ALL_ROLES: Role[] = [
  'SuperAdmin',
  'RiskManager',
  'TreasuryManager',
  'ComplianceOfficer',
  'OracleManager',
];

/** Human-readable label for one of the five fixed roles, for admin UI. */
export const ROLE_LABELS: Record<Role, string> = {
  SuperAdmin: 'Super Admin',
  RiskManager: 'Risk Manager',
  TreasuryManager: 'Treasury Manager',
  ComplianceOfficer: 'Compliance Officer',
  OracleManager: 'Oracle Manager',
};

export interface MultiSigConfig {
  signers: string[];
  threshold: number;
}

export type ProposalStatus = 'Pending' | 'Approved' | 'Executed' | 'Rejected';

// Mirrors contracts/access_control/src/lib.rs's `ActionPayload` enum. Each
// variant's `values` tuple matches that Rust variant's fields in order.
export type ActionPayload =
  | { tag: 'SetPaused'; values: [boolean] }
  | { tag: 'SetYield'; values: [number] }
  | { tag: 'SetTreasury'; values: [string] }
  | { tag: 'WithdrawRevenue'; values: [string, bigint] }
  | { tag: 'SetOracleContract'; values: [string] }
  | { tag: 'SetKycRequired'; values: [boolean] }
  | { tag: 'SetInvestorKyc'; values: [string, boolean] }
  | { tag: 'SetMaxUtilization'; values: [number] }
  | { tag: 'SetOracle'; values: [string] }
  | { tag: 'RegisterDebtor'; values: [string, string, bigint] }
  | { tag: 'DeactivateDebtor'; values: [string] }
  | { tag: 'AddKeeper'; values: [string] }
  | { tag: 'SetLateThreshold'; values: [bigint] }
  | { tag: 'SetScoreThresholds'; values: [number, number, number, number] }
  | { tag: 'RegisterAttestor'; values: [string, number, number] }
  | { tag: 'AddSigner'; values: [Role, string] }
  | { tag: 'RemoveSigner'; values: [Role, string] }
  | { tag: 'SetThreshold'; values: [Role, number] };

export interface Proposal {
  role: Role;
  target: string;
  action: ActionPayload;
  proposer: string;
  approvals: string[];
  createdAt: bigint;
  expiresAt: bigint;
  status: ProposalStatus;
}

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

export interface RegistryConfig {
  minStake: bigint;
  stakeToken: string;
  requiredVotes: number;
  quorumBps: number;
  roundDurationSecs: number;
  deregisterCooldownSecs: number;
  treasury?: string;
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

export interface ContractCallParams {
  signer: Signer;
  caller: string;
  onProgress?: (progress: TransactionProgress) => void;
}

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
