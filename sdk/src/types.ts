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
}

export interface AsteraConfig {
  rpcUrl: string;
  network: string;
  invoiceContractId: string;
  poolContractId: string;
  creditScoreContractId?: string;
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
