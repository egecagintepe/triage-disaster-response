import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  RED: { bg: 'bg-red-500/20', text: 'text-red-500', label: 'YÜKSEK' },
  YELLOW: { bg: 'bg-amber-500/20', text: 'text-amber-500', label: 'ORTA' },
  GREEN: { bg: 'bg-emerald-500/20', text: 'text-emerald-500', label: 'DÜŞÜK' },
  // Legacy Turkish values
  'Yüksek': { bg: 'bg-red-500/20', text: 'text-red-500', label: 'YÜKSEK' },
  'Orta': { bg: 'bg-amber-500/20', text: 'text-amber-500', label: 'ORTA' },
  'Düşük': { bg: 'bg-emerald-500/20', text: 'text-emerald-500', label: 'DÜŞÜK' },
};
import { useMapEvent } from 'react-leaflet';
import { ChevronDown, Navigation, ExternalLink, Target } from 'lucide-react';
import { useEffect, useState } from 'react';

// Fix for default marker icon in Leaflet + Vite
const customIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #ef4444; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const userIcon = L.divIcon({
  className: 'user-div-icon',
  html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); position: relative;">
          <div style="position: absolute; width: 32px; height: 32px; background: rgba(59, 130, 246, 0.3); border-radius: 50%; top: -8px; left: -8px; animation: pulse 2s infinite;"></div>
         </div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

// Helper component to center map on coordinates only when trigger or task coords change
function ChangeView({ lat, lng, trigger }: { lat: number, lng: number, trigger: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 15);
  }, [lat, lng, trigger, map]);
  return null;
}

// Automatically fix Leaflet map rendering issues on resize (expansion)
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

interface TaskMapProps {
  taskLat: number;
  taskLng: number;
  userLat: number | null;
  userLng: number | null;
  address: string;
  priority: string;
  status?: string;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

// Map Click Listener
function MapClickListener({ onExpand }: { onExpand?: () => void }) {
  useMapEvent('click', () => {
    if (onExpand) onExpand();
  });
  return null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'BEKLİYOR',
  assigned: 'ATANDI',
  in_progress: 'DEVAM EDİYOR',
  needs_backup: 'DESTEK GEREKLİ',
  false_alarm: 'YANLIŞ ALARM',
  resolved: 'TAMAMLANDI',
};

export default function TaskMap({ taskLat, taskLng, userLat, userLng, address, priority, status, isExpanded, onExpand, onCollapse }: TaskMapProps) {
  const prio = PRIORITY_COLORS[priority] || PRIORITY_COLORS['RED'];
  const [mapCenter, setMapCenter] = useState<[number, number]>([taskLat, taskLng]);
  const [centerTrigger, setCenterTrigger] = useState(0);

  // Auto-center when task changes
  useEffect(() => {
    setMapCenter([taskLat, taskLng]);
    setCenterTrigger(prev => prev + 1);
  }, [taskLat, taskLng]);

  const handleOrtala = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (userLat !== null && userLng !== null) {
      setMapCenter([userLat, userLng]);
    } else {
      setMapCenter([taskLat, taskLng]);
    }
    setCenterTrigger(prev => prev + 1);
  };

  const handleHedefOrtala = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMapCenter([taskLat, taskLng]);
    setCenterTrigger(prev => prev + 1);
  };

  const distance = (userLat !== null && userLng !== null)
    ? L.latLng(userLat, userLng).distanceTo(L.latLng(taskLat, taskLng))
    : null;

  const formatDistance = (dist: number | null) => {
    if (dist === null) return "Bilinmiyor";
    if (dist > 1000) return `${(dist / 1000).toFixed(1)} km`;
    return `${Math.round(dist)} m`;
  };

  const handleDirections = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.google.com/maps/dir/?api=1&destination=${taskLat},${taskLng}`;
    window.open(url, '_blank');
  };

  return (
    <div className={`relative ${isExpanded ? 'flex-1 h-full' : 'h-[40vh]'} shadow-2xl rounded-b-3xl overflow-hidden z-0 transition-all duration-500 ease-in-out`}>
      <MapContainer
        center={[taskLat, taskLng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        tap={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[taskLat, taskLng]} icon={customIcon}>
          <Popup>{address}</Popup>
        </Marker>

        {userLat !== null && userLng !== null && (
          <Marker position={[userLat, userLng]} icon={userIcon}>
            <Popup>Siz</Popup>
          </Marker>
        )}

        <ChangeView lat={mapCenter[0]} lng={mapCenter[1]} trigger={centerTrigger} />
        <MapClickListener onExpand={onExpand} />
        <MapResizer />
      </MapContainer>

      {/* Bottom UI Container */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-3 pointer-events-none z-[1000]">

        {/* Action Buttons Row */}
        <div className="flex justify-between items-end">
          {/* Navigation Buttons */}
          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={handleOrtala}
              className="bg-blue-600/80 hover:bg-blue-500 backdrop-blur-md p-2.5 rounded-full border border-white/20 transition-all shadow-lg flex items-center gap-2"
            >
              <Navigation className="h-5 w-5 text-white" />
              <span className="text-white text-xs font-bold pr-1">Ortala</span>
            </button>

            <button
              onClick={handleDirections}
              className="bg-emerald-600/80 hover:bg-emerald-500 backdrop-blur-md p-2.5 rounded-full border border-white/20 transition-all shadow-lg flex items-center gap-2"
            >
              <ExternalLink className="h-5 w-5 text-white" />
              <span className="text-white text-xs font-bold pr-1">Navigasyon</span>
            </button>
          </div>

          {/* Right Side Buttons: Target */}
          <div className="flex gap-2 pointer-events-auto">
            {/* Hedefi Ortala Button */}
            <button 
              onClick={handleHedefOrtala}
              aria-label="Hedefi ortala"
              className="bg-red-600/80 hover:bg-red-500 backdrop-blur-md p-2.5 rounded-full border border-white/20 transition-all shadow-lg flex items-center gap-2"
            >
              <span className="text-white text-xs font-bold pl-1 hidden sm:inline">Hedef</span>
              <Target className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Task Info Overlay (Click to toggle map) */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (isExpanded && onCollapse) onCollapse();
            else if (!isExpanded && onExpand) onExpand();
          }}
          className="bg-black/75 hover:bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 flex flex-col pointer-events-auto cursor-pointer transition-colors active:scale-[0.99]"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-2">
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Aktif Hedef</p>
              <h2 className="text-white text-lg font-extrabold leading-tight tracking-tight break-words">
                {address}
              </h2>
            </div>
            {distance !== null && (
              <div className="bg-white/10 px-2 py-1 rounded text-right shrink-0">
                <p className="text-[9px] text-gray-400 uppercase tracking-wider">Uzaklık</p>
                <p className="text-white font-mono text-xs font-bold">{formatDistance(distance)}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${prio.bg} ${prio.text}`}>
              Aciliyet: {prio.label}
            </span>
            {status && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400">
                {STATUS_LABELS[status] ?? status}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
