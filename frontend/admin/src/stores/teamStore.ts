/**
 * TRIAGE — Team Store (Admin)
 *
 * Zustand store with persist middleware for team/device state management.
 * The admin dashboard needs real-time visibility into all field teams.
 *
 * Reference: architecture.md Section 4.1.1
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, queueForSync, type Team } from '../services/localDb';

interface TeamState {
  teams: Team[];

  /* Actions */
  setTeams: (teams: Team[]) => void;
  addTeam: (team: Team) => void;
  updateTeam: (team: Partial<Team> & { id: number }) => void;
  removeTeam: (teamId: number) => void;

  updateTeamStatus: (teamId: number, status: Team['status']) => Promise<void>;
  setTeamLocation: (teamId: number, lat: number, lng: number) => Promise<void>;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      teams: [],

      setTeams: (teams) => set({ teams }),

      addTeam: (team) =>
        set((state) => ({ teams: [...state.teams, team] })),

      updateTeam: (updatedTeam) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t,
          ),
        })),

      removeTeam: (teamId) =>
        set((state) => ({
          teams: state.teams.filter((t) => t.id !== teamId),
        })),

      /**
       * Optimistic team status update.
       */
      updateTeamStatus: async (teamId, status) => {
        // 1. Optimistic UI
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, status } : t,
          ),
        }));

        // 2. Persist to Dexie
        try {
          await db.teams.update(teamId, { status });
        } catch (e) {
          console.error('[TeamStore] Dexie persist failed:', e);
        }

        // 3. Queue for sync
        try {
          await queueForSync('teams', 'update', { id: teamId, status });
        } catch (e) {
          console.error('[TeamStore] Sync queue failed:', e);
        }
      },

      /**
       * Update team GPS coordinates (typically from WebSocket location updates).
       * HOTFIX: Throttle Dexie writes to max once per 10s per team to prevent QuotaExceededError.
       */
      setTeamLocation: async (teamId, lat, lng) => {
        // Always update Zustand (in-memory, instant UI)
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, current_lat: lat, current_lng: lng } : t,
          ),
        }));

        // Throttle Dexie persist — max once per 10s per team
        const now = Date.now();
        const key = `_loc_persist_${teamId}`;
        const last = (window as any)[key] ?? 0;
        if (now - last < 10_000) return; // Skip — too soon
        (window as any)[key] = now;

        try {
          await db.teams.update(teamId, { current_lat: lat, current_lng: lng });
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
      name: 'triage-admin-teams',
    },
  ),
);
