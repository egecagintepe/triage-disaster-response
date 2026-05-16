/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import MapPanel from "./components/MapPanel";
import IntelligenceLogPanel from "./components/IntelligenceLogPanel";
import Login from "./pages/Login";
import { IntelligenceLog, LogType, FieldUnit, RiskZone, UnitStatus, ZoneType, ToolMode } from "./types";
import { useTaskStore } from "./stores/taskStore";
import { useTeamStore } from "./stores/teamStore";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { syncQueue } from "./services/syncQueue";
import { wsManager } from "./services/websocket";
import { db, type Task, type Team, type Zone } from "./services/localDb";

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
    ip: team.device_ip || `192.168.x.${team.id + 1}`,
    status: team.status === "idle" ? "Beklemede"
          : team.status === "busy" ? "Görevde"
          : "Çevrimdışı",
    statusType: statusMap[team.status] ?? UnitStatus.OFFLINE,
    coords: [team.current_lat ?? 41.0082, team.current_lng ?? 28.9784],
    battery: 100,  // Will come from heartbeat in future
    ping: 0,
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
/*  Fallback demo data (used when stores are empty / no backend)       */
/* ------------------------------------------------------------------ */

const DEMO_UNITS: FieldUnit[] = [
  { id: "1", ip: "192.168.x.2", status: "Hedefe Yakın", statusType: UnitStatus.BUSY, coords: [41.015, 28.98], destination: [41.012, 28.95], battery: 84, ping: 12 },
  { id: "2", ip: "192.168.x.3", status: "Beklemede", statusType: UnitStatus.IDLE, coords: [41.00, 28.96], battery: 92, ping: 18 },
  { id: "3", ip: "192.168.x.4", status: "Çevrimdışı", statusType: UnitStatus.OFFLINE, coords: [41.025, 28.92], battery: 0, ping: 999 },
  { id: "4", ip: "192.168.x.5", status: "Devriye", statusType: UnitStatus.IDLE, coords: [40.98, 29.02], battery: 76, ping: 24 },
];

const DEMO_ZONES: RiskZone[] = [
  { id: "z1", type: ZoneType.URGENT, score: 92, points: [[41.01, 28.95], [41.02, 28.96], [41.015, 28.97]] },
  { id: "z2", type: ZoneType.MEDIUM, score: 54, points: [[40.99, 29.00], [41.00, 29.02], [40.98, 29.01]] },
  { id: "z3", type: ZoneType.NO_GO, score: 0, points: [[41.03, 28.90], [41.04, 28.92], [41.02, 28.91]] },
];

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

  // Transform store data → UI types (with fallback to demo data)
  const units: FieldUnit[] = useMemo(
    () => storeTeams.length > 0 ? storeTeams.map(teamToFieldUnit) : DEMO_UNITS,
    [storeTeams],
  );

  // Zone data from Dexie (read once on mount, updated by WS)
  const [zones, setZones] = useState<RiskZone[]>(DEMO_ZONES);

  useEffect(() => {
    // Load zones from Dexie if available
    db.zones.toArray().then((dbZones) => {
      if (dbZones.length > 0) {
        setZones(dbZones.map(zoneToRiskZone));
      }
    });
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

    // Demo scenario interval (will be replaced by real WS events)
    const scenarios = [
      () => addLog("Bornova 3. Sokak", "skoru güncellendi -> KIRMIZI", LogType.AI),
      () => addLog("Ekip x.x.x.4", "hedefe ulaştı.", LogType.ROUTINE),
      () => addLog("Ekip x.x.x.2", "bağlantısı koptu. SINYAL_KAYBI", LogType.SYSTEM),
      () => addLog("Ekip x.x.x.2", "DESTEK TALEBİ! ACİL", LogType.CRITICAL),
      () => addLog("AI_CENTRAL", "Yeni devriye rotası optimize edildi.", LogType.AI),
    ];

    const interval = setInterval(() => {
      scenarios[Math.floor(Math.random() * scenarios.length)]();
    }, 5000);

    return () => {
      clearInterval(interval);
      syncQueue.stopAutoSync();
      wsManager.disconnect();
    };
  }, [addLog, isAuthenticated]);

  // --- Log network status changes ---
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isOnline) {
      addLog("NETWORK", "BAĞLANTI_KURULDU", LogType.SYSTEM);
    } else {
      addLog("NETWORK", "BAĞLANTI_KESİLDİ — ÇEVRİMDIŞI_MOD", LogType.CRITICAL);
    }
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
    <div className="relative h-screen w-screen bg-bg-base text-gray-50 overflow-hidden font-sans">
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
