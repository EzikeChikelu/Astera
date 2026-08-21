'use client';

// #1043: juror dashboard for the structured multi-party dispute arbitration
// subsystem — stake/deregister as a juror, and commit/reveal votes on cases
// this wallet was selected for. Modeled on app/admin/oracles/page.tsx's
// structure (local fetch-on-mount state, a `signAndSubmit` XDR helper), but
// deliberately kept to plain English strings rather than wired through
// next-intl — the rest of this dashboard's translation keys are a separate,
// mechanical follow-up, not part of #1043's scope.

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '@/lib/store';
import { Skeleton } from '@/components/Skeleton';
import { parseStellarAddress } from '@/lib/types';
import type { JurorInfo, DisputeCase, JurorVoteStatus } from '@/lib/types';
import {
  getJurorInfo,
  getJurorCases,
  getArbitrationCase,
  getJurorVoteStatus,
  buildRegisterJurorTx,
  buildDeregisterJurorTx,
  buildCommitVoteTx,
  buildRevealVoteTx,
  computeArbitrationCommitHash,
  generateArbitrationSalt,
  submitTx,
} from '@/lib/contracts';

const STATUS_STYLES: Record<DisputeCase['status'], string> = {
  EvidenceWindow: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CommitReveal: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
  NoQuorumEscalated: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function saltStorageKey(caseId: number, juror: string): string {
  return `astera:arbitration:salt:${caseId}:${juror}`;
}

function formatStake(amount: bigint): string {
  return (Number(amount) / 10_000_000).toLocaleString();
}

export default function ArbitrationJurorsPage() {
  const { wallet } = useStore();
  const [info, setInfo] = useState<JurorInfo | null>(null);
  const [cases, setCases] = useState<DisputeCase[]>([]);
  const [votes, setVotes] = useState<Record<number, JurorVoteStatus | null>>({});
  const [loading, setLoading] = useState(true);
  const [notDeployed, setNotDeployed] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [stakeInput, setStakeInput] = useState('1000');
  const [voteChoice, setVoteChoice] = useState<Record<number, boolean>>({});

  async function load() {
    if (!wallet.address) return;
    setLoading(true);
    try {
      const address = parseStellarAddress(wallet.address);
      const [jurorInfo, caseIds] = await Promise.all([
        getJurorInfo(address),
        getJurorCases(address),
      ]);
      setInfo(jurorInfo);
      const loadedCases = await Promise.all(caseIds.map((id) => getArbitrationCase(id)));
      const active = loadedCases.filter((c): c is DisputeCase => c !== null);
      setCases(active);
      const voteEntries = await Promise.all(
        active.map(async (c) => [c.id, await getJurorVoteStatus(c.id, address)] as const),
      );
      setVotes(Object.fromEntries(voteEntries));
    } catch (e) {
      // Most likely NEXT_PUBLIC_ARBITRATION_CONTRACT_ID is unset — this page
      // is only meaningful once the #1043 arbitration contract is deployed.
      console.error(e);
      setNotDeployed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  async function signAndSubmit(xdr: string) {
    const freighter = await import('@stellar/freighter-api');
    const { signedTxXdr, error: signError } = await freighter.signTransaction(xdr, {
      networkPassphrase: 'Test SDF Network ; September 2015',
      address: wallet.address!,
    });
    if (signError) throw new Error(signError.message || 'Signing rejected.');
    await submitTx(signedTxXdr);
  }

  async function handleRegister() {
    if (!wallet.address) return;
    const stakeAmount = BigInt(Math.round(Number(stakeInput) * 10_000_000));
    if (!Number.isFinite(Number(stakeInput)) || stakeAmount <= 0n) {
      toast.error('Enter a valid stake amount.');
      return;
    }
    setTxLoading(true);
    try {
      const operator = parseStellarAddress(wallet.address);
      const xdr = await buildRegisterJurorTx({ operator, stakeAmount });
      await signAndSubmit(xdr);
      toast.success('Registered as a juror.');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transaction failed.');
    } finally {
      setTxLoading(false);
    }
  }

  async function handleDeregister() {
    if (!wallet.address) return;
    setTxLoading(true);
    try {
      const operator = parseStellarAddress(wallet.address);
      const xdr = await buildDeregisterJurorTx({ operator });
      await signAndSubmit(xdr);
      toast.success(
        info?.deregisterRequestedAt
          ? 'Stake withdrawn.'
          : 'Deregistration requested — stake unlocks after the cooldown.',
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transaction failed.');
    } finally {
      setTxLoading(false);
    }
  }

  async function handleCommit(caseId: number) {
    if (!wallet.address) return;
    const choice = voteChoice[caseId];
    if (choice === undefined) {
      toast.error('Pick a side before committing.');
      return;
    }
    setTxLoading(true);
    try {
      const juror = parseStellarAddress(wallet.address);
      const salt = generateArbitrationSalt();
      // Persisted locally so this browser can reveal it later — losing the
      // salt means this vote can never be revealed and counted.
      window.localStorage.setItem(
        saltStorageKey(caseId, juror),
        JSON.stringify({ vote: choice, salt: Array.from(salt) }),
      );
      const commitHash = await computeArbitrationCommitHash(choice, salt);
      const xdr = await buildCommitVoteTx({ juror, caseId, commitHash });
      await signAndSubmit(xdr);
      toast.success('Vote committed. Come back during the reveal window to reveal it.');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transaction failed.');
    } finally {
      setTxLoading(false);
    }
  }

  async function handleReveal(caseId: number) {
    if (!wallet.address) return;
    const juror = parseStellarAddress(wallet.address);
    const stored = window.localStorage.getItem(saltStorageKey(caseId, juror));
    if (!stored) {
      toast.error(
        "No locally-saved salt for this case/browser — the committed vote can't be revealed from here.",
      );
      return;
    }
    setTxLoading(true);
    try {
      const { vote, salt } = JSON.parse(stored) as { vote: boolean; salt: number[] };
      const xdr = await buildRevealVoteTx({
        juror,
        caseId,
        voteChoice: vote,
        salt: new Uint8Array(salt),
      });
      await signAndSubmit(xdr);
      toast.success('Vote revealed.');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transaction failed.');
    } finally {
      setTxLoading(false);
    }
  }

  if (!wallet.address) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Arbitration Jurors</h1>
        <p className="text-brand-muted text-sm">Connect your wallet to register as a juror.</p>
      </div>
    );
  }

  if (notDeployed && !loading) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Arbitration Jurors</h1>
        <p className="text-brand-muted text-sm">
          The arbitration contract isn&apos;t configured on this deployment yet.
        </p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Arbitration Jurors</h1>
        <p className="text-brand-muted text-sm">
          Stake to become eligible for random selection onto invoice dispute cases, then commit and
          reveal your vote when selected.
        </p>
      </div>

      <div className="p-6 bg-brand-card border border-brand-border rounded-2xl space-y-4">
        <h2 className="text-xl font-bold">Your juror status</h2>
        {loading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : info ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-brand-muted text-xs">Stake</p>
              <p className="font-semibold">{formatStake(info.stakeAmount)}</p>
            </div>
            <div>
              <p className="text-brand-muted text-xs">Cases served</p>
              <p className="font-semibold">{info.casesServed}</p>
            </div>
            <div>
              <p className="text-brand-muted text-xs">Times slashed</p>
              <p className={info.timesSlashed > 0 ? 'font-semibold text-red-400' : 'font-semibold'}>
                {info.timesSlashed}
              </p>
            </div>
            <div>
              <p className="text-brand-muted text-xs">Status</p>
              <p className="font-semibold">
                {info.deregisterRequestedAt
                  ? 'Deregistering'
                  : info.isActive
                    ? 'Active'
                    : 'Inactive'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-brand-muted">Not yet registered as a juror.</p>
        )}

        <div className="flex gap-3 pt-2">
          {!info || info.deregisterRequestedAt === null ? (
            <>
              <input
                type="number"
                min={0}
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                placeholder="Stake amount"
                className="flex-1 bg-brand-dark border border-brand-border rounded-xl px-4 py-2.5 text-white placeholder-brand-muted focus:outline-none focus:border-brand-gold text-sm"
              />
              <button
                onClick={handleRegister}
                disabled={txLoading || !!info}
                className="px-5 py-2.5 bg-brand-gold text-brand-dark rounded-xl text-sm font-semibold hover:bg-brand-amber transition-colors disabled:opacity-50"
              >
                {info ? 'Registered' : 'Register'}
              </button>
            </>
          ) : null}
          {info && (
            <button
              onClick={handleDeregister}
              disabled={txLoading}
              className="px-5 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {info.deregisterRequestedAt ? 'Withdraw stake' : 'Deregister'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold">Your assigned cases</h2>
        {loading ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : cases.length === 0 ? (
          <div className="p-6 bg-brand-card border border-brand-border rounded-2xl text-center text-brand-muted text-sm">
            No cases assigned yet.
          </div>
        ) : (
          <div className="space-y-4">
            {cases.map((c) => {
              const vote = votes[c.id];
              const inCommitPhase = c.status === 'CommitReveal' && now <= c.commitDeadline;
              const inRevealPhase =
                c.status === 'CommitReveal' && now > c.commitDeadline && now <= c.revealDeadline;
              return (
                <div
                  key={c.id}
                  className="p-6 bg-brand-card border border-brand-border rounded-2xl space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-brand-muted">Case #{c.id}</p>
                      <p className="font-semibold">Invoice #{c.invoiceId}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>

                  {inCommitPhase && !vote?.hasCommitted && (
                    <div className="space-y-3 pt-3 border-t border-brand-border">
                      <p className="text-sm text-brand-muted">Commit your vote:</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setVoteChoice((v) => ({ ...v, [c.id]: true }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                            voteChoice[c.id] === true
                              ? 'bg-green-500/30 text-green-300 border-green-500/50'
                              : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                          }`}
                        >
                          Favor debtor
                        </button>
                        <button
                          onClick={() => setVoteChoice((v) => ({ ...v, [c.id]: false }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                            voteChoice[c.id] === false
                              ? 'bg-red-500/30 text-red-300 border-red-500/50'
                              : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                          }`}
                        >
                          Favor SME
                        </button>
                      </div>
                      <button
                        onClick={() => handleCommit(c.id)}
                        disabled={txLoading}
                        className="w-full py-2.5 bg-brand-gold text-brand-dark rounded-xl text-sm font-semibold hover:bg-brand-amber transition-colors disabled:opacity-50"
                      >
                        Commit vote
                      </button>
                    </div>
                  )}

                  {vote?.hasCommitted && vote.revealedVote === null && (
                    <div className="pt-3 border-t border-brand-border">
                      {inRevealPhase ? (
                        <button
                          onClick={() => handleReveal(c.id)}
                          disabled={txLoading}
                          className="w-full py-2.5 bg-brand-gold text-brand-dark rounded-xl text-sm font-semibold hover:bg-brand-amber transition-colors disabled:opacity-50"
                        >
                          Reveal vote
                        </button>
                      ) : (
                        <p className="text-sm text-brand-muted">
                          Committed — reveal opens once the commit window closes.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
