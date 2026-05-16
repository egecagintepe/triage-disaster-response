/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { MapContainer, Marker, Tooltip, Polygon, Polyline, FeatureGroup, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { FieldUnit, RiskZone, ZoneType, UnitStatus, ToolMode, LogType } from "../types";
import type { Task } from "../services/localDb";
import { db } from "../services/localDb";
import { useZoneStore } from "../stores/zoneStore";
import { api } from "../services/api";
import CommandSidePanel from "./CommandSidePanel";
import OfflineTileLayer from "./OfflineTileLayer";
import HeatmapLayer from "./HeatmapLayer";

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

const createTaskIcon = (rawPriority: string, status: string) => {
  const p = translatePriority(rawPriority);
  const color = p === "KRİTİK" ? "#EF4444"
              : p === "YÜKSEK" ? "#F97316"
              : p === "ORTA" ? "#F59E0B"
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
  const [kandilliEq, setKandilliEq] = useState<any>(null);

  useEffect(() => {
    fetch("https://api.orhanaydogdu.com.tr/deprem/kandilli/live")
      .then(res => res.json())
      .then(data => {
        if (data.result && data.result.length > 0) {
          setKandilliEq(data.result[0]);
        }
      })
      .catch(console.error);
  }, []);

  // Restore the programmatic drawing listener
  useEffect(() => {
    if (!map) return;
    
    // Explicitly rebind the drawing persistence pipeline
    const handleDrawCreated = async (e: any) => {
      const { layerType, layer } = e;
      if (layerType === 'polygon') {
        const latlngs = layer.getLatLngs()[0];
        const coordinates = [latlngs.map((ll: any) => [ll.lng, ll.lat])];
        // Close the polygon
        coordinates[0].push([latlngs[0].lng, latlngs[0].lat]);
        
        const geojson = {
          type: "Polygon",
          coordinates
        };

        // Add layer to map visually so it doesn't disappear immediately
        map.addLayer(layer);

        const tempId = `temp-${Date.now()}`;
        const newZonePoints = coordinates[0].map((c: any) => [c[1], c[0]] as [number, number]);
        useZoneStore.getState().addZone({
          id: tempId,
          type: ZoneType.MEDIUM,
          score: 70,
          points: newZonePoints
        });

        try {
          const res = await api.post('/api/v1/zones', {
            name: `Bölge ${Math.floor(Math.random() * 1000)}`,
            priority_score: 3.5, 
            geometry: geojson
          });
          
          if (res && res.id) {
            useZoneStore.getState().updateZone({
              id: String(res.id),
              type: ZoneType.MEDIUM,
              score: 70,
              points: newZonePoints
            });
            useZoneStore.getState().deleteZone(tempId);
          }
          
          // Log manual override
          window.dispatchEvent(new CustomEvent('map_action_log', { 
            detail: { action: "Yeni Risk Bölgesi İşaretlendi", entity: "[MANUAL_OVERRIDE]", type: LogType.SYSTEM } 
          }));
          
          // Remove manual layer, let WebSocket/Zustand update trigger React render
          map.removeLayer(layer);
        } catch (err) {
          console.error("Bölge oluşturulamadı:", err);
          map.removeLayer(layer); // remove if failed
          useZoneStore.getState().deleteZone(tempId);
        }
        
        setToolMode("CURSOR");
      }
    };

    map.on(L.Draw.Event.CREATED, handleDrawCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, handleDrawCreated);
    };
  }, [map, setToolMode]);

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

  const handleTaskClick = async (task: Task) => {
    if (toolMode === "OVERRIDE") {
      const nextPriority = task.priority === "RED" ? "YELLOW" : task.priority === "YELLOW" ? "GREEN" : "RED";
      try {
        await api.patch(`/api/v1/tasks/${task.id}`, { priority: nextPriority });
      } catch (e) {
        console.error("Task priority override failed", e);
      }
    }
  };

  const heatmapPoints: [number, number, number][] = [
    ...tasks.filter(t => t.status !== "resolved").map((t): [number, number, number] => {
      const weight = t.priority === "KRİTİK" || t.priority === "CRITICAL" || t.priority === "RED" ? 1.0 :
                     t.priority === "YÜKSEK" || t.priority === "HIGH" ? 0.8 :
                     t.priority === "ORTA" || t.priority === "YELLOW" || t.priority === "MEDIUM" ? 0.6 : 0.4;
      return [t.lat, t.lng, weight];
    }),
    ...riskZones.map((z): [number, number, number] => {
      if (!z.points || z.points.length === 0) return [0, 0, 0];
      const poly = L.polygon(z.points as L.LatLngTuple[]);
      const center = poly.getBounds().getCenter();
      return [center.lat, center.lng, (z.score || 50) / 100];
    }).filter(p => p[0] !== 0)
  ];

  return (
    <div className="absolute inset-0 z-0 bg-black">
      <MapContainer
        center={position}
        zoom={13}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
        dragging={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        ref={setMap}
      >
        <MouseTracker />
        <OfflineTileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
        />

        <HeatmapLayer points={heatmapPoints} />

        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <pattern id="no-go-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="10" style={{ stroke: "#F59E0B", strokeWidth: 4, opacity: 0.4 }} />
            </pattern>
          </defs>
        </svg>

        {/* Draw Controls */}
        {toolMode === "PEN" && (
          <FeatureGroup>
            <EditControl
              position="topright"
              onCreated={() => {/* Handled by useEffect map.on(L.Draw.Event.CREATED) */}}
              draw={{
                rectangle: false,
                circle: false,
                circlemarker: false,
                marker: false,
                polyline: false,
                polygon: {
                  allowIntersection: false,
                  drawError: { color: "#e1e100", message: "Kesişim olamaz!" },
                  shapeOptions: { color: "#3B82F6" }
                }
              }}
            />
          </FeatureGroup>
        )}
        
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

        {/* Marker Clusters */}
        <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
          {/* Task Markers — diamond-shaped, color = priority */}
          {tasks.filter(t => t.status !== "resolved" && t.status !== "false_alarm").map((task) => (
            <Marker
              key={`task-${task.id}`}
              position={[task.lat, task.lng]}
              icon={createTaskIcon(task.priority, task.status)}
              eventHandlers={{
                click: () => handleTaskClick(task)
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="bg-zinc-950/95 text-gray-100 border border-white/[0.06] p-2 rounded-lg shadow-2xl font-mono text-[10px] backdrop-blur-md min-w-[140px]">
                  <p className="text-blue-400 border-b border-white/10 pb-1 mb-1">TASK://{task.id}</p>
                  <div className="space-y-0.5">
                    <p>ÖNCELİK: <span className={
                      translatePriority(task.priority) === "KRİTİK" ? "text-red-500 font-bold" :
                      translatePriority(task.priority) === "YÜKSEK" ? "text-orange-400 font-bold" :
                      translatePriority(task.priority) === "ORTA" ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"
                    }>{translatePriority(task.priority)}</span></p>
                    <p>DURUM: <span className="text-gray-300">{STATUS_LABELS[task.status] ?? task.status}</span></p>
                    <div className="mt-1 border-t border-white/5 pt-1">
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">BÖLGE:</span> {kandilliEq?.location_properties?.closestCity?.name || kandilliEq?.title?.split(" ")[0] || "Bilinmeyen Koordinat"}</p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">ŞİDDET:</span> <span className="text-amber-400">{kandilliEq?.mag || "?"} M</span></p>
                      <p className="text-gray-400 text-[9px]"><span className="text-gray-500">DERİNLİK:</span> <span className="text-blue-400">{kandilliEq?.depth || "?"} km</span></p>
                    </div>
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
        </MarkerClusterGroup>
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
