/**
 * TRIAGE — Task Store (Field / Saha)
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

interface TaskState {
  tasks: Task[];
  activeTask: Task | null;

  /* Actions */
  setTasks: (tasks: Task[]) => void;
  setActiveTask: (task: Task | null) => void;
  addTask: (task: Task) => void;
  removeTask: (taskId: number) => void;
  updateTask: (task: Partial<Task> & { id: number }) => void;

  completeTask: (taskId: number, status: Task['status']) => Promise<void>;
  requestBackup: (taskId: number) => Promise<void>;
  cancelTask: (taskId: number) => Promise<void>;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      activeTask: null,

      setTasks: (tasks) => set({ tasks }),

      setActiveTask: (task) => set({ activeTask: task }),

      addTask: (newTask) =>
        set((state) => {
          const existingIndex = state.tasks.findIndex(t => t.id === newTask.id);
          if (existingIndex > -1) {
            const updated = [...state.tasks];
            updated[existingIndex] = { ...updated[existingIndex], ...newTask };
            return { tasks: updated };
          }
          return { tasks: [...state.tasks, newTask] };
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
          activeTask: state.activeTask?.id === taskId ? null : state.activeTask,
        })),

      /**
       * Optimistic task completion:
       * 1. Update Zustand state immediately (UI reflects change)
       * 2. Persist to Dexie (survives page refresh)
       * 3. Queue for server sync (will push when online)
       */
      completeTask: async (taskId, status) => {
        const timestamp = Date.now();

        // 1. Optimistic UI update
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, status, local_updated_at: timestamp } : t,
          ),
          activeTask:
            state.activeTask?.id === taskId
              ? { ...state.activeTask, status, local_updated_at: timestamp }
              : state.activeTask,
        }));

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
       * Request backup for the current task.
       */
      requestBackup: async (taskId) => {
        const timestamp = Date.now();

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'needs_backup' as const, local_updated_at: timestamp }
              : t,
          ),
          activeTask:
            state.activeTask?.id === taskId
              ? { ...state.activeTask, status: 'needs_backup' as const, local_updated_at: timestamp }
              : state.activeTask,
        }));

        try {
          await db.tasks.update(taskId, {
            status: 'needs_backup',
            local_updated_at: timestamp,
          });
          await queueForSync('tasks', 'update', {
            id: taskId,
            status: 'needs_backup',
            local_updated_at: timestamp,
          });
        } catch (e) {
          console.error('[TaskStore] Backup request failed:', e);
        }
      },

      /**
       * Cancel / mark task as false alarm.
       */
      cancelTask: async (taskId) => {
        const timestamp = Date.now();

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'false_alarm' as const, local_updated_at: timestamp }
              : t,
          ),
          activeTask: null,
        }));

        try {
          await db.tasks.update(taskId, {
            status: 'false_alarm',
            local_updated_at: timestamp,
          });
          await queueForSync('tasks', 'update', {
            id: taskId,
            status: 'false_alarm',
            local_updated_at: timestamp,
          });
        } catch (e) {
          console.error('[TaskStore] Cancel task failed:', e);
        }
      },
    }),
    {
      name: 'triage-field-tasks',
    },
  ),
);
