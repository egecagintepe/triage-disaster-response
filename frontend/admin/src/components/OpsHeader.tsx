/**
 * TRIAGE V2 — Telemetry Ops Header
 * Shows: Operation Uptime, Active Teams, Sync Queue, KIRMIZI ALARM button, QR Code
 */

import { useState, useEffect } from "react";
import { AlertTriangle, QrCode, Clock, Users, Radio, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../services/api";

interface Props {
  isOnline: boolean;
  teamCount: number;
  taskCount: number;
}

export default function OpsHeader({ isOnline, teamCount, taskCount }: Props) {
  const [uptime, setUptime] = useState("00:00:00");
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState<{ qr_base64?: string | null; url?: string; ip?: string } | null>(null);
  const [alertSending, setAlertSending] = useState(false);
  const [showRedAlertModal, setShowRedAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState("KIRMIZI ALARM — TÜM EKİPLER DİKKAT!");
  const [startTime] = useState(() => Date.now());
  const dynamicUrl = `${window.location.protocol}//${window.location.hostname}:3001`;

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

  const handlePanic = async () => {
    if (!alertMessage.trim()) return;
    setAlertSending(true);
    try {
      await api.post("/api/v1/emergency/alert", {
        message: alertMessage,
        severity: "critical",
      });
      setShowRedAlertModal(false);
    } catch (e) {
      console.error("Emergency alert failed:", e);
    }
    setTimeout(() => setAlertSending(false), 3000);
  };

  const handleQR = async () => {
    setShowQR(!showQR);
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
        </div>

        {/* Center: Title */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 tracking-[0.3em] uppercase">TRIAGE V2</span>
          <span className="text-[8px] text-gray-600 font-mono">KOMUTA MERKEZİ</span>
        </div>

        {/* Right: QR + Panic */}
        <div className="flex items-center gap-2">
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
