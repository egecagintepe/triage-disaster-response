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

  const handleOnline = useCallback(() => {
    console.log('[Network] Back online');
    setIsOnline(true);
  }, []);

  const handleOffline = useCallback(() => {
    console.log('[Network] Gone offline');
    setIsOnline(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return isOnline;
}
