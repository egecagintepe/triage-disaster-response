import { create } from 'zustand';
import { RiskZone } from '../types';

interface ZoneState {
  zones: RiskZone[];
  setZones: (zones: RiskZone[]) => void;
  deleteZone: (id: string) => void;
}

export const useZoneStore = create<ZoneState>((set) => ({
  zones: [],
  setZones: (zones) => set({ zones }),
  deleteZone: (id) => set((state) => ({ zones: state.zones.filter((z) => z.id !== id) })),
}));
