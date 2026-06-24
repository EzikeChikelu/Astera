import { getFreighter } from '@/lib/freighter';

const TOKEN_KEY = 'astera_jwt';

/** How many seconds before expiry we proactively refresh the token. */
const REFRESH_MARGIN_SECS = 5 * 60; // 5 minutes

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

/** Decode the expiry from a JWT without verifying the signature. */
function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

/** Returns true when the token is expired or within the refresh margin. */
function isTokenExpiredOrExpiring(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return true; // treat unparseable tokens as expired
  return Date.now() / 1000 > exp - REFRESH_MARGIN_SECS;
}

export async function requestChallenge(account: string) {
  const res = await fetch('/api/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });
  return res.json();
}

export async function exchangeToken(signedXDR: string) {
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signed_xdr: signedXDR }),
  });
  return res.json();
}

export async function verifyToken(token: string | null) {
  if (!token) return { authenticated: false };
  const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function ensureAuthWithFreighter(address: string) {
  try {
    const challenge = await requestChallenge(address);
    if (!challenge || !challenge.transaction) return { error: 'no_challenge' };

    // ask freighter to sign
    const freighter = await getFreighter();
    const { signed_envelope_xdr, error } = await freighter
      .signTransaction(challenge.transaction, {
        networkPassphrase: String(challenge.network_passphrase ?? ''),
        address,
      })
      .catch((e) => ({ error: String(e) }) as any);

    if (error || !signed_envelope_xdr) return { error: 'sign_failed' };

    const tokenResp = await exchangeToken(signed_envelope_xdr);
    if (tokenResp?.token) {
      setToken(tokenResp.token);
      return { token: tokenResp.token };
    }
    return { error: 'exchange_failed', detail: tokenResp };
  } catch (err) {
    return { error: String(err) };
  }
}

/**
 * Proactively refresh the stored token when it is near expiry.
 *
 * Requires the wallet address so the SEP-10 challenge/response flow can be
 * re-run with Freighter.  Returns the valid token (existing or freshly issued)
 * or null when re-authentication fails.
 */
export async function maybeRefreshToken(address: string): Promise<string | null> {
  const token = getToken();
  if (!token || isTokenExpiredOrExpiring(token)) {
    const result = await ensureAuthWithFreighter(address);
    if (result.token) return result.token;
    // Re-auth failed — clear stale token so callers know to redirect to login
    clearToken();
    return null;
  }
  return token;
}

/**
 * Authenticated fetch wrapper with automatic 401 recovery.
 *
 * On a 401 response the SEP-10 challenge/response flow is re-run once to
 * obtain a fresh JWT, then the request is retried with the new token.  If
 * re-authentication fails (wallet disconnected, key changed, etc.) the
 * original 401 response is returned so the caller can redirect the user to
 * the connect-wallet flow.
 *
 * @param url - The URL to fetch.
 * @param opts - Standard `RequestInit` options (headers merged, not replaced).
 * @param address - Stellar public key of the authenticated user.  Required for
 *   automatic re-auth; if omitted the 401 is returned without retrying.
 */
export async function authenticatedFetch(
  url: string,
  opts: RequestInit = {},
  address?: string,
): Promise<Response> {
  const buildHeaders = (token: string | null): HeadersInit => ({
    ...(opts.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const res = await fetch(url, { ...opts, headers: buildHeaders(getToken()) });

  if (res.status === 401 && address) {
    // Attempt silent re-authentication via SEP-10
    const result = await ensureAuthWithFreighter(address);
    if (result.token) {
      return fetch(url, { ...opts, headers: buildHeaders(result.token) });
    }
    // Re-auth failed — clear token and return the 401 so the UI can redirect
    clearToken();
  }

  return res;
}
