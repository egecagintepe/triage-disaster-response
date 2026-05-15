/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "motion/react";
import { IntelligenceLog, LogType } from "../types";

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
  return (
    <aside className="absolute right-8 top-8 bottom-8 w-96 glass-panel flex flex-col overflow-hidden z-[1001] border-white/10">
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-[1px] bg-accent/60" />
          <h3 className="text-gray-100 text-xs font-serif tracking-[0.3em]">
            OLAY_KAYITLARI
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-serif text-accent/80 italic tracking-widest">CANLI_VERİ</span>
          <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(197,160,89,0.5)]" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col-reverse justify-end h-full scrollbar-none">
        <AnimatePresence initial={false}>
          {logs.map((log) => {
            let textColor = "text-gray-300";
            let accentColor = "bg-white/[0.02]";
            let borderStyle = "border-white/10";

            if (log.type === LogType.CRITICAL) {
              textColor = "text-red-100";
              accentColor = "bg-red-950/30";
              borderStyle = "border-red-900/40";
            } else if (log.type === LogType.AI) {
              textColor = "text-accent";
              accentColor = "bg-accent/10";
              borderStyle = "border-accent/20";
            }

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className={`p-4 border-l-2 transition-all duration-700 ${accentColor} ${borderStyle} ${
                  log.type === LogType.CRITICAL ? "animate-pulse shadow-[0_0_20px_rgba(139,0,0,0.15)]" : ""
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-[9px] font-sans tracking-widest uppercase font-medium">[{log.time}]</span>
                    {log.type === LogType.AI && <span className="text-accent/60 text-[8px] font-serif tracking-[0.2em]">YAPAY_ZEKA_KATMANI</span>}
                    {log.type === LogType.CRITICAL && <span className="text-red-500 text-[8px] font-serif tracking-[0.2em] animate-pulse">ACİL_DURUM_BİLDİRİMİ</span>}
                  </div>
                  <p className={`text-[12px] font-sans leading-relaxed tracking-wide ${textColor}`}>
                    <span className="font-serif italic text-gray-400 mr-2">{log.entity}</span>
                    {log.action}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-30">
            <div className="w-12 h-[1px] bg-accent mb-4" />
            <p className="text-accent font-serif text-[10px] tracking-[0.4em] uppercase">Veri Akışı Bekleniyor</p>
          </div>
        )}
      </div>
      
      <div className="p-4 bg-white/[0.02] border-t border-white/10 text-center">
        <span className="text-[8px] font-serif text-gray-400 tracking-[0.5em] uppercase">Egemen Komuta Sistemi v4.0</span>
      </div>
    </aside>
  );
}
