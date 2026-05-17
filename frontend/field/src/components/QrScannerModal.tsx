/**
 * QR Scanner Modal — Bulk Receiver Mode
 * 
 * Handles both single TASK_SHARE and BULK payloads.
 * Bulk: iterates minified array, reconstructs tasks, bulk-inserts to Dexie + syncQueue.
 */

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db, queueForSync, type Task } from '../services/localDb';
import { useTaskStore } from '../stores/taskStore';

interface Props {
  onClose: () => void;
}

// Minified bulk item from sender
interface MinifiedTask {
  i: number;   // id
  z: number;   // zone_id
  p: string;   // R/Y/G (first char of priority)
  la: number;  // lat
  lo: number;  // lng
  a: string;   // address (truncated)
}

// Single task share (legacy)
interface SinglePayload {
  t: 'TASK_SHARE';
  id: number;
  zid: number;
  p: 'RED' | 'YELLOW' | 'GREEN';
  s: string;
  lat: number;
  lng: number;
  addr: string;
}

// Bulk payload
interface BulkPayload {
  t: 'BULK';
  d: MinifiedTask[];
}

function expandPriority(p: string): 'RED' | 'YELLOW' | 'GREEN' {
  if (p === 'R') return 'RED';
  if (p === 'Y') return 'YELLOW';
  return 'GREEN';
}

export default function QrScannerModal({ onClose }: Props) {
  const [status, setStatus] = useState<'scanning' | 'success' | 'error'>('scanning');
  const [errorMsg, setErrorMsg] = useState('');
  const [receivedCount, setReceivedCount] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    const scannerId = 'qr-scanner-region';
    let scanner: Html5Qrcode;

    const startScanner = async () => {
      scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          async (decodedText) => {
            if (processedRef.current) return;
            processedRef.current = true;

            try {
              const raw = JSON.parse(decodedText);
              const deviceName = localStorage.getItem('device_name') || 'FIELD-UNKNOWN';

              if (raw.t === 'BULK') {
                await handleBulkImport(raw as BulkPayload, deviceName);
              } else if (raw.t === 'TASK_SHARE') {
                await handleSingleImport(raw as SinglePayload, deviceName);
              } else {
                throw new Error('Geçersiz QR tipi');
              }

              // Stop camera
              try { await scanner.stop(); } catch {}
            } catch (e: any) {
              setErrorMsg(e.message || 'QR okunamadı');
              setStatus('error');
              try { await scanner.stop(); } catch {}
            }
          },
          () => { /* QR not found in frame */ }
        );
      } catch (err: any) {
        console.error('[QR] Camera error:', err);
        setErrorMsg(err?.message || 'Kamera açılamadı. İzin verildi mi?');
        setStatus('error');
      }
    };

    const timer = setTimeout(startScanner, 300);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  /**
   * Bulk import: iterate minified array, reconstruct tasks, bulk save.
   */
  const handleBulkImport = async (payload: BulkPayload, deviceName: string) => {
    if (!payload.d || payload.d.length === 0) {
      throw new Error('Boş toplu aktarım');
    }

    const store = useTaskStore.getState();
    const newTasks: Task[] = [];

    for (const item of payload.d) {
      const task: Task = {
        id: item.i,
        zone_id: item.z,
        assigned_team_id: null,
        status: 'pending',
        priority: expandPriority(item.p),
        lat: item.la,
        lng: item.lo,
        address: item.a,
        local_updated_at: Date.now(),
        notes: `P2P bulk transfer — received by ${deviceName}`,
      };

      // Save to Dexie
      await db.tasks.put(task);

      // Queue for backend sync
      await queueForSync('tasks', 'update', {
        id: task.id,
        status: 'pending',
        assigned_team_id: null,
        p2p_transfer: true,
        p2p_bulk: true,
        received_by_device: deviceName,
      });

      newTasks.push(task);
    }

    // Update Zustand store in one batch
    const existingIds = new Set(store.tasks.map(t => t.id));
    const toAdd = newTasks.filter(t => !existingIds.has(t.id));
    const toUpdate = newTasks.filter(t => existingIds.has(t.id));

    if (toAdd.length > 0) {
      store.setTasks([...store.tasks.map(t => {
        const upd = toUpdate.find(u => u.id === t.id);
        return upd || t;
      }), ...toAdd]);
    } else if (toUpdate.length > 0) {
      store.setTasks(store.tasks.map(t => {
        const upd = toUpdate.find(u => u.id === t.id);
        return upd || t;
      }));
    }

    setReceivedCount(newTasks.length);
    setStatus('success');
    console.log(`[QR] Bulk import: ${newTasks.length} tasks received`);
  };

  /**
   * Single task import (backward compat with original QR).
   */
  const handleSingleImport = async (payload: SinglePayload, deviceName: string) => {
    if (!payload.id || !payload.lat || !payload.lng) {
      throw new Error('Geçersiz QR: Eksik veri');
    }

    const task: Task = {
      id: payload.id,
      zone_id: payload.zid,
      assigned_team_id: null,
      status: 'pending',
      priority: payload.p,
      lat: payload.lat,
      lng: payload.lng,
      address: payload.addr,
      local_updated_at: Date.now(),
      notes: `P2P transfer via QR — received by ${deviceName}`,
    };

    await db.tasks.put(task);

    const store = useTaskStore.getState();
    const existingIdx = store.tasks.findIndex(t => t.id === task.id);
    if (existingIdx >= 0) {
      store.updateTask(task);
    } else {
      store.addTask(task);
    }

    await queueForSync('tasks', 'update', {
      id: task.id,
      status: 'pending',
      assigned_team_id: null,
      p2p_transfer: true,
      received_by_device: deviceName,
    });

    setReceivedCount(1);
    setStatus('success');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col items-center gap-5">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-white tracking-tight">📥 QR ile Görev Al</h2>
          <p className="text-xs text-gray-500 mt-1">
            {status === 'scanning' ? 'Diğer ekibin QR kodunu kameraya gösterin' :
             status === 'success' ? 'Görevler başarıyla alındı!' :
             'Hata oluştu'}
          </p>
        </div>

        {/* Scanner viewport */}
        {status === 'scanning' && (
          <div className="w-full rounded-2xl overflow-hidden border-2 border-blue-500/30 bg-black">
            <div id="qr-scanner-region" style={{ width: '100%' }} />
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-emerald-400 font-bold text-sm">
              {receivedCount} görev alındı!
            </p>
            <p className="text-gray-500 text-[10px] mt-2">Bağlantı kurulduğunda merkeze bildirilecek</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <div className="text-4xl mb-2">❌</div>
            <p className="text-red-400 font-bold text-sm">Tarama başarısız</p>
            <p className="text-red-400/70 text-xs mt-1">{errorMsg}</p>
          </div>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors text-sm"
        >
          {status === 'success' ? 'Tamam' : 'Kapat'}
        </button>
      </div>
    </div>
  );
}
