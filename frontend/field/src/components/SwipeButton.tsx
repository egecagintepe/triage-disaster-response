import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { ChevronRight } from 'lucide-react';

interface SwipeButtonProps {
  label: string;
  onConfirm: () => void;
  thumbColor: string;
  pulse?: boolean;
}

export default function SwipeButton({ label, onConfirm, thumbColor, pulse }: SwipeButtonProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [isSuccess, setIsSuccess] = useState(false);

  // Transform opacity based on drag position
  const opacity = useTransform(x, [0, 200], [1, 0]);
  
  const bind = useDrag(({ movement: [mx], down, cancel }) => {
    if (isSuccess) return;

    if (!trackRef.current) return;
    const trackWidth = trackRef.current.offsetWidth;
    const thumbWidth = 64; // w-16
    const maxBound = trackWidth - thumbWidth - 8;

    if (mx >= maxBound * 0.9) {
      setIsSuccess(true);
      if (navigator.vibrate) navigator.vibrate(50);
      onConfirm();
      if (cancel) cancel();
      
      animate(x, maxBound, { type: "spring", stiffness: 300, damping: 20 });
      
      setTimeout(() => {
        setIsSuccess(false);
        animate(x, 0, { type: "spring", stiffness: 300, damping: 20 });
      }, 1000);
      return;
    }

    if (down) {
      x.set(Math.max(0, Math.min(mx, maxBound)));
    } else {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 20 });
    }
  }, { 
    filterTaps: true,
    axis: 'x'
  });

  return (
    <div 
      ref={trackRef}
      className="relative h-[72px] w-full bg-gray-800 rounded-full flex items-center px-1 overflow-hidden"
    >
      <motion.div 
        style={{ opacity }}
        className="absolute inset-0 flex items-center justify-center font-bold text-lg text-gray-400 pointer-events-none select-none"
      >
        {label}
      </motion.div>

      <motion.div
        {...bind()}
        style={{ x, touchAction: "pan-y" }}
        className={`z-10 w-16 h-16 rounded-full flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-transform ${thumbColor} ${
          pulse && !isSuccess ? 'animate-pulse shadow-[0_0_15px_5px_rgba(220,38,38,0.5)]' : ''
        }`}
      >
        <ChevronRight size={32} className="text-white" />
      </motion.div>
    </div>
  );
}
