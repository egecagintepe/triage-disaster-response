import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import OfflineTileLayer from './OfflineTileLayer';

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  RED:    { bg: 'bg-red-500/20',    text: 'text-red-500',     label: 'YÜKSEK' },
  YELLOW: { bg: 'bg-amber-500/20',  text: 'text-amber-500',   label: 'ORTA' },
  GREEN:  { bg: 'bg-emerald-500/20', text: 'text-emerald-500', label: 'DÜŞÜK' },
  // Legacy Turkish values
  'Yüksek': { bg: 'bg-red-500/20',    text: 'text-red-500',     label: 'YÜKSEK' },
  'Orta':   { bg: 'bg-amber-500/20',  text: 'text-amber-500',   label: 'ORTA' },
  'Düşük':  { bg: 'bg-emerald-500/20', text: 'text-emerald-500', label: 'DÜŞÜK' },
};

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

// Helper component to center map on coordinates
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 15);
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
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'BEKLİYOR',
  assigned: 'ATANDI',
  in_progress: 'DEVAM EDİYOR',
  needs_backup: 'DESTEK GEREKLİ',
  false_alarm: 'YANLIŞ ALARM',
  resolved: 'TAMAMLANDI',
};

export default function TaskMap({ taskLat, taskLng, userLat, userLng, address, priority, status }: TaskMapProps) {
  const prio = PRIORITY_COLORS[priority] || PRIORITY_COLORS['RED'];

  return (
    <div className="relative h-[40vh] shadow-2xl rounded-b-3xl overflow-hidden z-0">
      <MapContainer 
        center={[taskLat, taskLng]} 
        zoom={15} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={false}
      >
        <OfflineTileLayer
          attribution='&copy; OpenStreetMap'
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
        
        <ChangeView center={[taskLat, taskLng]} />
      </MapContainer>

      {/* Task Info Overlay */}
      <div className="absolute bottom-4 left-4 right-4 bg-black/75 backdrop-blur-md p-4 rounded-xl border border-white/10 z-[1000] pointer-events-none">
        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Aktif Hedef</p>
        <h2 className="text-white text-lg font-extrabold leading-tight tracking-tight">
          {address}
        </h2>
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
  );
}
