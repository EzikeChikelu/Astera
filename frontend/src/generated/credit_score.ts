import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export type DataKey = {tag: "CreditScore", values: readonly [string]} | {tag: "PaymentHistory", values: readonly [string]} | {tag: "PaymentHistoryStart", values: readonly [string]} | {tag: "PaymentRecordIdx", values: readonly [string, u32]} | {tag: "PaymentRecordScoreVersion", values: readonly [u64]} | {tag: "InvoiceProcessed", values: readonly [u64]} | {tag: "ScoringConfig", values: void} | {tag: "Admin", values: void} | {tag: "InvoiceContract", values: void} | {tag: "PoolContract", values: void} | {tag: "Initialized", values: void} | {tag: "ScoreVersion", values: void} | {tag: "MaxPaymentHistory", values: void} | {tag: "Paused", values: void} | {tag: "ProposedWasmHash", values: void} | {tag: "UpgradeScheduledAt", values: void} | {tag: "ContractVersion", values: void} | {tag: "MigrationVersion", values: void} | {tag: "LateThreshold", values: void} | {tag: "ScoreThresholds", values: void} | {tag: "UpgradeTimelockSecs", values: void};


export interface PaymentRecord {
  amount: i128;
  days_late: i64;
  due_date: u64;
  invoice_id: u64;
  paid_at: u64;
  sme: string;
  status: PaymentStatus;
}

export type PaymentStatus = {tag: "PaidOnTime", values: void} | {tag: "PaidLate", values: void} | {tag: "Defaulted", values: void};


export interface ScoringConfig {
  averages: ScoreAverageConfig;
  bonuses: ScoreBonusConfig;
  core: ScoreCoreConfig;
}


export interface CreditScoreData {
  average_payment_days: i64;
  defaulted: u32;
  last_updated: u64;
  paid_late: u32;
  paid_on_time: u32;
  score: u32;
  score_version: u32;
  sme: string;
  total_invoices: u32;
  total_volume: i128;
}


export interface ScoreCoreConfig {
  base_score: u32;
  defaulted_pts: i32;
  max_score: u32;
  min_score: u32;
  paid_late_pts: i32;
  paid_on_time_pts: i32;
  score_version: u32;
}


export interface ScoreThresholds {
  excellent: u32;
  fair: u32;
  good: u32;
  very_good: u32;
}

/**
 * #396: Typed error codes for the credit-score contract.
 * All error codes are stable — do not re-number existing entries.
 */
export const Errors = {
  /**
   * Contract has already been initialised.
   */
  1: {message:"AlreadyInitialized"},

  /**
   * Caller is not the contract admin.
   */
  2: {message:"Unauthorized"},

  /**
   * Contract is paused; state-changing calls are blocked.
   */
  3: {message:"ContractPaused"},

  /**
   * This invoice has already been recorded in the credit score.
   */
  4: {message:"InvoiceAlreadyProcessed"},

  /**
   * Score thresholds are not strictly decreasing.
   */
  5: {message:"InvalidThresholds"},

  /**
   * Late-payment threshold is outside the valid 1–365 day range.
   */
  6: {message:"InvalidLateThreshold"},

  /**
   * Payment history limit must be greater than zero.
   */
  7: {message:"PaymentHistoryLimitZero"},

  /**
   * Upgrade timelock has not yet elapsed.
   */
  8: {message:"UpgradeTimelockNotExpired"},

  /**
   * No upgrade has been proposed.
   */
  9: {message:"NoUpgradeProposed"},

  /**
   * #338: upgrade timelock value is below the allowed minimum.
   */
  10: {message:"InvalidUpgradeTimelock"},

  /**
   * #340: proposed WASM hash is all-zero (invalid).
   */
  11: {message:"InvalidWasmHash"}
}

export interface ScoreBonusConfig {
  inv_bonus_pts: i32;
  inv_bonus_thr1: u32;
  inv_bonus_thr2: u32;
  inv_bonus_thr3: u32;
  vol_bonus_pts1: i32;
  vol_bonus_pts2: i32;
  vol_bonus_pts3: i32;
  vol_bonus_thr1: i128;
  vol_bonus_thr2: i128;
  vol_bonus_thr3: i128;
}


/**
 * Semantic version of this credit-score contract (#237).
 */
export interface CreditScoreVersion {
  major: u32;
  minor: u32;
  patch: u32;
}


export interface ScoreAverageConfig {
  avg_days_lt3: i64;
  avg_days_lt7: i64;
  avg_lt3_pts: i32;
  avg_lt7_pts: i32;
  avg_neg_pts: i32;
  avg_over_late_pts: i32;
}


export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause: ({admin}: {admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unpause: ({admin}: {admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the semantic version of this deployed credit-score contract (#237).
   */
  version: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<CreditScoreVersion>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_paused: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [string, string, string]>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, invoice_contract, pool_contract}: {admin: string, invoice_contract: string, pool_contract: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a run_migration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Run pending storage migrations after a WASM upgrade (#397).
   * 
   * Admin-only and idempotent: once the contract has reached
   * `CURRENT_MIGRATION_VERSION` further calls are a no-op. Each migration
   * step transforms the persistent storage layout for one schema version
   * and is meant to be invoked manually after `execute_upgrade`.
   */
  run_migration: ({admin}: {admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_score_band transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_score_band: ({score}: {score: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a record_default transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record_default: ({caller, invoice_id, sme, amount, due_date}: {caller: string, invoice_id: u64, sme: string, amount: i128, due_date: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a record_payment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record_payment: ({caller, invoice_id, sme, amount, due_date, paid_at}: {caller: string, invoice_id: u64, sme: string, amount: i128, due_date: u64, paid_at: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a execute_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute_upgrade: ({admin}: {admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose_upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose_upgrade: ({admin, wasm_hash}: {admin: string, wasm_hash: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_credit_score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_credit_score: ({sme}: {sme: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<CreditScoreData>>

  /**
   * Construct and simulate a migration_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the applied storage-schema migration level (#397).
   */
  migration_version: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_pool_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_pool_contract: ({admin, pool_contract}: {admin: string, pool_contract: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_late_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the current late-payment threshold in days (default 30).
   */
  get_late_threshold: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i64>>

  /**
   * Construct and simulate a get_payment_record transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_payment_record: ({sme, index}: {sme: string, index: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Option<PaymentRecord>>>

  /**
   * Construct and simulate a get_scoring_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_scoring_config: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<ScoringConfig>>

  /**
   * Construct and simulate a set_late_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the late-payment threshold (in days) used in score calculation.
   * Default is 30 days. Valid range: 1–365.
   */
  set_late_threshold: ({admin, days}: {admin: string, days: i64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_scoring_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_scoring_config: ({admin, config}: {admin: string, config: ScoringConfig}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_payment_history transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_payment_history: ({sme}: {sme: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Array<PaymentRecord>>>

  /**
   * Construct and simulate a get_score_thresholds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_score_thresholds: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<ScoreThresholds>>

  /**
   * Construct and simulate a get_upgrade_timelock transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the configured upgrade timelock in seconds (#338).
   */
  get_upgrade_timelock: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a is_invoice_processed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_invoice_processed: ({invoice_id}: {invoice_id: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_invoice_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_invoice_contract: ({admin, invoice_contract}: {admin: string, invoice_contract: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_score_thresholds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_score_thresholds: ({admin, thresholds}: {admin: string, thresholds: ScoreThresholds}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_upgrade_timelock transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the upgrade timelock duration in seconds (#338).
   * Minimum: 3,600 s (1 h). Default: 86,400 s (24 h).
   */
  set_upgrade_timelock: ({admin, secs}: {admin: string, secs: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_max_payment_history transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_max_payment_history: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_max_payment_history transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_max_payment_history: ({admin, max_history}: {admin: string, max_history: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_payment_history_length transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_payment_history_length: ({sme}: {sme: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_payment_record_score_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_payment_record_score_version: ({invoice_id}: {invoice_id: u64}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Option<u32>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initalizing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAEtSZXR1cm5zIHRoZSBzZW1hbnRpYyB2ZXJzaW9uIG9mIHRoaXMgZGVwbG95ZWQgY3JlZGl0LXNjb3JlIGNvbnRyYWN0ICgjMjM3KS4AAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAfQAAAAEkNyZWRpdFNjb3JlVmVyc2lvbgAA",
        "AAAAAAAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAFQAAAAEAAAAAAAAAC0NyZWRpdFNjb3JlAAAAAAEAAAATAAAAAQAAAEFOdW1iZXIgb2YgcmV0YWluZWQgcmVjb3JkcyBpbiB0aGUgcm9sbGluZyBwYXltZW50IGhpc3Rvcnkgd2luZG93LgAAAAAAAA5QYXltZW50SGlzdG9yeQAAAAAAAQAAABMAAAABAAAAAAAAABNQYXltZW50SGlzdG9yeVN0YXJ0AAAAAAEAAAATAAAAAQAAAAAAAAAQUGF5bWVudFJlY29yZElkeAAAAAIAAAATAAAABAAAAAEAAAAAAAAAGVBheW1lbnRSZWNvcmRTY29yZVZlcnNpb24AAAAAAAABAAAABgAAAAEAAAAAAAAAEEludm9pY2VQcm9jZXNzZWQAAAABAAAABgAAAAAAAAAAAAAADVNjb3JpbmdDb25maWcAAAAAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAAD0ludm9pY2VDb250cmFjdAAAAAAAAAAAAAAAAAxQb29sQ29udHJhY3QAAAAAAAAAAAAAAAtJbml0aWFsaXplZAAAAAAAAAAAAAAAAAxTY29yZVZlcnNpb24AAAAAAAAAPFNpemUgb2YgdGhlIHJvbGxpbmcgcGF5bWVudC1oaXN0b3J5IHdpbmRvdyByZXRhaW5lZCBwZXIgU01FLgAAABFNYXhQYXltZW50SGlzdG9yeQAAAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAAAAAAAAAAAQUHJvcG9zZWRXYXNtSGFzaAAAAAAAAAAAAAAAElVwZ3JhZGVTY2hlZHVsZWRBdAAAAAAAAAAAADNTZW1hbnRpYyB2ZXJzaW9uIHN0b3JlZCBkdXJpbmcgaW5pdGlhbGl6ZSgpICgjMjM3KS4AAAAAD0NvbnRyYWN0VmVyc2lvbgAAAAAAAAAALkFwcGxpZWQgc3RvcmFnZS1zY2hlbWEgbWlncmF0aW9uIGxldmVsICgjMzk3KS4AAAAAABBNaWdyYXRpb25WZXJzaW9uAAAAAAAAADNDb25maWd1cmFibGUgbGF0ZS1wYXltZW50IHRocmVzaG9sZCBpbiBkYXlzICgjNDMwKS4AAAAADUxhdGVUaHJlc2hvbGQAAAAAAAAAAAAARiM0Mjg6IENvbmZpZ3VyYWJsZSBzY29yZSB0aHJlc2hvbGRzIChFeGNlbGxlbnQsIFZlcnkgR29vZCwgR29vZCwgRmFpcikAAAAAAA9TY29yZVRocmVzaG9sZHMAAAAAAAAAADcjMzM4OiBjb25maWd1cmFibGUgdXBncmFkZSB0aW1lbG9jayBkdXJhdGlvbiBpbiBzZWNvbmRzAAAAABNVcGdyYWRlVGltZWxvY2tTZWNzAA==",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPtAAAAAwAAABMAAAATAAAAEw==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABBpbnZvaWNlX2NvbnRyYWN0AAAAEwAAAAAAAAANcG9vbF9jb250cmFjdAAAAAAAABMAAAAA",
        "AAAAAAAAAT1SdW4gcGVuZGluZyBzdG9yYWdlIG1pZ3JhdGlvbnMgYWZ0ZXIgYSBXQVNNIHVwZ3JhZGUgKCMzOTcpLgoKQWRtaW4tb25seSBhbmQgaWRlbXBvdGVudDogb25jZSB0aGUgY29udHJhY3QgaGFzIHJlYWNoZWQKYENVUlJFTlRfTUlHUkFUSU9OX1ZFUlNJT05gIGZ1cnRoZXIgY2FsbHMgYXJlIGEgbm8tb3AuIEVhY2ggbWlncmF0aW9uCnN0ZXAgdHJhbnNmb3JtcyB0aGUgcGVyc2lzdGVudCBzdG9yYWdlIGxheW91dCBmb3Igb25lIHNjaGVtYSB2ZXJzaW9uCmFuZCBpcyBtZWFudCB0byBiZSBpbnZva2VkIG1hbnVhbGx5IGFmdGVyIGBleGVjdXRlX3VwZ3JhZGVgLgAAAAAAAA1ydW5fbWlncmF0aW9uAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAOZ2V0X3Njb3JlX2JhbmQAAAAAAAEAAAAAAAAABXNjb3JlAAAAAAAABAAAAAEAAAAQ",
        "AAAAAAAAAAAAAAAOcmVjb3JkX2RlZmF1bHQAAAAAAAUAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAKaW52b2ljZV9pZAAAAAAABgAAAAAAAAADc21lAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAIZHVlX2RhdGUAAAAGAAAAAA==",
        "AAAAAAAAAAAAAAAOcmVjb3JkX3BheW1lbnQAAAAAAAYAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAKaW52b2ljZV9pZAAAAAAABgAAAAAAAAADc21lAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAIZHVlX2RhdGUAAAAGAAAAAAAAAAdwYWlkX2F0AAAAAAYAAAAA",
        "AAAAAAAAAAAAAAAPZXhlY3V0ZV91cGdyYWRlAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAPcHJvcG9zZV91cGdyYWRlAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAQAAAAAAAAAAAAAADVBheW1lbnRSZWNvcmQAAAAAAAAHAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACWRheXNfbGF0ZQAAAAAAAAcAAAAAAAAACGR1ZV9kYXRlAAAABgAAAAAAAAAKaW52b2ljZV9pZAAAAAAABgAAAAAAAAAHcGFpZF9hdAAAAAAGAAAAAAAAAANzbWUAAAAAEwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADVBheW1lbnRTdGF0dXMAAAA=",
        "AAAAAgAAAAAAAAAAAAAADVBheW1lbnRTdGF0dXMAAAAAAAADAAAAAAAAAAAAAAAKUGFpZE9uVGltZQAAAAAAAAAAAAAAAAAIUGFpZExhdGUAAAAAAAAAAAAAAAlEZWZhdWx0ZWQAAAA=",
        "AAAAAQAAAAAAAAAAAAAADVNjb3JpbmdDb25maWcAAAAAAAADAAAAAAAAAAhhdmVyYWdlcwAAB9AAAAASU2NvcmVBdmVyYWdlQ29uZmlnAAAAAAAAAAAAB2JvbnVzZXMAAAAH0AAAABBTY29yZUJvbnVzQ29uZmlnAAAAAAAAAARjb3JlAAAH0AAAAA9TY29yZUNvcmVDb25maWcA",
        "AAAAAAAAAAAAAAAQZ2V0X2NyZWRpdF9zY29yZQAAAAEAAAAAAAAAA3NtZQAAAAATAAAAAQAAB9AAAAAPQ3JlZGl0U2NvcmVEYXRhAA==",
        "AAAAAAAAADpSZXR1cm5zIHRoZSBhcHBsaWVkIHN0b3JhZ2Utc2NoZW1hIG1pZ3JhdGlvbiBsZXZlbCAoIzM5NykuAAAAAAARbWlncmF0aW9uX3ZlcnNpb24AAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAARc2V0X3Bvb2xfY29udHJhY3QAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADXBvb2xfY29udHJhY3QAAAAAAAATAAAAAA==",
        "AAAAAQAAAAAAAAAAAAAAD0NyZWRpdFNjb3JlRGF0YQAAAAAKAAAAAAAAABRhdmVyYWdlX3BheW1lbnRfZGF5cwAAAAcAAAAAAAAACWRlZmF1bHRlZAAAAAAAAAQAAAAAAAAADGxhc3RfdXBkYXRlZAAAAAYAAAAAAAAACXBhaWRfbGF0ZQAAAAAAAAQAAAAAAAAADHBhaWRfb25fdGltZQAAAAQAAAAAAAAABXNjb3JlAAAAAAAABAAAAAAAAAANc2NvcmVfdmVyc2lvbgAAAAAAAAQAAAAAAAAAA3NtZQAAAAATAAAAAAAAAA50b3RhbF9pbnZvaWNlcwAAAAAABAAAAAAAAAAMdG90YWxfdm9sdW1lAAAACw==",
        "AAAAAQAAAAAAAAAAAAAAD1Njb3JlQ29yZUNvbmZpZwAAAAAHAAAAAAAAAApiYXNlX3Njb3JlAAAAAAAEAAAAAAAAAA1kZWZhdWx0ZWRfcHRzAAAAAAAABQAAAAAAAAAJbWF4X3Njb3JlAAAAAAAABAAAAAAAAAAJbWluX3Njb3JlAAAAAAAABAAAAAAAAAANcGFpZF9sYXRlX3B0cwAAAAAAAAUAAAAAAAAAEHBhaWRfb25fdGltZV9wdHMAAAAFAAAAAAAAAA1zY29yZV92ZXJzaW9uAAAAAAAABA==",
        "AAAAAQAAAAAAAAAAAAAAD1Njb3JlVGhyZXNob2xkcwAAAAAEAAAAAAAAAAlleGNlbGxlbnQAAAAAAAAEAAAAAAAAAARmYWlyAAAABAAAAAAAAAAEZ29vZAAAAAQAAAAAAAAACXZlcnlfZ29vZAAAAAAAAAQ=",
        "AAAAAAAAAEBSZXR1cm5zIHRoZSBjdXJyZW50IGxhdGUtcGF5bWVudCB0aHJlc2hvbGQgaW4gZGF5cyAoZGVmYXVsdCAzMCkuAAAAEmdldF9sYXRlX3RocmVzaG9sZAAAAAAAAAAAAAEAAAAH",
        "AAAAAAAAAAAAAAASZ2V0X3BheW1lbnRfcmVjb3JkAAAAAAACAAAAAAAAAANzbWUAAAAAEwAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAA+gAAAfQAAAADVBheW1lbnRSZWNvcmQAAAA=",
        "AAAAAAAAAAAAAAASZ2V0X3Njb3JpbmdfY29uZmlnAAAAAAAAAAAAAQAAB9AAAAANU2NvcmluZ0NvbmZpZwAAAA==",
        "AAAAAAAAAG1TZXQgdGhlIGxhdGUtcGF5bWVudCB0aHJlc2hvbGQgKGluIGRheXMpIHVzZWQgaW4gc2NvcmUgY2FsY3VsYXRpb24uCkRlZmF1bHQgaXMgMzAgZGF5cy4gVmFsaWQgcmFuZ2U6IDHigJMzNjUuAAAAAAAAEnNldF9sYXRlX3RocmVzaG9sZAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAARkYXlzAAAABwAAAAA=",
        "AAAAAAAAAAAAAAASc2V0X3Njb3JpbmdfY29uZmlnAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABmNvbmZpZwAAAAAH0AAAAA1TY29yaW5nQ29uZmlnAAAAAAAAAA==",
        "AAAABAAAAHgjMzk2OiBUeXBlZCBlcnJvciBjb2RlcyBmb3IgdGhlIGNyZWRpdC1zY29yZSBjb250cmFjdC4KQWxsIGVycm9yIGNvZGVzIGFyZSBzdGFibGUg4oCUIGRvIG5vdCByZS1udW1iZXIgZXhpc3RpbmcgZW50cmllcy4AAAAAAAAAEENyZWRpdFNjb3JlRXJyb3IAAAALAAAAJkNvbnRyYWN0IGhhcyBhbHJlYWR5IGJlZW4gaW5pdGlhbGlzZWQuAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAIUNhbGxlciBpcyBub3QgdGhlIGNvbnRyYWN0IGFkbWluLgAAAAAAAAxVbmF1dGhvcml6ZWQAAAACAAAANUNvbnRyYWN0IGlzIHBhdXNlZDsgc3RhdGUtY2hhbmdpbmcgY2FsbHMgYXJlIGJsb2NrZWQuAAAAAAAADkNvbnRyYWN0UGF1c2VkAAAAAAADAAAAO1RoaXMgaW52b2ljZSBoYXMgYWxyZWFkeSBiZWVuIHJlY29yZGVkIGluIHRoZSBjcmVkaXQgc2NvcmUuAAAAABdJbnZvaWNlQWxyZWFkeVByb2Nlc3NlZAAAAAAEAAAALVNjb3JlIHRocmVzaG9sZHMgYXJlIG5vdCBzdHJpY3RseSBkZWNyZWFzaW5nLgAAAAAAABFJbnZhbGlkVGhyZXNob2xkcwAAAAAAAAUAAAA+TGF0ZS1wYXltZW50IHRocmVzaG9sZCBpcyBvdXRzaWRlIHRoZSB2YWxpZCAx4oCTMzY1IGRheSByYW5nZS4AAAAAABRJbnZhbGlkTGF0ZVRocmVzaG9sZAAAAAYAAAAwUGF5bWVudCBoaXN0b3J5IGxpbWl0IG11c3QgYmUgZ3JlYXRlciB0aGFuIHplcm8uAAAAF1BheW1lbnRIaXN0b3J5TGltaXRaZXJvAAAAAAcAAAAlVXBncmFkZSB0aW1lbG9jayBoYXMgbm90IHlldCBlbGFwc2VkLgAAAAAAABlVcGdyYWRlVGltZWxvY2tOb3RFeHBpcmVkAAAAAAAACAAAAB1ObyB1cGdyYWRlIGhhcyBiZWVuIHByb3Bvc2VkLgAAAAAAABFOb1VwZ3JhZGVQcm9wb3NlZAAAAAAAAAkAAAA6IzMzODogdXBncmFkZSB0aW1lbG9jayB2YWx1ZSBpcyBiZWxvdyB0aGUgYWxsb3dlZCBtaW5pbXVtLgAAAAAAFkludmFsaWRVcGdyYWRlVGltZWxvY2sAAAAAAAoAAAAvIzM0MDogcHJvcG9zZWQgV0FTTSBoYXNoIGlzIGFsbC16ZXJvIChpbnZhbGlkKS4AAAAAD0ludmFsaWRXYXNtSGFzaAAAAAAL",
        "AAAAAQAAAAAAAAAAAAAAEFNjb3JlQm9udXNDb25maWcAAAAKAAAAAAAAAA1pbnZfYm9udXNfcHRzAAAAAAAABQAAAAAAAAAOaW52X2JvbnVzX3RocjEAAAAAAAQAAAAAAAAADmludl9ib251c190aHIyAAAAAAAEAAAAAAAAAA5pbnZfYm9udXNfdGhyMwAAAAAABAAAAAAAAAAOdm9sX2JvbnVzX3B0czEAAAAAAAUAAAAAAAAADnZvbF9ib251c19wdHMyAAAAAAAFAAAAAAAAAA52b2xfYm9udXNfcHRzMwAAAAAABQAAAAAAAAAOdm9sX2JvbnVzX3RocjEAAAAAAAsAAAAAAAAADnZvbF9ib251c190aHIyAAAAAAALAAAAAAAAAA52b2xfYm9udXNfdGhyMwAAAAAACw==",
        "AAAAAAAAAAAAAAATZ2V0X3BheW1lbnRfaGlzdG9yeQAAAAABAAAAAAAAAANzbWUAAAAAEwAAAAEAAAPqAAAH0AAAAA1QYXltZW50UmVjb3JkAAAA",
        "AAAAAAAAAAAAAAAUZ2V0X3Njb3JlX3RocmVzaG9sZHMAAAAAAAAAAQAAB9AAAAAPU2NvcmVUaHJlc2hvbGRzAA==",
        "AAAAAAAAADpSZXR1cm5zIHRoZSBjb25maWd1cmVkIHVwZ3JhZGUgdGltZWxvY2sgaW4gc2Vjb25kcyAoIzMzOCkuAAAAAAAUZ2V0X3VwZ3JhZGVfdGltZWxvY2sAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAAUaXNfaW52b2ljZV9wcm9jZXNzZWQAAAABAAAAAAAAAAppbnZvaWNlX2lkAAAAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAUc2V0X2ludm9pY2VfY29udHJhY3QAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAEGludm9pY2VfY29udHJhY3QAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAUc2V0X3Njb3JlX3RocmVzaG9sZHMAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACnRocmVzaG9sZHMAAAAAB9AAAAAPU2NvcmVUaHJlc2hvbGRzAAAAAAA=",
        "AAAAAAAAAGZTZXQgdGhlIHVwZ3JhZGUgdGltZWxvY2sgZHVyYXRpb24gaW4gc2Vjb25kcyAoIzMzOCkuCk1pbmltdW06IDMsNjAwIHMgKDEgaCkuIERlZmF1bHQ6IDg2LDQwMCBzICgyNCBoKS4AAAAAABRzZXRfdXBncmFkZV90aW1lbG9jawAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEc2VjcwAAAAYAAAAA",
        "AAAAAQAAADZTZW1hbnRpYyB2ZXJzaW9uIG9mIHRoaXMgY3JlZGl0LXNjb3JlIGNvbnRyYWN0ICgjMjM3KS4AAAAAAAAAAAASQ3JlZGl0U2NvcmVWZXJzaW9uAAAAAAADAAAAAAAAAAVtYWpvcgAAAAAAAAQAAAAAAAAABW1pbm9yAAAAAAAABAAAAAAAAAAFcGF0Y2gAAAAAAAAE",
        "AAAAAQAAAAAAAAAAAAAAElNjb3JlQXZlcmFnZUNvbmZpZwAAAAAABgAAAAAAAAAMYXZnX2RheXNfbHQzAAAABwAAAAAAAAAMYXZnX2RheXNfbHQ3AAAABwAAAAAAAAALYXZnX2x0M19wdHMAAAAABQAAAAAAAAALYXZnX2x0N19wdHMAAAAABQAAAAAAAAALYXZnX25lZ19wdHMAAAAABQAAAAAAAAARYXZnX292ZXJfbGF0ZV9wdHMAAAAAAAAF",
        "AAAAAAAAAAAAAAAXZ2V0X21heF9wYXltZW50X2hpc3RvcnkAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAXc2V0X21heF9wYXltZW50X2hpc3RvcnkAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAttYXhfaGlzdG9yeQAAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAaZ2V0X3BheW1lbnRfaGlzdG9yeV9sZW5ndGgAAAAAAAEAAAAAAAAAA3NtZQAAAAATAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAgZ2V0X3BheW1lbnRfcmVjb3JkX3Njb3JlX3ZlcnNpb24AAAABAAAAAAAAAAppbnZvaWNlX2lkAAAAAAAGAAAAAQAAA+gAAAAE" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<null>,
        unpause: this.txFromJSON<null>,
        version: this.txFromJSON<CreditScoreVersion>,
        is_paused: this.txFromJSON<boolean>,
        get_config: this.txFromJSON<readonly [string, string, string]>,
        initialize: this.txFromJSON<null>,
        run_migration: this.txFromJSON<null>,
        get_score_band: this.txFromJSON<string>,
        record_default: this.txFromJSON<null>,
        record_payment: this.txFromJSON<null>,
        execute_upgrade: this.txFromJSON<null>,
        propose_upgrade: this.txFromJSON<null>,
        get_credit_score: this.txFromJSON<CreditScoreData>,
        migration_version: this.txFromJSON<u32>,
        set_pool_contract: this.txFromJSON<null>,
        get_late_threshold: this.txFromJSON<i64>,
        get_payment_record: this.txFromJSON<Option<PaymentRecord>>,
        get_scoring_config: this.txFromJSON<ScoringConfig>,
        set_late_threshold: this.txFromJSON<null>,
        set_scoring_config: this.txFromJSON<null>,
        get_payment_history: this.txFromJSON<Array<PaymentRecord>>,
        get_score_thresholds: this.txFromJSON<ScoreThresholds>,
        get_upgrade_timelock: this.txFromJSON<u64>,
        is_invoice_processed: this.txFromJSON<boolean>,
        set_invoice_contract: this.txFromJSON<null>,
        set_score_thresholds: this.txFromJSON<null>,
        set_upgrade_timelock: this.txFromJSON<null>,
        get_max_payment_history: this.txFromJSON<u32>,
        set_max_payment_history: this.txFromJSON<null>,
        get_payment_history_length: this.txFromJSON<u32>,
        get_payment_record_score_version: this.txFromJSON<Option<u32>>
  }
}