import { rpc as StellarRpc } from '@stellar/stellar-sdk';
import { BaseClient, nativeToScVal, scValToNative, Address, xdr } from './base';
import type { ClientConfig, TransactionProgress } from '../types';
import type { Signer } from '../types';

type CreditScoreResponse = Record<string, unknown> & {
  sme: string;
  score: number;
  totalInvoices: number;
  paidOnTime: number;
  paidLate: number;
  defaulted: number;
  totalVolume: bigint;
  averagePaymentDays: number;
  lastUpdated: number;
  scoreVersion: number;
  configVersion: number;
  isStale: boolean;
  blendedScore: number;
  /** #1041: point delta from debtor-concentration/invoice-size risk signals. */
  riskAdjustmentPts: number;
  /** #1041: point delta from the repayment-trend factor. */
  trendAdjustmentPts: number;
  /** #1041: blendedScore + riskAdjustmentPts + trendAdjustmentPts, clamped. */
  finalScore: number;
};

/** #1041: off-chain-computed risk signal for an SME (see `submit_risk_signal`). */
interface RiskSignalData {
  debtorConcentrationBps: number;
  invoiceSizeRiskBps: number;
  submittedAt: number;
}

// #1041: fixed to match the real contract enum (contracts/credit_score/src/lib.rs
// `AttestorType`) — the previous union here didn't match any of the four real
// variants except CreditBureau, silently misencoding the other three.
type AttestorType = 'BusinessRegistry' | 'CreditBureau' | 'ExternalProtocol' | 'Manual';

type AttestationStatus = 'Active' | 'Expired' | 'Revoked';

interface Attestation {
  id: bigint;
  sme: string;
  attestor: string;
  attestationType: AttestorType;
  scoreContribution: number;
  evidenceHash: string;
  submittedAt: number;
  expiresAt: number;
  status: AttestationStatus;
}

interface AttestorInfo {
  address: string;
  attestorType: AttestorType;
  isActive: boolean;
  weightBps: number;
  registeredAt: number;
}

function attestorTypeToScVal(variant: AttestorType): xdr.ScVal {
  return xdr.ScVal.scvVec([nativeToScVal(variant, { type: 'symbol' })]);
}

function enumTagFromNative<T extends string>(raw: unknown): T {
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function creditScoreResponseFromScVal(raw: Record<string, unknown>): CreditScoreResponse {
  return {
    sme: raw.sme as string,
    score: Number(raw.score),
    totalInvoices: Number(raw.total_invoices),
    paidOnTime: Number(raw.paid_on_time),
    paidLate: Number(raw.paid_late),
    defaulted: Number(raw.defaulted),
    totalVolume: BigInt(String(raw.total_volume)),
    averagePaymentDays: Number(raw.average_payment_days),
    lastUpdated: Number(raw.last_updated),
    scoreVersion: Number(raw.score_version),
    configVersion: Number(raw.config_version),
    isStale: Boolean(raw.is_stale),
    blendedScore: Number(raw.blended_score),
    riskAdjustmentPts: Number(raw.risk_adjustment_pts),
    trendAdjustmentPts: Number(raw.trend_adjustment_pts),
    finalScore: Number(raw.final_score),
  };
}

function riskSignalDataFromScVal(raw: Record<string, unknown>): RiskSignalData {
  return {
    debtorConcentrationBps: Number(raw.debtor_concentration_bps),
    invoiceSizeRiskBps: Number(raw.invoice_size_risk_bps),
    submittedAt: Number(raw.submitted_at),
  };
}

function attestationFromScVal(raw: Record<string, unknown>): Attestation {
  return {
    id: BigInt(String(raw.id)),
    sme: raw.sme as string,
    attestor: raw.attestor as string,
    attestationType: enumTagFromNative(raw.attestation_type),
    scoreContribution: Number(raw.score_contribution),
    evidenceHash: raw.evidence_hash as string,
    submittedAt: Number(raw.submitted_at),
    expiresAt: Number(raw.expires_at),
    status: enumTagFromNative(raw.status),
  };
}

function attestorInfoFromScVal(raw: Record<string, unknown>): AttestorInfo {
  return {
    address: raw.address as string,
    attestorType: enumTagFromNative(raw.attestor_type),
    isActive: Boolean(raw.is_active),
    weightBps: Number(raw.weight_bps),
    registeredAt: Number(raw.registered_at),
  };
}

export class CreditScoreClient extends BaseClient {
  constructor(config: ClientConfig) {
    super(config);
  }

  async getCreditScore(sme: string): Promise<CreditScoreResponse> {
    const sim = await this.simulate('get_credit_score', [
      new Address(sme).toScVal(),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval) as Record<string, unknown>;
    return creditScoreResponseFromScVal(raw);
  }

  async simulateScoreWithAttestations(
    sme: string,
    hypothetical: Array<{ weightBps: number; scoreContribution: number }>,
  ): Promise<number> {
    const hypotheticalScVal = xdr.ScVal.scvVec(
      hypothetical.map((h) =>
        xdr.ScVal.scvVec([
          nativeToScVal(h.weightBps, { type: 'u32' }),
          nativeToScVal(h.scoreContribution, { type: 'u32' }),
        ]),
      ),
    );
    const sim = await this.simulate('simulate_score_with_attestations', [
      new Address(sme).toScVal(),
      hypotheticalScVal,
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    return Number(scValToNative(sim.result!.retval));
  }

  async getAttestorInfo(address: string): Promise<AttestorInfo | null> {
    const sim = await this.simulate('get_attestor_info', [
      new Address(address).toScVal(),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval);
    if (!raw) return null;
    return attestorInfoFromScVal(raw as Record<string, unknown>);
  }

  async listActiveAttestors(): Promise<AttestorInfo[]> {
    const sim = await this.simulate('list_active_attestors', []);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval) as Record<string, unknown>[];
    return (raw ?? []).map(attestorInfoFromScVal);
  }

  async getAttestation(id: bigint | number): Promise<Attestation | null> {
    const sim = await this.simulate('get_attestation', [
      nativeToScVal(id, { type: 'u64' }),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval);
    if (!raw) return null;
    return attestationFromScVal(raw as Record<string, unknown>);
  }

  async listSmeAttestations(sme: string): Promise<Attestation[]> {
    const sim = await this.simulate('list_sme_attestations', [
      new Address(sme).toScVal(),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval) as Record<string, unknown>[];
    return (raw ?? []).map(attestationFromScVal);
  }

  async registerAttestor(params: {
    signer: Signer;
    admin: string;
    address: string;
    attestorType: AttestorType;
    weightBps: number;
    onProgress?: (progress: TransactionProgress) => void;
  }): Promise<string> {
    return this.buildAndSendTx(
      params.admin,
      'register_attestor',
      [
        new Address(params.admin).toScVal(),
        new Address(params.address).toScVal(),
        attestorTypeToScVal(params.attestorType),
        nativeToScVal(params.weightBps, { type: 'u32' }),
      ],
      params.onProgress,
    );
  }

  async deactivateAttestor(params: {
    signer: Signer;
    admin: string;
    address: string;
    onProgress?: (progress: TransactionProgress) => void;
  }): Promise<string> {
    return this.buildAndSendTx(
      params.admin,
      'deactivate_attestor',
      [
        new Address(params.admin).toScVal(),
        new Address(params.address).toScVal(),
      ],
      params.onProgress,
    );
  }

  async submitAttestation(params: {
    signer: Signer;
    attestor: string;
    sme: string;
    attestationType: AttestorType;
    scoreContribution: number;
    evidenceHash: string;
    expiresAt: number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> {
      return this.buildAndSendTx(
        params.attestor,
        'submit_attestation',
        [
          new Address(params.attestor).toScVal(),
          new Address(params.sme).toScVal(),
          attestorTypeToScVal(params.attestationType),
          nativeToScVal(params.scoreContribution, { type: 'u32' }),
          nativeToScVal(params.evidenceHash, { type: 'string' }),
          nativeToScVal(params.expiresAt, { type: 'u64' }),
        ],
        params.onProgress,
      );
    }

    async disputeAttestation(params: {
      signer: Signer;
      caller: string;
      attestationId: bigint | number;
      reasonHash: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> {
      return this.buildAndSendTx(
        params.caller,
        'dispute_attestation',
        [
          new Address(params.caller).toScVal(),
          nativeToScVal(params.attestationId, { type: 'u64' }),
          nativeToScVal(params.reasonHash, { type: 'string' }),
        ],
        params.onProgress,
      );
    }

    async resolveAttestationDispute(params: {
      signer: Signer;
      admin: string;
      attestationId: bigint | number;
      upheld: boolean;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> {
      return this.buildAndSendTx(
        params.admin,
        'resolve_attestation_dispute',
        [
          new Address(params.admin).toScVal(),
          nativeToScVal(params.attestationId, { type: 'u64' }),
          nativeToScVal(params.upheld, { type: 'bool' }),
        ],
        params.onProgress,
      );
    }

    /** #1041: governance-configurable credibility weight, settable after registration. */
    async setAttestorWeight(params: {
      signer: Signer;
      admin: string;
      address: string;
      weightBps: number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> {
      return this.buildAndSendTx(
        params.admin,
        'set_attestor_weight',
        [
          new Address(params.admin).toScVal(),
          new Address(params.address).toScVal(),
          nativeToScVal(params.weightBps, { type: 'u32' }),
        ],
        params.onProgress,
      );
    }

    /** #1041: the latest off-chain-computed risk signal for `sme`, if any. */
    async getRiskSignal(sme: string): Promise<RiskSignalData | null> {
      const sim = await this.simulate('get_risk_signal', [
        new Address(sme).toScVal(),
      ]);
      if (StellarRpc.Api.isSimulationError(sim)) {
        throw new Error(`Simulation failed: ${sim.error}`);
      }
      const raw = scValToNative(sim.result!.retval);
      if (!raw) return null;
      return riskSignalDataFromScVal(raw as Record<string, unknown>);
    }

    /** #1041: authorize the off-chain keeper permitted to call `submitRiskSignal`. */
    async setRiskSignalKeeper(params: {
      signer: Signer;
      admin: string;
      keeper: string;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> {
      return this.buildAndSendTx(
        params.admin,
        'set_risk_signal_keeper',
        [
          new Address(params.admin).toScVal(),
          new Address(params.keeper).toScVal(),
        ],
        params.onProgress,
      );
    }

    /** #1041: submit (or replace) an SME's off-chain-computed risk signal. Keeper-only. */
    async submitRiskSignal(params: {
      signer: Signer;
      keeper: string;
      sme: string;
      debtorConcentrationBps: number;
      invoiceSizeRiskBps: number;
      onProgress?: (progress: TransactionProgress) => void;
    }): Promise<string> {
      return this.buildAndSendTx(
        params.keeper,
        'submit_risk_signal',
        [
          new Address(params.keeper).toScVal(),
          new Address(params.sme).toScVal(),
          nativeToScVal(params.debtorConcentrationBps, { type: 'u32' }),
          nativeToScVal(params.invoiceSizeRiskBps, { type: 'u32' }),
        ],
        params.onProgress,
      );
    }
  }
