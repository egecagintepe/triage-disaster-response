/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import MapPanel from "./components/MapPanel";
import IntelligenceLogPanel from "./components/IntelligenceLogPanel";
import OpsHeader from "./components/OpsHeader";
import Login from "./pages/Login";
import { IntelligenceLog, LogType, FieldUnit, RiskZone, UnitStatus, ZoneType, ToolMode } from "./types";
import { useTaskStore } from "./stores/taskStore";
import { useTeamStore } from "./stores/teamStore";
import { useZoneStore } from "./stores/zoneStore";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { syncQueue } from "./services/syncQueue";
import { wsManager } from "./services/websocket";
import { db, type Task, type Team, type Zone } from "./services/localDb";
import { useZoneStore } from "./stores/zoneStore";
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
    battery: 100,  // Will come from heartbeat in future
    ping: 0,
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
  if (geo?.coordinates?.[0]) {
    points = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
  }

  return {
    id: String(zone.id),
    type: typeMap(zone.priority_score),
    score: Math.round(zone.priority_score * 20), // 1-5 → 0-100
    points,
  };
}

/* ------------------------------------------------------------------ */
/*  Backend Fetchers & Fallbacks (Mock data purged)                   */
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
      // Load zones from Dexie if available
      const dbZones = await db.zones.toArray();
      if (dbZones.length > 0) {
        setZones(dbZones.map(zoneToRiskZone));
      } else if (isAuthenticated) {
        // Fallback to REST API if Dexie is empty
        try {
          const apiZones = await api.get<Zone[]>('/api/v1/zones');
          console.log("[API] Zones fetched:", apiZones);
          if (apiZones && apiZones.length > 0) {
            await db.zones.bulkPut(apiZones);
            setZones(apiZones.map(zoneToRiskZone));
          }
        } catch (error) {
          console.error("[API] Failed to fetch Zones. Error:", error);
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
      
      if (isAuthenticated && storeTasks.length === 0) {
        try {
          const tasks = await api.get<Task[]>('/api/v1/tasks');
          console.log("[API] Tasks fetched:", tasks);
          if (tasks && tasks.length > 0) {
            await db.tasks.bulkPut(tasks);
            useTaskStore.getState().setTasks(tasks);
          }
        } catch (error) {
          console.error("[API] Failed to fetch Tasks. Error:", error);
        }
      }
    };

    fetchInitialData();

    // Also listen to Dexie changes for zones (since WS updates Dexie, or drawing updates it)
    const subscription = db.zones.hook('creating', () => {
      db.zones.toArray().then(z => setZones(z.map(zoneToRiskZone)));
    });
    const sub2 = db.zones.hook('updating', () => {
      db.zones.toArray().then(z => setZones(z.map(zoneToRiskZone)));
    });
    const sub3 = db.zones.hook('deleting', () => {
      db.zones.toArray().then(z => setZones(z.map(zoneToRiskZone)));
    });

    return () => {
      db.zones.hook('creating').unsubscribe(subscription);
      db.zones.hook('updating').unsubscribe(sub2);
      db.zones.hook('deleting').unsubscribe(sub3);
    };
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

    // Replace demo scenarios with real system hooks
    // No more random interval logging, just real events from WS or TaskStore changes.

    return () => {
      syncQueue.stopAutoSync();
      wsManager.disconnect();
    };
  }, [addLog, isAuthenticated]);

  // --- Log network status changes & map events ---
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isOnline) {
      addLog("NETWORK", "BAĞLANTI_KURULDU", LogType.SYSTEM);
    } else {
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
    <div className="relative h-screen w-screen bg-black text-gray-50 overflow-hidden font-sans">
      <OpsHeader
        isOnline={isOnline}
        teamCount={storeTeams.length}
        taskCount={storeTasks.filter(t => t.status !== 'resolved' && t.status !== 'false_alarm').length}
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
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tighter uppercase">ACCESS_DENIED</h2>
          <p className="text-gray-400 font-mono text-sm leading-relaxed">
            SYSTEM_ERROR: VIEWPORT_SIZE_INSUFFICIENT<br/>
            Bu arayüz sadece komuta merkezi monitörleri (≥1024px) için optimize edilmiştir.
          </p>
        </div>
      </div>
    </div>
  );
}
