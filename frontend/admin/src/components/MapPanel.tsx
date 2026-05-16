/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { MapContainer, Tooltip, Polygon, Polyline, CircleMarker, useMapEvents, GeoJSON, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FieldUnit, RiskZone, ZoneType, UnitStatus, ToolMode, LogType } from "../types";
import type { Task } from "../services/localDb";
import { db } from "../services/localDb";
import { useZoneStore } from "../stores/zoneStore";
import { api } from "../services/api";
import CommandSidePanel from "./CommandSidePanel";

const translatePriority = (p: string) => {
  if (p === "RED" || p === "CRITICAL" || p === "KRİTİK") return "KRİTİK";
  if (p === "HIGH" || p === "YÜKSEK") return "YÜKSEK";
  if (p === "YELLOW" || p === "MEDIUM" || p === "ORTA") return "ORTA";
  return "DÜŞÜK";
};

function MouseTracker() {
  useMapEvents({
    mousemove(e) {
      const el = document.getElementById('live-coord');
      if (el) el.innerText = `LAT:${e.latlng.lat.toFixed(5)} LON:${e.latlng.lng.toFixed(5)}`;
    }
  });
  return null;
}

// --- Custom Glowing CSS DivIcon Markers (NO external images) ---

const createGlowingIcon = (color: string, size: number = 16) => new L.DivIcon({
  className: '',
  html: `<div class="triage-marker-dot" style="
    width: ${size}px;
    height: ${size}px;
    background: ${color};
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.9);
    box-shadow: 0 0 10px ${color}, 0 0 20px ${color}80;
  "></div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});

const PRIORITY_ICON_MAP: Record<string, L.DivIcon> = {
  'KRİTİK': createGlowingIcon('#ef4444', 16),
  'YÜKSEK': createGlowingIcon('#f97316', 14),
  'ORTA': createGlowingIcon('#f59e0b', 12),
  'DÜŞÜK': createGlowingIcon('#10b981', 10),
};

const createUnitIcon = (status: UnitStatus) => {
  const color = status === UnitStatus.BUSY ? '#ef4444' : status === UnitStatus.OFFLINE ? '#6b7280' : '#3b82f6';
  return createGlowingIcon(color, 14);
};

const STATUS_LABELS: Record<string, string> = {
  pending: "BEKLİYOR",
  pending_approval: "ONAY BEKLİYOR",
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
  const [kandilliEq, setKandilliEq] = useState<any>(null);
  const [faultLines, setFaultLines] = useState<any>(null);

  useEffect(() => {
    const controller = new AbortController();
    
    fetch("https://api.orhanaydogdu.com.tr/deprem/kandilli/live", { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.result && data.result.length > 0) {
          const eq = data.result[0];
          const mag = parseFloat(eq.mag);
          eq.rupture_length_km = Math.pow(10, 0.69 * mag - 3.22).toFixed(2);
          const K = 15 * (mag / 5.0);
          eq.estimated_aftershocks = Math.max(1, Math.floor(K / Math.pow(6.1, 1.1)));
          eq.source = "AFAD/Kandilli/EMSC";
          setKandilliEq(eq);
        }
      })
      .catch(() => {});

    fetch("/data/fay_hatlari.json", { signal: controller.signal })
      .then(res => res.json())
      .then(data => setFaultLines(data))
      .catch(() => {});

    return () => controller.abort();
  }, []);

  // Priority Toggle
  const handleZoneClick = async (zone: RiskZone) => {
    if (toolMode === "OVERRIDE") {
      let nextPriorityScore = 4.5;
      let nextType = ZoneType.MEDIUM;
      let nextScore = 90;
      if (zone.type === ZoneType.URGENT) { nextPriorityScore = 3.0; nextType = ZoneType.MEDIUM; nextScore = 60; }
      else if (zone.type === ZoneType.MEDIUM) { nextPriorityScore = 1.5; nextType = ZoneType.SAFE; nextScore = 30; }
      else { nextPriorityScore = 4.5; nextType = ZoneType.URGENT; nextScore = 90; }

      // Optimistic update
      useZoneStore.getState().updateZone({ ...zone, type: nextType, score: nextScore });

      try {
        await api.patch(`/api/v1/zones/${zone.id}`, { priority_score: nextPriorityScore });
      } catch (e) {
        console.error("Zone priority override failed", e);
        // Rollback
        useZoneStore.getState().updateZone(zone);
      }
    } else if (toolMode === "ERASER") {
      // 1. Instant optimistic UI update
      useZoneStore.getState().deleteZone(zone.id);
      try {
        // 2. Network & Local persistence
        await api.delete(`/api/v1/zones/${zone.id}`);
        await db.zones.delete(zone.id);
      } catch (e) {
        console.error("Zone deletion failed", e);
      }
    }
  };

  return (
    <div className="absolute inset-0 z-0 bg-black">
      <MapContainer
        center={position}
        zoom={13}
        minZoom={2}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
        dragging={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        preferCanvas={true}
        ref={setMap}
      >
        <MouseTracker />
        
        {/* CartoDB Dark Matter tiles with CORS bypass */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; CARTO'
          subdomains="abcd"
          crossOrigin="anonymous"
          maxZoom={19}
        />

        {faultLines && (
          <GeoJSON 
            data={faultLines} 
            style={{ color: '#ef4444', weight: 1, opacity: 0.5, dashArray: '4 4' }} 
          />
        )}

        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <pattern id="no-go-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: "#F59E0B", strokeWidth: 4, opacity: 0.4 }} />
            </pattern>
          </defs>
        </svg>

        {/* Risk Zones — No clusters, no heatmap, clean polygons */}
        {riskZones.filter(z => z && z.points && z.points.length > 0 && z.points.every(p => p && p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]))).map((zone) => {
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
            className: zone.type === ZoneType.URGENT ? "zone-critical" : 
                       zone.type === ZoneType.MEDIUM ? "zone-high" : undefined,
          };

          return (
            <Polygon 
              key={zone.id} 
              positions={zone.points} 
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => handleZoneClick(zone)
              }}
            >
              <Tooltip sticky>
                <div className="bg-zinc-950 border border-white/[0.06] text-gray-100 p-1.5 text-[10px] rounded font-mono shadow-2xl backdrop-blur-md">
                  <span className="opacity-60 text-blue-400">ZONE_CORE:</span> {zone.id}<br/>
                  <span className="opacity-60 text-red-400">THREAT_LVL:</span> {zone.score}%
                  {zone.isHumanOverride && <div className="mt-1 text-amber-400 border-t border-white/10 pt-1">⭐ MANUAL_OVERRIDE_ENABLED</div>}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Scientific Epicenter CircleMarkers (outer rings) */}
        {tasks.filter(t => t && t.status !== "resolved" && !isNaN(t.lat) && !isNaN(t.lng)).map((task) => {
          const prio = translatePriority(task.priority);
          const isKritik = prio === "KRİTİK";
          const isYuksek = prio === "YÜKSEK";
          const radius = isKritik ? 18 : isYuksek ? 14 : 10;
          const color = isKritik ? "#ef4444" : isYuksek ? "#f97316" : "#f59e0b";
          return (
            <CircleMarker
              key={`epicenter-${task.id}`}
              center={[task.lat, task.lng]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: 1,
                dashArray: "4, 4",
              }}
            />
          );
        })}

        {/* Task Markers — Glowing CSS DivIcons, NO external images */}
        {tasks.filter(t => t && t.status !== "resolved" && t.status !== "false_alarm" && !isNaN(t.lat) && !isNaN(t.lng)).map((task, idx) => {
          const prio = translatePriority(task.priority);
          return (
            <Marker
              key={`task-${task.id}-${idx}`}
              position={[task.lat, task.lng]}
              icon={PRIORITY_ICON_MAP[prio] || PRIORITY_ICON_MAP['DÜŞÜK']}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="bg-zinc-950/95 text-gray-100 border border-white/[0.06] p-2 rounded-lg shadow-2xl font-mono text-[10px] backdrop-blur-md min-w-[140px]">
                  <p className="text-blue-400 border-b border-white/10 pb-1 mb-1">TASK://{task.id}</p>
                  <div className="space-y-0.5">
                    <p>ÖNCELİK: <span className={
                      prio === "KRİTİK" ? "text-red-500 font-bold" :
                      prio === "YÜKSEK" ? "text-orange-400 font-bold" :
                      prio === "ORTA" ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"
                    }>{prio}</span></p>
                    <p>DURUM: <span className="text-gray-300">{STATUS_LABELS[task.status] ?? task.status}</span></p>
                    <div className="mt-1 border-t border-white/5 pt-1">
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">BÖLGE:</span> {kandilliEq?.location_properties?.closestCity?.name || kandilliEq?.title?.split(" ")[0] || "Bilinmeyen Koordinat"}</p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">ŞİDDET:</span> <span className="text-amber-400">{kandilliEq?.mag || "?"} M</span></p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">DERİNLİK:</span> <span className="text-blue-400">{kandilliEq?.depth || "?"} km</span></p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">KIRIK UZUNLUĞU:</span> <span className="text-red-400">{kandilliEq?.rupture_length_km || "?"} km</span></p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">ARTÇI TAHMİNİ:</span> <span className="text-orange-400">{kandilliEq?.estimated_aftershocks || "?"} adet / 6 saat</span></p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">KAYNAK:</span> <span className="text-blue-400">[{kandilliEq?.source || "AFAD/Kandilli"}]</span></p>
                    </div>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* Unit Markers + destination lines */}
        {units.filter(u => u && u.coords && u.coords.length === 2 && !isNaN(u.coords[0]) && !isNaN(u.coords[1])).map((unit) => (
          <div key={unit.id}>
            {unit.destination && unit.statusType === UnitStatus.BUSY && (
              <Polyline 
                positions={[unit.coords, unit.destination]} 
                pathOptions={{ color: "#3B82F6", weight: 1, dashArray: "10, 15", opacity: 0.4 }} 
              />
            )}
            <Marker position={unit.coords} icon={createUnitIcon(unit.statusType)}>
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="bg-zinc-950/95 text-gray-100 border border-white/[0.06] p-2 rounded-lg shadow-2xl font-mono text-[10px] backdrop-blur-md">
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
        <div className="pointer-events-none h-full w-full">
          <CommandSidePanel units={units} tasks={tasks} map={map} mode={toolMode} setMode={setToolMode} isOnline={isOnline} />
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel p-2.5 px-6 flex items-center gap-6 pointer-events-none border-white/[0.04]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-gray-500 font-bold tracking-tighter">COORDINATE_GRID</span>
              <span id="live-coord" className="text-[11px] font-mono text-blue-400/80">LAT:{position[0].toFixed(5)} LON:{position[1].toFixed(5)}</span>
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
