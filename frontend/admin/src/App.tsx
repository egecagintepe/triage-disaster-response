/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Toaster, toast } from "sonner";
import MapPanel from "./components/MapPanel";
import IntelligenceLogPanel from "./components/IntelligenceLogPanel";
import OpsHeader from "./components/OpsHeader";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import { IntelligenceLog, LogType, FieldUnit, RiskZone, UnitStatus, ZoneType, ToolMode } from "./types";
import { useTaskStore } from "./stores/taskStore";
import { useTeamStore } from "./stores/teamStore";
import { useZoneStore } from "./stores/zoneStore";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { syncQueue } from "./services/syncQueue";
import { wsManager } from "./services/websocket";
import { db, type Task, type Team, type Zone } from "./services/localDb";
import { api } from "./services/api";

/* ------------------------------------------------------------------ */
/*  Transform backend models → existing UI types                       */
/* ------------------------------------------------------------------ */

function teamToFieldUnit(team: Team): FieldUnit {
  const statusMap: Record<string, UnitStatus> = {
    idle: UnitStatus.IDLE,
    busy: UnitStatus.BUSY,
    offline: UnitStatus.OFFLINE,
  };
  return {
    id: String(team.id),
    name: team.name,
    ip: team.device_ip || `192.168.x.${team.id + 1}`,
    status: team.status === "idle" ? "Beklemede"
          : team.status === "busy" ? "Görevde"
          : "Çevrimdışı",
    statusType: statusMap[team.status] ?? UnitStatus.OFFLINE,
    coords: [team.current_lat ?? 41.0082, team.current_lng ?? 28.9784],
    battery: team.battery_level ?? 100,
    ping: team.ping_ms ?? 0,
    isOnline: !!team.is_online,
  };
}

function zoneToRiskZone(zone: Zone): RiskZone {
  const typeMap = (score: number): ZoneType =>
    score >= 4.0 ? ZoneType.URGENT
    : score >= 2.5 ? ZoneType.MEDIUM
    : ZoneType.SAFE;

  // Extract points from GeoJSON geometry
  let points: [number, number][] = [];
  const geo = zone.geometry as any;
  if (geo?.type === 'Polygon' && geo?.coordinates?.[0]) {
    points = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
  } else if (geo?.type === 'Point' && Array.isArray(geo?.coordinates)) {
    // If it's a point, we can just use the center or skip it if we strictly need polygons
    // For now, let's just use it as a single point to avoid crash
    points = [[geo.coordinates[1], geo.coordinates[0]]];
  }

  return {
    id: String(zone.id),
    type: typeMap(zone.priority_score),
    score: Math.round(zone.priority_score * 20), // 1-5 → 0-100
    points,
    // Enriched metadata for tooltip
    name: zone.name,
    estimated_casualties: zone.estimated_casualties,
    building_density: zone.building_density,
    population_density: zone.population_density,
    infrastructure_risk: zone.infrastructure_risk,
    priority_score: zone.priority_score,
  };
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem('auth_token')
  );
  const [toolMode, setToolMode] = useState<ToolMode>("CURSOR");
  const [logs, setLogs] = useState<IntelligenceLog[]>([]);
  const isOnline = useOnlineStatus();

  // Zustand stores
  const storeTeams = useTeamStore((s) => s.teams);
  const storeTasks = useTaskStore((s) => s.tasks);

  // Transform store data → UI types
  const units: FieldUnit[] = useMemo(
    () => storeTeams.map(teamToFieldUnit),
    [storeTeams],
  );

  // Zone data from Zustand (instantly reactive)
  const zones = useZoneStore((s) => s.zones);
  const setZones = useZoneStore((s) => s.setZones);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (isAuthenticated) {
        try {
          const apiZones = await api.get<Zone[]>('/api/v1/zones');
          console.log("[API] Zones fetched:", apiZones);
          if (apiZones) {
            await db.zones.clear();
            if (apiZones.length > 0) {
              await db.zones.bulkPut(apiZones);
            }
            setZones(apiZones.map(zoneToRiskZone));
          }
        } catch (error) {
          console.error("[API] Failed to fetch Zones. Error:", error);
          // Fallback to local Dexie data
          const dbZones = await db.zones.toArray();
          if (dbZones.length > 0) {
            setZones(dbZones.map(zoneToRiskZone));
          }
        }
      }

      // Also fetch Teams and Tasks if they are empty
      if (isAuthenticated && storeTeams.length === 0) {
        try {
          const teams = await api.get<Team[]>('/api/v1/teams');
          console.log("[API] Teams fetched:", teams);
          if (teams && teams.length > 0) {
            await db.teams.bulkPut(teams);
            useTeamStore.getState().setTeams(teams);
          }
        } catch (error) {
          console.error("[API] Failed to fetch Teams. Error:", error);
        }
      }
      
      if (isAuthenticated) {
        try {
          const tasks = await api.get<Task[]>('/api/v1/tasks');
          console.log("[API] Tasks fetched:", tasks);
          if (tasks) {
            const backendTaskIds = new Set(tasks.map(t => t.id));
            const localTasks = await db.tasks.toArray();
            
            for (const localTask of localTasks) {
              // Delete local tasks that don't exist on backend (unless pending sync offline creation, which we don't currently have id for)
              if (!backendTaskIds.has(localTask.id)) {
                await db.tasks.delete(localTask.id); // Kill the ghost!
              }
            }
            
            if (tasks.length > 0) {
              await db.tasks.bulkPut(tasks);
            }
            
            const updatedLocalTasks = await db.tasks.toArray();
            useTaskStore.getState().setTasks(updatedLocalTasks);
          }
        } catch (error: any) {
          console.error("[API] Failed to fetch Tasks. Error:", error);
          if (error?.name === 'QuotaExceededError' || error?.message?.includes('QuotaExceeded')) {
            console.error('[STORAGE] QuotaExceeded — purging stale task cache');
            await db.tasks.clear();
            await db.syncQueue.clear();
            useTaskStore.getState().setTasks([]);
          } else {
            const dbTasks = await db.tasks.toArray();
            if (dbTasks.length > 0) {
              // Deduplicate before setting
              const unique = Array.from(new Map(dbTasks.map(t => [t.id, t])).values());
              useTaskStore.getState().setTasks(unique);
            }
          }
        }
      }
    };

    fetchInitialData();
  }, []);

  // --- Log helper ---
  const addLog = useCallback((entity: string, action: string, type: LogType = LogType.ROUTINE) => {
    const newLog: IntelligenceLog = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      entity,
      action,
      type,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50));
  }, []);

  // --- Boot services on auth ---
  useEffect(() => {
    if (!isAuthenticated) return;

    const deviceName = localStorage.getItem('device_name') || 'ADMIN-UNKNOWN';

    // Start sync queue auto-sync
    syncQueue.startAutoSync();

    // Connect WebSocket
    wsManager.connect(deviceName);

    // Boot logs
    addLog("Uplink", "SECURE_TUNNEL_ESTABLISHED", LogType.SYSTEM);
    addLog("Central", "AI_ENGINE_v4_ONLINE", LogType.AI);

    return () => {
      syncQueue.stopAutoSync();
      wsManager.disconnect();
    };
  }, [addLog, isAuthenticated]);

  // --- Phase 3: Toast notifications from WS broadcasts ---
  useEffect(() => {
    const handleBroadcast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const msg = detail?.message || '';
      if (msg.includes('SİMÜLASYON') || msg.includes('ALARM')) {
        toast.error(msg);
      } else if (msg.includes('AI') || msg.includes('OTOMATİK')) {
        toast.info(msg);
      } else {
        toast(msg);
      }
      addLog("WS_BROADCAST", msg, LogType.AI);
    };

    const handleNewTask = () => {
      // Toast on new tasks arriving via WS
    };

    window.addEventListener('ws_broadcast', handleBroadcast);
    return () => window.removeEventListener('ws_broadcast', handleBroadcast);
  }, [addLog]);

  // --- Log network status changes & map events ---
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isOnline) {
      toast.success("BAĞLANTI KURULDU", { id: "network-status", duration: 4000 });
      addLog("NETWORK", "BAĞLANTI_KURULDU", LogType.SYSTEM);
    } else {
      toast.error("BAĞLANTI KESİLDİ — ÇEVRİMDIŞI MOD", { id: "network-status" });
      addLog("NETWORK", "BAĞLANTI_KESİLDİ — ÇEVRİMDIŞI_MOD", LogType.CRITICAL);
    }

    const handleMapLog = (e: any) => {
      addLog(e.detail.entity, e.detail.action, e.detail.type);
    };
    window.addEventListener("map_action_log", handleMapLog);
    return () => window.removeEventListener("map_action_log", handleMapLog);
  }, [isOnline, addLog, isAuthenticated]);

  // --- Log task store changes ---
  useEffect(() => {
    if (!isAuthenticated || storeTasks.length === 0) return;
    const latest = storeTasks[storeTasks.length - 1];
    if (latest) {
      addLog(
        latest.address || `Görev #${latest.id}`,
        `durum: ${latest.status} | öncelik: ${latest.priority}`,
        latest.priority === 'RED' ? LogType.CRITICAL : LogType.ROUTINE,
      );
    }
    // Only fire on task count change (new task added)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeTasks.length]);

  // --- Show login ---
  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <ErrorBoundary>
      <div className="relative h-screen w-screen bg-black text-gray-50 overflow-hidden font-sans">
        <Toaster duration={4000} theme="dark" position="bottom-right" richColors />
        <OpsHeader
          isOnline={isOnline}
          teamCount={storeTeams.length}
          taskCount={storeTasks.filter(t => t.status !== 'resolved' && t.status !== 'false_alarm').length}
          logs={logs}
        />
        <MapPanel
          units={units}
          riskZones={zones}
          toolMode={toolMode}
          setToolMode={setToolMode}
          tasks={storeTasks}
          isOnline={isOnline}
        />
        
        <IntelligenceLogPanel logs={logs} />

        {/* Desktop-Only Warning Overlay */}
        <div className="lg:hidden fixed inset-0 z-[10000] bg-gray-900/95 backdrop-blur-xl flex items-center justify-center p-12 text-center">
          <div className="max-w-md glass-panel p-8">
            <div className="h-2 w-12 bg-red-500 mx-auto mb-6 rounded-full animate-pulse" />
            <h2 className="text-2xl font-bold text-white mb-4 tracking-tighter uppercase">DAHA GENİŞ EKRAN GEREKLİ</h2>
            <p className="text-gray-400 font-mono text-sm leading-relaxed">
              Lütfen bu arayüzü kullanmak için cihazınızı yan çevirin veya daha geniş bir ekrana geçin.<br/>
              Bu arayüz sadece komuta merkezi monitörleri (≥1024px) için optimize edilmiştir.
            </p>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
