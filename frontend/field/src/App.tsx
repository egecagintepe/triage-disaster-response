/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import StatusBar from './components/StatusBar';
import TaskMap from './components/TaskMap';
import SwipeButton from './components/SwipeButton';
import QrShareModal from './components/QrShareModal';
import QrScannerModal from './components/QrScannerModal';
import Login from './pages/Login';
import { motion, AnimatePresence } from 'motion/react';

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
  const [emergencyAlert, setEmergencyAlert] = useState<{ message: string; severity: string } | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isQrShareOpen, setIsQrShareOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);

  // Active tasks = all pending/assigned/in_progress tasks for this device
  const activeTasks: Task[] = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'assigned' || t.status === 'in_progress',
  );
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const activeTask: Task | undefined = activeTasks[activeTaskIndex] ?? activeTasks[0];

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const deviceName = localStorage.getItem('device_name') || 'FIELD-UNKNOWN';

  // --- Boot services on auth ---
  useEffect(() => {
    if (!isAuthenticated) return;

    // Start sync queue auto-sync
    syncQueue.startAutoSync();

    // Connect WebSocket
    wsManager.connect(deviceName);

    // Load tasks from Dexie into Zustand (initial hydration)
    const hydrateFromDexie = async () => {
      try {
        const dbTasks = await db.tasks.toArray();
        if (dbTasks.length > 0) {
          // Deduplicate before setting
          const unique = Array.from(new Map(dbTasks.map(t => [t.id, t])).values());
          useTaskStore.getState().setTasks(unique);
        }
      } catch (error: any) {
        if (error?.name === 'QuotaExceededError' || error?.message?.includes('QuotaExceeded')) {
          console.error('[STORAGE] QuotaExceeded — purging stale task cache');
          await db.tasks.clear();
          await db.syncQueue.clear();
          useTaskStore.getState().setTasks([]);
        }
      }
    };
    hydrateFromDexie();

    return () => {
      syncQueue.stopAutoSync();
      wsManager.disconnect();
    };
  }, [isAuthenticated, deviceName]);

  // --- Geolocation tracking + WS location reporting ---
  useEffect(() => {
    if (!isAuthenticated) return;

    let watchId: number | undefined;
    let latestLocation: { lat: number; lng: number } | null = null;

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          latestLocation = loc;
          setUserLocation(loc);
        },
        (err) => console.error('[Geo] Konum hatası:', err),
        { enableHighAccuracy: true },
      );

      // Send location to server every 10s (uses closure, not state)
      locationIntervalRef.current = setInterval(() => {
        if (latestLocation && wsManager.isConnected) {
          wsManager.sendLocation(latestLocation.lat, latestLocation.lng);
        }
      }, 10_000);
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // --- Poll pending sync count ---
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      const count = await syncQueue.pendingCount();
      setPendingSyncCount(count);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // --- Emergency alert listener + AudioContext Siren ---
  useEffect(() => {
    const playSiren = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      
      let high = true;
      sirenIntervalRef.current = setInterval(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(high ? 800 : 600, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime); // LOUD but not deafening
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        high = !high;
      }, 500);
    };

    const stopSiren = () => {
      if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };

    const handleAlert = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEmergencyAlert({ message: detail.message, severity: detail.severity });
      playSiren();
      setTimeout(() => {
        stopSiren();
        setEmergencyAlert(null);
      }, 10000);
    };
    
    const handleClear = () => {
      setEmergencyAlert(null);
      stopSiren();
    };

    window.addEventListener('emergency_alert', handleAlert);
    window.addEventListener('emergency_clear', handleClear);
    return () => {
      window.removeEventListener('emergency_alert', handleAlert);
      window.removeEventListener('emergency_clear', handleClear);
      stopSiren();
    };
  }, []);

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
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden font-sans">
      {/* Emergency Alert Overlay */}
      {emergencyAlert && (
        <div className="fixed inset-0 z-[99999] bg-red-700 flex flex-col items-center justify-center animate-pulse">
          <div className="text-white text-center p-8">
            <div className="text-8xl mb-6">🚨</div>
            <h1 className="text-4xl font-black uppercase tracking-wider mb-4">KIRMIZI ALARM</h1>
            <p className="text-xl font-bold mb-8">{emergencyAlert.message}</p>
            <p className="text-gray-200 mt-4 text-sm animate-pulse">Siren 10 saniye boyunca çalacak...</p>
          </div>
        </div>
      )}

      <StatusBar
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        teamName={deviceName}
      />

      <main className="flex-1 flex flex-col">
        {activeTask ? (
          <>
            {/* Multi-task navigation */}
            {activeTasks.length > 1 && (
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
                <button
                  onClick={() => setActiveTaskIndex(Math.max(0, activeTaskIndex - 1))}
                  disabled={activeTaskIndex === 0}
                  className="px-3 py-1 text-sm font-bold rounded bg-zinc-800 text-white disabled:opacity-30"
                >
                  ◀ Önceki
                </button>
                <span className="text-xs font-mono text-gray-400">
                  Görev {activeTaskIndex + 1} / {activeTasks.length}
                </span>
                <button
                  onClick={() => setActiveTaskIndex(Math.min(activeTasks.length - 1, activeTaskIndex + 1))}
                  disabled={activeTaskIndex >= activeTasks.length - 1}
                  className="px-3 py-1 text-sm font-bold rounded bg-zinc-800 text-white disabled:opacity-30"
                >
                  Sonraki ▶
                </button>
              </div>
            )}
            <TaskMap
              taskLat={activeTask.lat}
              taskLng={activeTask.lng}
              userLat={userLocation?.lat ?? null}
              userLng={userLocation?.lng ?? null}
              address={activeTask.address || `Konum: ${activeTask.lat.toFixed(4)}, ${activeTask.lng.toFixed(4)}`}
              priority={activeTask.priority}
              status={activeTask.status}
              isExpanded={isMapExpanded}
              onExpand={() => setIsMapExpanded(true)}
              onCollapse={() => setIsMapExpanded(false)}
            />

            <AnimatePresence>
              {!isMapExpanded && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 50, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 px-4 flex flex-col justify-center gap-6 py-6 overflow-hidden"
                >
                  {/* Show different buttons based on task status */}
                  {(activeTask.status === 'pending' || activeTask.status === 'assigned') && (
                    <>
                      <SwipeButton
                        label="Bölgeye Ulaşıldı →"
                        thumbColor="bg-emerald-600"
                        onConfirm={handleArrived}
                      />
                      <SwipeButton
                        label="Görev Paylaştır →"
                        thumbColor="bg-amber-500"
                        onConfirm={() => setIsQrShareOpen(true)}
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
                        label="Görev Paylaştır →"
                        thumbColor="bg-amber-500"
                        onConfirm={() => setIsQrShareOpen(true)}
                      />
                      <SwipeButton
                        label="Yanlış Alarm →"
                        thumbColor="bg-gray-600"
                        onConfirm={handleCancel}
                      />
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-zinc-950 border border-zinc-800 p-8 rounded-3xl"
            >
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <div className="w-4 h-4 bg-zinc-700 rounded-full" />
              </div>
              <h1 className="text-xl font-bold mb-2 text-gray-100">Görev Bekleniyor</h1>
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

              <button
                onClick={() => setIsQrScannerOpen(true)}
                className="mt-4 w-full py-3 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-300 font-bold rounded-xl transition-colors text-sm"
              >
                📥 QR ile Görev Al
              </button>
            </motion.div>
          </div>
        )}
      </main>

      {/* QR Modals */}
      {isQrShareOpen && (
        <QrShareModal 
          onClose={() => setIsQrShareOpen(false)} 
          tasks={activeTasks}
        />
      )}
      {isQrScannerOpen && (
        <QrScannerModal 
          onClose={() => setIsQrScannerOpen(false)} 
        />
      )}
    </div>
  );
}
