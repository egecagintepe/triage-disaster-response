/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { IntelligenceLog, LogType } from "../types";
import { ChevronRight, ChevronLeft, CheckCircle2, Bot } from "lucide-react";
import { useTaskStore } from "../stores/taskStore";
import { api } from "../services/api";

interface Props {
  logs: IntelligenceLog[];
}

// Priority sort weight (lower = higher priority = top of list)
const PRIORITY_WEIGHT: Record<string, number> = {
  'RED': 1, 'CRITICAL': 1, 'KRİTİK': 1,
  'YELLOW': 2, 'HIGH': 2, 'YÜKSEK': 2,
  'MEDIUM': 3, 'ORTA': 3,
  'GREEN': 4, 'LOW': 4, 'DÜŞÜK': 4,
};

const isLowPriority = (priority: string): boolean => {
  const p = priority.toUpperCase();
  return p === 'GREEN' || p === 'LOW' || p === 'DÜŞÜK' || p === '1' || p === '2';
};

/**
 * FUTURE AGENT NOTE:
 * This panel renders the real-time stream of tactical logs.
 * 
 * ENDPOINT INTEGRATION:
 * 1. Live Feed: This should be connected to a WebSocket (e.g., /api/intelligence/stream).
 * 2. Log Priority: Differing LogTypes trigger different visual states (glassmorphism/pulse).
 * 3. History: Consider implementing a local search or filtering mechanism for archived logs.
 */
export default function IntelligenceLogPanel({ logs }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);
  const completeTask = useTaskStore((s) => s.completeTask);
  const autoApprovedRef = useRef<Set<number>>(new Set());

  // Auto-approve non-DÜŞÜK tasks
  const allPendingApproval = tasks.filter((t) => t.status === "pending_approval");
  useEffect(() => {
    for (const task of allPendingApproval) {
      if (!isLowPriority(task.priority) && !autoApprovedRef.current.has(task.id)) {
        autoApprovedRef.current.add(task.id);
        completeTask(task.id, "pending");
      }
    }
  }, [allPendingApproval, completeTask]);

  // Only DÜŞÜK tasks stay for manual approval, sorted by priority
  const pendingAiTasks = allPendingApproval
    .filter(t => isLowPriority(t.priority))
    .sort((a, b) => (PRIORITY_WEIGHT[a.priority.toUpperCase()] ?? 5) - (PRIORITY_WEIGHT[b.priority.toUpperCase()] ?? 5));

  const handleApprove = async (taskId: number) => {
    await completeTask(taskId, "pending");
  };

  return (
    <>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-[1002] bg-zinc-950 border-y border-l border-white/10 p-2 rounded-l-lg hover:bg-zinc-900 transition-colors"
      >
        {isCollapsed ? <ChevronLeft className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.aside 
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute right-6 top-16 bottom-6 w-96 glass-panel flex flex-col overflow-hidden z-[1001] border-zinc-800"
          >
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-black/20">
        <h3 className="text-gray-400 text-[11px] font-bold tracking-tighter uppercase">
          SON DURUM BİLDİRİMLERİ
        </h3>
        <span className="text-[9px] font-mono text-emerald-500 animate-pulse">● LIVE</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-4 h-full scrollbar-none">
        {/* LOGS (reverse order) */}
        <ul className="flex flex-col-reverse gap-3 mt-4">
          <AnimatePresence initial={false}>
          {logs.map((log) => {
            let textColor = "text-gray-50";
            let borderColor = "border-white/5";
            let bgColor = "bg-white/5";

            if (log.type === LogType.CRITICAL) {
              textColor = "text-red-400 font-bold";
              borderColor = "border-red-500/50";
              bgColor = "bg-red-500/10";
            } else if (log.type === LogType.AI) {
              textColor = "text-blue-400";
              borderColor = "border-blue-500/30";
              bgColor = "bg-blue-500/5";
            } else if (log.type === LogType.SYSTEM) {
              textColor = "text-amber-400";
              borderColor = "border-amber-500/30";
              bgColor = "bg-amber-500/5";
            }

            return (
              <motion.li
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={`p-3 rounded-lg text-[13px] border transition-all ${bgColor} ${borderColor} ${
                  log.type === LogType.CRITICAL ? "animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]" : ""
                }`}
              >
                <div className="flex gap-2 font-mono">
                  <span className="text-gray-500 text-[10px] shrink-0 mt-0.5">[{log.time}]</span>
                  <p className={textColor}>
                    {log.type === LogType.AI && <span className="opacity-60 mr-1">[AI_ENGINE]</span>}
                    {log.type === LogType.SYSTEM && <span className="opacity-60 mr-1">[WARN]</span>}
                    {log.entity} {log.action}
                  </p>
                </div>
              </motion.li>
            );
          })}
          </AnimatePresence>
        </ul>
        
        {/* AI APPROVAL QUEUE (top) */}
        {pendingAiTasks.length > 0 && (
          <ul className="mb-4 space-y-2">
            <div className="text-[11px] font-bold text-blue-400 uppercase tracking-tighter border-b border-zinc-800 pb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" />
                AI Görev Onayı Bekliyor ({pendingAiTasks.length})
              </span>
              <button
                onClick={async () => {
                  try {
                    await api.post("/api/v1/tasks/approve-all");
                  } catch (e) {
                    console.error("Bulk approve failed", e);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-widest shadow-[0_0_10px_rgba(37,99,235,0.4)] transition-all"
                title="Tüm görevleri onayla ve sahaya aktar"
              >
                TÜMÜNÜ ONAYLA
              </button>
            </div>
            <AnimatePresence>
              {pendingAiTasks.map((task) => {
                const priorityTr = task.priority === "RED" || task.priority === "CRITICAL" || task.priority === "KRİTİK" ? "KRİTİK"
                  : task.priority === "HIGH" || task.priority === "YÜKSEK" ? "YÜKSEK"
                  : task.priority === "YELLOW" || task.priority === "MEDIUM" || task.priority === "ORTA" ? "ORTA"
                  : "DÜŞÜK";

                const isKritik = priorityTr === "KRİTİK";
                const isYuksek = priorityTr === "YÜKSEK";
                const isOrta = priorityTr === "ORTA";
                
                const borderColor = isKritik ? "border-red-500/50" : isYuksek ? "border-orange-500/50" : isOrta ? "border-amber-500/50" : "border-emerald-500/50";
                const bgColor = isKritik ? "bg-red-950/20" : isYuksek ? "bg-orange-950/20" : isOrta ? "bg-amber-950/20" : "bg-emerald-950/20";
                const glowColor = isKritik ? "shadow-[inset_0_0_15px_rgba(239,68,68,0.15)]" : isYuksek ? "shadow-[inset_0_0_15px_rgba(249,115,22,0.15)]" : isOrta ? "shadow-[inset_0_0_15px_rgba(245,158,11,0.15)]" : "shadow-[inset_0_0_15px_rgba(16,185,129,0.15)]";
                const accentColor = isKritik ? "bg-red-500" : isYuksek ? "bg-orange-500" : isOrta ? "bg-amber-500" : "bg-emerald-500";
                const textPriority = isKritik ? "text-red-400" : isYuksek ? "text-orange-400" : isOrta ? "text-amber-400" : "text-emerald-400";
                
                return (
                <motion.li
                  key={`ai-task-${task.id}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className={`${bgColor} border ${borderColor} ${glowColor} rounded-md p-3 relative overflow-hidden`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />
                  <div className="flex justify-between items-start pl-2">
                    <div>
                      <p className="text-white text-[13px] font-semibold">{task.address}</p>
                      <p className={`${textPriority} text-[10px] font-bold mt-1 uppercase tracking-wider`}>ÖNCELİK: {priorityTr}</p>
                      <p className="text-gray-400 text-[10px] mt-1.5 italic leading-tight">{task.notes}</p>
                    </div>
                    <button
                      onClick={() => handleApprove(task.id)}
                      className="bg-blue-600/20 hover:bg-blue-500 border border-blue-500/50 text-blue-400 hover:text-white rounded p-1.5 transition-all ml-3 shrink-0"
                      title="Görevi Onayla ve Sahaya Aktar"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        
        {logs.length === 0 && pendingAiTasks.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-600 font-mono text-xs animate-pulse tracking-tighter">BAĞLANTI_KURULUYOR... VERİ_BEKLENİYOR</p>
          </div>
        )}
      </div>
    </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
