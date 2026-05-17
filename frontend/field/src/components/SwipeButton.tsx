import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
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
  
  const handleDragEnd = (_: any, info: any) => {
    if (trackRef.current) {
      const trackWidth = trackRef.current.offsetWidth;
      const thumbWidth = 64; // w-16
      const threshold = (trackWidth - thumbWidth) * 0.8;

      if (info.point.x - trackRef.current.getBoundingClientRect().left >= threshold) {
        setIsSuccess(true);
        if (navigator.vibrate) navigator.vibrate(50);
        onConfirm();
        // Reset after a delay
        setTimeout(() => {
          animate(x, 0, { type: 'spring', stiffness: 300, damping: 25 });
          setIsSuccess(false);
        }, 1000);
      } else {
        // Snap back
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 25 });
      }
    }
  };

  return (
    <div 
      ref={trackRef}
      className="relative h-[72px] w-full bg-gray-800 rounded-full flex items-center px-1 overflow-hidden"
    >
      {/* Background track text */}
      <motion.div 
        style={{ opacity }}
        className="absolute inset-0 flex items-center justify-center font-bold text-lg text-gray-400 pointer-events-none select-none"
      >
        {label}
      </motion.div>

      {/* The Swipe Thumb */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: trackRef.current ? trackRef.current.offsetWidth - 68 : 300 }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className={`z-10 w-16 h-16 rounded-full flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-transform ${thumbColor} ${
          pulse ? 'animate-pulse shadow-[0_0_15px_5px_rgba(220,38,38,0.5)]' : ''
        }`}
      >
        <ChevronRight size={32} className="text-white" />
      </motion.div>
    </div>
  );
}
