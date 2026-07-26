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
const POLL_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_SSE_POLL_INTERVAL_MS ?? 10_000);
const MIN_POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const INITIAL_LOOKBACK_LEDGERS = 10;

type SseClient = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  invoiceId: string | null;
};

let sharedPollerTimer: ReturnType<typeof setInterval> | null = null;
const sharedClients: Set<SseClient> = new Set();
let sharedLastSeenLedger = 0;

async function sharedPoll() {
  if (sharedClients.size === 0) return;

  const contractIds = [INVOICE_CONTRACT_ID, POOL_CONTRACT_ID].filter(Boolean);
  if (contractIds.length === 0) return;

  try {
    const latest = await rpcGetLatestLedger();
    const currentLedger = latest.sequence;

    if (currentLedger <= sharedLastSeenLedger) return;

    const startLedger =
      sharedLastSeenLedger > 0
        ? sharedLastSeenLedger + 1
        : Math.max(1, currentLedger - INITIAL_LOOKBACK_LEDGERS);

    const response = await rpcGetEvents({
      startLedger,
      filters: [{ contractIds }],
    });

    sharedLastSeenLedger = currentLedger;

    for (const raw of response.events) {
      const e = raw as unknown as Record<string, unknown>;
      const topic = ((e.topic as unknown[]) ?? []).map((t) =>
        scValToNative(t as Parameters<typeof scValToNative>[0]),
      );
      const value = scValToNative(e.value as Parameters<typeof scValToNative>[0]);
      const eventInvoiceId = (value as unknown[] | null)?.[0];
      const payload = JSON.stringify({
        id: e.id,
        contractId: e.contractId,
        topic,
        value,
        ledger: e.ledger,
        txHash: e.txHash,
        ledgerCloseAt: (e.ledgerClosedAt ?? e.ledgerCloseAt) as string,
      });

      for (const client of sharedClients) {
        if (client.invoiceId !== null && String(eventInvoiceId) !== client.invoiceId) continue;
        try {
          client.controller.enqueue(client.encoder.encode(`data: ${payload}\n\n`));
        } catch {
          client.controller.error(new Error('SSE client disconnected'));
        }
      }
    }
  } catch (err) {
    console.error('[SSE /api/events] shared poll error:', err);
    for (const client of sharedClients) {
      try {
        client.controller.enqueue(
          client.encoder.encode(`event: error\ndata: ${JSON.stringify({ type: 'error' })}\n\n`),
        );
      } catch {
        client.controller.error(new Error('SSE client disconnected'));
      }
    }
  }
}

function startSharedPoller(): void {
  if (sharedPollerTimer) return;
  const interval = Math.max(MIN_POLL_INTERVAL_MS, POLL_INTERVAL_MS);
  if (sharedClients.size > 0) {
    void sharedPoll();
  }
  sharedPollerTimer = setInterval(sharedPoll, interval);
}

function stopSharedPollerIfEmpty(): void {
  if (sharedClients.size === 0 && sharedPollerTimer) {
    clearInterval(sharedPollerTimer);
    sharedPollerTimer = null;
    sharedLastSeenLedger = 0;
  }
}

function registerClient(client: SseClient): void {
  sharedClients.add(client);
  startSharedPoller();
}

function unregisterClient(client: SseClient): void {
  sharedClients.delete(client);
  stopSharedPollerIfEmpty();
}

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

  const stream = new ReadableStream({
    start(controller) {
      const client: SseClient = {
        controller,
        encoder,
        invoiceId: invoiceIdParam,
      };

      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ type: 'connected' })}\n\n`),
      );

      registerClient(client);

      const heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('event: ping\ndata: \n\n'));
        } catch {
          controller.error(new Error('SSE client disconnected'));
        }
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatTimer);
        unregisterClient(client);
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
