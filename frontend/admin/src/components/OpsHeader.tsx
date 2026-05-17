/**
 * TRIAGE — Telemetry Ops Header
 * Phase 2: Simulation inject button
 * Phase 4: AI status badge
 * Phase 6: AAR export + Auto-dispatch
 */

import { useState, useEffect } from "react";
import { AlertTriangle, QrCode, Clock, Users, Radio, X, Brain, Download, Zap, Trash2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../services/api";
import { toast } from "sonner";
import { useTaskStore } from "../stores/taskStore";
import { useTeamStore } from "../stores/teamStore";

interface Props {
  isOnline: boolean;
  teamCount: number;
  taskCount: number;
  logs?: { time: string; entity: string; action: string }[];
}

export default function OpsHeader({ isOnline, teamCount, taskCount, logs = [] }: Props) {
  const [uptime, setUptime] = useState("00:00:00");
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState<{ qr_base64?: string | null; url?: string; ip?: string } | null>(null);
  const [alertSending, setAlertSending] = useState(false);
  const [showRedAlertModal, setShowRedAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState("KIRMIZI ALARM — TÜM EKİPLER DİKKAT!");
  const [startTime] = useState(() => Date.now());
  const dynamicUrl = `https://saha.gokberkceviker.com.tr`;

  // Phase 4: AI Status
  const [aiStatus, setAiStatus] = useState<"online" | "offline" | "checking">("checking");
  const [simLoading, setSimLoading] = useState(false);

  // Ops Clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setUptime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Phase 4: Poll AI status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get<{ status: string; mode: string }>('/api/v1/debug/ai-status');
        setAiStatus(res.status === "online" ? "online" : "offline");
      } catch (err) {
        // Suppress unhandled promise rejection if endpoint is down or 404
        setAiStatus("offline");
      }
    };
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, []);

  const handlePanic = async () => {
    if (!alertMessage.trim()) return;
    setAlertSending(true);
    try {
      await api.post("/api/v1/emergency/alert", {
        message: alertMessage,
        severity: "critical",
      });
      setShowRedAlertModal(false);
      toast.error("KIRMIZI ALARM gönderildi!");
    } catch (e) {
      console.error("Emergency alert failed:", e);
      toast.error("Alarm gönderilemedi!");
    }
    setTimeout(() => setAlertSending(false), 3000);
  };

  const handleQR = async () => {
    setShowQR(!showQR);
  };

  // Phase 2: Inject earthquake
  const handleInjectEarthquake = async () => {
    setSimLoading(true);
    try {
      const res = await api.post<any>("/api/v1/debug/inject-earthquake", {
        lat: 38.4192,
        lng: 27.1287,
        magnitude: 6.5,
        depth: 10,
        city: "İzmir (Demo)"
      });
      toast.success(`SİMÜLASYON BAŞARILI: ${res.zones_created} bölge, ${res.tasks_created} görev oluşturuldu (${res.method})`);
    } catch (e) {
      console.error("Inject failed:", e);
      toast.error("Simülasyon başarısız!");
    }
    setSimLoading(false);
  };

  // Phase 6: Auto-dispatch
  const handleAutoDispatch = async () => {
    const assigned = await useTaskStore.getState().autoDispatch();
    if (assigned > 0) {
      toast.success(`Yapay zeka ${assigned} ekibi görevlere atadı.`);
    } else {
      toast.info("Atanacak boş ekip veya görev yok.");
    }
  };

  // Phase 6: AAR Export
  const handleExport = () => {
    const tasks = useTaskStore.getState().tasks;
    const teams = useTeamStore.getState().teams;
    const report = {
      timestamp: new Date().toISOString(),
      operation: "TRIAGE_V2_SNAPSHOT",
      summary: {
        total_tasks: tasks.length,
        completed: tasks.filter(t => t.status === "resolved").length,
        active: tasks.filter(t => t.status === "in_progress" || t.status === "assigned").length,
        pending: tasks.filter(t => t.status === "pending").length,
        teams: teams.length,
        online_teams: teams.filter(t => t.is_online).length,
      },
      tasks,
      teams,
      timeline: logs.slice(0, 100),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operation_snapshot_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info("Operasyon raporu indirildi.");
  };

  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-[1100] h-10 bg-black/80 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-4 pointer-events-auto">
        {/* Left: Ops Clock */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[10px] font-mono text-gray-400 tracking-wider">OPS</span>
            <span className="text-xs font-mono font-bold text-white tracking-widest">{uptime}</span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-mono text-gray-400">EKİP</span>
            <span className="text-xs font-mono font-bold text-emerald-400">{teamCount}</span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-gray-400">GÖREV</span>
            <span className="text-xs font-mono font-bold text-amber-400">{taskCount}</span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className={`flex items-center gap-1.5 ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
            <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
            <span className="text-[10px] font-mono font-bold">{isOnline ? "BAĞLI" : "ÇEVRİMDIŞI"}</span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Phase 4: AI Status Badge */}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
            aiStatus === "online"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : aiStatus === "offline"
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-gray-500/30 bg-gray-500/10 text-gray-400"
          }`}>
            <Brain className={`h-3 w-3 ${aiStatus === "online" ? "text-emerald-400" : "text-red-400"}`} />
            <span className="text-[9px] font-mono font-bold">
              AI: {aiStatus === "online" ? "ONLINE" : aiStatus === "offline" ? "OFFLINE (DETERMİNİSTİK)" : "..."}
            </span>
          </div>
        </div>

        {/* Center: Title */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 tracking-[0.3em] uppercase">TRIAGE</span>
          <span className="text-[8px] text-gray-600 font-mono">KOMUTA MERKEZİ</span>
        </div>

        {/* Right: Tools */}
        <div className="flex items-center gap-2">
          {/* Phase 2: Nuke DB */}
          <button
            onClick={async () => {
              if (window.confirm("Tüm veritabanı SIFIRLANACAKTIR! Onaylıyor musunuz?")) {
                try {
                  await api.post("/api/v1/debug/clear-database", {});
                  toast.success("Veritabanı sıfırlandı!");
                  window.location.reload();
                } catch (e) {
                  toast.error("Temizleme başarısız!");
                }
              }
            }}
            className="p-1.5 rounded-md bg-red-950/30 border border-red-500/20 hover:bg-red-900/50 transition-colors text-red-400 hover:text-white"
            title="Verileri Temizle"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Phase 6: Auto-Dispatch */}
          <button
            onClick={handleAutoDispatch}
            className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 transition-colors"
            title="Yapay Zeka Oto-Atama"
          >
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              OTO-ATA
            </span>
          </button>

          {/* Phase 2: Simulation */}
          <button
            onClick={handleInjectEarthquake}
            disabled={simLoading}
            className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${
              simLoading
                ? "bg-amber-900 text-amber-300 cursor-not-allowed"
                : "bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/30"
            }`}
            title="Deprem Simülasyonu Başlat"
          >
            {simLoading ? "İŞLENİYOR..." : "SİMÜLASYON"}
          </button>

          {/* Phase 6: Export */}
          <button
            onClick={handleExport}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            title="Operasyon Raporu İndir"
          >
            <Download className="h-4 w-4" />
          </button>

          <button
            onClick={handleQR}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            title="QR Kod ile Ekip Ekle"
          >
            <QrCode className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowRedAlertModal(true)}
            disabled={alertSending}
            className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
              alertSending
                ? "bg-red-900 text-red-300 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:shadow-[0_0_25px_rgba(239,68,68,0.6)]"
            }`}
          >
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {alertSending ? "GÖNDERİLDİ!" : "KIRMIZI ALARM"}
            </span>
          </button>
        </div>
      </header>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center pointer-events-auto">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center relative">
            <button
              onClick={() => setShowQR(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <QrCode className="h-8 w-8 text-blue-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Saha Ekibi Ekle</h3>
            <p className="text-gray-400 text-xs mb-6">
              Bu QR kodu telefonla okutarak saha uygulamasına anında bağlanın.
            </p>

            <div className="bg-white p-2 rounded-xl mb-4 inline-block">
              <QRCodeCanvas value={dynamicUrl} size={180} />
            </div>

            <div className="bg-zinc-900 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Saha Uygulaması URL</p>
              <p className="text-sm font-mono text-blue-400 font-bold">{dynamicUrl}</p>
            </div>
          </div>
        </div>
      )}

      {/* Red Alert Modal */}
      {showRedAlertModal && (
        <div className="fixed inset-0 z-[9999] bg-red-950/80 backdrop-blur-md flex items-center justify-center pointer-events-auto">
          <div className="bg-zinc-950 border border-red-500/50 rounded-2xl p-8 max-w-md w-full relative shadow-[0_0_50px_rgba(239,68,68,0.2)]">
            <button
              onClick={() => setShowRedAlertModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <AlertTriangle className="h-10 w-10 text-red-500 mb-4 animate-pulse" />
            <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Kritik Acil Durum İletisi</h3>
            <p className="text-gray-400 text-xs mb-6">Tüm saha personeline iletilecek acil durum mesajını girin. Bu işlem geri alınamaz ve anında tüm cihazlarda siren çaldırır.</p>
            
            <textarea 
              value={alertMessage} 
              onChange={(e) => setAlertMessage(e.target.value)} 
              className="w-full h-32 bg-black border border-red-500/30 rounded p-3 text-white mb-4 focus:outline-none focus:border-red-500 resize-none"
              placeholder="Acil Durum Mesajı..."
            />
            
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setShowRedAlertModal(false)}
                className="px-4 py-2 rounded bg-zinc-900 text-gray-400 hover:text-white transition-colors text-sm font-bold"
              >
                İPTAL
              </button>
              <button 
                onClick={handlePanic}
                className="px-6 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-bold transition-colors text-sm"
              >
                TÜM SAHAYA İLET
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
