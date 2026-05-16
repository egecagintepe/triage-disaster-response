/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { IntelligenceLog, LogType } from "../types";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface Props {
  logs: IntelligenceLog[];
}

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
            className="absolute right-6 top-6 bottom-6 w-96 glass-panel flex flex-col overflow-hidden z-[1001] border-white/[0.04]"
          >
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
        <h3 className="text-gray-400 text-[10px] font-bold tracking-[0.2em] uppercase">
          SON DURUM BİLDİRİMLERİ
        </h3>
        <span className="text-[9px] font-mono text-emerald-500 animate-pulse">● LIVE</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col-reverse justify-end h-full scrollbar-none">
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
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
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
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {logs.length === 0 && (
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
