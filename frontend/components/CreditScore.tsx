'use client';

import { useMemo } from 'react';

interface PaymentRecord {
  invoiceId: number;
  amount: bigint;
  dueDate: number;
  paidDate: number | null;
  status: 'OnTime' | 'Late' | 'Defaulted';
  daysLate?: number;
}

interface Props {
  paid: number;
  funded: number;
  defaulted: number;
  totalVolume: bigint;
  paymentHistory?: PaymentRecord[];
  previousScore?: number;
}

export default function CreditScore({
  paid,
  funded,
  defaulted,
  totalVolume,
  paymentHistory = [],
  previousScore,
}: Props) {
  const total = paid + funded + defaulted;

  // Simple score: 300–850 based on repayment rate and volume
  const repaymentRate = total > 0 ? paid / total : 0;
  const volumeBonus = Math.min(Number(totalVolume) / 1e10, 50); // up to 50 pts
  const score = Math.round(300 + repaymentRate * 500 + volumeBonus);

  const scoreChange = previousScore ? score - previousScore : null;
  const scoreColor =
    score >= 750 ? 'text-green-400' : score >= 600 ? 'text-yellow-400' : 'text-red-400';
  const scoreLabel =
    score >= 750 ? 'Excellent' : score >= 650 ? 'Good' : score >= 550 ? 'Fair' : 'Building';

  const arc = Math.round(((score - 300) / 550) * 180); // 0–180 degrees

  const avgPaymentDays = useMemo(() => {
    if (paymentHistory.length === 0) return 0;
    const onTimePaid = paymentHistory.filter((p) => p.status === 'OnTime');
    if (onTimePaid.length === 0) return 0;
    const totalDays = onTimePaid.reduce((sum, p) => {
      const due = p.dueDate;
      const paid = p.paidDate || Date.now() / 1000;
      return sum + Math.floor((paid - due) / 86400);
    }, 0);
    return Math.round(totalDays / onTimePaid.length);
  }, [paymentHistory]);

  return (
    <div className="space-y-6">
      {/* Score Overview Card */}
      <div className="p-6 bg-brand-card border border-brand-border rounded-2xl">
        <h2 className="text-lg font-semibold mb-6">On-Chain Credit Score</h2>

        {/* Score display with change indicator */}
        <div className="text-center mb-8">
          <div className={`text-5xl font-bold mb-2 ${scoreColor}`}>{score}</div>
          <div className="text-brand-muted text-sm mb-1">{scoreLabel}</div>
          {scoreChange !== null && (
            <div
              className={`text-xs font-medium ${
                scoreChange >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {scoreChange >= 0 ? '+' : ''}{scoreChange} since last invoice
            </div>
          )}
          <div className="text-xs text-brand-muted/60 mt-2">Based on {total} invoice(s)</div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <ScoreRow label="Paid on time" count={paid} color="bg-green-500" total={total} />
          <ScoreRow label="Currently funded" count={funded} color="bg-blue-500" total={total} />
          <ScoreRow label="Defaulted" count={defaulted} color="bg-red-500" total={total} />
        </div>

        {/* Additional Stats */}
        {total > 0 && (
          <div className="mt-6 pt-6 border-t border-brand-border grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-brand-muted mb-1">Repayment Rate</div>
              <div className="text-lg font-semibold">
                {Math.round(repaymentRate * 100)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-brand-muted mb-1">Average Payment Days</div>
              <div className="text-lg font-semibold">{avgPaymentDays} days</div>
            </div>
          </div>
        )}

        {total === 0 && (
          <p className="text-center text-brand-muted text-sm mt-4">
            Create and repay invoices to build your score.
          </p>
        )}
      </div>

      {/* Payment History Table */}
      {paymentHistory.length > 0 && (
        <div className="p-6 bg-brand-card border border-brand-border rounded-2xl">
          <h3 className="text-lg font-semibold mb-4">Payment History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left text-brand-muted py-3 px-2">Invoice</th>
                  <th className="text-right text-brand-muted py-3 px-2">Amount</th>
                  <th className="text-left text-brand-muted py-3 px-2">Status</th>
                  <th className="text-right text-brand-muted py-3 px-2">Days Late</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.slice(0, 10).map((record) => (
                  <tr
                    key={record.invoiceId}
                    className="border-b border-brand-border hover:bg-brand-border/30 transition"
                  >
                    <td className="py-3 px-2 font-medium">#{record.invoiceId}</td>
                    <td className="text-right py-3 px-2">
                      ${(Number(record.amount) / 1e6).toFixed(2)}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          record.status === 'OnTime'
                            ? 'bg-green-500/20 text-green-400'
                            : record.status === 'Late'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {record.status === 'OnTime' ? 'On Time' : record.status}
                      </span>
                    </td>
                    <td className="text-right py-3 px-2">
                      {record.daysLate ? record.daysLate : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRow({
  label,
  count,
  color,
  total,
}: {
  label: string;
  count: number;
  color: string;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-brand-muted">{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
