/**
 * TRIAGE V2 — Online/Offline Status Hook
 *
 * Tracks navigator.onLine and listens for 'online' / 'offline' events.
 * Returns a reactive boolean that components can consume.
 *
 * Reference: architecture.md Section 8 — Offline-First Architecture
 */

import { useState, useEffect, useCallback } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const handleOnline = useCallback((e: Event) => {
    const isWsOnline = (e as CustomEvent).detail;
    console.log(`[Network] WS status changed: ${isWsOnline}`);
    setIsOnline(isWsOnline);
  }, []);

  useEffect(() => {
    window.addEventListener('ws_status_change', handleOnline);

    return () => {
      window.removeEventListener('ws_status_change', handleOnline);
    };
  }, [handleOnline]);

  return isOnline;
}
