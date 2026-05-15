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
    { id: "CURSOR" as ToolMode, icon: MousePointer2, label: "MANUEL" },
    { id: "PEN" as ToolMode, icon: PenTool, label: "STRATEJİ" },
    { id: "OVERRIDE" as ToolMode, icon: Star, label: "KONTROL" },
  ];

  const handleUnitClick = (unit: FieldUnit) => {
    if (map) {
      map.flyTo(unit.coords, 16, { animate: true, duration: 1.5 });
    }
  };

  return (
    <div className="absolute left-8 top-8 bottom-8 w-80 glass-panel flex flex-col pointer-events-auto z-[1005] border-white/10 overflow-hidden">
      {/* SECTION: COMMAND INTERFACE */}
      <div className="p-5 border-b border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent flex justify-between items-center">
        <div className="flex gap-4">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setMode(tool.id)}
              title={tool.label}
              className={`flex flex-col items-center gap-1 transition-all duration-500 group ${
                mode === tool.id ? "text-accent" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <div className={`p-2 rounded-full transition-all duration-500 ${
                mode === tool.id ? "bg-accent/10 shadow-[0_0_20px_rgba(197,160,89,0.3)]" : "bg-transparent"
              }`}>
                <tool.icon className={`h-4 w-4 ${mode === tool.id ? "scale-110" : "scale-100"}`} />
              </div>
              <span className="text-[8px] font-serif tracking-[0.2em]">{tool.label}</span>
            </button>
          ))}
        </div>
        <div className="text-right">
           <div className="text-[10px] font-serif text-accent/80 tracking-widest leading-none">DURUM</div>
           <div className="text-[12px] font-serif text-accent font-bold tracking-tighter">SİSTEM AKTİF</div>
        </div>
      </div>

      {/* SECTION: UNIT DEPLOYMENT */}
      <div className="p-6 flex-1 flex flex-col overflow-hidden">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-4 w-[1px] bg-accent/60" />
            <h3 className="text-white text-xs font-serif tracking-[0.3em]">
              BİRİM_MERKEZİ
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-sans text-accent/60 tracking-widest uppercase">GÜVENLİ</span>
            <div className="h-1 w-1 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(197,160,89,1)]" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none">
          {units.map((unit) => (
            <button
              key={unit.id}
              onClick={() => handleUnitClick(unit)}
              className="w-full group relative p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-accent/40 transition-all duration-700 text-left"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-sans text-gray-400 tracking-[0.2em] mb-1 italic uppercase font-medium">TANIMLAMA: {unit.ip.split('.').pop()}</span>
                  <h4 className="text-sm font-serif text-gray-100 group-hover:text-accent transition-colors duration-500 tracking-wider">
                    {unit.id === "1" ? "ALFA" : unit.id === "2" ? "BRAVO" : unit.id === "3" ? "CHARLIE" : "DELTA"} KOMUTA
                  </h4>
                </div>
                <div className={`text-[9px] font-serif tracking-widest px-2 py-0.5 border-l ${
                  unit.statusType === UnitStatus.IDLE ? "text-emerald-400 border-emerald-400/30" : 
                  unit.statusType === UnitStatus.BUSY ? "text-red-400 border-red-400/30" : 
                  "text-gray-300 border-gray-300/30"
                }`}>
                  {unit.statusType === UnitStatus.IDLE ? "BEKLEMEDE" : 
                   unit.statusType === UnitStatus.BUSY ? "MEŞGUL" : "ÇEVRİMDIŞI"}
                </div>
              </div>

              <div className="flex gap-4 items-center opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                <div className="flex items-center gap-2">
                  <Battery className={`h-3 w-3 ${unit.battery < 20 ? "text-red-500" : "text-accent"}`} />
                  <span className="text-[10px] font-sans text-gray-200">%{unit.battery}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Signal className="h-3 w-3 text-accent" />
                  <span className="text-[10px] font-sans text-gray-200">{unit.ping}ms</span>
                </div>
                <div className="flex-1 text-right text-[9px] font-serif italic text-gray-300">
                  {unit.status}
                </div>
              </div>
              
              {/* Baroque detail: subtle gold line on hover */}
              <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-accent/60 group-hover:w-full transition-all duration-700" />
            </button>
          ))}
        </div>
      </div>

      {/* FOOTER: SYSTEM ARCHITECTURE */}
      <footer className="p-6 border-t border-white/10 bg-black/50 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-serif text-accent/60 tracking-[0.2em]">ŞİFRELEME_EVRESİ</span>
          <span className="text-[10px] font-sans text-gray-300 tracking-tight">KORUMA_AKTİF</span>
        </div>
        <div className="flex gap-1.5">
           {[1,2,3].map(i => <div key={i} className={`w-1 h-1 rounded-full ${i < 3 ? "bg-accent shadow-[0_0_8px_rgba(197,160,89,0.7)]" : "bg-white/10"}`} />)}
        </div>
      </footer>
    </div>
  );
}
