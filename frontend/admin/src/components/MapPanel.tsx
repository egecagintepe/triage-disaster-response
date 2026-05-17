/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polygon, Polyline, CircleMarker, FeatureGroup, useMapEvents } from "react-leaflet";
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

const priorityToColor = (priority: string): string => {
  const p = priority.toUpperCase();
  if (p === "RED" || p === "KRİTİK" || p === "YÜKSEK" || p === "CRITICAL" || p === "HIGH") return "#EF4444";
  if (p === "YELLOW" || p === "ORTA" || p === "MEDIUM") return "#F59E0B";
  return "#10B981"; // GREEN / DÜŞÜK / LOW
};

const createTaskIcon = (priority: string, status: string) => {
  const color = priorityToColor(priority);

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

        try {
          const newZone = await api.post<Zone>('/api/v1/zones', {
            name: `Bölge ${Math.floor(Math.random() * 1000)}`,
            priority_score: 3.5, 
            geometry: geojson
          });
          
          window.dispatchEvent(new CustomEvent('map_action_log', { 
            detail: { action: "Yeni Risk Bölgesi İşaretlendi", entity: "[MANUAL_OVERRIDE]", type: LogType.SYSTEM } 
          }));
          
          if (newZone && newZone.id) {
            await db.zones.put(newZone);
            
            // Optimistic UI Update for instant feedback
            const points = newZone.geometry?.coordinates?.[0]?.map((c: any) => [c[1], c[0]]) || [];
            const rz: RiskZone = {
              id: String(newZone.id),
              type: ZoneType.MEDIUM,
              score: 70,
              points
            };
            useZoneStore.getState().setZones([...useZoneStore.getState().zones, rz]);
          }

          map.removeLayer(layer);
        } catch (err) {
          console.error("Bölge oluşturulamadı:", err);
          map.removeLayer(layer); 
        }
        
        setToolMode("CURSOR");
      }
    };

    map.on(L.Draw.Event.CREATED, handleDrawCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, handleDrawCreated);
    };
  }, [map, setToolMode]);

  const handleZoneClick = async (zone: RiskZone) => {
    if (toolMode === "ERASER") {
      // Prevent double-click firing API twice
      const exists = useZoneStore.getState().zones.find(z => z.id === zone.id);
      if (!exists) return;

      useZoneStore.getState().deleteZone(zone.id);
      try {
        await api.delete(`/api/v1/zones/${zone.id}`);
        await db.zones.delete(zone.id);
      } catch (e: any) {
        if (!e.message?.includes('404')) {
          console.error("Zone deletion failed", e);
        }
      }
    }
  };

  const handleZoneDoubleClick = async (zone: RiskZone) => {
    if (toolMode === "OVERRIDE") {
      let nextPriorityScore = 4.5;
      if (zone.type === ZoneType.SAFE || zone.type === ZoneType.NO_GO) nextPriorityScore = 3.0;
      else if (zone.type === ZoneType.MEDIUM) nextPriorityScore = 4.5;
      else nextPriorityScore = 1.5; // URGENT -> SAFE (wrap around)

      // Optimistic UI update
      const nextType = nextPriorityScore >= 4.0 ? ZoneType.URGENT : nextPriorityScore >= 2.5 ? ZoneType.MEDIUM : ZoneType.SAFE;
      const store = useZoneStore.getState();
      const updatedZones = store.zones.map(z => 
        z.id === zone.id ? { ...z, type: nextType, score: Math.round(nextPriorityScore * 20) } : z
      );
      store.setZones(updatedZones);

      try {
        await api.patch(`/api/v1/zones/${zone.id}`, { priority_score: nextPriorityScore });
      } catch (e: any) {
        console.error("Zone priority override failed", e);
        if (e.message?.includes("404")) {
          // Ghost zone — remove from UI
          store.deleteZone(zone.id);
        }
      }
    }
  };

  const handleTaskDoubleClick = async (task: Task) => {
    if (toolMode === "OVERRIDE") {
      const nextPriority = task.priority === "GREEN" ? "YELLOW" : task.priority === "YELLOW" ? "RED" : "GREEN";
      try {
        await api.patch(`/api/v1/tasks/${task.id}`, { priority: nextPriority });
      } catch (e) {
        console.error("Task priority override failed", e);
      }
    }
  };

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
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

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
              onCreated={() => {/* Handled by useEffect map.on(L.Draw.Event.CREATED) */ }}
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

        {riskZones.map((zone) => {
          // zone.points is already in [lat, lng] format from App.tsx
          const leafletCoords = zone.points;

          // 2. Dynamic Priority Styling helper
          const getPriorityColor = (type: any) => {
            const p = String(type).toUpperCase();
            if (p === 'URGENT' || p === 'RED' || p === '5' || p === '4' || p === 'KRİTİK' || p === 'YÜKSEK') return "#ef4444";
            if (p === 'MEDIUM' || p === 'YELLOW' || p === '3' || p === 'ORTA') return "#eab308";
            return "#22c55e"; // SAFE
          };

          const priorityColor = getPriorityColor(zone.type);

          let pathOptions: L.PathOptions = {
            color: priorityColor,
            fillColor: zone.type === ZoneType.NO_GO ? "url(#no-go-hatch)" : priorityColor,
            fillOpacity: zone.type === ZoneType.NO_GO ? 1 :
              zone.type === ZoneType.URGENT ? 0.4 :
                zone.type === ZoneType.MEDIUM ? 0.25 : 0.1,
            weight: zone.type === ZoneType.URGENT ? 3 : 2,
            dashArray: zone.type === ZoneType.NO_GO ? "5, 10" : undefined,
          };

          return (
            <Polygon
              key={`${zone.id}-${zone.type}-${zone.score}`}
              positions={leafletCoords}
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => handleZoneClick(zone),
                dblclick: () => handleZoneDoubleClick(zone)
              }}
            >
              <Tooltip sticky className="custom-zone-tooltip">
                <div className="bg-zinc-950 border border-zinc-700 text-gray-100 p-3 rounded-lg font-mono shadow-2xl backdrop-blur-md min-w-[220px]">
                  {/* Header with zone name & ID */}
                  <div className="flex items-center justify-between border-b border-zinc-700 pb-2 mb-2">
                    <span className="text-[11px] font-bold text-blue-400 tracking-wide uppercase truncate max-w-[160px]">
                      {zone.name || `BÖLGE #${zone.id}`}
                    </span>
                    <span className="text-[8px] font-mono text-gray-500 ml-2">ID:{zone.id}</span>
                  </div>

                  {/* Threat Level Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] text-gray-500 uppercase tracking-wider">Tehdit Seviyesi</span>
                      <span className={`text-[10px] font-bold ${zone.score >= 80 ? 'text-red-400' : zone.score >= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        %{zone.score}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${zone.score}%`,
                          backgroundColor: zone.score >= 80 ? '#ef4444' : zone.score >= 50 ? '#f59e0b' : '#10b981',
                        }}
                      />
                    </div>
                  </div>

                  {/* Data Grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px]">
                    {zone.estimated_casualties != null && (
                      <>
                        <span className="text-gray-500">Tahmini Kayıp:</span>
                        <span className={`font-bold text-right ${zone.estimated_casualties > 50 ? 'text-red-400' : zone.estimated_casualties > 10 ? 'text-amber-400' : 'text-gray-300'}`}>
                          ~{zone.estimated_casualties} kişi
                        </span>
                      </>
                    )}
                    {zone.population_density != null && (
                      <>
                        <span className="text-gray-500">Nüfus Yoğunluğu:</span>
                        <span className="text-gray-300 font-bold text-right">{zone.population_density.toLocaleString('tr-TR')}/km²</span>
                      </>
                    )}
                    {zone.building_density != null && (
                      <>
                        <span className="text-gray-500">Bina Yoğunluğu:</span>
                        <span className="text-gray-300 font-bold text-right">{zone.building_density.toLocaleString('tr-TR')} yapı</span>
                      </>
                    )}
                    {zone.infrastructure_risk != null && (
                      <>
                        <span className="text-gray-500">Altyapı Riski:</span>
                        <span className={`font-bold text-right ${zone.infrastructure_risk >= 3.5 ? 'text-red-400' : zone.infrastructure_risk >= 2.0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {zone.infrastructure_risk.toFixed(1)}/5.0
                        </span>
                      </>
                    )}
                    {zone.priority_score != null && (
                      <>
                        <span className="text-gray-500">Öncelik Skoru:</span>
                        <span className={`font-bold text-right ${zone.priority_score >= 4.0 ? 'text-red-400' : zone.priority_score >= 2.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {zone.priority_score.toFixed(1)}/5.0
                        </span>
                      </>
                    )}
                  </div>

                  {/* Aftershock prediction */}
                  {zone.priority_score != null && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Artçı Tahmini</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
                        <span className="text-gray-500">Tahmini Büyüklük:</span>
                        <span className="text-amber-300 font-bold text-right">
                          M{Math.max(2.0, zone.priority_score * 0.8 + 1.2).toFixed(1)}–{Math.max(3.0, zone.priority_score * 1.1 + 0.5).toFixed(1)}
                        </span>
                        <span className="text-gray-500">Beklenen Süre:</span>
                        <span className="text-gray-300 font-bold text-right">
                          {zone.priority_score >= 4.0 ? '24-48 saat' : zone.priority_score >= 2.5 ? '48-72 saat' : '72+ saat'}
                        </span>
                      </div>
                    </div>
                  )}

                  {zone.isHumanOverride && (
                    <div className="mt-2 text-amber-400 border-t border-zinc-700 pt-2 text-[9px] flex items-center gap-1">
                      <span>⭐</span> <span className="font-bold">MANUEL ÖNCELİK</span>
                    </div>
                  )}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Task Markers — diamond-shaped, color = priority */}
        {tasks.filter(t => t.status !== "resolved" && t.status !== "false_alarm").map((task) => (
          <Marker
            key={`task-${task.id}`}
            position={[task.lat, task.lng]}
            icon={createTaskIcon(task.priority, task.status)}
            eventHandlers={{
              dblclick: () => handleTaskDoubleClick(task)
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div className="bg-zinc-950/95 text-gray-100 border border-white/[0.06] p-2 rounded-lg shadow-2xl font-mono text-[10px] backdrop-blur-md min-w-[140px]">
                <p className="text-blue-400 border-b border-white/10 pb-1 mb-1">TASK://{task.id}</p>
                <div className="space-y-0.5">
                  <p>ÖNCELİK: <span style={{ color: priorityToColor(task.priority) }} className="font-bold">{task.priority}</span></p>
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
