import { useEffect, useState } from 'react';
import { Wifi, WifiOff, CloudOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StatusBarProps {
  isOnline?: boolean;
  pendingSyncCount?: number;
  teamName?: string;
}

export default function StatusBar({ isOnline: isOnlineProp, pendingSyncCount = 0, teamName }: StatusBarProps) {
  // Use prop if provided, otherwise fall back to own detection
  const [localOnline, setLocalOnline] = useState(navigator.onLine);

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
        isOnline ? 'bg-emerald-600 border-transparent' : 'bg-gray-800 border-amber-600'
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
