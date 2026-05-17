import { create } from 'zustand';
import { RiskZone } from '../types';

interface ZoneState {
  zones: RiskZone[];
  setZones: (zones: RiskZone[]) => void;
  addZone: (zone: RiskZone) => void;
  updateZone: (zone: RiskZone) => void;
  deleteZone: (id: string) => void;
}

export const useZoneStore = create<ZoneState>((set) => ({
  zones: [],
  setZones: (zones) => set({ zones }),
  addZone: (zone) => set((state) => ({ zones: [...state.zones, zone] })),
  updateZone: (zone) => set((state) => ({ zones: state.zones.map((z) => (z.id === zone.id ? zone : z)) })),
  deleteZone: (id) => set((state) => ({ zones: state.zones.filter((z) => z.id !== id) })),
}));
