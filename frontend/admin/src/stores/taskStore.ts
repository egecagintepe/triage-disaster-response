/**
 * TRIAGE — Task Store (Admin)
 *
 * Zustand store with persist middleware for task state management.
 * Implements optimistic UI updates: local state is updated immediately,
 * then persisted to Dexie, then queued for server sync.
 *
 * Reference: architecture.md Section 4.1.1
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, queueForSync, type Task } from '../services/localDb';
import { useTeamStore } from './teamStore';

interface TaskState {
  tasks: Task[];
  activeTask: Task | null;

  /* Actions */
  setTasks: (tasks: Task[]) => void;
  setActiveTask: (task: Task | null) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Partial<Task> & { id: number }) => void;
  removeTask: (taskId: number) => void;

  completeTask: (taskId: number, status: Task['status']) => Promise<void>;
  autoDispatch: () => Promise<number>;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeTask: null,

      setTasks: (tasks) => set({ tasks: [...tasks] }),

      setActiveTask: (task) => set({ activeTask: task ? { ...task } : null }),

      addTask: (newTask) =>
        set((state) => {
          const existingIndex = state.tasks.findIndex(t => t.id === newTask.id);
          if (existingIndex > -1) {
            const updated = [...state.tasks];
            updated[existingIndex] = { ...updated[existingIndex], ...newTask };
            return { tasks: updated };
          }
          return { tasks: [...state.tasks, { ...newTask }] };
        }),

      updateTask: (updatedTask) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === updatedTask.id ? { ...t, ...updatedTask } : t,
          ),
          activeTask:
            state.activeTask?.id === updatedTask.id
              ? { ...state.activeTask, ...updatedTask }
              : state.activeTask,
        })),

      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== taskId),
          activeTask:
            state.activeTask?.id === taskId ? null : state.activeTask,
        })),

      /**
       * Optimistic task completion:
       * 1. Update Zustand state immediately (UI reflects change)
       * 2. Persist to Dexie (survives page refresh)
       * 3. Queue for server sync (will push when online)
       */
      completeTask: async (taskId, status) => {
        const timestamp = Date.now();

        // 1. Optimistic UI update (immutable)
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, status, local_updated_at: timestamp } : t,
          ),
          activeTask:
            state.activeTask?.id === taskId
              ? { ...state.activeTask, status, local_updated_at: timestamp }
              : state.activeTask,
        }));

        const state = get();
        const taskToComplete = state.tasks.find(t => t.id === taskId);
        if (taskToComplete?.assigned_team_id && ['completed', 'resolved', 'cancelled', 'false_alarm'].includes(status)) {
          useTeamStore.getState().updateTeamStatus(taskToComplete.assigned_team_id, 'idle');
          try {
            await db.teams.update(taskToComplete.assigned_team_id, { status: 'idle' });
            await queueForSync('teams', 'update', { id: taskToComplete.assigned_team_id, status: 'idle' });
          } catch(e) {}
        }

        // 2. Persist to Dexie
        try {
          await db.tasks.update(taskId, {
            status,
            local_updated_at: timestamp,
          });
        } catch (e) {
          console.error('[TaskStore] Dexie persist failed:', e);
        }

        // 3. Queue for server sync
        try {
          await queueForSync('tasks', 'update', {
            id: taskId,
            status,
            local_updated_at: timestamp,
          });
        } catch (e) {
          console.error('[TaskStore] Sync queue failed:', e);
        }
      },

      /**
       * Auto-dispatch: Match idle teams to unassigned critical tasks.
       * Uses fully immutable state updates so the map reacts instantly.
       */
      autoDispatch: async () => {
        const teamsStore = useTeamStore.getState();
        const currentTeams = [...teamsStore.teams.map(t => ({ ...t }))];
        const currentTasks = [...get().tasks.map(t => ({ ...t }))];

        const idleTeams = currentTeams.filter(t => t.status === 'idle');
        const unassignedTasks = currentTasks
          .filter(t => t.status === 'pending' || t.status === 'pending_approval')
          .sort((a, b) => {
            const p: Record<string, number> = { 'KRİTİK': 4, 'CRITICAL': 4, 'RED': 4, 'YÜKSEK': 3, 'HIGH': 3, 'ORTA': 2, 'DÜŞÜK': 1 };
            return (p[b.priority] || 0) - (p[a.priority] || 0);
          });

        let assignedCount = 0;
        const timestamp = Date.now();
        let idleIdx = 0;

        for (const task of unassignedTasks) {
          if (idleIdx >= idleTeams.length) break;
          const team = idleTeams[idleIdx];
          idleIdx++;

          // Update task in our copy
          const taskIndex = currentTasks.findIndex(t => t.id === task.id);
          if (taskIndex !== -1) {
            currentTasks[taskIndex] = {
              ...currentTasks[taskIndex],
              status: 'assigned',
              assigned_team_id: team.id,
              local_updated_at: timestamp,
            };

            // Update team in our copy
            const teamIndex = currentTeams.findIndex(t => t.id === team.id);
            if (teamIndex !== -1) {
              currentTeams[teamIndex] = { ...currentTeams[teamIndex], status: 'assigned' };
            }

            // Persist async (non-blocking for UI)
            db.tasks.update(task.id, { status: 'assigned', assigned_team_id: team.id, local_updated_at: timestamp }).catch(console.error);
            queueForSync('tasks', 'update', { id: task.id, status: 'assigned', assigned_team_id: team.id, local_updated_at: timestamp }).catch(console.error);
            db.teams.update(team.id, { status: 'assigned' }).catch(console.error);
            queueForSync('teams', 'update', { id: team.id, status: 'assigned' }).catch(console.error);

            assignedCount++;
          }
        }

        // Immutable set for both stores — triggers re-render
        set({ tasks: [...currentTasks] });
        teamsStore.setTeams([...currentTeams]);

        return assignedCount;
      },
    }),
    {
      name: 'triage-admin-tasks',
    },
  ),
);
