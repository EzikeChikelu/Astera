'use client';

import { getEnvConfig } from '@/lib/env';
import { useReferralStats } from '@/lib/cache';
import toast from 'react-hot-toast';

interface Props {
  address: string;
}

// #799: shareable referral link — the referral program only exists once a
// referral contract is deployed and configured.
export default function InviteFriends({ address }: Props) {
  const { NEXT_PUBLIC_REFERRAL_CONTRACT_ID } = getEnvConfig();
  const { data: stats } = useReferralStats(NEXT_PUBLIC_REFERRAL_CONTRACT_ID ? address : null);

  if (!NEXT_PUBLIC_REFERRAL_CONTRACT_ID) return null;

  const referralLink =
    typeof window !== 'undefined' ? `${window.location.origin}/?ref=${address}` : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Referral link copied!');
    } catch {
      toast.error('Could not copy link — copy it manually.');
    }
  }

  return (
    <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/5 p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-gold">Invite friends</p>
          <p className="text-xs text-brand-muted mt-0.5">
            Share your link — earn a share of the protocol fees from anyone you refer.
            {stats && stats.referralCount > 0
              ? ` ${stats.referralCount} referral${stats.referralCount === 1 ? '' : 's'} so far.`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="px-3 py-1.5 rounded-lg bg-brand-dark border border-brand-border text-xs text-brand-muted max-w-[220px] truncate">
            {referralLink}
          </code>
          <button
            onClick={copyLink}
            className="px-3 py-1.5 rounded-lg bg-brand-gold text-brand-dark text-xs font-bold hover:bg-brand-gold-light transition-colors"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
