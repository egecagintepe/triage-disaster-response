/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polygon, Polyline, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FieldUnit, RiskZone, ZoneType, UnitStatus, ToolMode } from "../types";
import type { Task } from "../services/localDb";
import CommandSidePanel from "./CommandSidePanel";

const createUnitIcon = (status: UnitStatus) => {
  let color = "#10B981"; // success
  if (status === UnitStatus.BUSY) color = "#EF4444";
  if (status === UnitStatus.OFFLINE) color = "#9CA3AF";

  return L.divIcon({
    className: "custom-div-icon",
    html: `
      <div class="relative flex items-center justify-center">
        ${status !== UnitStatus.OFFLINE ? `<div class="absolute w-8 h-8 rounded-full bg-[${color}] opacity-30" style="background-color: ${color}; animation: radar-ping 2s infinite;"></div>` : ""}
        <div class="relative w-3.5 h-3.5 rounded-full border border-white/40 shadow-lg" style="background-color: ${color}; ${status === UnitStatus.OFFLINE ? "border: 2px solid #F59E0B; box-shadow: 0 0 10px #F59E0B;" : ""}"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const createTaskIcon = (priority: string, status: string) => {
  const color = priority === "RED" ? "#EF4444"
              : priority === "YELLOW" ? "#F59E0B"
              : "#10B981";

  const pulse = status === "pending" || status === "needs_backup";

  return L.divIcon({
    className: "custom-div-icon",
    html: `
      <div class="relative flex items-center justify-center">
        ${pulse ? `<div class="absolute w-6 h-6 rounded-sm opacity-40" style="background-color: ${color}; animation: radar-ping 1.5s infinite; transform: rotate(45deg);"></div>` : ""}
        <div class="relative w-3 h-3 rounded-sm border border-white/50 shadow-lg" style="background-color: ${color}; transform: rotate(45deg);"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const STATUS_LABELS: Record<string, string> = {
  pending: "BEKLİYOR",
  assigned: "ATANDI",
  in_progress: "DEVAM EDİYOR",
  needs_backup: "DESTEK GEREKLİ",
  false_alarm: "YANLIŞ ALARM",
  resolved: "TAMAMLANDI",
};

interface Props {
  units: FieldUnit[];
  riskZones: RiskZone[];
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  tasks?: Task[];
  isOnline?: boolean;
}

/**
 * FUTURE AGENT NOTE:
 * This is the primary spatial view. It handles rendering of units and risk zones.
 * 
 * ENDPOINT INTEGRATION:
 * 1. Units: Real-time unit locations should update via state/context from a WebSocket.
 * 2. Risk Zones: Polygons can be fetched from /api/geofence or /api/intelligence/zones.
 * 3. Interactions: Click events on map coordinates can trigger 'Move To' commands to units.
 */
export default function MapPanel({ units, riskZones, toolMode, setToolMode, tasks = [], isOnline = true }: Props) {
  const [map, setMap] = useState<L.Map | null>(null);
  const position: [number, number] = [41.0082, 28.9784];

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0f1a]">
      <MapContainer
        center={position}
        zoom={13}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
        ref={setMap}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <pattern id="no-go-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: "#F59E0B", strokeWidth: 4, opacity: 0.4 }} />
            </pattern>
          </defs>
        </svg>
        
        {/* Risk Zones */}
        {riskZones.map((zone) => {
          let pathOptions: L.PathOptions = {
            color: zone.type === ZoneType.URGENT ? "#EF4444" : 
                   zone.type === ZoneType.MEDIUM ? "#F59E0B" : 
                   zone.type === ZoneType.SAFE ? "#10B981" : "#F59E0B",
            fillColor: zone.type === ZoneType.NO_GO ? "url(#no-go-hatch)" : 
                       zone.type === ZoneType.URGENT ? "#EF4444" : 
                       zone.type === ZoneType.MEDIUM ? "#F59E0B" : "#10B981",
            fillOpacity: zone.type === ZoneType.NO_GO ? 1 : 
                         zone.type === ZoneType.URGENT ? 0.4 : 
                         zone.type === ZoneType.MEDIUM ? 0.25 : 0.1,
            weight: zone.type === ZoneType.URGENT ? 3 : 1.5,
            dashArray: zone.type === ZoneType.NO_GO ? "5, 10" : undefined,
          };

          return (
            <Polygon key={zone.id} positions={zone.points} pathOptions={pathOptions}>
              <Tooltip sticky>
                <div className="bg-gray-950 border border-white/10 text-white p-1.5 text-[10px] rounded font-mono shadow-2xl backdrop-blur-md">
                  <span className="opacity-60 text-blue-400">ZONE_CORE:</span> {zone.id}<br/>
                  <span className="opacity-60 text-red-400">THREAT_LVL:</span> {zone.score}%
                  {zone.isHumanOverride && <div className="mt-1 text-amber-400 border-t border-white/10 pt-1">⭐ MANUAL_OVERRIDE_ENABLED</div>}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Task Markers — diamond-shaped, color = priority */}
        {tasks.map((task) => (
          <Marker
            key={`task-${task.id}`}
            position={[task.lat, task.lng]}
            icon={createTaskIcon(task.priority, task.status)}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div className="bg-gray-950/90 text-gray-50 border border-white/10 p-2 rounded-lg shadow-2xl font-mono text-[10px] backdrop-blur-md min-w-[140px]">
                <p className="text-blue-400 border-b border-white/10 pb-1 mb-1">TASK://{task.id}</p>
                <div className="space-y-0.5">
                  <p>ÖNCELİK: <span className={
                    task.priority === "RED" ? "text-red-400 font-bold" :
                    task.priority === "YELLOW" ? "text-amber-400" : "text-emerald-400"
                  }>{task.priority}</span></p>
                  <p>DURUM: <span className="text-gray-300">{STATUS_LABELS[task.status] ?? task.status}</span></p>
                  {task.address && <p className="text-gray-400 text-[9px] mt-1 border-t border-white/5 pt-1">{task.address}</p>}
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {/* Unit Markers + destination lines */}
        {units.map((unit) => (
          <div key={unit.id}>
            {unit.destination && unit.statusType === UnitStatus.BUSY && (
              <Polyline 
                positions={[unit.coords, unit.destination]} 
                pathOptions={{ color: "#3B82F6", weight: 1, dashArray: "10, 15", opacity: 0.4 }} 
              />
            )}
            <Marker position={unit.coords} icon={createUnitIcon(unit.statusType)}>
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="bg-gray-950/90 text-gray-50 border border-white/10 p-2 rounded-lg shadow-2xl font-mono text-[10px] backdrop-blur-md">
                  <p className="text-blue-400 border-b border-white/10 pb-1 mb-1">UNIT://{unit.ip}</p>
                  <div className="space-y-0.5">
                    <p>STATUS: <span className="text-gray-300">{unit.status}</span></p>
                    <p>BATTERY: <span className={unit.battery < 20 ? "text-red-500 animate-pulse" : ""}>%{unit.battery}</span></p>
                    <p>P_LATENCY: {unit.ping}ms</p>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          </div>
        ))}
      </MapContainer>
      
      {/* HUD & Panels - Siblings of MapContainer to ensure top-layer render */}
      <div className="absolute inset-0 pointer-events-none z-[1000]">
        <div className="pointer-events-auto h-full w-full">
          <CommandSidePanel units={units} tasks={tasks} map={map} mode={toolMode} setMode={setToolMode} isOnline={isOnline} />
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel p-2.5 px-6 flex items-center gap-6 pointer-events-none border-blue-500/20">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-gray-500 font-bold tracking-tighter">COORDINATE_GRID</span>
              <span className="text-[11px] font-mono text-blue-400/80">LAT:{position[0].toFixed(5)} LON:{position[1].toFixed(5)}</span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-gray-500 font-bold tracking-tighter">OPERATIONAL_MODE</span>
              <span className="text-[11px] font-mono text-emerald-400">{toolMode}</span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-gray-500 font-bold tracking-tighter">NETWORK</span>
              <span className={`text-[11px] font-mono ${isOnline ? "text-emerald-400" : "text-red-400 animate-pulse"}`}>
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
