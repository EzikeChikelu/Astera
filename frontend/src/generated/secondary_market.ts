import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
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
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export type DataKey = {tag: "Admin", values: void} | {tag: "PoolContract", values: void} | {tag: "Initialized", values: void} | {tag: "Paused", values: void};


/**
 * A secondary-market listing created by `list_position`.
 * `amount_or_bps` is:
 * - for `CoFunding`: the bps of the seller's CoFundShare being offered
 * - for `SingleFunded`: the raw token amount of deployed principal being offered
 * `price` is the flat token amount the buyer must pay.
 */
export interface Listing {
  amount_or_bps: u64;
  created_at: u64;
  invoice_id: u64;
  kind: ListingKind;
  listing_id: u64;
  price: i128;
  seller: string;
  status: ListingStatus;
  token: string;
}

/**
 * Whether the listing covers a co-funded share (bps of a CoFundingRound)
 * or a single-funded position slice (raw token amount of deployed principal).
 */
export type ListingKind = {tag: "CoFunding", values: void} | {tag: "SingleFunded", values: void};

export const MarketError = {
  0: {message:"AlreadyInitialized"},
  1: {message:"NotInitialized"},
  2: {message:"Unauthorized"},
  3: {message:"ContractPaused"},
  4: {message:"ZeroAmount"},
  5: {message:"InvalidAmount"},
  6: {message:"ListingNotFound"},
  7: {message:"ListingNotOpen"},
  8: {message:"ListingNotSeller"},
  9: {message:"TooManyListings"},
  /**
   * The cross-contract call into pool's `market_settle_listing` failed.
   * Pool's own `PoolError` isn't re-exposed here since it's a different
   * contract's error domain (KYC, compliance, concentration cap, etc.) —
   * callers that need the specific reason should simulate the transaction.
   */
  10: {message:"SettlementFailed"}
}


export interface WaitEstimate {
  capital_ahead: i128;
  /**
 * #865: predicted seconds until this request is likely to clear, projected from
 * `capital_ahead` divided by the trailing deposit-inflow rate, combined with
 * `nearest_invoice_due_date` and clamped to
 * `[MIN_WAIT_ESTIMATE_SECS, MAX_WAIT_ESTIMATE_SECS]`. This is an estimate, not a
 * guarantee — actual settlement depends on future deposits/repayments.
 */
estimated_wait_secs: u64;
  nearest_invoice_due_date: u64;
  queue_position: u32;
}

export type ListingStatus = {tag: "Open", values: void} | {tag: "Filled", values: void} | {tag: "Cancelled", values: void};


/**
 * #865: a single projected point in `get_liquidity_forecast`'s horizon.
 */
export interface LiquidityForecastPoint {
  /**
 * Days from now (1-indexed; day 1 is the first point after "now").
 */
day: u32;
  /**
 * Projected `available_liquidity` at this point: current liquidity, plus principal
 * from open invoices whose `due_date` falls within the window, plus the trailing
 * deposit-inflow rate extrapolated over the elapsed days.
 */
projected_available: i128;
}

export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unpause: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, pool_contract}: {admin: string, pool_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a buy_listing transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Buy an open listing. Delegates the actual balance movement to pool's
   * `market_settle_listing`, which re-validates the underlying balances
   * independently of what was checked at list time.
   */
  buy_listing: ({buyer, listing_id}: {buyer: string, listing_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_listing transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a single listing by ID. Returns `None` if not found.
   */
  get_listing: ({listing_id}: {listing_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Listing>>>

  /**
   * Construct and simulate a list_position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * List part or all of a position for sale on the secondary market.
   * 
   * For `CoFunding` kind: `amount_or_bps` is the bps of the seller's
   * `CoFundShare` to offer. For `SingleFunded` kind: `amount_or_bps` is
   * the raw token amount of deployed principal to offer. Ownership is
   * best-effort validated here against pool's current state — settlement
   * re-validates independently at buy time regardless, so a listing that
   * outlives the seller's actual holding (e.g. after a withdrawal) simply
   * fails to fill rather than being exploitable.
   */
  list_position: ({seller, invoice_id, kind, amount_or_bps, price}: {seller: string, invoice_id: u64, kind: ListingKind, amount_or_bps: u64, price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a cancel_listing transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel an open listing. Only the original seller may cancel.
   */
  cancel_listing: ({seller, listing_id}: {seller: string, listing_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_pool_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pool_contract: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_liquidity_forecast transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * #865: project available liquidity at up to `horizon_days` daily points, based on
   * principal from open invoices' known due dates plus the trailing deposit-inflow
   * rate extrapolated forward. `horizon_days` is clamped to
   * `[1, MAX_FORECAST_HORIZON_DAYS]` to bound loop iteration cost.
   */
  get_liquidity_forecast: ({token, horizon_days}: {token: string, horizon_days: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<LiquidityForecastPoint>>>

  /**
   * Construct and simulate a estimate_withdrawal_wait transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * #865: predict how long `investor`'s (already-queued) withdrawal
   * request will take to clear, based on the pool's current withdrawal
   * queue, its trailing deposit-inflow rate, and the nearest due date
   * among its open invoices for `token`.
   */
  estimate_withdrawal_wait: ({investor, token}: {investor: string, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<WaitEstimate>>

  /**
   * Construct and simulate a list_listings_for_invoice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * List all listing IDs for a given invoice (open and closed).
   */
  list_listings_for_invoice: ({invoice_id}: {invoice_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

  /**
   * Construct and simulate a list_listings_for_investor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * List all listing IDs created by a given seller (open and closed).
   */
  list_listings_for_investor: ({seller}: {seller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u64>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
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
      new ContractSpec([ "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAH0AAAAAtNYXJrZXRFcnJvcgA=",
        "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAH0AAAAAtNYXJrZXRFcnJvcgA=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUG9vbENvbnRyYWN0AAAAAAAAAAAAAAALSW5pdGlhbGl6ZWQAAAAAAAAAAAAAAAAGUGF1c2VkAAA=",
        "AAAAAQAAARNBIHNlY29uZGFyeS1tYXJrZXQgbGlzdGluZyBjcmVhdGVkIGJ5IGBsaXN0X3Bvc2l0aW9uYC4KYGFtb3VudF9vcl9icHNgIGlzOgotIGZvciBgQ29GdW5kaW5nYDogdGhlIGJwcyBvZiB0aGUgc2VsbGVyJ3MgQ29GdW5kU2hhcmUgYmVpbmcgb2ZmZXJlZAotIGZvciBgU2luZ2xlRnVuZGVkYDogdGhlIHJhdyB0b2tlbiBhbW91bnQgb2YgZGVwbG95ZWQgcHJpbmNpcGFsIGJlaW5nIG9mZmVyZWQKYHByaWNlYCBpcyB0aGUgZmxhdCB0b2tlbiBhbW91bnQgdGhlIGJ1eWVyIG11c3QgcGF5LgAAAAAAAAAAB0xpc3RpbmcAAAAACQAAAAAAAAANYW1vdW50X29yX2JwcwAAAAAAAAYAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAAAAAAABGtpbmQAAAfQAAAAC0xpc3RpbmdLaW5kAAAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAABnN0YXR1cwAAAAAH0AAAAA1MaXN0aW5nU3RhdHVzAAAAAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAA1wb29sX2NvbnRyYWN0AAAAAAAAEwAAAAA=",
        "AAAAAAAAALhCdXkgYW4gb3BlbiBsaXN0aW5nLiBEZWxlZ2F0ZXMgdGhlIGFjdHVhbCBiYWxhbmNlIG1vdmVtZW50IHRvIHBvb2wncwpgbWFya2V0X3NldHRsZV9saXN0aW5nYCwgd2hpY2ggcmUtdmFsaWRhdGVzIHRoZSB1bmRlcmx5aW5nIGJhbGFuY2VzCmluZGVwZW5kZW50bHkgb2Ygd2hhdCB3YXMgY2hlY2tlZCBhdCBsaXN0IHRpbWUuAAAAC2J1eV9saXN0aW5nAAAAAAIAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAC01hcmtldEVycm9yAA==",
        "AAAAAAAAADlSZWFkIGEgc2luZ2xlIGxpc3RpbmcgYnkgSUQuIFJldHVybnMgYE5vbmVgIGlmIG5vdCBmb3VuZC4AAAAAAAALZ2V0X2xpc3RpbmcAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAPoAAAH0AAAAAdMaXN0aW5nAA==",
        "AAAAAAAAAgdMaXN0IHBhcnQgb3IgYWxsIG9mIGEgcG9zaXRpb24gZm9yIHNhbGUgb24gdGhlIHNlY29uZGFyeSBtYXJrZXQuCgpGb3IgYENvRnVuZGluZ2Aga2luZDogYGFtb3VudF9vcl9icHNgIGlzIHRoZSBicHMgb2YgdGhlIHNlbGxlcidzCmBDb0Z1bmRTaGFyZWAgdG8gb2ZmZXIuIEZvciBgU2luZ2xlRnVuZGVkYCBraW5kOiBgYW1vdW50X29yX2Jwc2AgaXMKdGhlIHJhdyB0b2tlbiBhbW91bnQgb2YgZGVwbG95ZWQgcHJpbmNpcGFsIHRvIG9mZmVyLiBPd25lcnNoaXAgaXMKYmVzdC1lZmZvcnQgdmFsaWRhdGVkIGhlcmUgYWdhaW5zdCBwb29sJ3MgY3VycmVudCBzdGF0ZSDigJQgc2V0dGxlbWVudApyZS12YWxpZGF0ZXMgaW5kZXBlbmRlbnRseSBhdCBidXkgdGltZSByZWdhcmRsZXNzLCBzbyBhIGxpc3RpbmcgdGhhdApvdXRsaXZlcyB0aGUgc2VsbGVyJ3MgYWN0dWFsIGhvbGRpbmcgKGUuZy4gYWZ0ZXIgYSB3aXRoZHJhd2FsKSBzaW1wbHkKZmFpbHMgdG8gZmlsbCByYXRoZXIgdGhhbiBiZWluZyBleHBsb2l0YWJsZS4AAAAADWxpc3RfcG9zaXRpb24AAAAAAAAFAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAAAAAAABGtpbmQAAAfQAAAAC0xpc3RpbmdLaW5kAAAAAAAAAAANYW1vdW50X29yX2JwcwAAAAAAAAYAAAAAAAAABXByaWNlAAAAAAAACwAAAAEAAAPpAAAABgAAB9AAAAALTWFya2V0RXJyb3IA",
        "AAAAAgAAAJJXaGV0aGVyIHRoZSBsaXN0aW5nIGNvdmVycyBhIGNvLWZ1bmRlZCBzaGFyZSAoYnBzIG9mIGEgQ29GdW5kaW5nUm91bmQpCm9yIGEgc2luZ2xlLWZ1bmRlZCBwb3NpdGlvbiBzbGljZSAocmF3IHRva2VuIGFtb3VudCBvZiBkZXBsb3llZCBwcmluY2lwYWwpLgAAAAAAAAAAAAtMaXN0aW5nS2luZAAAAAACAAAAAAAAAAAAAAAJQ29GdW5kaW5nAAAAAAAAAAAAAAAAAAAMU2luZ2xlRnVuZGVk",
        "AAAABAAAAAAAAAAAAAAAC01hcmtldEVycm9yAAAAAAsAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAAAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADFVuYXV0aG9yaXplZAAAAAIAAAAAAAAADkNvbnRyYWN0UGF1c2VkAAAAAAADAAAAAAAAAApaZXJvQW1vdW50AAAAAAAEAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABQAAAAAAAAAPTGlzdGluZ05vdEZvdW5kAAAAAAYAAAAAAAAADkxpc3RpbmdOb3RPcGVuAAAAAAAHAAAAAAAAABBMaXN0aW5nTm90U2VsbGVyAAAACAAAAAAAAAAPVG9vTWFueUxpc3RpbmdzAAAAAAkAAAEVVGhlIGNyb3NzLWNvbnRyYWN0IGNhbGwgaW50byBwb29sJ3MgYG1hcmtldF9zZXR0bGVfbGlzdGluZ2AgZmFpbGVkLgpQb29sJ3Mgb3duIGBQb29sRXJyb3JgIGlzbid0IHJlLWV4cG9zZWQgaGVyZSBzaW5jZSBpdCdzIGEgZGlmZmVyZW50CmNvbnRyYWN0J3MgZXJyb3IgZG9tYWluIChLWUMsIGNvbXBsaWFuY2UsIGNvbmNlbnRyYXRpb24gY2FwLCBldGMuKSDigJQKY2FsbGVycyB0aGF0IG5lZWQgdGhlIHNwZWNpZmljIHJlYXNvbiBzaG91bGQgc2ltdWxhdGUgdGhlIHRyYW5zYWN0aW9uLgAAAAAAABBTZXR0bGVtZW50RmFpbGVkAAAACg==",
        "AAAAAAAAADxDYW5jZWwgYW4gb3BlbiBsaXN0aW5nLiBPbmx5IHRoZSBvcmlnaW5hbCBzZWxsZXIgbWF5IGNhbmNlbC4AAAAOY2FuY2VsX2xpc3RpbmcAAAAAAAIAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAPpAAAD7QAAAAAAAAfQAAAAC01hcmtldEVycm9yAA==",
        "AAAAAQAAAAAAAAAAAAAADFdhaXRFc3RpbWF0ZQAAAAQAAAAAAAAADWNhcGl0YWxfYWhlYWQAAAAAAAALAAABWCM4NjU6IHByZWRpY3RlZCBzZWNvbmRzIHVudGlsIHRoaXMgcmVxdWVzdCBpcyBsaWtlbHkgdG8gY2xlYXIsIHByb2plY3RlZCBmcm9tCmBjYXBpdGFsX2FoZWFkYCBkaXZpZGVkIGJ5IHRoZSB0cmFpbGluZyBkZXBvc2l0LWluZmxvdyByYXRlLCBjb21iaW5lZCB3aXRoCmBuZWFyZXN0X2ludm9pY2VfZHVlX2RhdGVgIGFuZCBjbGFtcGVkIHRvCmBbTUlOX1dBSVRfRVNUSU1BVEVfU0VDUywgTUFYX1dBSVRfRVNUSU1BVEVfU0VDU11gLiBUaGlzIGlzIGFuIGVzdGltYXRlLCBub3QgYQpndWFyYW50ZWUg4oCUIGFjdHVhbCBzZXR0bGVtZW50IGRlcGVuZHMgb24gZnV0dXJlIGRlcG9zaXRzL3JlcGF5bWVudHMuAAAAE2VzdGltYXRlZF93YWl0X3NlY3MAAAAABgAAAAAAAAAYbmVhcmVzdF9pbnZvaWNlX2R1ZV9kYXRlAAAABgAAAAAAAAAOcXVldWVfcG9zaXRpb24AAAAAAAQ=",
        "AAAAAgAAAAAAAAAAAAAADUxpc3RpbmdTdGF0dXMAAAAAAAADAAAAAAAAAAAAAAAET3BlbgAAAAAAAAAAAAAABkZpbGxlZAAAAAAAAAAAAAAAAAAJQ2FuY2VsbGVkAAAA",
        "AAAAAAAAAAAAAAARZ2V0X3Bvb2xfY29udHJhY3QAAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAARYjODY1OiBwcm9qZWN0IGF2YWlsYWJsZSBsaXF1aWRpdHkgYXQgdXAgdG8gYGhvcml6b25fZGF5c2AgZGFpbHkgcG9pbnRzLCBiYXNlZCBvbgpwcmluY2lwYWwgZnJvbSBvcGVuIGludm9pY2VzJyBrbm93biBkdWUgZGF0ZXMgcGx1cyB0aGUgdHJhaWxpbmcgZGVwb3NpdC1pbmZsb3cKcmF0ZSBleHRyYXBvbGF0ZWQgZm9yd2FyZC4gYGhvcml6b25fZGF5c2AgaXMgY2xhbXBlZCB0bwpgWzEsIE1BWF9GT1JFQ0FTVF9IT1JJWk9OX0RBWVNdYCB0byBib3VuZCBsb29wIGl0ZXJhdGlvbiBjb3N0LgAAAAAAFmdldF9saXF1aWRpdHlfZm9yZWNhc3QAAAAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAMaG9yaXpvbl9kYXlzAAAABAAAAAEAAAPqAAAH0AAAABZMaXF1aWRpdHlGb3JlY2FzdFBvaW50AAA=",
        "AAAAAAAAAOkjODY1OiBwcmVkaWN0IGhvdyBsb25nIGBpbnZlc3RvcmAncyAoYWxyZWFkeS1xdWV1ZWQpIHdpdGhkcmF3YWwKcmVxdWVzdCB3aWxsIHRha2UgdG8gY2xlYXIsIGJhc2VkIG9uIHRoZSBwb29sJ3MgY3VycmVudCB3aXRoZHJhd2FsCnF1ZXVlLCBpdHMgdHJhaWxpbmcgZGVwb3NpdC1pbmZsb3cgcmF0ZSwgYW5kIHRoZSBuZWFyZXN0IGR1ZSBkYXRlCmFtb25nIGl0cyBvcGVuIGludm9pY2VzIGZvciBgdG9rZW5gLgAAAAAAABhlc3RpbWF0ZV93aXRoZHJhd2FsX3dhaXQAAAACAAAAAAAAAAhpbnZlc3RvcgAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAfQAAAADFdhaXRFc3RpbWF0ZQ==",
        "AAAAAQAAAEUjODY1OiBhIHNpbmdsZSBwcm9qZWN0ZWQgcG9pbnQgaW4gYGdldF9saXF1aWRpdHlfZm9yZWNhc3RgJ3MgaG9yaXpvbi4AAAAAAAAAAAAAFkxpcXVpZGl0eUZvcmVjYXN0UG9pbnQAAAAAAAIAAABARGF5cyBmcm9tIG5vdyAoMS1pbmRleGVkOyBkYXkgMSBpcyB0aGUgZmlyc3QgcG9pbnQgYWZ0ZXIgIm5vdyIpLgAAAANkYXkAAAAABAAAANdQcm9qZWN0ZWQgYGF2YWlsYWJsZV9saXF1aWRpdHlgIGF0IHRoaXMgcG9pbnQ6IGN1cnJlbnQgbGlxdWlkaXR5LCBwbHVzIHByaW5jaXBhbApmcm9tIG9wZW4gaW52b2ljZXMgd2hvc2UgYGR1ZV9kYXRlYCBmYWxscyB3aXRoaW4gdGhlIHdpbmRvdywgcGx1cyB0aGUgdHJhaWxpbmcKZGVwb3NpdC1pbmZsb3cgcmF0ZSBleHRyYXBvbGF0ZWQgb3ZlciB0aGUgZWxhcHNlZCBkYXlzLgAAAAATcHJvamVjdGVkX2F2YWlsYWJsZQAAAAAL",
        "AAAAAAAAADtMaXN0IGFsbCBsaXN0aW5nIElEcyBmb3IgYSBnaXZlbiBpbnZvaWNlIChvcGVuIGFuZCBjbG9zZWQpLgAAAAAZbGlzdF9saXN0aW5nc19mb3JfaW52b2ljZQAAAAAAAAEAAAAAAAAACmludm9pY2VfaWQAAAAAAAYAAAABAAAD6gAAAAY=",
        "AAAAAAAAAEFMaXN0IGFsbCBsaXN0aW5nIElEcyBjcmVhdGVkIGJ5IGEgZ2l2ZW4gc2VsbGVyIChvcGVuIGFuZCBjbG9zZWQpLgAAAAAAABpsaXN0X2xpc3RpbmdzX2Zvcl9pbnZlc3RvcgAAAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAQAAA+oAAAAG" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        unpause: this.txFromJSON<Result<void>>,
        initialize: this.txFromJSON<null>,
        buy_listing: this.txFromJSON<Result<void>>,
        get_listing: this.txFromJSON<Option<Listing>>,
        list_position: this.txFromJSON<Result<u64>>,
        cancel_listing: this.txFromJSON<Result<void>>,
        get_pool_contract: this.txFromJSON<Option<string>>,
        get_liquidity_forecast: this.txFromJSON<Array<LiquidityForecastPoint>>,
        estimate_withdrawal_wait: this.txFromJSON<WaitEstimate>,
        list_listings_for_invoice: this.txFromJSON<Array<u64>>,
        list_listings_for_investor: this.txFromJSON<Array<u64>>
  }
}