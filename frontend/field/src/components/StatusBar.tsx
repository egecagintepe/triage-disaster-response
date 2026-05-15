import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function StatusBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div 
      className={`h-[10vh] flex items-center justify-center transition-colors duration-500 border-b-2 ${
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
            <span className="tracking-wide uppercase">🟢 YEREL AĞA BAĞLI (Canlı)</span>
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
            <span className="tracking-wide uppercase">⚠️ OFFLINE MOD (Veri Kaydediliyor)</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
