/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Battery, Signal, Zap, MousePointer2, PenTool, Star } from "lucide-react";
import { FieldUnit, UnitStatus, ToolMode } from "../types";
import L from "leaflet";

interface Props {
  units: FieldUnit[];
  map: L.Map | null;
  mode: ToolMode;
  setMode: (mode: ToolMode) => void;
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
export default function CommandSidePanel({ units, map, mode, setMode }: Props) {
  const tools = [
    { id: "CURSOR" as ToolMode, icon: MousePointer2, label: "Manuel Atama" },
    { id: "PEN" as ToolMode, icon: PenTool, label: "Bölge Çiz" },
    { id: "OVERRIDE" as ToolMode, icon: Star, label: "Öncelik Ezme" },
  ];

  const handleUnitClick = (unit: FieldUnit) => {
    if (map) {
      map.flyTo(unit.coords, 16, { animate: true, duration: 1.5 });
    }
  };

  return (
    <div className="absolute left-6 top-6 bottom-6 w-80 glass-panel flex flex-col pointer-events-auto border-white/5 z-[1005]">
      {/* SECTION: INTEGRATED TOOLBAR */}
      <div className="p-3 border-b border-white/10 bg-white/[0.02] flex justify-between items-center gap-2">
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
        <div className="h-4 w-px bg-white/10" />
        <div className="flex flex-col items-end">
           <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">MODE</span>
           <span className="text-[10px] font-mono text-blue-400 font-bold">{mode}</span>
        </div>
      </div>

      {/* SECTION: FLEET INTELLIGENCE */}
      <div className="p-4 flex-1 flex flex-col overflow-hidden">
        <header className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-blue-400 fill-blue-400/20" />
            <h3 className="text-white text-[10px] font-bold tracking-[0.2em] uppercase">
              FLEET_INTELLIGENCE
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-mono text-gray-400">SYNC_OK</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 scrollbar-none">
          {units.map((unit) => (
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
                  <span className="text-[9px] font-mono text-gray-500 tracking-tighter">NODE_ADDR: {unit.ip}</span>
                  <h4 className="text-[13px] font-bold text-gray-100 group-hover:text-blue-400 transition-colors tracking-tight">
                    Unit_{unit.id === "1" ? "ALFA" : unit.id === "2" ? "BRAVO" : unit.id === "3" ? "CHARLIE" : "DELTA"}
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
                <div className="flex items-center gap-1.5 bg-black/30 p-1.5 rounded-md border border-white/5">
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
          ))}
        </div>
      </div>

      {/* FOOTER: SYSTEM INFRA */}
      <footer className="p-4 pt-4 border-t border-white/10 flex items-center justify-between bg-black/20 rounded-b-xl">
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-bold text-gray-600 tracking-[0.1em]">ENCRYPTION_LAYER</span>
          <span className="text-[9px] font-mono text-gray-400 italic">AES_256_GCM_READY</span>
        </div>
        <div className="flex gap-1">
           {[1,2,3,4,5].map(i => <div key={i} className={`w-0.5 h-3 ${i < 4 ? "bg-blue-500" : "bg-white/10"} rounded-full`} />)}
        </div>
      </footer>
    </div>
  );
}
