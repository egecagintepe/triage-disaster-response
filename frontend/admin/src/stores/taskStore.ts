/**
 * TRIAGE V2 — Task Store (Admin)
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
  updateTask: (task: Partial<Task> & { id: number }) => void;
  removeTask: (taskId: number) => void;

  completeTask: (taskId: number, status: Task['status']) => Promise<void>;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeTask: null,

      setTasks: (tasks) => set({ tasks }),

      setActiveTask: (task) => set({ activeTask: task }),

      addTask: (task) =>
        set((state) => ({ tasks: [...state.tasks, task] })),

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
    }),
    {
      name: 'triage-admin-tasks',
    },
  ),
);
