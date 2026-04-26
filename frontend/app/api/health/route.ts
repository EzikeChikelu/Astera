import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface HealthCheck {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  checks: Record<string, HealthCheck>;
  timestamp: string;
}

const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const RPC_TIMEOUT_MS = 5000;

async function checkRpc(): Promise<HealthCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const start = Date.now();
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] }),
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;
    if (!res.ok) {
      return { name: 'stellar_rpc', status: 'down', detail: `HTTP ${res.status}` };
    }
    if (elapsed > RPC_TIMEOUT_MS) {
      return { name: 'stellar_rpc', status: 'degraded', detail: `Response time ${elapsed}ms > ${RPC_TIMEOUT_MS}ms` };
    }
    return { name: 'stellar_rpc', status: 'ok', detail: `${elapsed}ms` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unreachable';
    return { name: 'stellar_rpc', status: 'down', detail: message };
  } finally {
    clearTimeout(timer);
  }
}

function overallStatus(checks: Record<string, HealthCheck>): 'ok' | 'degraded' | 'down' {
  const statuses = Object.values(checks).map((c) => c.status);
  if (statuses.includes('down')) return 'down';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

async function fireWebhook(payload: HealthResponse): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl || payload.status === 'ok') return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert: 'health_degraded',
        severity: payload.status === 'down' ? 'critical' : 'warning',
        data: payload,
        timestamp: payload.timestamp,
      }),
    });
  } catch {
    // Best-effort — do not fail the health endpoint because of a webhook error.
  }
}

export async function GET() {
  const rpc = await checkRpc();

  const checks: Record<string, HealthCheck> = {
    stellar_rpc: rpc,
  };

  const response: HealthResponse = {
    status: overallStatus(checks),
    checks,
    timestamp: new Date().toISOString(),
  };

  await fireWebhook(response);

  const httpStatus = response.status === 'down' ? 503 : 200;
  return NextResponse.json(response, { status: httpStatus });
}
