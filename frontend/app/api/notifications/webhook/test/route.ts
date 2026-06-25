import { NextResponse } from 'next/server';
import dns from 'dns/promises';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 6000;

// RFC 1918 private ranges, loopback, link-local, cloud metadata, and
// unspecified. Applied to both IPv4 and (after decoding) IPv4-mapped IPv6.
const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // RFC 1918 class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 class B
  /^192\.168\./, // RFC 1918 class C
  /^169\.254\./, // link-local / cloud metadata (AWS/GCP/Azure)
  /^0\./, // 0.0.0.0/8 — unspecified / all-interfaces
];

const PRIVATE_IPV6_PATTERNS = [
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 unique local (RFC 4193)
  /^fe80:/i, // IPv6 link-local
];

// Block cloud metadata hostnames by name before DNS resolution so that even a
// resolver returning a public alias for these services is not trusted.
const BLOCKED_HOSTNAMES = new Set([
  '169.254.169.254', // AWS / Azure / GCP shared metadata IP
  'metadata.google.internal', // GCP metadata DNS name
  'metadata.goog', // GCP metadata DNS alias
  'instance-data', // common internal alias used by some hypervisors
]);

/**
 * Decode an IPv4-mapped IPv6 address (::ffff:<high16>:<low16>) to dotted
 * decimal so it can be checked against IPv4 private ranges.
 *
 * Node's dns.lookup returns these as family-6 strings like "::ffff:7f00:1"
 * (not the dotted-quad form), so we must decode them manually.
 * Returns null if the address is not in mapped form.
 */
function decodeMappedIPv4(addr: string): string | null {
  const m = addr.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
  if (!m) return null;
  const high = parseInt(m[1]!, 16);
  const low = parseInt(m[2]!, 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) {
    return PRIVATE_IPV4_PATTERNS.some((p) => p.test(address));
  }
  // IPv6: first check native IPv6 patterns, then check if it is an
  // IPv4-mapped address (::ffff:<h>:<l>) by decoding and re-checking IPv4.
  if (PRIVATE_IPV6_PATTERNS.some((p) => p.test(address))) return true;
  const mapped = decodeMappedIPv4(address);
  return mapped !== null && PRIVATE_IPV4_PATTERNS.some((p) => p.test(mapped));
}

async function isSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Only HTTPS — reject http, file, gopher, data, etc.
  if (parsed.protocol !== 'https:') return false;

  // URL encodes IPv6 literals with brackets: "[::1]". Strip them so
  // dns.lookup receives a bare address string it can handle.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Block known metadata service hostnames before DNS resolution.
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;

  // Resolve all DNS addresses and reject if any resolves to a restricted range.
  // Fail closed: DNS errors are treated as unsafe (no request is made).
  //
  // NOTE: DNS rebinding (attacker rotates DNS between our check and the actual
  // fetch) cannot be fully eliminated without pinning the outbound connection to
  // the resolved IP. The TIMEOUT_MS abort and redirect:error (below) limit the
  // exposure window. A future hardening pass can replace fetch() with a
  // custom http.request using the `lookup` option to pin the address.
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address, family } of addresses) {
      if (isPrivateAddress(address, family)) return false;
    }
  } catch {
    return false;
  }

  return true;
}

export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const url =
    typeof (body as { url?: unknown })?.url === 'string' ? (body as { url: string }).url : '';

  // Use a single generic error for all validation/SSRF rejections so callers
  // cannot distinguish "bad URL format" from "blocked internal address".
  if (!(await isSafeWebhookUrl(url))) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook URL.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const payload = {
      event: 'TEST_WEBHOOK',
      message: 'This is a test webhook from Astera (notification settings).',
      timestamp: new Date().toISOString(),
      data: {
        exampleAlert: {
          type: 'INVOICE_FUNDED',
          priority: 'MEDIUM',
          message: 'Invoice #123 has been funded for 2500 USDC.',
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Prevent open-redirect SSRF: if the server returns a 3xx the request
      // fails immediately rather than following the Location header to a
      // potentially internal URL that bypassed our isSafeWebhookUrl check.
      redirect: 'error',
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Webhook responded with HTTP ${res.status}.` },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Webhook request failed.';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
