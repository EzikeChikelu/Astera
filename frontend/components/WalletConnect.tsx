'use client';

import { useEffect, useState } from 'react';
import { useStore, getStoredWalletAddress } from '@/lib/store';
import toast from 'react-hot-toast';
import { truncateAddress } from '@/lib/stellar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useTranslations } from 'next-intl';

type WalletStep = 'idle' | 'detecting' | 'requesting-access' | 'fetching-address';

const MAX_RETRIES = 2;

export default function WalletConnect() {
  const t = useTranslations('Notifications.wallet');
  const { wallet, setWallet, disconnect } = useStore();
  const [step, setStep] = useState<WalletStep>('idle');
  const [retryCount, setRetryCount] = useState(0);

  const loading = step !== 'idle';
  const stepLabels: Record<WalletStep, string> = {
    idle: t('connect'),
    detecting: t('detecting'),
    'requesting-access': t('requestingAccess'),
    'fetching-address': t('fetchingAddress'),
  };

  // Auto-reconnect on mount if a wallet address was previously stored
  useEffect(() => {
    const stored = getStoredWalletAddress();
    if (!stored || wallet.connected) return;

    void (async () => {
      try {
        const freighter = await import('@stellar/freighter-api');
        const { isConnected } = await freighter.isConnected();
        if (!isConnected) return;

        const { isAllowed } = await freighter.isAllowed();
        if (!isAllowed) return;

        const { address, error: addrError } = await freighter.getAddress();
        if (addrError || !address) return;

        setWallet({ address, connected: true, network: 'testnet' });
      } catch {
        // Silent failure - user can reconnect manually
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(attempt = 0) {
    setStep('detecting');
    try {
      const freighter = await import('@stellar/freighter-api');

      const { isConnected } = await freighter.isConnected();
      if (!isConnected) {
        toast.error(t('freighterMissing'));
        setStep('idle');
        return;
      }

      setStep('requesting-access');
      const { isAllowed } = await freighter.isAllowed();
      if (!isAllowed) {
        await freighter.setAllowed();
      }

      setStep('fetching-address');
      const { address, error: addrError } = await freighter.getAddress();
      if (addrError) {
        toast.error(t('addressUnavailable'));
        setStep('idle');
        return;
      }

      setWallet({ address, connected: true, network: 'testnet' });
      toast.success(t('connected'));
      setRetryCount(0);
      setStep('idle');
    } catch (e) {
      console.error('[WalletConnect] Connection error:', e);
      if (attempt < MAX_RETRIES) {
        setRetryCount(attempt + 1);
        // Brief delay before auto-retry
        setTimeout(() => connect(attempt + 1), 800);
      } else {
        toast.error(t('connectFailed'));
        setRetryCount(0);
        setStep('idle');
      }
    }
  }

  function handleRetry() {
    setRetryCount(0);
    connect(0);
  }

  if (wallet.connected && wallet.address) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-800/50 text-green-400 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden="true" />
          <span>{truncateAddress(wallet.address)}</span>
        </div>
        <button
          onClick={disconnect}
          className="text-sm text-brand-muted hover:text-white transition-colors"
        >
          {t('disconnect')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={() => connect(0)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-brand-gold text-brand-dark font-semibold rounded-lg hover:bg-brand-amber transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        aria-busy={loading}
      >
        {loading && <LoadingSpinner size="sm" />}
        {stepLabels[step]}
      </button>

      {retryCount > 0 && (
        <button
          onClick={handleRetry}
          className="text-xs text-brand-gold hover:text-brand-amber underline transition-colors"
        >
          {t('retry')}
        </button>
      )}

      {loading && retryCount > 0 && (
        <p className="text-brand-muted text-xs">
          {t('retryAttempt', { retryCount, maxRetries: MAX_RETRIES })}
        </p>
      )}
    </div>
  );
}
