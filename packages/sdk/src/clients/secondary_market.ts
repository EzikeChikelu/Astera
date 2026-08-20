import { rpc as StellarRpc } from '@stellar/stellar-sdk';
import { BaseClient, nativeToScVal, scValToNative, Address, xdr } from './base';
import { Errors as SecondaryMarketErrors } from '../generated/secondary_market';
import type {
  ClientConfig,
  WaitEstimate,
  LiquidityForecastPoint,
  Listing,
  ListingKind,
  TransactionProgress,
} from '../types';
import type { Signer } from '../types';

// #1044: split out of PoolClient when the secondary-market listing lifecycle
// and withdrawal-wait/liquidity-forecast analytics moved off `pool` onto the
// `secondary_market` satellite contract (see contracts/secondary_market).

export class SecondaryMarketClient extends BaseClient {
  protected override readonly errors = SecondaryMarketErrors;

  constructor(config: ClientConfig) {
    super(config);
  }

  private listingFromRaw(raw: Record<string, unknown>): Listing {
    return {
      listingId: BigInt(String(raw.listing_id)),
      invoiceId: BigInt(String(raw.invoice_id)),
      seller: raw.seller as string,
      token: raw.token as string,
      kind: (Array.isArray(raw.kind) ? raw.kind[0] : raw.kind) as ListingKind,
      amountOrBps: BigInt(String(raw.amount_or_bps)),
      price: BigInt(String(raw.price)),
      createdAt: Number(raw.created_at),
      status: (Array.isArray(raw.status) ? raw.status[0] : raw.status) as Listing['status'],
    };
  }

  private listingKindToScVal(kind: ListingKind): xdr.ScVal {
    return xdr.ScVal.scvVec([nativeToScVal(kind, { type: 'symbol' })]);
  }

  /** List part or all of a position for sale on the secondary market. */
  async listPosition(params: {
    signer: Signer;
    seller: string;
    invoiceId: bigint | number;
    kind: ListingKind;
    amountOrBps: bigint;
    price: bigint;
    onProgress?: (progress: TransactionProgress) => void;
  }): Promise<string> {
    return this.buildAndSendTx(
      params.seller,
      'list_position',
      [
        new Address(params.seller).toScVal(),
        nativeToScVal(params.invoiceId, { type: 'u64' }),
        this.listingKindToScVal(params.kind),
        nativeToScVal(params.amountOrBps, { type: 'u64' }),
        nativeToScVal(params.price, { type: 'i128' }),
      ],
      params.onProgress,
    );
  }

  /** Cancel an open listing. Only the original seller may cancel. */
  async cancelListing(params: {
    signer: Signer;
    seller: string;
    listingId: bigint | number;
    onProgress?: (progress: TransactionProgress) => void;
  }): Promise<string> {
    return this.buildAndSendTx(
      params.seller,
      'cancel_listing',
      [
        new Address(params.seller).toScVal(),
        nativeToScVal(params.listingId, { type: 'u64' }),
      ],
      params.onProgress,
    );
  }

  /** Buy an open listing. Buyer's available balance is debited by the price. */
  async buyListing(params: {
    signer: Signer;
    buyer: string;
    listingId: bigint | number;
    onProgress?: (progress: TransactionProgress) => void;
  }): Promise<string> {
    return this.buildAndSendTx(
      params.buyer,
      'buy_listing',
      [
        new Address(params.buyer).toScVal(),
        nativeToScVal(params.listingId, { type: 'u64' }),
      ],
      params.onProgress,
    );
  }

  /** Fetch a single listing by ID. Returns null if not found. */
  async getListing(listingId: bigint | number): Promise<Listing | null> {
    const sim = await this.simulate('get_listing', [
      nativeToScVal(listingId, { type: 'u64' }),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) return null;
    const raw = scValToNative(sim.result!.retval);
    if (!raw) return null;
    return this.listingFromRaw(raw as Record<string, unknown>);
  }

  /** All listing IDs for a given invoice (open and closed). */
  async listListingsForInvoice(invoiceId: bigint | number): Promise<bigint[]> {
    const sim = await this.simulate('list_listings_for_invoice', [
      nativeToScVal(invoiceId, { type: 'u64' }),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) return [];
    const raw = scValToNative(sim.result!.retval) as unknown[];
    return (raw ?? []).map((id) => BigInt(String(id)));
  }

  /** All listing IDs created by a given seller (open and closed). */
  async listListingsForInvestor(seller: string): Promise<bigint[]> {
    const sim = await this.simulate('list_listings_for_investor', [
      new Address(seller).toScVal(),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) return [];
    const raw = scValToNative(sim.result!.retval) as unknown[];
    return (raw ?? []).map((id) => BigInt(String(id)));
  }

  async estimateWithdrawalWait(investor: string, token: string): Promise<WaitEstimate> {
    const sim = await this.simulate('estimate_withdrawal_wait', [
      new Address(investor).toScVal(),
      new Address(token).toScVal(),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval) as Record<string, unknown>;
    return {
      queuePosition: Number(raw.queue_position),
      capitalAhead: BigInt(String(raw.capital_ahead)),
      nearestInvoiceDueDate: Number(raw.nearest_invoice_due_date),
      estimatedWaitSecs: Number(raw.estimated_wait_secs),
    };
  }

  async getLiquidityForecast(token: string, horizonDays: number): Promise<LiquidityForecastPoint[]> {
    const sim = await this.simulate('get_liquidity_forecast', [
      new Address(token).toScVal(),
      nativeToScVal(horizonDays, { type: 'u32' }),
    ]);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const raw = scValToNative(sim.result!.retval) as Record<string, unknown>[];
    return raw.map((r) => ({
      day: Number(r.day),
      projectedAvailable: BigInt(String(r.projected_available)),
    }));
  }
}
