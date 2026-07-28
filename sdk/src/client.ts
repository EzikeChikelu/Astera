export { AsteraClient } from '../../packages/sdk/src/astera-client';
export type {
  AsteraConfig,
  Invoice,
  InvoiceMetadata,
  InvestorPosition,
  PoolConfig,
  PoolTokenTotals,
  FundedInvoice,
  TransactionProgress,
  WithdrawalRequest,
  WaitEstimate,
  LiquidityForecastPoint,
  CoFundingRound,
  OracleInfo,
  VerificationRound,
  AttestorType,
  AttestorInfo,
  Attestation,
  CreditScoreResponse,
  RateModelConfig,
  RateSnapshot,
  ComplianceStatus,
  RiskTier,
  ComplianceRecord,
  ScreeningHistoryEntry,
} from '../../packages/sdk/src/types';

export * from './generated/tranche';

import { 
  TrancheClass,
  TrancheConfig,
  TranchePool,
  InvoiceTrancheExposure,
  WaterfallSimulation,
} from './generated/tranche';

export interface TrancheClientConfig {
  contractId: string;
  network: 'mainnet' | 'testnet';
}

export class TrancheClient {
  constructor(private config: TrancheClientConfig) {}

  /**
   * Deposit into a specific tranche
   */
  async deposit(
    investor: string,
    token: string,
    trancheClass: TrancheClass,
    amount: bigint
  ): Promise<void> {
    // Implementation would use Soroban SDK to invoke contract
    throw new Error('Not implemented - requires Soroban SDK integration');
  }

  /**
   * Withdraw from a specific tranche
   */
  async withdraw(
    investor: string,
    token: string,
    trancheClass: TrancheClass,
    amount: bigint
  ): Promise<void> {
    throw new Error('Not implemented - requires Soroban SDK integration');
  }

  /**
   * Get tranche pool information for a token
   */
  async getPool(token: string): Promise<TranchePool> {
    throw new Error('Not implemented - requires Soroban SDK integration');
  }

  /**
   * Get investor's position in a specific tranche
   */
  async getInvestorPosition(
    investor: string,
    token: string,
    trancheClass: TrancheClass
  ): Promise<{ deposited: bigint; available: bigint; earned: bigint; losses: bigint }> {
    throw new Error('Not implemented - requires Soroban SDK integration');
  }

  /**
   * Simulate waterfall repayment for a hypothetical scenario
   */
  async simulateWaterfall(
    invoiceId: number,
    hypotheticalRepayment: bigint,
    elapsedSecs: number
  ): Promise<WaterfallSimulation> {
    throw new Error('Not implemented - requires Soroban SDK integration');
  }

  /**
   * Get effective APY for a tranche (trailing realized yield)
   */
  async getEffectiveApy(token: string, trancheClass: TrancheClass): Promise<number> {
    throw new Error('Not implemented - requires indexer data');
  }

  /**
   * Get tranche configuration for a token
   */
  async getTrancheConfig(token: string): Promise<TrancheConfig> {
    throw new Error('Not implemented - requires Soroban SDK integration');
  }

  /**
   * Get invoice tranche exposure
   */
  async getInvoiceExposure(invoiceId: number): Promise<InvoiceTrancheExposure> {
    throw new Error('Not implemented - requires Soroban SDK integration');
  }
}
