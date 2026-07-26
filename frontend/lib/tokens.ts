import { rpc as StellarRpc, scValToNative } from '@stellar/stellar-sdk';
import { simulateTx } from './stellar';

// #778: placeholder source account for read-only simulation calls — mirrors
// the convention used throughout lib/contracts.ts for view functions that
// don't need a real signer.
const READ_ONLY_SOURCE = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

const tokenDecimalsCache = new Map<string, number>();

/**
 * Fetch and cache a SEP-41 token contract's `decimals()`. Amount displays
 * must not assume Stellar's native 7-decimal precision — a pool-accepted
 * token with a different precision (e.g. a 6-decimal stablecoin or an
 * 18-decimal wrapped asset) has to be read from the token itself (#778).
 */
export async function getTokenDecimals(contractId: string): Promise<number> {
  const cached = tokenDecimalsCache.get(contractId);
  if (cached !== undefined) return cached;

  const sim = await simulateTx(contractId, 'decimals', [], READ_ONLY_SOURCE);
  const result = (sim as StellarRpc.Api.SimulateTransactionSuccessResponse).result;
  const decimals = Number(scValToNative(result!.retval));
  tokenDecimalsCache.set(contractId, decimals);
  return decimals;
}
