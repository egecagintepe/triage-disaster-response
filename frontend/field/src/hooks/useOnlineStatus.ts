/**
 * TRIAGE — Online/Offline Status Hook
 *
 * Listens to WebSocket status events (ws_status_change) for accurate
 * connection state. Falls back to navigator.onLine for initial state.
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
    // Listen for WebSocket custom events (primary source of truth)
    window.addEventListener('ws_status_change', handleWsStatus);

    // Also listen for browser online/offline as secondary signal
    const goOnline = () => {
      // Browser says online, but WS might still be disconnected
      // Don't set true — let WS reconnect trigger it
      console.log('[Network] Browser online event');
    };
    const goOffline = () => {
      console.log('[Network] Browser offline event');
      setIsOnline(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('ws_status_change', handleWsStatus);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [handleWsStatus]);

  return isOnline;
}
