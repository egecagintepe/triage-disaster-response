import { MapContainer, Marker, Popup, useMap, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  className: 'bg-transparent',
  html: `<div class="w-3 h-3 bg-red-500 rounded-full border border-black shadow-lg shadow-red-500"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const userIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="w-3 h-3 bg-blue-500 rounded-full border border-black shadow-lg shadow-blue-500"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
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
        minZoom={5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        preferCanvas={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; CARTO'
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
