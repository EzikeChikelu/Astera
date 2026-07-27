import { InvoiceClient } from './clients/invoice';
import { PoolClient } from './clients/pool';
import { CreditScoreClient } from './clients/credit_score';
import { OracleRegistryClient } from './clients/oracle_registry';
import { ComplianceClient } from './clients/compliance';
import { AccessControlClient } from './clients/access_control';
import type {
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
  RateModelConfig,
  RateSnapshot,
  ComplianceStatus,
  RiskTier,
  ComplianceRecord,
  ScreeningHistoryEntry,
  Role,
  MultiSigConfig,
  Proposal,
  ActionPayload,
} from './types';

export class AsteraClient {
  private invoiceClient: InvoiceClient;
  private poolClient: PoolClient;
  private creditScoreClient: CreditScoreClient;
  private oracleRegistryClient: OracleRegistryClient;
  private complianceClient: ComplianceClient;
  private accessControlClient: AccessControlClient;

  constructor(config: AsteraConfig) {
    this.invoiceClient = new InvoiceClient({
      rpcUrl: config.rpcUrl,
      network: config.network,
      contractId: config.invoiceContractId,
    });
    this.poolClient = new PoolClient({
      rpcUrl: config.rpcUrl,
      network: config.network,
      contractId: config.poolContractId,
    });
    this.creditScoreClient = new CreditScoreClient({
      rpcUrl: config.rpcUrl,
      network: config.network,
      contractId: config.creditScoreContractId ?? '',
    });
    this.oracleRegistryClient = new OracleRegistryClient({
      rpcUrl: config.rpcUrl,
      network: config.network,
      contractId: config.oracleRegistryContractId ?? '',
    });
    this.complianceClient = new ComplianceClient({
      rpcUrl: config.rpcUrl,
      network: config.network,
      contractId: config.complianceContractId ?? '',
    });
    this.accessControlClient = new AccessControlClient({
      rpcUrl: config.rpcUrl,
      network: config.network,
      contractId: config.accessControlContractId ?? '',
    });
  }

  public readonly invoice = {
    get: (id: bigint | number): Promise<Invoice> =>
      this.invoiceClient.getInvoice(id),

    getMetadata: (id: bigint | number): Promise<InvoiceMetadata> =>
      this.invoiceClient.getMetadata(id),

    create: (params: {
      signer: (txXdr: string) => Promise<string>;
      owner: string;
      debtor: string;
      amount: bigint;
      dueDate: number;
      description: string;
      verificationHash?: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> => {
      const { signer, owner, debtor, amount, dueDate, description, verificationHash, onProgress } = params;
      return this.invoiceClient.createInvoice({
        signer, owner, debtor, amount, dueDate, description, verificationHash, onProgress,
      });
    },

    verify: (params: {
      signer: (txXdr: string) => Promise<string>;
      oracle: string;
      id: bigint | number;
      approved: boolean;
      reason: string;
      oracleHash: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> => {
      const { signer, oracle, id, approved, reason, oracleHash, onProgress } = params;
      return this.invoiceClient.verifyInvoice({ signer, oracle, id, approved, reason, oracleHash, onProgress });
    },
  };

  public readonly pool = {
    getConfig: (): Promise<PoolConfig> =>
      this.poolClient.getConfig(),

    getPosition: (investor: string, token: string): Promise<InvestorPosition | null> =>
      this.poolClient.getPosition(investor, token),

    deposit: (params: {
      signer: (txXdr: string) => Promise<string>;
      investor: string;
      token: string;
      amount: bigint;
      minRate?: number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.deposit(params),

    requestWithdrawal: (params: {
      signer: (txXdr: string) => Promise<string>;
      investor: string;
      token: string;
      shares: bigint;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.requestWithdrawal(params),

    cancelWithdrawalRequest: (params: {
      signer: (txXdr: string) => Promise<string>;
      investor: string;
      token: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.cancelWithdrawalRequest(params),

    drainWithdrawalQueue: (params: {
      signer: (txXdr: string) => Promise<string>;
      caller: string;
      token: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.drainWithdrawalQueue(params),

    getWithdrawalQueue: (token: string): Promise<WithdrawalRequest[]> =>
      this.poolClient.getWithdrawalQueue(token),

    estimateWithdrawalWait: (investor: string, token: string): Promise<WaitEstimate> =>
      this.poolClient.estimateWithdrawalWait(investor, token),

    getLiquidityForecast: (token: string, horizonDays: number): Promise<LiquidityForecastPoint[]> =>
      this.poolClient.getLiquidityForecast(token, horizonDays),

    repay: (params: {
      signer: (txXdr: string) => Promise<string>;
      payer: string;
      invoiceId: bigint | number;
      amount: bigint;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.repay(params),

    fundInvoice: (params: {
      signer: (txXdr: string) => Promise<string>;
      admin: string;
      invoiceId: bigint | number;
      principal: bigint;
      sme: string;
      dueDate: number;
      token: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.fundInvoice(params),

    getFundedInvoice: (invoiceId: bigint | number): Promise<FundedInvoice | null> =>
      this.poolClient.getFundedInvoice(invoiceId),

    getPoolTokenTotals: (token: string): Promise<PoolTokenTotals> =>
      this.poolClient.getPoolTokenTotals(token),

    openCoFunding: (params: {
      signer: (txXdr: string) => Promise<string>;
      admin: string;
      invoiceId: bigint | number;
      token: string;
      targetPrincipal: bigint;
      sme: string;
      dueDate: number;
      fundingDeadline: number;
      minCommitment: bigint;
      maxInvestorBps: number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.openCoFunding(params),

    commitToInvoice: (params: {
      signer: (txXdr: string) => Promise<string>;
      investor: string;
      invoiceId: bigint | number;
      amount: bigint;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.commitToInvoice(params),

    finalizeCoFunding: (params: {
      signer: (txXdr: string) => Promise<string>;
      caller: string;
      invoiceId: bigint | number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.finalizeCoFunding(params),

    withdrawCoFundingCommitment: (params: {
      signer: (txXdr: string) => Promise<string>;
      investor: string;
      invoiceId: bigint | number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.withdrawCommitment(params),

    transferCoFundShare: (params: {
      signer: (txXdr: string) => Promise<string>;
      from: string;
      invoiceId: bigint | number;
      token: string;
      to: string;
      bps: number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.poolClient.transferCoFundShare(params),

    getCoFundingRound: (invoiceId: bigint | number): Promise<CoFundingRound | null> =>
      this.poolClient.getCoFundingRound(invoiceId),

    listCoFundingRounds: (): Promise<bigint[]> =>
      this.poolClient.listCoFundingRounds(),

    getInvestorCoFundPositions: (
      investor: string,
    ): Promise<Array<{ invoiceId: bigint; bps: number }>> =>
      this.poolClient.getInvestorCoFundPositions(investor),

    getCoFundShare: (invoiceId: bigint | number, investor: string): Promise<number> =>
      this.poolClient.getCoFundShare(invoiceId, investor),

    getCurrentRate: (token: string): Promise<number> =>
      this.poolClient.getCurrentRate(token),

    getRateModelConfig: (token: string): Promise<RateModelConfig | null> =>
      this.poolClient.getRateModelConfig(token),

    getRateHistory: (token: string, limit: number): Promise<RateSnapshot[]> =>
      this.poolClient.getRateHistory(token, limit),

    previewRateAtUtilization: (token: string, utilizationBps: number): Promise<number> =>
      this.poolClient.previewRateAtUtilization(token, utilizationBps),
  };

  public readonly creditScore = {
    getCreditScore: (sme: string) =>
      this.creditScoreClient.getCreditScore(sme),
  };

  public readonly oracleRegistry = {
    getRound: (invoiceId: bigint | number): Promise<VerificationRound | null> =>
      this.oracleRegistryClient.getRound(invoiceId),

    getOracleInfo: (operator: string): Promise<OracleInfo | null> =>
      this.oracleRegistryClient.getOracleInfo(operator),

    openRound: (params: {
      signer: (txXdr: string) => Promise<string>;
      caller: string;
      invoiceId: bigint | number;
      oracleHash: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.oracleRegistryClient.openRound(params),

    register: (params: {
      signer: (txXdr: string) => Promise<string>;
      operator: string;
      stakeAmount: bigint;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.oracleRegistryClient.register(params),

    vote: (params: {
      signer: (txXdr: string) => Promise<string>;
      oracle: string;
      invoiceId: bigint | number;
      approved: boolean;
      evidenceHash: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.oracleRegistryClient.vote(params),
  };

  public readonly compliance = {
    isCleared: (address: string): Promise<boolean> =>
      this.complianceClient.isCleared(address),

    getRecord: (address: string): Promise<ComplianceRecord | null> =>
      this.complianceClient.getRecord(address),

    getHistory: (address: string): Promise<ScreeningHistoryEntry[]> =>
      this.complianceClient.getHistory(address),

    listFlagged: (): Promise<string[]> =>
      this.complianceClient.listFlagged(),

    listPendingReview: (): Promise<string[]> =>
      this.complianceClient.listPendingReview(),

    submitScreeningResult: (params: {
      signer: (txXdr: string) => Promise<string>;
      screener: string;
      address: string;
      status: ComplianceStatus;
      reasonCode: number;
      riskTier: RiskTier;
      expiresAt: number;
      notesHash: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.complianceClient.submitScreeningResult(params),

    requestReview: (params: {
      signer: (txXdr: string) => Promise<string>;
      caller: string;
      address: string;
      reason: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.complianceClient.requestReview(params),
  };

  /** #864: role-based multisig access control. */
  public readonly accessControl = {
    getRoleConfig: (role: Role): Promise<MultiSigConfig | null> =>
      this.accessControlClient.getRoleConfig(role),

    isSigner: (role: Role, address: string): Promise<boolean> =>
      this.accessControlClient.isSigner(role, address),

    getProposal: (proposalId: bigint | number): Promise<Proposal | null> =>
      this.accessControlClient.getProposal(proposalId),

    listProposals: (): Promise<Array<{ id: bigint; proposal: Proposal }>> =>
      this.accessControlClient.listProposals(),

    proposeAction: (params: {
      signer: (txXdr: string) => Promise<string>;
      role: Role;
      proposer: string;
      target: string;
      action: ActionPayload;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.accessControlClient.proposeAction(params),

    approveAction: (params: {
      signer: (txXdr: string) => Promise<string>;
      signerAddress: string;
      proposalId: bigint | number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.accessControlClient.approveAction(params),

    revokeApproval: (params: {
      signer: (txXdr: string) => Promise<string>;
      signerAddress: string;
      proposalId: bigint | number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.accessControlClient.revokeApproval(params),

    rejectAction: (params: {
      signer: (txXdr: string) => Promise<string>;
      signerAddress: string;
      proposalId: bigint | number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.accessControlClient.rejectAction(params),

    executeAction: (params: {
      signer: (txXdr: string) => Promise<string>;
      caller: string;
      proposalId: bigint | number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> =>
      this.accessControlClient.executeAction(params),
  };
}
