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




export type DataKey = {tag: "Invoice", values: readonly [u64]} | {tag: "InvoiceCount", values: void} | {tag: "Admin", values: void} | {tag: "Pool", values: void} | {tag: "Oracle", values: void} | {tag: "Initialized", values: void} | {tag: "StorageStats", values: void} | {tag: "Paused", values: void} | {tag: "MinDueDateWindowSecs", values: void} | {tag: "DailyInvoiceCount", values: readonly [string]} | {tag: "DailyInvoiceResetTime", values: readonly [string]} | {tag: "ProposedWasmHash", values: void} | {tag: "UpgradeScheduledAt", values: void} | {tag: "GracePeriodDays", values: void} | {tag: "MaxInvoiceAmount", values: void} | {tag: "MaxOutstandingPerSme", values: void} | {tag: "ExpirationDurationSecs", values: void} | {tag: "DailyInvoiceLimit", values: void} | {tag: "DisputeResolutionWindow", values: void} | {tag: "ContractVersion", values: void} | {tag: "MigrationVersion", values: void} | {tag: "RequireRegisteredDebtor", values: void} | {tag: "DebtorRecord", values: readonly [string]} | {tag: "DebtorIds", values: void} | {tag: "SmeOutstanding", values: readonly [string]} | {tag: "MetadataImageUri", values: void} | {tag: "CompletedInvoiceTtl", values: void} | {tag: "UpgradeTimelockSecs", values: void};


export interface Invoice {
  amount: i128;
  created_at: u64;
  debtor: string;
  description: string;
  dispute_reason: string;
  disputed_at: u64;
  due_date: u64;
  funded_at: u64;
  grace_period_override: Option<u32>;
  id: u64;
  metadata_uri: Option<string>;
  oracle_verified: boolean;
  original_due_date: u64;
  owner: string;
  paid_at: u64;
  pending_due_date: Option<u64>;
  pool_contract: string;
  status: InvoiceStatus;
  verification_hash: string;
}


export interface DebtorRecord {
  current_exposure: i128;
  debtor_id: string;
  debtor_name: string;
  is_active: boolean;
  max_exposure: i128;
}

export const Errors = {
  1: {message:"Unauthorized"},

  2: {message:"InvalidStatusTransition"},

  3: {message:"InvoiceNotFound"},

  4: {message:"HashMismatch"},

  5: {message:"SmeExposureLimitExceeded"},

  6: {message:"AmountOverflow"},

  7: {message:"EmptyField"},

  8: {message:"FieldTooLong"},

  9: {message:"DateOverflow"},

  10: {message:"InvalidMetadata"},

  11: {message:"DescriptionTooLong"},

  12: {message:"DebtorNameTooLong"},

  13: {message:"VerificationHashTooLong"},

  14: {message:"ExtensionAlreadyPending"},

  15: {message:"InvalidDueDateExtension"},

  16: {message:"ExtensionTooLarge"},

  17: {message:"NoPendingExtension"},

  18: {message:"PoolCallFailed"},

  19: {message:"ArithmeticOverflow"},

  20: {message:"EmptyDebtorName"},

  21: {message:"EmptyDescription"},

  22: {message:"InvalidVerificationHash"},

  23: {message:"DueDateTooSoon"},

  24: {message:"UpgradeTimelockNotExpired"},

  25: {message:"InvalidUpgradeTimelock"},

  26: {message:"InvalidWasmHash"}
}

export interface StorageStats {
  active_invoices: u64;
  cleaned_invoices: u64;
  total_invoices: u64;
}

export type InvoiceStatus = {tag: "Pending", values: void} | {tag: "AwaitingVerification", values: void} | {tag: "Verified", values: void} | {tag: "Disputed", values: void} | {tag: "Funded", values: void} | {tag: "Paid", values: void} | {tag: "Defaulted", values: void} | {tag: "Cancelled", values: void} | {tag: "Expired", values: void};


export interface ContractVersion {
  major: u32;
  minor: u32;
  patch: u32;
}


export interface InvoiceMetadata {
  amount: i128;
  debtor: string;
  decimals: u32;
  description: string;
  due_date: u64;
  image: string;
  name: string;
  status: InvoiceStatus;
  symbol: string;
}

export type DisputeResolution = {tag: "InFavorOfSME", values: void} | {tag: "InFavorOfDebtor", values: void};


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
  }) => Promise<AssembledTransaction<ContractVersion>>

  /**
   * Construct and simulate a set_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_pool: ({admin, pool}: {admin: string, pool: string}, options?: {
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
   * Construct and simulate a mark_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mark_paid: ({id, pool}: {id: u64, pool: string}, options?: {
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
   * Construct and simulate a get_debtor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_debtor: ({debtor_id}: {debtor_id: string}, options?: {
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
  }) => Promise<AssembledTransaction<DebtorRecord>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, pool, max_invoice_amount, expiration_duration_secs, grace_period_days}: {admin: string, pool: string, max_invoice_amount: i128, expiration_duration_secs: u64, grace_period_days: u32}, options?: {
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
   * Construct and simulate a set_oracle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_oracle: ({admin, oracle}: {admin: string, oracle: string}, options?: {
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
   * Construct and simulate a get_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_invoice: ({id}: {id: u64}, options?: {
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
  }) => Promise<AssembledTransaction<Invoice>>

  /**
   * Construct and simulate a mark_funded transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mark_funded: ({id, pool}: {id: u64, pool: string}, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_metadata: ({id}: {id: u64}, options?: {
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
  }) => Promise<AssembledTransaction<InvoiceMetadata>>

  /**
   * Construct and simulate a list_debtors transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_debtors: (options?: {
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
  }) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a run_migration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
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
   * Construct and simulate a cancel_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_invoice: ({id, caller}: {id: u64, caller: string}, options?: {
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
   * Construct and simulate a create_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_invoice: ({owner, debtor, amount, due_date, description, verification_hash, metadata_url}: {owner: string, debtor: string, amount: i128, due_date: u64, description: string, verification_hash: string, metadata_url: string}, options?: {
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
   * Construct and simulate a mark_defaulted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mark_defaulted: ({id, pool}: {id: u64, pool: string}, options?: {
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
   * Construct and simulate a verify_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_invoice: ({id, oracle, approved, reason, oracle_hash}: {id: u64, oracle: string, approved: boolean, reason: string, oracle_hash: string}, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cleanup_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only single-entry cleanup (existing behaviour, unchanged).
   */
  cleanup_invoice: ({id, caller}: {id: u64, caller: string}, options?: {
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
   * Construct and simulate a register_debtor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_debtor: ({admin, debtor_id, debtor_name, max_exposure}: {admin: string, debtor_id: string, debtor_name: string, max_exposure: i128}, options?: {
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
   * Construct and simulate a resolve_dispute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  resolve_dispute: ({id, caller, resolution}: {id: u64, caller: string, resolution: DisputeResolution}, options?: {
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
   * Construct and simulate a check_expiration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  check_expiration: ({id}: {id: u64}, options?: {
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
   * Construct and simulate a get_grace_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_grace_period: (options?: {
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
   * Construct and simulate a set_grace_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_grace_period: ({admin, days}: {admin: string, days: u32}, options?: {
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
   * Construct and simulate a approve_extension transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  approve_extension: ({id, approver}: {id: u64, approver: string}, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a deactivate_debtor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deactivate_debtor: ({admin, debtor_id}: {admin: string, debtor_id: string}, options?: {
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
   * Construct and simulate a get_invoice_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_invoice_count: (options?: {
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
   * Construct and simulate a get_storage_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_storage_stats: (options?: {
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
  }) => Promise<AssembledTransaction<StorageStats>>

  /**
   * Construct and simulate a migration_version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
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
   * Construct and simulate a request_extension transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  request_extension: ({id, owner, new_due_date}: {id: u64, owner: string, new_due_date: u64}, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_dispute_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_dispute_window: (options?: {
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
   * Construct and simulate a set_dispute_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_dispute_window: ({admin, window}: {admin: string, window: u64}, options?: {
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
   * Construct and simulate a get_authorized_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the currently authorized pool address (#385).
   */
  get_authorized_pool: (options?: {
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
   * Construct and simulate a get_sme_outstanding transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_sme_outstanding: ({sme}: {sme: string}, options?: {
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
  }) => Promise<AssembledTransaction<i128>>

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
   * Construct and simulate a is_invoice_defaulted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns true if the invoice with `id` has status Defaulted (#386).
   */
  is_invoice_defaulted: ({id}: {id: u64}, options?: {
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
   * Construct and simulate a check_default_warning transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  check_default_warning: ({id}: {id: u64}, options?: {
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
   * Construct and simulate a estimate_storage_cost transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Estimate the current monthly persistent storage rent in stroops (#290).
   * 
   * Uses `StorageStats.active_invoices` as the live entry count and applies
   * a conservative per-ledger rate:
   * 
   * ```text
   * active_invoices × STROOPS_PER_LEDGER_PER_ENTRY × LEDGERS_PER_MONTH
   * ```
   * 
   * **Approximation only** — real costs vary with entry size, TTL settings,
   * and network fee schedules.
   * 
   * # Returns
   * Estimated rent cost in stroops per month.
   */
  estimate_storage_cost: (options?: {
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
   * Construct and simulate a get_multiple_invoices transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_multiple_invoices: ({ids}: {ids: Array<u64>}, options?: {
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
  }) => Promise<AssembledTransaction<Array<Invoice>>>

  /**
   * Construct and simulate a batch_check_expiration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  batch_check_expiration: ({ids}: {ids: Array<u64>}, options?: {
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
   * Construct and simulate a get_max_invoice_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_max_invoice_amount: (options?: {
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
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_metadata_image_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_metadata_image_uri: (options?: {
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
   * Construct and simulate a set_max_invoice_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_max_invoice_amount: ({admin, max_invoice_amount}: {admin: string, max_invoice_amount: i128}, options?: {
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
   * Construct and simulate a set_metadata_image_uri transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_metadata_image_uri: ({admin, uri}: {admin: string, uri: string}, options?: {
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
   * Construct and simulate a cleanup_expired_storage transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove terminal invoice entries from persistent storage in batch (#290).
   * 
   * **Public function** — callable by anyone (caller must sign; no admin role
   * required) to keep storage lean and reduce ongoing rent costs.
   * 
   * Terminal states: `Paid`, `Defaulted`, `Cancelled`, `Expired`.
   * Active invoices (`Pending`, `AwaitingVerification`, `Verified`, `Funded`,
   * `Disputed`) are **silently skipped** — they are never removed.
   * 
   * The function is idempotent: IDs that were already removed (or never
   * existed) are skipped without panicking.
   * 
   * # Arguments
   * * `caller` — Any address that authorises the call.
   * * `ids`    — Batch of invoice IDs to attempt cleanup (max 50 per call).
   * 
   * # Returns
   * Number of entries actually removed in this call.
   * 
   * # Events
   * Emits `(INVOICE, "st_clean")` with `(removed_count, caller)` when at
   * least one entry is removed.
   * 
   * # Panics
   * Panics if `ids.len() > MAX_CLEANUP_BATCH` (50).
   */
  cleanup_expired_storage: ({caller, ids}: {caller: string, ids: Array<u64>}, options?: {
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
   * Construct and simulate a get_daily_invoice_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_daily_invoice_limit: (options?: {
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
   * Construct and simulate a get_expiration_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_expiration_duration: (options?: {
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
   * Construct and simulate a get_min_due_date_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_min_due_date_window: (options?: {
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
   * Construct and simulate a set_daily_invoice_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_daily_invoice_limit: ({admin, limit}: {admin: string, limit: u32}, options?: {
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
   * Construct and simulate a set_expiration_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_expiration_duration: ({admin, expiration_duration_secs}: {admin: string, expiration_duration_secs: u64}, options?: {
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
   * Construct and simulate a set_max_sme_outstanding transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_max_sme_outstanding: ({admin, max}: {admin: string, max: i128}, options?: {
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
   * Construct and simulate a set_min_due_date_window transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_min_due_date_window: ({admin, window_secs}: {admin: string, window_secs: u64}, options?: {
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
   * Construct and simulate a get_invoice_grace_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_invoice_grace_period: ({id}: {id: u64}, options?: {
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
   * Construct and simulate a set_invoice_grace_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_invoice_grace_period: ({admin, id, days}: {admin: string, id: u64, days: u32}, options?: {
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
   * Construct and simulate a get_completed_invoice_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * #446: Return the currently configured completed-invoice TTL in ledgers.
   */
  get_completed_invoice_ttl: (options?: {
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
   * Construct and simulate a set_completed_invoice_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * #446: Set the TTL (in ledgers) applied to completed/defaulted/cancelled
   * invoices.  Must be at least as long as `ACTIVE_INVOICE_TTL` (1 year) so
   * historical records are never evicted before active ones.
   */
  set_completed_invoice_ttl: ({admin, ttl_ledgers}: {admin: string, ttl_ledgers: u32}, options?: {
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
   * Construct and simulate a create_invoice_with_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_invoice_with_metadata: ({owner, debtor, amount, due_date, description, verification_hash, metadata_uri}: {owner: string, debtor: string, amount: i128, due_date: u64, description: string, verification_hash: string, metadata_uri: Option<string>}, options?: {
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
   * Construct and simulate a set_require_registered_debtor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_require_registered_debtor: ({admin, required}: {admin: string, required: boolean}, options?: {
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
      new ContractSpec([ "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",
        "AAAABAAAAAAAAAAAAAAADEludm9pY2VFcnJvcgAAABoAAAAAAAAADFVuYXV0aG9yaXplZAAAAAEAAAAAAAAAF0ludmFsaWRTdGF0dXNUcmFuc2l0aW9uAAAAAAIAAAAAAAAAD0ludm9pY2VOb3RGb3VuZAAAAAADAAAAAAAAAAxIYXNoTWlzbWF0Y2gAAAAEAAAAAAAAABhTbWVFeHBvc3VyZUxpbWl0RXhjZWVkZWQAAAAFAAAAAAAAAA5BbW91bnRPdmVyZmxvdwAAAAAABgAAAAAAAAAKRW1wdHlGaWVsZAAAAAAABwAAAAAAAAAMRmllbGRUb29Mb25nAAAACAAAAAAAAAAMRGF0ZU92ZXJmbG93AAAACQAAAAAAAAAPSW52YWxpZE1ldGFkYXRhAAAAAAoAAAAAAAAAEkRlc2NyaXB0aW9uVG9vTG9uZwAAAAAACwAAAAAAAAARRGVidG9yTmFtZVRvb0xvbmcAAAAAAAAMAAAAAAAAABdWZXJpZmljYXRpb25IYXNoVG9vTG9uZwAAAAANAAAAAAAAABdFeHRlbnNpb25BbHJlYWR5UGVuZGluZwAAAAAOAAAAAAAAABdJbnZhbGlkRHVlRGF0ZUV4dGVuc2lvbgAAAAAPAAAAAAAAABFFeHRlbnNpb25Ub29MYXJnZQAAAAAAABAAAAAAAAAAEk5vUGVuZGluZ0V4dGVuc2lvbgAAAAAAEQAAAAAAAAAOUG9vbENhbGxGYWlsZWQAAAAAABIAAAAAAAAAEkFyaXRobWV0aWNPdmVyZmxvdwAAAAAAEwAAAAAAAAAPRW1wdHlEZWJ0b3JOYW1lAAAAABQAAAAAAAAAEEVtcHR5RGVzY3JpcHRpb24AAAAVAAAAAAAAABdJbnZhbGlkVmVyaWZpY2F0aW9uSGFzaAAAAAAWAAAAAAAAAA5EdWVEYXRlVG9vU29vbgAAAAAAFwAAAAAAAAAZVXBncmFkZVRpbWVsb2NrTm90RXhwaXJlZAAAAAAAABgAAAAAAAAAFkludmFsaWRVcGdyYWRlVGltZWxvY2sAAAAAABkAAAAAAAAAD0ludmFsaWRXYXNtSGFzaAAAAAAa",
        "AAAAAQAAAAAAAAAAAAAADFN0b3JhZ2VTdGF0cwAAAAMAAAAAAAAAD2FjdGl2ZV9pbnZvaWNlcwAAAAAGAAAAAAAAABBjbGVhbmVkX2ludm9pY2VzAAAABgAAAAAAAAAOdG90YWxfaW52b2ljZXMAAAAAAAY=",
        "AAAAAAAAAEBBZG1pbi1vbmx5IHNpbmdsZS1lbnRyeSBjbGVhbnVwIChleGlzdGluZyBiZWhhdmlvdXIsIHVuY2hhbmdlZCkuAAAAD2NsZWFudXBfaW52b2ljZQAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAPZXhlY3V0ZV91cGdyYWRlAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAPcHJvcG9zZV91cGdyYWRlAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAPcmVnaXN0ZXJfZGVidG9yAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJZGVidG9yX2lkAAAAAAAAEAAAAAAAAAALZGVidG9yX25hbWUAAAAAEAAAAAAAAAAMbWF4X2V4cG9zdXJlAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAPcmVzb2x2ZV9kaXNwdXRlAAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAACnJlc29sdXRpb24AAAAAB9AAAAARRGlzcHV0ZVJlc29sdXRpb24AAAAAAAAA",
        "AAAAAgAAAAAAAAAAAAAADUludm9pY2VTdGF0dXMAAAAAAAAJAAAAAAAAAAAAAAAHUGVuZGluZwAAAAAAAAAAAAAAABRBd2FpdGluZ1ZlcmlmaWNhdGlvbgAAAAAAAAAAAAAACFZlcmlmaWVkAAAAAAAAAAAAAAAIRGlzcHV0ZWQAAAAAAAAAAAAAAAZGdW5kZWQAAAAAAAAAAAAAAAAABFBhaWQAAAAAAAAAAAAAAAlEZWZhdWx0ZWQAAAAAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAAAAAAAAAAAAAAAAAdFeHBpcmVkAA==",
        "AAAAAAAAAAAAAAAQY2hlY2tfZXhwaXJhdGlvbgAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAQZ2V0X2dyYWNlX3BlcmlvZAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAQc2V0X2dyYWNlX3BlcmlvZAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEZGF5cwAAAAQAAAAA",
        "AAAAAAAAAAAAAAARYXBwcm92ZV9leHRlbnNpb24AAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAIYXBwcm92ZXIAAAATAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAMSW52b2ljZUVycm9y",
        "AAAAAAAAAAAAAAARZGVhY3RpdmF0ZV9kZWJ0b3IAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACWRlYnRvcl9pZAAAAAAAABAAAAAA",
        "AAAAAAAAAAAAAAARZ2V0X2ludm9pY2VfY291bnQAAAAAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAARZ2V0X3N0b3JhZ2Vfc3RhdHMAAAAAAAAAAAAAAQAAB9AAAAAMU3RvcmFnZVN0YXRz",
        "AAAAAAAAAAAAAAARbWlncmF0aW9uX3ZlcnNpb24AAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAARcmVxdWVzdF9leHRlbnNpb24AAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAxuZXdfZHVlX2RhdGUAAAAGAAAAAQAAA+kAAAPtAAAAAAAAB9AAAAAMSW52b2ljZUVycm9y",
        "AAAAAQAAAAAAAAAAAAAAD0NvbnRyYWN0VmVyc2lvbgAAAAADAAAAAAAAAAVtYWpvcgAAAAAAAAQAAAAAAAAABW1pbm9yAAAAAAAABAAAAAAAAAAFcGF0Y2gAAAAAAAAE",
        "AAAAAQAAAAAAAAAAAAAAD0ludm9pY2VNZXRhZGF0YQAAAAAJAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAABmRlYnRvcgAAAAAAEAAAAAAAAAAIZGVjaW1hbHMAAAAEAAAAAAAAAAtkZXNjcmlwdGlvbgAAAAAQAAAAAAAAAAhkdWVfZGF0ZQAAAAYAAAAAAAAABWltYWdlAAAAAAAAEAAAAAAAAAAEbmFtZQAAABAAAAAAAAAABnN0YXR1cwAAAAAH0AAAAA1JbnZvaWNlU3RhdHVzAAAAAAAAAAAAAAZzeW1ib2wAAAAAABA=",
        "AAAAAAAAAAAAAAASZ2V0X2Rpc3B1dGVfd2luZG93AAAAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAASc2V0X2Rpc3B1dGVfd2luZG93AAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABndpbmRvdwAAAAAABgAAAAA=",
        "AAAAAAAAADVSZXR1cm5zIHRoZSBjdXJyZW50bHkgYXV0aG9yaXplZCBwb29sIGFkZHJlc3MgKCMzODUpLgAAAAAAABNnZXRfYXV0aG9yaXplZF9wb29sAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAATZ2V0X3NtZV9vdXRzdGFuZGluZwAAAAABAAAAAAAAAANzbWUAAAAAEwAAAAEAAAAL",
        "AAAAAgAAAAAAAAAAAAAAEURpc3B1dGVSZXNvbHV0aW9uAAAAAAAAAgAAAAAAAAAAAAAADEluRmF2b3JPZlNNRQAAAAAAAAAAAAAAD0luRmF2b3JPZkRlYnRvcgA=",
        "AAAAAAAAADpSZXR1cm5zIHRoZSBjb25maWd1cmVkIHVwZ3JhZGUgdGltZWxvY2sgaW4gc2Vjb25kcyAoIzMzOCkuAAAAAAAUZ2V0X3VwZ3JhZGVfdGltZWxvY2sAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAEJSZXR1cm5zIHRydWUgaWYgdGhlIGludm9pY2Ugd2l0aCBgaWRgIGhhcyBzdGF0dXMgRGVmYXVsdGVkICgjMzg2KS4AAAAAABRpc19pbnZvaWNlX2RlZmF1bHRlZAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAE=",
        "AAAAAAAAAGZTZXQgdGhlIHVwZ3JhZGUgdGltZWxvY2sgZHVyYXRpb24gaW4gc2Vjb25kcyAoIzMzOCkuCk1pbmltdW06IDMsNjAwIHMgKDEgaCkuIERlZmF1bHQ6IDg2LDQwMCBzICgyNCBoKS4AAAAAABRzZXRfdXBncmFkZV90aW1lbG9jawAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEc2VjcwAAAAYAAAAA",
        "AAAAAAAAAAAAAAAVY2hlY2tfZGVmYXVsdF93YXJuaW5nAAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAQ==",
        "AAAAAAAAAZ1Fc3RpbWF0ZSB0aGUgY3VycmVudCBtb250aGx5IHBlcnNpc3RlbnQgc3RvcmFnZSByZW50IGluIHN0cm9vcHMgKCMyOTApLgoKVXNlcyBgU3RvcmFnZVN0YXRzLmFjdGl2ZV9pbnZvaWNlc2AgYXMgdGhlIGxpdmUgZW50cnkgY291bnQgYW5kIGFwcGxpZXMKYSBjb25zZXJ2YXRpdmUgcGVyLWxlZGdlciByYXRlOgoKYGBgdGV4dAphY3RpdmVfaW52b2ljZXMgw5cgU1RST09QU19QRVJfTEVER0VSX1BFUl9FTlRSWSDDlyBMRURHRVJTX1BFUl9NT05USApgYGAKCioqQXBwcm94aW1hdGlvbiBvbmx5Kiog4oCUIHJlYWwgY29zdHMgdmFyeSB3aXRoIGVudHJ5IHNpemUsIFRUTCBzZXR0aW5ncywKYW5kIG5ldHdvcmsgZmVlIHNjaGVkdWxlcy4KCiMgUmV0dXJucwpFc3RpbWF0ZWQgcmVudCBjb3N0IGluIHN0cm9vcHMgcGVyIG1vbnRoLgAAAAAAABVlc3RpbWF0ZV9zdG9yYWdlX2Nvc3QAAAAAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAAVZ2V0X211bHRpcGxlX2ludm9pY2VzAAAAAAAAAQAAAAAAAAADaWRzAAAAA+oAAAAGAAAAAQAAA+oAAAfQAAAAB0ludm9pY2UA",
        "AAAAAAAAAAAAAAAWYmF0Y2hfY2hlY2tfZXhwaXJhdGlvbgAAAAAAAQAAAAAAAAADaWRzAAAAA+oAAAAGAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAWZ2V0X21heF9pbnZvaWNlX2Ftb3VudAAAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAAWZ2V0X21ldGFkYXRhX2ltYWdlX3VyaQAAAAAAAAAAAAEAAAAQ",
        "AAAAAAAAAAAAAAAWc2V0X21heF9pbnZvaWNlX2Ftb3VudAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABJtYXhfaW52b2ljZV9hbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAWc2V0X21ldGFkYXRhX2ltYWdlX3VyaQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAN1cmkAAAAAEAAAAAA=",
        "AAAAAAAAA3dSZW1vdmUgdGVybWluYWwgaW52b2ljZSBlbnRyaWVzIGZyb20gcGVyc2lzdGVudCBzdG9yYWdlIGluIGJhdGNoICgjMjkwKS4KCioqUHVibGljIGZ1bmN0aW9uKiog4oCUIGNhbGxhYmxlIGJ5IGFueW9uZSAoY2FsbGVyIG11c3Qgc2lnbjsgbm8gYWRtaW4gcm9sZQpyZXF1aXJlZCkgdG8ga2VlcCBzdG9yYWdlIGxlYW4gYW5kIHJlZHVjZSBvbmdvaW5nIHJlbnQgY29zdHMuCgpUZXJtaW5hbCBzdGF0ZXM6IGBQYWlkYCwgYERlZmF1bHRlZGAsIGBDYW5jZWxsZWRgLCBgRXhwaXJlZGAuCkFjdGl2ZSBpbnZvaWNlcyAoYFBlbmRpbmdgLCBgQXdhaXRpbmdWZXJpZmljYXRpb25gLCBgVmVyaWZpZWRgLCBgRnVuZGVkYCwKYERpc3B1dGVkYCkgYXJlICoqc2lsZW50bHkgc2tpcHBlZCoqIOKAlCB0aGV5IGFyZSBuZXZlciByZW1vdmVkLgoKVGhlIGZ1bmN0aW9uIGlzIGlkZW1wb3RlbnQ6IElEcyB0aGF0IHdlcmUgYWxyZWFkeSByZW1vdmVkIChvciBuZXZlcgpleGlzdGVkKSBhcmUgc2tpcHBlZCB3aXRob3V0IHBhbmlja2luZy4KCiMgQXJndW1lbnRzCiogYGNhbGxlcmAg4oCUIEFueSBhZGRyZXNzIHRoYXQgYXV0aG9yaXNlcyB0aGUgY2FsbC4KKiBgaWRzYCAgICDigJQgQmF0Y2ggb2YgaW52b2ljZSBJRHMgdG8gYXR0ZW1wdCBjbGVhbnVwIChtYXggNTAgcGVyIGNhbGwpLgoKIyBSZXR1cm5zCk51bWJlciBvZiBlbnRyaWVzIGFjdHVhbGx5IHJlbW92ZWQgaW4gdGhpcyBjYWxsLgoKIyBFdmVudHMKRW1pdHMgYChJTlZPSUNFLCAic3RfY2xlYW4iKWAgd2l0aCBgKHJlbW92ZWRfY291bnQsIGNhbGxlcilgIHdoZW4gYXQKbGVhc3Qgb25lIGVudHJ5IGlzIHJlbW92ZWQuCgojIFBhbmljcwpQYW5pY3MgaWYgYGlkcy5sZW4oKSA+IE1BWF9DTEVBTlVQX0JBVENIYCAoNTApLgAAAAAXY2xlYW51cF9leHBpcmVkX3N0b3JhZ2UAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAANpZHMAAAAD6gAAAAYAAAABAAAABA==",
        "AAAAAAAAAAAAAAAXZ2V0X2RhaWx5X2ludm9pY2VfbGltaXQAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAXZ2V0X2V4cGlyYXRpb25fZHVyYXRpb24AAAAAAAAAAAEAAAAG",
        "AAAAAAAAAAAAAAAXZ2V0X21pbl9kdWVfZGF0ZV93aW5kb3cAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAAAAAAAXc2V0X2RhaWx5X2ludm9pY2VfbGltaXQAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAXc2V0X2V4cGlyYXRpb25fZHVyYXRpb24AAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABhleHBpcmF0aW9uX2R1cmF0aW9uX3NlY3MAAAAGAAAAAA==",
        "AAAAAAAAAAAAAAAXc2V0X21heF9zbWVfb3V0c3RhbmRpbmcAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAANtYXgAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAXc2V0X21pbl9kdWVfZGF0ZV93aW5kb3cAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAt3aW5kb3dfc2VjcwAAAAAGAAAAAA==",
        "AAAAAAAAAAAAAAAYZ2V0X2ludm9pY2VfZ3JhY2VfcGVyaW9kAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAABA==",
        "AAAAAAAAAAAAAAAYc2V0X2ludm9pY2VfZ3JhY2VfcGVyaW9kAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAEZGF5cwAAAAQAAAAA",
        "AAAAAAAAAEcjNDQ2OiBSZXR1cm4gdGhlIGN1cnJlbnRseSBjb25maWd1cmVkIGNvbXBsZXRlZC1pbnZvaWNlIFRUTCBpbiBsZWRnZXJzLgAAAAAZZ2V0X2NvbXBsZXRlZF9pbnZvaWNlX3R0bAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAMgjNDQ2OiBTZXQgdGhlIFRUTCAoaW4gbGVkZ2VycykgYXBwbGllZCB0byBjb21wbGV0ZWQvZGVmYXVsdGVkL2NhbmNlbGxlZAppbnZvaWNlcy4gIE11c3QgYmUgYXQgbGVhc3QgYXMgbG9uZyBhcyBgQUNUSVZFX0lOVk9JQ0VfVFRMYCAoMSB5ZWFyKSBzbwpoaXN0b3JpY2FsIHJlY29yZHMgYXJlIG5ldmVyIGV2aWN0ZWQgYmVmb3JlIGFjdGl2ZSBvbmVzLgAAABlzZXRfY29tcGxldGVkX2ludm9pY2VfdHRsAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAt0dGxfbGVkZ2VycwAAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAcY3JlYXRlX2ludm9pY2Vfd2l0aF9tZXRhZGF0YQAAAAcAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAGZGVidG9yAAAAAAAQAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACGR1ZV9kYXRlAAAABgAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAARdmVyaWZpY2F0aW9uX2hhc2gAAAAAAAAQAAAAAAAAAAxtZXRhZGF0YV91cmkAAAPoAAAAEAAAAAEAAAAG",
        "AAAAAAAAAAAAAAAdc2V0X3JlcXVpcmVfcmVnaXN0ZXJlZF9kZWJ0b3IAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHJlcXVpcmVkAAAAAQAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<null>,
        unpause: this.txFromJSON<null>,
        version: this.txFromJSON<ContractVersion>,
        set_pool: this.txFromJSON<null>,
        is_paused: this.txFromJSON<boolean>,
        mark_paid: this.txFromJSON<null>,
        get_debtor: this.txFromJSON<DebtorRecord>,
        initialize: this.txFromJSON<null>,
        set_oracle: this.txFromJSON<null>,
        get_invoice: this.txFromJSON<Invoice>,
        mark_funded: this.txFromJSON<Result<void>>,
        get_metadata: this.txFromJSON<InvoiceMetadata>,
        list_debtors: this.txFromJSON<Array<string>>,
        run_migration: this.txFromJSON<null>,
        cancel_invoice: this.txFromJSON<null>,
        create_invoice: this.txFromJSON<u64>,
        mark_defaulted: this.txFromJSON<null>,
        verify_invoice: this.txFromJSON<Result<void>>,
        cleanup_invoice: this.txFromJSON<null>,
        execute_upgrade: this.txFromJSON<null>,
        propose_upgrade: this.txFromJSON<null>,
        register_debtor: this.txFromJSON<null>,
        resolve_dispute: this.txFromJSON<null>,
        check_expiration: this.txFromJSON<boolean>,
        get_grace_period: this.txFromJSON<u32>,
        set_grace_period: this.txFromJSON<null>,
        approve_extension: this.txFromJSON<Result<void>>,
        deactivate_debtor: this.txFromJSON<null>,
        get_invoice_count: this.txFromJSON<u64>,
        get_storage_stats: this.txFromJSON<StorageStats>,
        migration_version: this.txFromJSON<u32>,
        request_extension: this.txFromJSON<Result<void>>,
        get_dispute_window: this.txFromJSON<u64>,
        set_dispute_window: this.txFromJSON<null>,
        get_authorized_pool: this.txFromJSON<string>,
        get_sme_outstanding: this.txFromJSON<i128>,
        get_upgrade_timelock: this.txFromJSON<u64>,
        is_invoice_defaulted: this.txFromJSON<boolean>,
        set_upgrade_timelock: this.txFromJSON<null>,
        check_default_warning: this.txFromJSON<boolean>,
        estimate_storage_cost: this.txFromJSON<u64>,
        get_multiple_invoices: this.txFromJSON<Array<Invoice>>,
        batch_check_expiration: this.txFromJSON<u32>,
        get_max_invoice_amount: this.txFromJSON<i128>,
        get_metadata_image_uri: this.txFromJSON<string>,
        set_max_invoice_amount: this.txFromJSON<null>,
        set_metadata_image_uri: this.txFromJSON<null>,
        cleanup_expired_storage: this.txFromJSON<u32>,
        get_daily_invoice_limit: this.txFromJSON<u32>,
        get_expiration_duration: this.txFromJSON<u64>,
        get_min_due_date_window: this.txFromJSON<u64>,
        set_daily_invoice_limit: this.txFromJSON<null>,
        set_expiration_duration: this.txFromJSON<null>,
        set_max_sme_outstanding: this.txFromJSON<null>,
        set_min_due_date_window: this.txFromJSON<null>,
        get_invoice_grace_period: this.txFromJSON<u32>,
        set_invoice_grace_period: this.txFromJSON<null>,
        get_completed_invoice_ttl: this.txFromJSON<u32>,
        set_completed_invoice_ttl: this.txFromJSON<null>,
        create_invoice_with_metadata: this.txFromJSON<u64>,
        set_require_registered_debtor: this.txFromJSON<null>
  }
}