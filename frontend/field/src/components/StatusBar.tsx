import { useEffect, useState } from 'react';
import { Wifi, WifiOff, CloudOff, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StatusBarProps {
  isOnline?: boolean;
  pendingSyncCount?: number;
  teamName?: string;
}

export default function StatusBar({ isOnline: isOnlineProp, pendingSyncCount = 0, teamName }: StatusBarProps) {
  // Use prop if provided, otherwise fall back to own detection
  const [localOnline, setLocalOnline] = useState(navigator.onLine);
  
  const [showSettings, setShowSettings] = useState(false);
  const [ipValue, setIpValue] = useState(() => localStorage.getItem('triage_server_ip') || 'https://saha.gokberkceviker.com.tr');

  // Auto-persist default server URL on first mount if not already saved
  // This ensures immediate connection without requiring Settings → Save
  useEffect(() => {
    const existing = localStorage.getItem('triage_server_ip');
    if (!existing) {
      localStorage.setItem('triage_server_ip', 'https://saha.gokberkceviker.com.tr');
    }
  }, []);

  const handleSaveIp = () => {
    localStorage.setItem('triage_server_ip', ipValue);
    window.location.reload();
  };

  useEffect(() => {
    if (isOnlineProp !== undefined) return; // Skip if controlled via prop
    const handleOnline = () => setLocalOnline(true);
    const handleOffline = () => setLocalOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnlineProp]);

  const isOnline = isOnlineProp ?? localOnline;

  return (
    <div 
      className={`h-[10vh] flex items-center justify-between px-6 transition-colors duration-500 border-b-2 ${
        isOnline ? 'bg-emerald-600 border-transparent' : 'bg-zinc-950 border-amber-600'
      }`}
    >
      <AnimatePresence mode="wait">
        {isOnline ? (
          <motion.div
            key="online"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center gap-2 text-white font-bold"
          >
            <Wifi size={20} />
            <span className="tracking-wide uppercase text-sm">🟢 BAĞLI</span>
          </motion.div>
        ) : (
          <motion.div
            key="offline"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center gap-2 text-amber-500 font-bold"
          >
            <WifiOff size={20} />
            <span className="tracking-wide uppercase text-sm">⚠️ ÇEVRİMDIŞI</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-4">
        {showSettings ? (
          <div className="flex items-center gap-2 bg-black/60 p-1 rounded-md">
            <input 
              type="text" 
              value={ipValue} 
              onChange={(e) => setIpValue(e.target.value)}
              className="bg-transparent text-white text-xs px-2 outline-none min-w-[220px] font-mono"
              placeholder="https://api.domain.com"
            />
            <button onClick={handleSaveIp} className="text-xs bg-blue-600 px-2 py-1 rounded font-bold text-white">Kaydet</button>
            <button onClick={() => setShowSettings(false)} className="text-xs px-2 text-white/70 hover:text-white">İptal</button>
          </div>
        ) : (
          <button onClick={() => setShowSettings(true)} className="text-white/70 hover:text-white transition-colors">
            <Settings size={18} />
          </button>
        )}

        {/* Pending sync count */}
        {pendingSyncCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-full"
          >
            <CloudOff size={14} className="text-amber-300" />
            <span className="text-xs font-bold text-amber-200">{pendingSyncCount} bekliyor</span>
          </motion.div>
        )}

        {/* Team name */}
        {teamName && (
          <div className="text-xs font-mono text-white/70 bg-black/20 px-3 py-1 rounded-full">
            {teamName}
          </div>
        )}
      </div>
    </div>
  );
}
