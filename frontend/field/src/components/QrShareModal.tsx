/**
 * QR Share Modal — Bulk Proportional Split Sender
 * 
 * Calculates a 50/50 split of active tasks grouped by priority,
 * generates a minified QR payload, and lets sender confirm handoff.
 */

import { useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Task } from '../services/localDb';
import { db, queueForSync } from '../services/localDb';
import { useTaskStore } from '../stores/taskStore';

interface Props {
  tasks: Task[];
  onClose: () => void;
}

/**
 * Proportional 50/50 split by priority.
 * For each priority: Math.floor(count / 2) tasks go to receiver.
 * Sender keeps remainder.
 */
export function calculateTaskSplit(allTasks: Task[]): { toTransfer: Task[]; toKeep: Task[] } {
  // HOTFIX: Deduplicate by ID first — prevents ghost duplicates from inflating the split
  const uniqueTasks = Array.from(new Map(allTasks.map(t => [t.id, t])).values());

  // HOTFIX: Filter out completed/cancelled tasks — never hand off finished work
  const activeTasks = uniqueTasks.filter(
    t => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'resolved' && t.status !== 'false_alarm'
  );

  const grouped: Record<string, Task[]> = { RED: [], YELLOW: [], GREEN: [] };

  for (const t of activeTasks) {
    const bucket = grouped[t.priority] || grouped['GREEN'];
    bucket.push(t);
  }

  const toTransfer: Task[] = [];
  const toKeep: Task[] = [];

  for (const priority of ['RED', 'YELLOW', 'GREEN'] as const) {
    const group = grouped[priority];
    const splitCount = Math.floor(group.length / 2);

    for (let i = 0; i < group.length; i++) {
      if (i < splitCount) {
        toTransfer.push(group[i]);
      } else {
        toKeep.push(group[i]);
      }
    }
  }

  return { toTransfer, toKeep };
}

/**
 * Minified payload for QR.
 * Single-letter keys keep QR scannable.
 * {t:"BULK", d:[{i:id, z:zone_id, p:"RED", la:lat, lo:lng, a:"addr"}]}
 */
function buildBulkPayload(tasks: Task[]): string {
  const d = tasks.map(t => ({
    i: t.id,
    z: t.zone_id,
    p: t.priority[0], // R/Y/G — single char
    la: +t.lat.toFixed(4),
    lo: +t.lng.toFixed(4),
    a: (t.address || '').substring(0, 40),
  }));
  return JSON.stringify({ t: 'BULK', d });
}

export default function QrShareModal({ tasks, onClose }: Props) {
  const { toTransfer, toKeep } = useMemo(() => calculateTaskSplit(tasks), [tasks]);
  const [handedOff, setHandedOff] = useState(false);

  const payload = useMemo(() => buildBulkPayload(toTransfer), [toTransfer]);

  // Stats per priority
  const stats = useMemo(() => {
    const count = (arr: Task[], p: string) => arr.filter(t => t.priority === p).length;
    return {
      red: { transfer: count(toTransfer, 'RED'), keep: count(toKeep, 'RED') },
      yellow: { transfer: count(toTransfer, 'YELLOW'), keep: count(toKeep, 'YELLOW') },
      green: { transfer: count(toTransfer, 'GREEN'), keep: count(toKeep, 'GREEN') },
    };
  }, [toTransfer, toKeep]);

  const handleConfirmHandoff = async () => {
    const deviceName = localStorage.getItem('device_name') || 'FIELD-UNKNOWN';

    for (const task of toTransfer) {
      // Mark as delegated in Dexie
      await db.tasks.update(task.id, { status: 'resolved' as any, notes: `P2P delegated by ${deviceName}` });

      // Queue sync so backend knows
      await queueForSync('tasks', 'update', {
        id: task.id,
        status: 'resolved',
        p2p_delegated: true,
        delegated_by: deviceName,
      });
    }

    // Update Zustand — remove transferred tasks
    const store = useTaskStore.getState();
    const remainingIds = new Set(toTransfer.map(t => t.id));
    store.setTasks(store.tasks.filter(t => !remainingIds.has(t.id)));

    setHandedOff(true);
  };

  if (toTransfer.length === 0) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col items-center gap-5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">📤 Toplu Paylaşım</h2>
            <p className="text-xs text-gray-500 mt-2">Paylaşılacak yeterli görev yok (en az 2 aynı öncelikte görev gerekli)</p>
          </div>
          <button onClick={onClose} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors text-sm">
            Kapat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col items-center gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-white tracking-tight">📤 Toplu Görev Paylaşımı</h2>
          <p className="text-xs text-gray-500 mt-1">
            {handedOff ? 'Aktarım tamamlandı!' : `${toTransfer.length} görev aktarılacak`}
          </p>
        </div>

        {!handedOff ? (
          <>
            {/* QR Code */}
            <div className="bg-white p-3 rounded-2xl">
              <QRCodeSVG
                value={payload}
                size={200}
                level="L"
                includeMargin={false}
              />
            </div>

            {/* Split breakdown */}
            <div className="w-full bg-zinc-900 rounded-xl p-3 text-xs font-mono space-y-1.5">
              <div className="text-gray-500 text-[10px] mb-1">BÖLÜŞÜM TABLOSU (50/50)</div>
              <div className="flex justify-between">
                <span className="text-red-400">🔴 KIRMIZI</span>
                <span className="text-gray-400">
                  Aktarım: <span className="text-white font-bold">{stats.red.transfer}</span> | Kalacak: <span className="text-white">{stats.red.keep}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400">🟡 SARI</span>
                <span className="text-gray-400">
                  Aktarım: <span className="text-white font-bold">{stats.yellow.transfer}</span> | Kalacak: <span className="text-white">{stats.yellow.keep}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400">🟢 YEŞİL</span>
                <span className="text-gray-400">
                  Aktarım: <span className="text-white font-bold">{stats.green.transfer}</span> | Kalacak: <span className="text-white">{stats.green.keep}</span>
                </span>
              </div>
            </div>

            {/* Confirm handoff button */}
            <button
              onClick={handleConfirmHandoff}
              className="w-full py-3 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-300 font-bold rounded-xl transition-colors text-sm"
            >
              ✅ Aktarımı Tamamla (Benden Düş)
            </button>

            <button onClick={onClose} className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors text-sm">
              İptal
            </button>
          </>
        ) : (
          <>
            {/* Success state */}
            <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-emerald-400 font-bold text-sm">{toTransfer.length} görev aktarıldı!</p>
              <p className="text-gray-500 text-[10px] mt-2">Bağlantı kurulduğunda merkeze bildirilecek</p>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-colors text-sm">
              Tamam
            </button>
          </>
        )}
      </div>
    </div>
  );
}
