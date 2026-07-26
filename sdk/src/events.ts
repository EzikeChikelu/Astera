import { scValToNative, xdr } from './stellar';

export interface ContractEvent {
  type: string;
  timestamp: number;
  contractId: string;
  topics: string[];
  value: unknown[];
}

export interface PoolDepositEvent {
  type: 'pool:deposit';
  depositor: string;
  token: string;
  amount: bigint;
  sharesMinted: bigint;
  timestamp: number;
}

export interface PoolWithdrawalEvent {
  type: 'pool:withdrawal';
  withdrawer: string;
  token: string;
  amount: bigint;
  sharesBurned: bigint;
  timestamp: number;
}

export interface PoolYieldClaimedEvent {
  type: 'pool:yield_claimed';
  claimer: string;
  token: string;
  amount: bigint;
  timestamp: number;
}

export interface ShareMintEvent {
  type: 'share:mint';
  to: string;
  amount: bigint;
  timestamp: number;
}

export interface ShareBurnEvent {
  type: 'share:burn';
  from: string;
  amount: bigint;
  timestamp: number;
}

export interface ShareTransferEvent {
  type: 'share:transfer';
  from: string;
  to: string;
  amount: bigint;
}

export interface ShareApproveEvent {
  type: 'share:approve';
  owner: string;
  spender: string;
  amount: bigint;
}

// #985 — governance contract events (topic namespace "gov")
export interface GovernanceProposalCreatedEvent {
  type: 'governance:proposal_created';
  proposalId: bigint;
  proposer: string;
}

export interface GovernanceVoteCastEvent {
  type: 'governance:vote_cast';
  proposalId: bigint;
  voter: string;
  inFavor: boolean;
  weight: bigint;
}

export interface GovernanceProposalExecutedEvent {
  type: 'governance:proposal_executed';
  proposalId: bigint;
  targetContract: string;
  functionName: string;
  calldata: unknown[];
}

export interface GovernanceProposalCancelledEvent {
  type: 'governance:proposal_cancelled';
  proposalId: bigint;
  caller: string;
}

// #985 — insurance contract events (topic namespace "INSURNCE", matching
// the on-chain `symbol_short!("INSURNCE")` EVT constant exactly)
export interface InsuranceInitializedEvent {
  type: 'insurance:initialized';
  admin: string;
}

export interface InsurancePremiumConfigSetEvent {
  type: 'insurance:premium_config_set';
  admin: string;
}

export interface InsuranceMinCoverageRatioSetEvent {
  type: 'insurance:min_coverage_ratio_set';
  admin: string;
  token: string;
  minRatioBps: number;
}

export interface InsurancePausedEvent {
  type: 'insurance:paused';
  admin: string;
}

export interface InsuranceUnpausedEvent {
  type: 'insurance:unpaused';
  admin: string;
}

export interface InsuranceReserveFundedEvent {
  type: 'insurance:reserve_funded';
  admin: string;
  token: string;
  amount: bigint;
}

export interface InsuranceCoveragePurchasedEvent {
  type: 'insurance:coverage_purchased';
  invoiceId: bigint;
  payer: string;
  premium: bigint;
  coverageBps: number;
}

export interface InsuranceClaimPaidEvent {
  type: 'insurance:claim_paid';
  invoiceId: bigint;
  payout: bigint;
}

export type ContractEventType =
  | PoolDepositEvent
  | PoolWithdrawalEvent
  | PoolYieldClaimedEvent
  | ShareMintEvent
  | ShareBurnEvent
  | ShareTransferEvent
  | ShareApproveEvent
  | GovernanceProposalCreatedEvent
  | GovernanceVoteCastEvent
  | GovernanceProposalExecutedEvent
  | GovernanceProposalCancelledEvent
  | InsuranceInitializedEvent
  | InsurancePremiumConfigSetEvent
  | InsuranceMinCoverageRatioSetEvent
  | InsurancePausedEvent
  | InsuranceUnpausedEvent
  | InsuranceReserveFundedEvent
  | InsuranceCoveragePurchasedEvent
  | InsuranceClaimPaidEvent;

export function parseContractEvent(event: {
  topic: string[];
  value: xdr.ScVal[];
}): ContractEventType | null {
  const [namespace, action] = event.topic;

  if (!namespace || !action) {
    return null;
  }

  try {
    if (namespace === 'pool') {
      const [depositor, token, amount, sharesMinted, timestamp] = event.value.map((v) =>
        scValToNative(v),
      );

      switch (action) {
        case 'deposit':
          return {
            type: 'pool:deposit',
            depositor: String(depositor),
            token: String(token),
            amount: BigInt(String(amount)),
            sharesMinted: BigInt(String(sharesMinted)),
            timestamp: Number(timestamp),
          } as PoolDepositEvent;

        case 'withdrawal': {
          const [withdrawer, token, amount, sharesBurned, timestamp] = event.value.map((v) =>
            scValToNative(v),
          );
          return {
            type: 'pool:withdrawal',
            withdrawer: String(withdrawer),
            token: String(token),
            amount: BigInt(String(amount)),
            sharesBurned: BigInt(String(sharesBurned)),
            timestamp: Number(timestamp),
          } as PoolWithdrawalEvent;
        }

        case 'yield_claimed': {
          const [claimer, token, amount, timestamp] = event.value.map((v) =>
            scValToNative(v),
          );
          return {
            type: 'pool:yield_claimed',
            claimer: String(claimer),
            token: String(token),
            amount: BigInt(String(amount)),
            timestamp: Number(timestamp),
          } as PoolYieldClaimedEvent;
        }
      }
    }

    if (namespace === 'share') {
      const values = event.value.map((v) => scValToNative(v));

      switch (action) {
        case 'mint': {
          const [to, amount, timestamp] = values;
          return {
            type: 'share:mint',
            to: String(to),
            amount: BigInt(String(amount)),
            timestamp: Number(timestamp),
          } as ShareMintEvent;
        }

        case 'burn': {
          const [from, amount, timestamp] = values;
          return {
            type: 'share:burn',
            from: String(from),
            amount: BigInt(String(amount)),
            timestamp: Number(timestamp),
          } as ShareBurnEvent;
        }

        case 'transfer': {
          const [from, to, amount] = values;
          return {
            type: 'share:transfer',
            from: String(from),
            to: String(to),
            amount: BigInt(String(amount)),
          } as ShareTransferEvent;
        }

        case 'approve': {
          const [owner, spender, amount] = values;
          return {
            type: 'share:approve',
            owner: String(owner),
            spender: String(spender),
            amount: BigInt(String(amount)),
          } as ShareApproveEvent;
        }
      }
    }

    // #985 — governance contract events (EVT = symbol_short!("gov"))
    if (namespace === 'gov') {
      const values = event.value.map((v) => scValToNative(v));

      switch (action) {
        case 'create': {
          const [id, proposer] = values;
          return {
            type: 'governance:proposal_created',
            proposalId: BigInt(String(id)),
            proposer: String(proposer),
          } as GovernanceProposalCreatedEvent;
        }

        case 'vote': {
          const [proposalId, voter, inFavor, weight] = values;
          return {
            type: 'governance:vote_cast',
            proposalId: BigInt(String(proposalId)),
            voter: String(voter),
            inFavor: Boolean(inFavor),
            weight: BigInt(String(weight)),
          } as GovernanceVoteCastEvent;
        }

        case 'execute': {
          const [proposalId, targetContract, functionName, calldata] = values;
          return {
            type: 'governance:proposal_executed',
            proposalId: BigInt(String(proposalId)),
            targetContract: String(targetContract),
            functionName: String(functionName),
            calldata: Array.isArray(calldata) ? calldata : [calldata],
          } as GovernanceProposalExecutedEvent;
        }

        case 'cancel': {
          const [proposalId, caller] = values;
          return {
            type: 'governance:proposal_cancelled',
            proposalId: BigInt(String(proposalId)),
            caller: String(caller),
          } as GovernanceProposalCancelledEvent;
        }
      }
    }

    // #985 — insurance contract events (EVT = symbol_short!("INSURNCE"))
    if (namespace === 'INSURNCE') {
      const values = event.value.map((v) => scValToNative(v));

      switch (action) {
        case 'init': {
          const [admin] = values;
          return {
            type: 'insurance:initialized',
            admin: String(admin),
          } as InsuranceInitializedEvent;
        }

        case 'cfg_set': {
          const [admin] = values;
          return {
            type: 'insurance:premium_config_set',
            admin: String(admin),
          } as InsurancePremiumConfigSetEvent;
        }

        case 'mcr_set': {
          const [admin, token, minRatioBps] = values;
          return {
            type: 'insurance:min_coverage_ratio_set',
            admin: String(admin),
            token: String(token),
            minRatioBps: Number(minRatioBps),
          } as InsuranceMinCoverageRatioSetEvent;
        }

        case 'paused': {
          const [admin] = values;
          return {
            type: 'insurance:paused',
            admin: String(admin),
          } as InsurancePausedEvent;
        }

        case 'unpaused': {
          const [admin] = values;
          return {
            type: 'insurance:unpaused',
            admin: String(admin),
          } as InsuranceUnpausedEvent;
        }

        case 'funded': {
          const [admin, token, amount] = values;
          return {
            type: 'insurance:reserve_funded',
            admin: String(admin),
            token: String(token),
            amount: BigInt(String(amount)),
          } as InsuranceReserveFundedEvent;
        }

        case 'covered': {
          const [invoiceId, payer, premium, coverageBps] = values;
          return {
            type: 'insurance:coverage_purchased',
            invoiceId: BigInt(String(invoiceId)),
            payer: String(payer),
            premium: BigInt(String(premium)),
            coverageBps: Number(coverageBps),
          } as InsuranceCoveragePurchasedEvent;
        }

        case 'claimed': {
          const [invoiceId, payout] = values;
          return {
            type: 'insurance:claim_paid',
            invoiceId: BigInt(String(invoiceId)),
            payout: BigInt(String(payout)),
          } as InsuranceClaimPaidEvent;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to parse contract event:', error);
    return null;
  }
}
