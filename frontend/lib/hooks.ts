import { useState, useEffect, useRef } from 'react';
import { getToken, getTokenExpiry, ensureAuthWithFreighter, REFRESH_MARGIN_MS } from '@/lib/auth';

/**
 * Hook that debounces a value by the specified delay.
 * Useful for search inputs to avoid excessive re-renders or API calls.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Silently refreshes the SEP-10 JWT before it expires so long-lived sessions
 * (e.g. admin monitoring tabs) never hit a stale-token 401.
 *
 * Schedules a re-authentication REFRESH_MARGIN_MS before the current token
 * expires and reschedules itself after each successful refresh. If the wallet
 * is unavailable at refresh time the timer is not rescheduled; the next manual
 * action will surface the 401 via authenticatedFetch.
 */
export function useAuthRefresh(address: string | null): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!address) return;
    const addr: string = address;

    function schedule() {
      if (timerRef.current) clearTimeout(timerRef.current);

      const token = getToken();
      if (!token) return;

      const exp = getTokenExpiry(token);
      if (!exp) return;

      const refreshAt = exp * 1000 - REFRESH_MARGIN_MS;
      const delay = Math.max(0, refreshAt - Date.now());

      timerRef.current = setTimeout(async () => {
        const result = await ensureAuthWithFreighter(addr).catch(() => null);
        if (result && 'token' in result) {
          schedule();
        }
      }, delay);
    }

    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [address]);
}
