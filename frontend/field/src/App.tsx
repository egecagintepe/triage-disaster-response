/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { db, seedDatabase } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import StatusBar from './components/StatusBar';
import TaskMap from './components/TaskMap';
import SwipeButton from './components/SwipeButton';
import Login from './pages/Login';
import { motion } from 'motion/react';
import type { Task } from './lib/db';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem('auth_token')
  );

  const tasks = useLiveQuery(() => db.tasks.toArray());
  const activeTask = tasks?.find(t => t.status === 'pending' || t.status === 'in_progress');
  
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    seedDatabase();
    
    // Watch geolocation
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.error("Konum hatası:", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isAuthenticated]);

  const handleUpdateStatus = async (status: Task['status']) => {
    if (!activeTask) return;
    
    // Update local DB
    await db.tasks.update(activeTask.id, { 
      status, 
      updatedAt: Date.now() 
    });

    // Log for sync
    await db.logs.add({
      taskId: activeTask.id,
      status,
      timestamp: Date.now(),
      synced: false
    });

    // Simulating reassignment or completion by adding a new one if finished
    if (status === 're_assigned' || status === 'completed') {
      setTimeout(async () => {
        await db.tasks.add({
          id: `task-${Date.now()}`,
          address: 'Altındağ, Anafartalar Cd. No:112, Ankara',
          priority: Math.random() > 0.5 ? 'Yüksek' : 'Orta',
          lat: 39.9413,
          lng: 32.8554,
          status: 'pending',
          updatedAt: Date.now()
        });
      }, 500);
    }
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 overflow-hidden font-sans">
      <StatusBar />

      <main className="flex-1 flex flex-col">
        {activeTask ? (
          <>
            <TaskMap 
              taskLat={activeTask.lat}
              taskLng={activeTask.lng}
              userLat={userLocation?.lat ?? null}
              userLng={userLocation?.lng ?? null}
              address={activeTask.address}
              priority={activeTask.priority}
            />

            <div className="flex-1 px-4 flex flex-col justify-center gap-6 py-6 overflow-hidden">
              <SwipeButton 
                label="Ulaşıldı ->" 
                thumbColor="bg-emerald-600" 
                onConfirm={() => handleUpdateStatus('in_progress')}
              />
              <SwipeButton 
                label="Destek İste ->" 
                thumbColor="bg-red-600" 
                pulse
                onConfirm={() => handleUpdateStatus('needs_backup')}
              />
              <SwipeButton 
                label="Görevi Aktar ->" 
                thumbColor="bg-blue-600" 
                onConfirm={() => handleUpdateStatus('re_assigned')}
              />
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
              <h1 className="text-xl font-bold mb-2">Görev Yok</h1>
              <p className="text-gray-500 text-sm">Merkezden yeni görev ataması bekleniyor...</p>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
