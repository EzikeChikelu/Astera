'use client';

import { useEffect } from 'react';
import useSseEvents from '@/hooks/useSseEvents';
import { useStore } from '@/lib/store';
import type { UserRole } from '@/lib/sse-events';

/**
 * RealTimeNotificationProvider
 *
 * Activates the real-time event polling service on mount.
 * Detects user role based on wallet state and pool config,
 * then configures the polling service accordingly.
 *
 * This component enables:
 * - Real-time toast notifications for contract events (funding, repayment, defaults)
 * - Live updates in the NotificationBell component
 * - Automatic dispatch to the notification service
 */
export function RealTimeNotificationProvider() {
  const wallet = useStore((s) => s.wallet);
  const poolConfig = useStore((s) => s.poolConfig);

  // Determine user role based on wallet and pool config
  const userRole: UserRole = (() => {
    if (!wallet.connected || !wallet.address) {
      return 'Admin'; // Default role when not connected
    }

    // Check if user is admin
    if (poolConfig?.admin === wallet.address) {
      return 'Admin';
    }

    // Default to Admin for broad event coverage
    // Can be refined later with more sophisticated role detection
    // (e.g., checking invoice ownership, investor positions, etc.)
    return 'Admin';
  })();

  // Activate polling with user role and default interval (15 seconds)
  const { isPolling } = useSseEvents({
    role: userRole,
    intervalMs: 15_000,
    enabled: true, // Always enabled once mounted
  });

  // Log polling status for debugging
  useEffect(() => {
    if (isPolling) {
      console.log(`[RealTimeNotifications] Polling activated for role: ${userRole}`);
    }
  }, [isPolling, userRole]);

  // No UI needed - this component just manages the polling lifecycle
  return null;
}
