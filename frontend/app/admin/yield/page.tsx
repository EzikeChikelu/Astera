'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '@/lib/store';
import { Skeleton } from '@/components/Skeleton';
import { RateCurveChart } from '@/components/analytics';
import { validateRateModelConfig } from '@/lib/rate-model';
import { stablecoinLabel } from '@/lib/stellar';
import type { RateModelConfig } from '@/lib/types';
import {
  getPoolConfig,
  buildSetYieldTx,
  buildSetFactoringFeeTx,
  submitTx,
  getAcceptedTokens,
  getRateModelConfig,
  buildProposeRateModelTx,
} from '@/lib/contracts';

export default function AdminYieldPage() {
  const { wallet, poolConfig, setPoolConfig } = useStore();
  const [newYield, setNewYield] = useState('');
  const [newFactoringFee, setNewFactoringFee] = useState('');
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);

  // #863: rate-model curve editor state (values stored as percent strings,
  // converted to bps on submit).
  const [rateTokens, setRateTokens] = useState<string[]>([]);
  const [rateToken, setRateToken] = useState('');
  const [currentModel, setCurrentModel] = useState<RateModelConfig | null>(null);
  const [baseRate, setBaseRate] = useState('2');
  const [kinkUtil, setKinkUtil] = useState('80');
  const [slope1, setSlope1] = useState('6');
  const [slope2, setSlope2] = useState('24');
  const [maxRate, setMaxRate] = useState('50');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const config = await getPoolConfig();
        setPoolConfig(config);
        setNewYield((config.yieldBps / 100).toString());
        setNewFactoringFee((config.factoringFeeBps / 100).toString());
        const tokens = await getAcceptedTokens();
        setRateTokens(tokens);
        if (tokens.length > 0) setRateToken((prev) => prev || tokens[0] || '');
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setPoolConfig]);

  // Load the selected token's current curve (if any) into the editor.
  useEffect(() => {
    if (!rateToken) return;
    let cancelled = false;
    getRateModelConfig(rateToken)
      .then((model) => {
        if (cancelled) return;
        setCurrentModel(model);
        if (model) {
          setBaseRate((model.baseRateBps / 100).toString());
          setKinkUtil((model.optimalUtilizationBps / 100).toString());
          setSlope1((model.slope1Bps / 100).toString());
          setSlope2((model.slope2Bps / 100).toString());
          setMaxRate((model.maxRateBps / 100).toString());
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentModel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rateToken]);

  // Live preview of the draft curve before submitting the timelocked proposal.
  const draftModel = useMemo<RateModelConfig>(
    () => ({
      baseRateBps: Math.round(parseFloat(baseRate || '0') * 100),
      optimalUtilizationBps: Math.round(parseFloat(kinkUtil || '0') * 100),
      slope1Bps: Math.round(parseFloat(slope1 || '0') * 100),
      slope2Bps: Math.round(parseFloat(slope2 || '0') * 100),
      maxRateBps: Math.round(parseFloat(maxRate || '0') * 100),
    }),
    [baseRate, kinkUtil, slope1, slope2, maxRate],
  );
  const draftError = useMemo(() => validateRateModelConfig(draftModel), [draftModel]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  async function signAndSubmit(xdr: string) {
    const freighter = await import('@stellar/freighter-api');
    const { signedTxXdr, error: signError } = await freighter.signTransaction(xdr, {
      networkPassphrase: 'Test SDF Network ; September 2015',
      address: wallet.address!,
    });

    if (signError) throw new Error(signError.message || 'Signing rejected.');
    await submitTx(signedTxXdr);
  }

  async function handleYieldSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    const bps = Math.round(parseFloat(newYield) * 100);
    if (isNaN(bps) || bps < 0 || bps > 5000) {
      toast.error('Yield must be between 0% and 50% (5000 bps).');
      return;
    }

    setTxLoading(true);

    try {
      const xdr = await buildSetYieldTx(wallet.address, bps);
      await signAndSubmit(xdr);
      toast.success(`Yield rate updated to ${newYield}% (${bps} bps).`);

      const updatedConfig = await getPoolConfig();
      setPoolConfig(updatedConfig);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update yield rate.';
      toast.error(msg);
      console.error(e);
    } finally {
      setTxLoading(false);
    }
  }

  async function handleFactoringFeeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    const bps = Math.round(parseFloat(newFactoringFee) * 100);
    if (isNaN(bps) || bps < 0 || bps > 10000) {
      toast.error('Factoring fee must be between 0% and 100% (10000 bps).');
      return;
    }

    setTxLoading(true);

    try {
      const xdr = await buildSetFactoringFeeTx(wallet.address, bps);
      await signAndSubmit(xdr);
      toast.success(`Factoring fee updated to ${newFactoringFee}% (${bps} bps).`);

      const updatedConfig = await getPoolConfig();
      setPoolConfig(updatedConfig);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update factoring fee.';
      toast.error(msg);
      console.error(e);
    } finally {
      setTxLoading(false);
    }
  }

  // #863: propose new curve parameters — takes effect only after the
  // on-chain timelock (48h default) via execute_rate_model_change.
  async function handleRateModelSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address || !rateToken) return;

    if (draftError) {
      toast.error(draftError);
      return;
    }

    setTxLoading(true);

    try {
      const xdr = await buildProposeRateModelTx(wallet.address, rateToken, draftModel);
      await signAndSubmit(xdr);
      toast.success(
        `Rate model proposal submitted for ${stablecoinLabel(rateToken)}. ` +
          'It becomes executable after the timelock elapses.',
      );

      const model = await getRateModelConfig(rateToken);
      setCurrentModel(model);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to propose rate model change.';
      toast.error(msg);
      console.error(e);
    } finally {
      setTxLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Pool Fee Management</h1>
        <p className="text-brand-muted text-sm">
          Configure borrower pricing for the Astera liquidity pool.
        </p>
      </div>

      <div className="p-8 bg-brand-card border border-brand-border rounded-2xl shadow-sm">
        <label className="block text-sm font-semibold text-brand-muted mb-6 uppercase tracking-wider">
          Current Configuration
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-brand-dark rounded-xl border border-brand-border">
            <p className="text-xs text-brand-muted mb-1">Current Yield</p>
            <p className="text-2xl font-bold text-white">
              {loading ? '...' : ((poolConfig?.yieldBps ?? 0) / 100).toFixed(2)}%
            </p>
          </div>
          <div className="p-4 bg-brand-dark rounded-xl border border-brand-border">
            <p className="text-xs text-brand-muted mb-1">Current Factoring Fee</p>
            <p className="text-2xl font-bold text-brand-gold">
              {loading ? '...' : ((poolConfig?.factoringFeeBps ?? 0) / 100).toFixed(2)}%
            </p>
          </div>
        </div>

        <form onSubmit={handleYieldSubmit} className="space-y-6 pt-6 border-t border-brand-border">
          <div>
            <label className="block text-sm font-medium text-white mb-2">New Yield Rate (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="50"
                value={newYield}
                onChange={(e) => setNewYield(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder-brand-muted focus:outline-none focus:border-brand-gold text-lg"
                placeholder="e.g. 8.5"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-muted font-bold">
                %
              </span>
            </div>
            <p className="mt-2 text-xs text-brand-muted">
              Example: 8.5% is equivalent to 850 basis points.
            </p>
          </div>

          <button
            type="submit"
            disabled={txLoading || loading}
            className="w-full py-4 bg-brand-gold text-brand-dark font-bold rounded-xl hover:bg-brand-amber transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
          >
            {txLoading ? 'Updating Rate...' : 'Update Yield Rate'}
          </button>
        </form>

        <form
          onSubmit={handleFactoringFeeSubmit}
          className="space-y-6 pt-6 mt-6 border-t border-brand-border"
        >
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              New Factoring Fee (%)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={newFactoringFee}
                onChange={(e) => setNewFactoringFee(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder-brand-muted focus:outline-none focus:border-brand-gold text-lg"
                placeholder="e.g. 2.5"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-muted font-bold">
                %
              </span>
            </div>
            <p className="mt-2 text-xs text-brand-muted">
              This fee is locked when an invoice becomes fully funded and is charged on top of
              borrower interest at repayment.
            </p>
          </div>

          <button
            type="submit"
            disabled={txLoading || loading}
            className="w-full py-4 bg-white text-brand-dark font-bold rounded-xl hover:bg-stone-200 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
          >
            {txLoading ? 'Updating Fee...' : 'Update Factoring Fee'}
          </button>
        </form>
      </div>

      {/* #863: utilization-driven rate model editor */}
      <div className="p-8 bg-brand-card border border-brand-border rounded-2xl shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Interest Rate Curve</h2>
          <p className="text-brand-muted text-sm">
            Utilization-driven pricing per token. New parameters go through the standard
            timelocked proposal flow; already-funded invoices keep their locked rate.
          </p>
        </div>

        {rateTokens.length === 0 ? (
          <p className="text-brand-muted text-sm">No accepted tokens configured.</p>
        ) : (
          <form onSubmit={handleRateModelSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Token</label>
              <select
                value={rateToken}
                onChange={(e) => setRateToken(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-gold"
              >
                {rateTokens.map((tok) => (
                  <option key={tok} value={tok}>
                    {stablecoinLabel(tok)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-brand-muted">
                {currentModel
                  ? 'This token has an active curve — the flat yield rate is inert for its new fundings.'
                  : 'No curve configured yet — new fundings use the flat yield rate above.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  ['Base rate (%)', baseRate, setBaseRate, 'Rate at 0% utilization'],
                  ['Kink utilization (%)', kinkUtil, setKinkUtil, 'Optimal utilization point'],
                  ['Slope 1 (%)', slope1, setSlope1, 'Rate added from 0% to the kink'],
                  ['Slope 2 (%)', slope2, setSlope2, 'Rate added from kink to 100%'],
                  ['Max rate (%)', maxRate, setMaxRate, 'Hard ceiling on the curve'],
                ] as const
              ).map(([label, value, setter, hint]) => (
                <div key={label}>
                  <label className="block text-sm font-medium text-white mb-2">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-3 text-white placeholder-brand-muted focus:outline-none focus:border-brand-gold"
                    required
                  />
                  <p className="mt-1 text-xs text-brand-muted">{hint}</p>
                </div>
              ))}
            </div>

            {draftError ? (
              <p className="text-sm text-red-400">{draftError}</p>
            ) : (
              <RateCurveChart config={draftModel} title="Proposal preview" />
            )}

            <button
              type="submit"
              disabled={txLoading || loading || !rateToken || Boolean(draftError)}
              className="w-full py-4 bg-brand-gold text-brand-dark font-bold rounded-xl hover:bg-brand-amber transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              {txLoading ? 'Submitting Proposal...' : 'Propose Rate Model Change'}
            </button>
            <p className="text-xs text-brand-muted">
              The proposal becomes executable after the on-chain timelock (48h default). Anyone
              can execute it once the timelock elapses.
            </p>
          </form>
        )}
      </div>

      <div className="p-6 bg-brand-dark border border-brand-border rounded-2xl text-xs text-brand-muted space-y-2">
        <p className="font-bold text-white mb-1 uppercase tracking-tighter">Safety Controls:</p>
        <p>• The contract enforces a maximum yield of 50.00% (5000 bps).</p>
        <p>• The contract enforces a maximum factoring fee of 100.00% (10000 bps).</p>
        <p>• Curve parameters are capped at a 50.00% (5000 bps) max rate.</p>
        <p>• Yield changes apply to active and new funded invoices at repayment time.</p>
        <p>• Factoring fees are locked when an invoice becomes fully funded.</p>
        <p>
          • Once a token has a rate curve, the curve prices its new fundings and the flat yield
          rate is inert for that token (it remains the fallback for tokens without a curve).
        </p>
      </div>
    </div>
  );
}
