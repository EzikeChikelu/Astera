import { type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import {
  rpcGetEvents,
  rpcGetLatestLedger,
  INVOICE_CONTRACT_ID,
  POOL_CONTRACT_ID,
  scValToNative,
} from '../../../lib/stellar';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.SEP10_JWT_SECRET || process.env.JWT_SECRET;
const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
// Look back this many ledgers on the first poll to catch very recent events
const INITIAL_LOOKBACK_LEDGERS = 10;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');
  const invoiceIdParam = searchParams.get('invoiceId');

  if (!JWT_SECRET || !token) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const key = new TextEncoder().encode(JWT_SECRET);
    await jwtVerify(token, key);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const contractIds = [INVOICE_CONTRACT_ID, POOL_CONTRACT_ID].filter(Boolean);
  if (contractIds.length === 0) {
    return new Response('Contract IDs not configured', { status: 503 });
  }

  const encoder = new TextEncoder();
  let lastSeenLedger = 0;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const enqueue = (data: string, eventName?: string) => {
        if (closed) return;
        const line = eventName ? `event: ${eventName}\ndata: ${data}\n\n` : `data: ${data}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      const poll = async () => {
        if (closed) return;
        try {
          const latest = await rpcGetLatestLedger();
          const currentLedger = latest.sequence;

          if (currentLedger <= lastSeenLedger) return;

          const startLedger =
            lastSeenLedger > 0
              ? lastSeenLedger + 1
              : Math.max(1, currentLedger - INITIAL_LOOKBACK_LEDGERS);

          const response = await rpcGetEvents({
            startLedger,
            filters: [{ contractIds }],
          });

          lastSeenLedger = currentLedger;

          for (const raw of response.events) {
            const e = raw as unknown as Record<string, unknown>;
            const topic = ((e.topic as unknown[]) ?? []).map((t) =>
              scValToNative(t as Parameters<typeof scValToNative>[0]),
            );
            const value = scValToNative(e.value as Parameters<typeof scValToNative>[0]);
            const eventInvoiceId = (value as unknown[] | null)?.[0];

            // Filter by invoiceId if the caller requested a specific invoice
            if (invoiceIdParam !== null && String(eventInvoiceId) !== invoiceIdParam) {
              continue;
            }

            enqueue(
              JSON.stringify({
                id: e.id,
                contractId: e.contractId,
                topic,
                value,
                ledger: e.ledger,
                txHash: e.txHash,
                ledgerCloseAt: (e.ledgerClosedAt ?? e.ledgerCloseAt) as string,
              }),
            );
          }
        } catch (err) {
          console.error('[SSE /api/events] poll error:', err);
          enqueue(JSON.stringify({ type: 'error' }), 'error');
        }
      };

      // Initial handshake
      enqueue(JSON.stringify({ type: 'connected' }), 'connected');

      // First poll immediately, then schedule repeating poll + heartbeat
      await poll();
      const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
      const heartbeatTimer = setInterval(() => enqueue('', 'ping'), HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
