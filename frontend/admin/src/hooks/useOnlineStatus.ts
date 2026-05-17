/**
 * TRIAGE — Online/Offline Status Hook (Admin)
 *
 * Tracks WebSocket connection status via ws_status_change custom events.
 * Defaults to false (offline) until WS connection succeeds.
 *
 * Reference: architecture.md Section 8 — Offline-First Architecture
 */

import { useState, useEffect, useCallback } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const handleWsStatus = useCallback((e: Event) => {
    const wsOnline = (e as CustomEvent).detail;
    console.log(`[Network] WS status changed: ${wsOnline}`);
    setIsOnline(!!wsOnline);
  }, []);

  useEffect(() => {
    // Primary: WebSocket custom events
    window.addEventListener('ws_status_change', handleWsStatus);

    // Secondary: browser offline signal
    const goOffline = () => {
      console.log('[Network] Browser offline event');
      setIsOnline(false);
    };
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('ws_status_change', handleWsStatus);
      window.removeEventListener('offline', goOffline);
    };
  }, [handleWsStatus]);

  return isOnline;
}
