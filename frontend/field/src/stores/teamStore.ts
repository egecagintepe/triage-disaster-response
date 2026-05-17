/**
 * TRIAGE — Team Store (Field / Saha)
 *
 * Zustand store with persist middleware for the field device's own team info.
 * On the field app, "team" primarily refers to this device's own identity,
 * but may also cache nearby teams for coordination.
 *
 * Reference: architecture.md Section 4.1.1
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, type Team } from '../services/localDb';

interface TeamState {
  teams: Team[];
  myTeam: Team | null;

  /* Actions */
  setTeams: (teams: Team[]) => void;
  setMyTeam: (team: Team | null) => void;
  updateTeam: (team: Partial<Team> & { id: number }) => void;

  updateMyStatus: (status: Team['status']) => Promise<void>;
  updateMyLocation: (lat: number, lng: number) => Promise<void>;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      teams: [],
      myTeam: null,

      setTeams: (teams) => set({ teams }),

      setMyTeam: (team) => set({ myTeam: team }),

      updateTeam: (updatedTeam) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t,
          ),
          myTeam:
            state.myTeam?.id === updatedTeam.id
              ? { ...state.myTeam, ...updatedTeam }
              : state.myTeam,
        })),

      /**
       * Update this device's team status.
       */
      updateMyStatus: async (status) => {
        const myTeam = get().myTeam;
        if (!myTeam) return;

        set((state) => ({
          myTeam: state.myTeam ? { ...state.myTeam, status } : null,
        }));

        try {
          await db.teams.update(myTeam.id, { status });
        } catch (e) {
          console.error('[TeamStore] Dexie persist failed:', e);
        }
      },

      /**
       * Update this device's GPS coordinates.
       * HOTFIX: Throttle Dexie writes to max once per 10s to prevent QuotaExceededError.
       */
      updateMyLocation: async (lat, lng) => {
        const myTeam = get().myTeam;
        if (!myTeam) return;

        // Always update Zustand (in-memory, instant UI)
        set((state) => ({
          myTeam: state.myTeam
            ? { ...state.myTeam, current_lat: lat, current_lng: lng }
            : null,
        }));

        // Throttle Dexie persist — max once per 10s
        const now = Date.now();
        const last = (window as any)._field_loc_persist ?? 0;
        if (now - last < 10_000) return; // Skip — too soon
        (window as any)._field_loc_persist = now;

        try {
          await db.teams.update(myTeam.id, {
            current_lat: lat,
            current_lng: lng,
          });
        } catch (e: any) {
          if (e?.name === 'QuotaExceededError' || e?.message?.includes('QuotaExceeded')) {
            console.error('[TeamStore] QuotaExceeded — skipping location persist');
          } else {
            console.error('[TeamStore] Dexie location persist failed:', e);
          }
        }
      },
    }),
    {
      name: 'triage-field-teams',
    },
  ),
);
