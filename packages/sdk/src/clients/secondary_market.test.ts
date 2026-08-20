import { xdr, Address, Keypair } from '@stellar/stellar-sdk';
import { SecondaryMarketClient } from './secondary_market';

// #1044: SecondaryMarketClient carries the listing lifecycle and
// withdrawal-wait/liquidity-forecast methods moved off PoolClient onto the
// secondary_market satellite contract. These tests mirror the arg-encoding
// and response-decoding contract against contracts/secondary_market/src/lib.rs
// without needing a live RPC endpoint.
//
// Real (checksum-valid) keypairs, since the client round-trips these
// through `new Address(...)` when encoding call args.
const SELLER = Keypair.random().publicKey();
const BUYER = Keypair.random().publicKey();
const TOKEN = Keypair.random().publicKey();

function makeClient(): SecondaryMarketClient {
  return new SecondaryMarketClient({
    rpcUrl: 'https://example.com',
    network: 'Test SDF Network ; September 2015',
    contractId: 'CSECONDARYMARKET',
  });
}

function unitVariant(name: string): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]);
}

function scvMap(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.entries(fields).map(
      ([key, val]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val }),
    ),
  );
}

function listingScVal(overrides: Partial<Record<string, xdr.ScVal>> = {}): xdr.ScVal {
  return scvMap({
    listing_id: xdr.ScVal.scvU64(new xdr.Uint64(7)),
    invoice_id: xdr.ScVal.scvU64(new xdr.Uint64(42)),
    seller: new Address(SELLER).toScVal(),
    token: new Address(TOKEN).toScVal(),
    kind: unitVariant('SingleFunded'),
    amount_or_bps: xdr.ScVal.scvU64(new xdr.Uint64(1000)),
    price: xdr.ScVal.scvI128(
      new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('1500') }),
    ),
    created_at: xdr.ScVal.scvU64(new xdr.Uint64(1700000000)),
    status: unitVariant('Open'),
    ...overrides,
  });
}

describe('SecondaryMarketClient reads', () => {
  it('getListing decodes listing_id, kind, and status out of their one-element enum vecs', async () => {
    const client = makeClient();
    jest.spyOn(client as any, 'simulate').mockResolvedValue({
      result: { retval: listingScVal() },
    });

    const listing = await client.getListing(7);

    expect(listing).not.toBeNull();
    expect(listing?.listingId).toBe(7n);
    expect(listing?.invoiceId).toBe(42n);
    expect(listing?.seller).toBe(SELLER);
    expect(listing?.kind).toBe('SingleFunded');
    expect(listing?.amountOrBps).toBe(1000n);
    expect(listing?.price).toBe(1500n);
    expect(listing?.status).toBe('Open');
  });

  it('getListing returns null for a nonexistent listing', async () => {
    const client = makeClient();
    jest.spyOn(client as any, 'simulate').mockResolvedValue({
      result: { retval: xdr.ScVal.scvVoid() },
    });

    expect(await client.getListing(9999)).toBeNull();
  });

  it('listListingsForInvoice decodes a Vec<u64> of listing ids', async () => {
    const client = makeClient();
    jest.spyOn(client as any, 'simulate').mockResolvedValue({
      result: {
        retval: xdr.ScVal.scvVec([
          xdr.ScVal.scvU64(new xdr.Uint64(1)),
          xdr.ScVal.scvU64(new xdr.Uint64(2)),
        ]),
      },
    });

    const ids = await client.listListingsForInvoice(42);
    expect(ids).toEqual([1n, 2n]);
  });

  it('listListingsForInvestor returns [] instead of throwing on a simulation error', async () => {
    const client = makeClient();
    jest.spyOn(client as any, 'simulate').mockResolvedValue({
      error: 'HostError: Error(Contract, #NotInitialized)',
    });

    expect(await client.listListingsForInvestor(SELLER)).toEqual([]);
  });

  it('estimateWithdrawalWait decodes a WaitEstimate', async () => {
    const client = makeClient();
    jest.spyOn(client as any, 'simulate').mockResolvedValue({
      result: {
        retval: scvMap({
          queue_position: xdr.ScVal.scvU32(3),
          capital_ahead: xdr.ScVal.scvI128(
            new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('5000') }),
          ),
          nearest_invoice_due_date: xdr.ScVal.scvU64(new xdr.Uint64(1700100000)),
          estimated_wait_secs: xdr.ScVal.scvU64(new xdr.Uint64(3600)),
        }),
      },
    });

    const estimate = await client.estimateWithdrawalWait(SELLER, TOKEN);
    expect(estimate).toEqual({
      queuePosition: 3,
      capitalAhead: 5000n,
      nearestInvoiceDueDate: 1700100000,
      estimatedWaitSecs: 3600,
    });
  });

  it('getLiquidityForecast decodes a Vec<LiquidityForecastPoint>', async () => {
    const client = makeClient();
    jest.spyOn(client as any, 'simulate').mockResolvedValue({
      result: {
        retval: xdr.ScVal.scvVec([
          scvMap({
            day: xdr.ScVal.scvU32(1),
            projected_available: xdr.ScVal.scvI128(
              new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('9000') }),
            ),
          }),
        ]),
      },
    });

    const points = await client.getLiquidityForecast(TOKEN, 30);
    expect(points).toEqual([{ day: 1, projectedAvailable: 9000n }]);
  });
});

describe('SecondaryMarketClient writes', () => {
  it('listPosition calls buildAndSendTx with list_position and correctly-ordered args', async () => {
    const client = makeClient();
    const spy = jest.spyOn(client as any, 'buildAndSendTx').mockResolvedValue('txhash');

    await client.listPosition({
      signer: async (xdrTx: string) => xdrTx,
      seller: SELLER,
      invoiceId: 42,
      kind: 'CoFunding',
      amountOrBps: 2500n,
      price: 900n,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [caller, method, args] = spy.mock.calls[0];
    expect(caller).toBe(SELLER);
    expect(method).toBe('list_position');
    expect(args).toHaveLength(5);
  });

  it('cancelListing calls buildAndSendTx with cancel_listing and (seller, listing_id)', async () => {
    const client = makeClient();
    const spy = jest.spyOn(client as any, 'buildAndSendTx').mockResolvedValue('txhash');

    await client.cancelListing({
      signer: async (xdrTx: string) => xdrTx,
      seller: SELLER,
      listingId: 7,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [caller, method, args] = spy.mock.calls[0];
    expect(caller).toBe(SELLER);
    expect(method).toBe('cancel_listing');
    expect(args).toHaveLength(2);
  });

  it('buyListing calls buildAndSendTx with buy_listing and (buyer, listing_id)', async () => {
    const client = makeClient();
    const spy = jest.spyOn(client as any, 'buildAndSendTx').mockResolvedValue('txhash');

    await client.buyListing({
      signer: async (xdrTx: string) => xdrTx,
      buyer: BUYER,
      listingId: 7,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [caller, method, args] = spy.mock.calls[0];
    expect(caller).toBe(BUYER);
    expect(method).toBe('buy_listing');
    expect(args).toHaveLength(2);
  });
});
