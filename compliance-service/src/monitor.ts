/**
 * #867: Horizon event monitor — watches pool/invoice activity for suspicious
 * patterns and calls compliance.request_review on-chain when triggered.
 */

import { Keypair, TransactionBuilder, BASE_FEE, Contract, rpc as StellarRpc, Address, nativeToScVal } from '@stellar/stellar-sdk';
import type { ComplianceConfig, MonitorAlert } from './types';

interface DepositTick {
  at: number;
  amount: bigint;
}

export class Monitor {
  private readonly config: ComplianceConfig;
  private readonly keypair: Keypair;
  private readonly server: StellarRpc.Server;
  private readonly deposits = new Map<string, DepositTick[]>();
  private readonly alerts: MonitorAlert[] = [];
  private cursor = 'now';
  private running = false;
  processedCount = 0;

  constructor(config: ComplianceConfig) {
    this.config = config;
    this.keypair = Keypair.fromSecret(config.screenerSecretKey);
    this.server = new StellarRpc.Server(config.rpcUrl, { allowHttp: true });
  }

  listAlerts(): MonitorAlert[] {
    return [...this.alerts].slice(-100);
  }

  async start(): Promise<void> {
    this.running = true;
    console.log('[monitor] starting Horizon poll loop');
    void this.pollLoop();
  }

  stop(): void {
    this.running = false;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        console.error('[monitor] poll error:', err);
      }
      await sleep(5000);
    }
  }

  private async pollOnce(): Promise<void> {
    const url = new URL(`${this.config.horizonUrl}/operations`);
    url.searchParams.set('order', 'asc');
    url.searchParams.set('limit', '50');
    url.searchParams.set('cursor', this.cursor);
    url.searchParams.set('include_failed', 'false');

    const res = await fetch(url.toString());
    if (!res.ok) return;
    const body = (await res.json()) as {
      _embedded?: { records?: Array<Record<string, unknown>> };
    };
    const records = body._embedded?.records ?? [];
    for (const rec of records) {
      this.cursor = String(rec.paging_token ?? this.cursor);
      await this.handleRecord(rec);
      this.processedCount += 1;
    }
  }

  private async handleRecord(rec: Record<string, unknown>): Promise<void> {
    // Best-effort: look for invoke_host_function ops that touch the pool.
    const type = String(rec.type ?? '');
    if (type !== 'invoke_host_function') return;

    const functionName = String(rec.function ?? '');
    if (!functionName.includes('HostFunction')) {
      // Horizon may expose different shapes; still try topic-like fields.
    }

    // Parse a lightweight "deposit" signal from transaction memo / envelope is
    // unreliable without full event decoding. For the demo service we also
    // expose recordDeposit() for the REST surface / tests.
  }

  /** Called by REST or internal hooks when a deposit is observed. */
  async recordDeposit(address: string, amount: bigint): Promise<void> {
    const now = Date.now();
    const window = this.config.structuringWindowMs;
    const ticks = (this.deposits.get(address) ?? []).filter((t) => now - t.at <= window);
    ticks.push({ at: now, amount });
    this.deposits.set(address, ticks);

    const nearThreshold = ticks.filter(
      (t) => t.amount > 0n && t.amount < this.config.structuringThreshold,
    );
    if (nearThreshold.length >= this.config.structuringMaxCount) {
      await this.flag(
        address,
        'structuring',
        `structuring: ${nearThreshold.length} sub-threshold deposits in window`,
      );
      this.deposits.set(address, []);
    }

    // Rapid deposit-then-withdraw heuristic is handled when recordWithdraw is called.
  }

  async recordWithdraw(address: string, _amount: bigint): Promise<void> {
    const ticks = this.deposits.get(address) ?? [];
    const now = Date.now();
    const recent = ticks.filter((t) => now - t.at < 60_000);
    if (recent.length > 0) {
      await this.flag(
        address,
        'rapid_cycle',
        'rapid deposit-then-withdraw within 60s',
      );
    }
  }

  async flag(address: string, pattern: string, reason: string): Promise<void> {
    const alert: MonitorAlert = {
      id: `${Date.now()}-${address.slice(0, 8)}`,
      address,
      reason,
      at: new Date().toISOString(),
      pattern,
    };
    this.alerts.push(alert);
    console.log(`[monitor] alert ${pattern} for ${address}: ${reason}`);

    try {
      await this.requestReviewOnChain(address, reason);
    } catch (err) {
      console.error('[monitor] request_review failed:', err);
    }
  }

  private async requestReviewOnChain(address: string, reason: string): Promise<void> {
    if (!this.config.complianceContractId) return;

    const account = await this.server.getAccount(this.keypair.publicKey());
    const contract = new Contract(this.config.complianceContractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'request_review',
          new Address(this.keypair.publicKey()).toScVal(),
          new Address(address).toScVal(),
          nativeToScVal(reason.slice(0, 200), { type: 'string' }),
        ),
      )
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`simulate request_review failed: ${sim.error}`);
    }
    const prepared = StellarRpc.assembleTransaction(tx, sim).build();
    prepared.sign(this.keypair);
    const send = await this.server.sendTransaction(prepared);
    console.log(`[monitor] request_review submitted: ${send.hash}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
