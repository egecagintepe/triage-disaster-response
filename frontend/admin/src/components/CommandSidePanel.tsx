/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Battery, Signal, Zap, MousePointer2, PenTool, Star, AlertTriangle, CheckCircle, Clock, ChevronLeft, ChevronRight, Eraser } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FieldUnit, UnitStatus, ToolMode } from "../types";
import type { Task } from "../services/localDb";
import { useTaskStore } from "../stores/taskStore";
import { useTeamStore } from "../stores/teamStore";
import L from "leaflet";

const PRIORITY_COLORS: Record<string, string> = {
  RED: "text-red-400 bg-red-500/10 border-red-500/20",
  YELLOW: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  GREEN: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const MOCK_KANDILLI = [
  { id: 1, loc: "İzmir - Buca", mag: 6.8, depth: 12.4, time: "11:42", lat: 38.38, lng: 27.16 },
  { id: 2, loc: "Ege Denizi", mag: 4.2, depth: 8.1, time: "11:30", lat: 38.5, lng: 26.8 },
  { id: 3, loc: "Manisa - Akhisar", mag: 3.5, depth: 5.0, time: "10:15", lat: 38.92, lng: 27.84 },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  assigned: "Atandı",
  in_progress: "Devam Ediyor",
  needs_backup: "Destek Gerekli",
  false_alarm: "Yanlış Alarm",
  resolved: "Tamamlandı",
};

interface Props {
  units: FieldUnit[];
  tasks?: Task[];
  map: L.Map | null;
  mode: ToolMode;
  setMode: (mode: ToolMode) => void;
  isOnline?: boolean;
}

/**
 * FUTURE AGENT NOTE: 
 * This is the central command panel for the left side of the dashboard.
 * 
 * ENDPOINT INTEGRATION POINTS:
 * 1. Fleet Data: The 'units' prop should eventually be hooked into a WebSocket 
 *    or long-polling endpoint (e.g., /api/fleet/status).
 * 2. Tool Mode Actions: When ToolMode changes, ensure the map's click handlers 
 *    or draw layers are updated accordingly.
 * 3. Unit Navigation: handleUnitClick uses Leaflet's flyTo. If units move rapidly, 
 *    consider a 'follow mode' toggle.
 */
export default function CommandSidePanel({ units, tasks = [], map, mode, setMode, isOnline = true }: Props) {
  const [activeTab, setActiveTab] = useState<"fleet" | "tasks">("tasks");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const completeTask = useTaskStore((s) => s.completeTask);
  const storeTeams = useTeamStore((s) => s.teams);

  const tools = [
    { id: "CURSOR" as ToolMode, icon: MousePointer2, label: "Manuel Atama" },
    { id: "PEN" as ToolMode, icon: PenTool, label: "Bölge Çiz" },
    { id: "OVERRIDE" as ToolMode, icon: Star, label: "Öncelik Ezme" },
    { id: "ERASER" as ToolMode, icon: Eraser, label: "Bölge Sil" },
  ];

  const handleUnitClick = (unit: FieldUnit) => {
    if (map) {
      map.flyTo(unit.coords, 16, { animate: true, duration: 1.5 });
    }
  };

  const handleTaskClick = (task: Task) => {
    if (map) {
      map.flyTo([task.lat, task.lng], 16, { animate: true, duration: 1.5 });
    }
  };

  const handleDispatch = async (taskId: number, status: Task["status"]) => {
    await completeTask(taskId, status);
  };

  // Task counts
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const activeTasks = tasks.filter((t) => t.status === "in_progress" || t.status === "assigned");
  const backupTasks = tasks.filter((t) => t.status === "needs_backup");

  return (
    <>
      <motion.div 
        initial={false}
        animate={{ x: isCollapsed ? -344 : 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="absolute left-0 top-6 bottom-6 flex items-center z-[1001] pointer-events-none"
      >
        <div className="w-80 h-full ml-6 glass-panel flex flex-col pointer-events-auto border-white/[0.04]">

      {/* SECTION: INTEGRATED TOOLBAR */}
      <div className="p-3 border-b border-white/[0.06] bg-white/[0.01] flex justify-between items-center gap-2">
        <div className="flex gap-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setMode(tool.id)}
              title={tool.label}
              className={`p-2.5 rounded-lg transition-all duration-300 relative group ${
                mode === tool.id
                  ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                  : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
              }`}
            >
              <tool.icon className={`h-4 w-4 ${mode === tool.id ? "scale-110" : "scale-100"} transition-transform`} />
              {mode === tool.id && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-white/[0.06]" />
        <div className="flex flex-col items-end">
           <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">MODE</span>
           <span className="text-[10px] font-mono text-blue-400 font-bold">{mode}</span>
        </div>
      </div>

      {/* CONTEXT SUB-PANEL */}
      {(mode === "PEN" || mode === "OVERRIDE") && (
        <div className="p-3 border-b border-white/[0.06] bg-black/40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">KANDİLLİ_CANLI_VERİ</span>
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="space-y-1 mb-3">
            {MOCK_KANDILLI.map((q) => (
              <button
                key={q.id}
                onClick={() => map?.flyTo([q.lat, q.lng], 12, { animate: true, duration: 1 })}
                className="w-full text-left p-2 rounded bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex justify-between items-center"
              >
                <div>
                  <p className="text-white text-[11px] font-bold">{q.loc}</p>
                  <p className="text-gray-500 text-[9px] font-mono">{q.time} | D:{q.depth}km</p>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${q.mag >= 6 ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"}`}>
                  {q.mag} M
                </div>
              </button>
            ))}
          </div>

          {mode === "PEN" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (map) {
                    // @ts-ignore
                    new L.Draw.Polygon(map).enable();
                  }
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-2 rounded transition-colors"
              >
                BÖLGE ÇİZİMİ BAŞLAT
              </button>
              <button
                onClick={() => setMode("CURSOR")}
                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 text-[10px] font-bold px-3 rounded transition-colors"
              >
                İPTAL
              </button>
            </div>
          )}
          {mode === "OVERRIDE" && (
            <div className="text-[10px] text-amber-400 text-center font-mono opacity-80 mt-1">
              HARİTADAN BÖLGE VEYA GÖREV SEÇİN
            </div>
          )}
        </div>
      )}

      {/* TAB SWITCHER */}
      <div className="flex border-b border-white/[0.06]">
        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex-1 py-2 text-[9px] font-bold tracking-[0.15em] uppercase transition-colors ${
            activeTab === "tasks"
              ? "text-blue-400 border-b-2 border-blue-500 bg-blue-500/5"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          GÖREV KUYRUĞU ({pendingTasks.length + activeTasks.length})
        </button>
        <button
          onClick={() => setActiveTab("fleet")}
          className={`flex-1 py-2 text-[9px] font-bold tracking-[0.15em] uppercase transition-colors ${
            activeTab === "fleet"
              ? "text-blue-400 border-b-2 border-blue-500 bg-blue-500/5"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          FİLO ({units.length})
        </button>
      </div>

      {/* SECTION: CONTENT */}
      <div className="p-4 flex-1 flex flex-col overflow-hidden">
        <header className="mb-3 flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-blue-400 fill-blue-400/20" />
            <h3 className="text-white text-[10px] font-bold tracking-[0.2em] uppercase">
              {activeTab === "tasks" ? "TASK_QUEUE" : "FLEET_INTELLIGENCE"}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-[9px] font-mono text-gray-400">{isOnline ? "SYNC_OK" : "OFFLINE"}</span>
          </div>
        </header>

        {/* TASK QUEUE TAB */}
        {activeTab === "tasks" && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-none">
            {/* Backup requests first (critical) */}
            {backupTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className="cursor-pointer w-full group relative overflow-hidden p-3 bg-red-500/10 hover:bg-red-500/15 border border-red-500/30 rounded-xl transition-all duration-300 text-left animate-pulse"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[11px] font-bold text-red-400">DESTEK TALEBİ</span>
                  </div>
                  <span className="text-[9px] font-mono text-red-300">#{task.id}</span>
                </div>
                {task.address && <p className="text-[10px] text-gray-400 mt-1.5 truncate">{task.address}</p>}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDispatch(task.id, "assigned"); }}
                    className="flex-1 text-[8px] font-bold bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg py-1.5 transition-colors"
                  >
                    EKİP ATA
                  </button>
                </div>
              </div>
            ))}

            {/* Pending tasks */}
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className="cursor-pointer w-full group relative overflow-hidden p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-blue-500/30 rounded-xl transition-all duration-300 text-left"
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-gray-500">TASK #{task.id}</span>
                    <span className="text-[12px] font-bold text-gray-100 group-hover:text-blue-400 transition-colors">
                      {task.address || `Konum: ${task.lat.toFixed(4)}, ${task.lng.toFixed(4)}`}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-tighter border ${PRIORITY_COLORS[task.priority] || ""}`}>
                    {task.priority}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="h-2.5 w-2.5 text-gray-500" />
                  <span className="text-[9px] text-gray-500">{STATUS_LABELS[task.status] ?? task.status}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDispatch(task.id, "assigned"); }}
                    className="flex-1 text-[8px] font-bold bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg py-1.5 transition-colors"
                  >
                    EKİP ATA
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDispatch(task.id, "false_alarm"); }}
                    className="text-[8px] font-bold bg-gray-600/20 hover:bg-gray-600/40 text-gray-400 border border-gray-500/30 rounded-lg py-1.5 px-3 transition-colors"
                  >
                    İPTAL
                  </button>
                </div>
              </div>
            ))}

            {/* Active tasks */}
            {activeTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleTaskClick(task)}
                className="cursor-pointer w-full p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-left"
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-emerald-400/60">AKTİF #{task.id}</span>
                    <span className="text-[11px] font-bold text-gray-200">
                      {task.address || `Konum: ${task.lat.toFixed(4)}, ${task.lng.toFixed(4)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-emerald-400" />
                    <span className="text-[8px] text-emerald-400 font-bold">{STATUS_LABELS[task.status]}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDispatch(task.id, "resolved"); }}
                    className="flex-1 text-[8px] font-bold bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-lg py-1.5 transition-colors"
                  >
                    TAMAMLANDI
                  </button>
                </div>
              </div>
            ))}

            {tasks.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-600 font-mono text-xs animate-pulse tracking-tighter">GÖREV_KUYRUĞU_BOŞ</p>
              </div>
            )}
          </div>
        )}

        {/* FLEET TAB */}
        {activeTab === "fleet" && (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 scrollbar-none">
            {units && units.length > 0 ? units.map((unit) => (
              <button
                key={unit.id}
                onClick={() => handleUnitClick(unit)}
                className="w-full group relative overflow-hidden p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-blue-500/30 rounded-xl transition-all duration-300 text-left flex flex-col gap-2.5"
              >
                <div className={`absolute top-0 right-0 w-16 h-16 blur-2xl opacity-5 transition-opacity group-hover:opacity-15 ${
                  unit.statusType === UnitStatus.IDLE ? "bg-emerald-500" : 
                  unit.statusType === UnitStatus.BUSY ? "bg-red-500" : "bg-gray-500"
                }`} />

                <div className="flex justify-between items-start relative z-10">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-gray-500 tracking-tighter flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${unit.isOnline ? "bg-emerald-500 animate-[pulse_2s_ease-in-out_infinite]" : "bg-red-500"}`} />
                      NODE_ADDR: {unit.ip}
                    </span>
                    <h4 className="text-[13px] font-bold text-gray-100 group-hover:text-blue-400 transition-colors tracking-tight">
                      {unit.name}
                    </h4>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-tighter border ${
                    unit.statusType === UnitStatus.IDLE ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                    unit.statusType === UnitStatus.BUSY ? "bg-red-500/10 text-red-400 border-red-500/20" : 
                    "bg-gray-500/10 text-gray-400 border-gray-500/20"
                  }`}>
                    {unit.statusType}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-400 font-mono relative z-10">
                  <div className="flex items-center gap-1.5 bg-black/50 p-1.5 rounded-md border border-white/[0.04]">
                    <Battery className={`h-2.5 w-2.5 ${unit.battery < 20 ? "text-red-500 animate-pulse" : "text-emerald-500"}`} />
                    <span>%{unit.battery}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/30 p-1.5 rounded-md border border-white/5">
                    <Signal className="h-2.5 w-2.5 text-blue-500" />
                    <span>{unit.ping}ms</span>
                  </div>
                  <div className="flex items-center justify-center bg-black/30 p-1.5 rounded-md border border-white/5 text-[8px] text-gray-300">
                    {unit.status}
                  </div>
                </div>
              </button>
            )) : (
              <p className="text-gray-500 text-xs p-4 border border-white/10 rounded bg-white/5 font-mono text-center">Veritabanında ekip bulunamadı veya yükleniyor...</p>
            )}
          </div>
        )}
      </div>

      {/* FOOTER: SYSTEM INFRA */}
      <footer className="p-4 pt-4 border-t border-white/[0.06] flex items-center justify-between bg-black/40 rounded-b-xl">
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-bold text-gray-600 tracking-[0.1em]">ENCRYPTION_LAYER</span>
          <span className="text-[9px] font-mono text-gray-400 italic">AES_256_GCM_READY</span>
        </div>
        <div className="flex gap-1">
           {[1,2,3,4,5].map(i => <div key={i} className={`w-0.5 h-3 ${i < 4 ? "bg-blue-500" : "bg-white/10"} rounded-full`} />)}
        </div>
      </footer>
        </div>
        
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="pointer-events-auto bg-zinc-950 border-y border-r border-white/10 p-2 rounded-r-lg hover:bg-zinc-900 transition-colors shadow-lg"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronLeft className="h-4 w-4 text-gray-400" />}
        </button>
      </motion.div>
    </>
  );
}
