/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import MapPanel from "./components/MapPanel";
import IntelligenceLogPanel from "./components/IntelligenceLogPanel";
import { IntelligenceLog, LogType, FieldUnit, RiskZone, UnitStatus, ZoneType, ToolMode } from "./types";

export default function App() {
  const [toolMode, setToolMode] = useState<ToolMode>("CURSOR");
  const [logs, setLogs] = useState<IntelligenceLog[]>([]);
  const [units] = useState<FieldUnit[]>([
    { id: "1", ip: "192.168.x.2", status: "Hedefe Yakın", statusType: UnitStatus.BUSY, coords: [41.015, 28.98], destination: [41.012, 28.95], battery: 84, ping: 12 },
    { id: "2", ip: "192.168.x.3", status: "Beklemede", statusType: UnitStatus.IDLE, coords: [41.00, 28.96], battery: 92, ping: 18 },
    { id: "3", ip: "192.168.x.4", status: "Çevrimdışı", statusType: UnitStatus.OFFLINE, coords: [41.025, 28.92], battery: 0, ping: 999 },
    { id: "4", ip: "192.168.x.5", status: "Devriye", statusType: UnitStatus.IDLE, coords: [40.98, 29.02], battery: 76, ping: 24 },
  ]);

  const [riskZones] = useState<RiskZone[]>([
    {
      id: "z1",
      type: ZoneType.URGENT,
      score: 92,
      points: [
        [41.01, 28.95],
        [41.02, 28.96],
        [41.015, 28.97],
      ],
    },
    {
      id: "z2",
      type: ZoneType.MEDIUM,
      score: 54,
      points: [
        [40.99, 29.00],
        [41.00, 29.02],
        [40.98, 29.01],
      ],
    },
    {
      id: "z3",
      type: ZoneType.NO_GO,
      score: 0,
      points: [
        [41.03, 28.90],
        [41.04, 28.92],
        [41.02, 28.91],
      ],
    },
  ]);

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

  useEffect(() => {
    const scenarios = [
      () => addLog("Bornova 3. Sokak", "skoru güncellendi -> KIRMIZI", LogType.AI),
      () => addLog("Ekip x.x.x.4", "hedefe ulaştı.", LogType.ROUTINE),
      () => addLog("Ekip x.x.x.2", "bağlantısı koptu. SINYAL_KAYBI", LogType.SYSTEM),
      () => addLog("Ekip x.x.x.2", "DESTEK TALEBİ! ACİL", LogType.CRITICAL),
      () => addLog("AI_CENTRAL", "Yeni devriye rotası optimize edildi.", LogType.AI),
    ];

    const interval = setInterval(() => {
      const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
      randomScenario();
    }, 5000);

    addLog("Uplink", "SECURE_TUNNEL_ESTABLISHED", LogType.SYSTEM);
    addLog("Central", "AI_ENGINE_v4_ONLINE", LogType.AI);

    return () => clearInterval(interval);
  }, [addLog]);

  return (
    <div className="relative h-screen w-screen bg-bg-base text-gray-50 overflow-hidden font-sans">
      <MapPanel units={units} riskZones={riskZones} toolMode={toolMode} setToolMode={setToolMode} />
      
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

