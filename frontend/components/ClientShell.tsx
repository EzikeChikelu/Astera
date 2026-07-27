'use client';

import { TransactionStatusPanel } from '@/components/TransactionStatus';

export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TransactionStatusPanel />
    </>
  );
}
