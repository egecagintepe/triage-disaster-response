/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import StatusBar from './components/StatusBar';
import TaskMap from './components/TaskMap';
import SwipeButton from './components/SwipeButton';
import Login from './pages/Login';
import { motion } from 'motion/react';

// Sprint 2.1 + 2.3 services
import { useTaskStore } from './stores/taskStore';
import { useTeamStore } from './stores/teamStore';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { syncQueue } from './services/syncQueue';
import { wsManager } from './services/websocket';
import { db } from './services/localDb';
import type { Task } from './services/localDb';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem('auth_token')
  );

  // Zustand stores
  const tasks = useTaskStore((s) => s.tasks);
  const completeTask = useTaskStore((s) => s.completeTask);
  const requestBackup = useTaskStore((s) => s.requestBackup);
  const cancelTask = useTaskStore((s) => s.cancelTask);

  const isOnline = useOnlineStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Active task = first pending/assigned/in_progress task for this device
  const activeTask: Task | undefined = tasks.find(
    (t) => t.status === 'pending' || t.status === 'assigned' || t.status === 'in_progress',
  );

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const deviceName = localStorage.getItem('device_name') || 'FIELD-UNKNOWN';

  // --- Boot services on auth ---
  useEffect(() => {
    if (!isAuthenticated) return;

    // Start sync queue auto-sync
    syncQueue.startAutoSync();

    // Connect WebSocket
    wsManager.connect(deviceName);

    // Load tasks from Dexie into Zustand (initial hydration)
    db.tasks.toArray().then((dbTasks) => {
      if (dbTasks.length > 0) {
        useTaskStore.getState().setTasks(dbTasks);
      }
    });

    return () => {
      syncQueue.stopAutoSync();
      wsManager.disconnect();
    };
  }, [isAuthenticated, deviceName]);

  // --- Geolocation tracking + WS location reporting ---
  useEffect(() => {
    if (!isAuthenticated) return;

    let watchId: number | undefined;

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
        },
        (err) => console.error('[Geo] Konum hatası:', err),
        { enableHighAccuracy: true },
      );

      // Send location to server every 10s
      locationIntervalRef.current = setInterval(() => {
        if (userLocation && wsManager.isConnected) {
          wsManager.sendLocation(userLocation.lat, userLocation.lng);
        }
      }, 10_000);
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [isAuthenticated, userLocation]);

  // --- Poll pending sync count ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      const count = await syncQueue.pendingCount();
      setPendingSyncCount(count);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // --- Action handlers (wire to Zustand → Dexie → SyncQueue) ---
  const handleArrived = useCallback(async () => {
    if (!activeTask) return;
    await completeTask(activeTask.id, 'in_progress');
  }, [activeTask, completeTask]);

  const handleRequestBackup = useCallback(async () => {
    if (!activeTask) return;
    await requestBackup(activeTask.id);
  }, [activeTask, requestBackup]);

  const handleCancel = useCallback(async () => {
    if (!activeTask) return;
    await cancelTask(activeTask.id);
  }, [activeTask, cancelTask]);

  const handleComplete = useCallback(async () => {
    if (!activeTask) return;
    await completeTask(activeTask.id, 'resolved');
  }, [activeTask, completeTask]);

  // --- Login gate ---
  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 overflow-hidden font-sans">
      <StatusBar
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        teamName={deviceName}
      />

      <main className="flex-1 flex flex-col">
        {activeTask ? (
          <>
            <TaskMap
              taskLat={activeTask.lat}
              taskLng={activeTask.lng}
              userLat={userLocation?.lat ?? null}
              userLng={userLocation?.lng ?? null}
              address={activeTask.address || `Konum: ${activeTask.lat.toFixed(4)}, ${activeTask.lng.toFixed(4)}`}
              priority={activeTask.priority}
              status={activeTask.status}
            />

            <div className="flex-1 px-4 flex flex-col justify-center gap-6 py-6 overflow-hidden">
              {/* Show different buttons based on task status */}
              {(activeTask.status === 'pending' || activeTask.status === 'assigned') && (
                <>
                  <SwipeButton
                    label="Bölgeye Ulaşıldı →"
                    thumbColor="bg-emerald-600"
                    onConfirm={handleArrived}
                  />
                  <SwipeButton
                    label="Destek Ekip Lazım →"
                    thumbColor="bg-red-600"
                    pulse
                    onConfirm={handleRequestBackup}
                  />
                  <SwipeButton
                    label="Hasar Yok / İptal →"
                    thumbColor="bg-gray-600"
                    onConfirm={handleCancel}
                  />
                </>
              )}

              {activeTask.status === 'in_progress' && (
                <>
                  <SwipeButton
                    label="Görev Tamamlandı →"
                    thumbColor="bg-emerald-600"
                    onConfirm={handleComplete}
                  />
                  <SwipeButton
                    label="Destek Ekip Lazım →"
                    thumbColor="bg-red-600"
                    pulse
                    onConfirm={handleRequestBackup}
                  />
                  <SwipeButton
                    label="Yanlış Alarm →"
                    thumbColor="bg-gray-600"
                    onConfirm={handleCancel}
                  />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gray-900 border border-gray-800 p-8 rounded-3xl"
            >
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <div className="w-4 h-4 bg-gray-600 rounded-full" />
              </div>
              <h1 className="text-xl font-bold mb-2">Görev Bekleniyor</h1>
              <p className="text-gray-500 text-sm">Merkezden yeni görev ataması bekleniyor...</p>

              {!isOnline && (
                <div className="mt-4 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-amber-400 text-xs font-bold">⚠️ Çevrimdışı mod aktif</p>
                  <p className="text-amber-400/70 text-[10px] mt-1">Bağlantı kurulunca görevler senkronize edilecek</p>
                </div>
              )}

              {pendingSyncCount > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  {pendingSyncCount} işlem senkronize edilmeyi bekliyor
                </div>
              )}
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
