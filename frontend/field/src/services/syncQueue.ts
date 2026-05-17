/**
 * TRIAGE — Sync Queue (Field)
 *
 * Implements the "Outbox Pattern": all write operations are first saved
 * to a local Dexie `syncQueue` table, then pushed to the backend when
 * the device is online.
 *
 * Reference: architecture.md Section 8.1
 */

import { db } from './localDb';
import { api } from './api';

const MAX_RETRIES = 3;
const AUTO_SYNC_INTERVAL_MS = 30_000; // 30 seconds

class SyncQueue {
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  /* ---------------------------------------------------------------- */
  /*  Public API                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Process all pending (unsynced) operations in FIFO order.
   * Safe to call repeatedly — guards against concurrent runs.
   */
  async processQueue(): Promise<void> {
    if (this.isSyncing) return;
    if (!navigator.onLine) return;

    this.isSyncing = true;
    console.log('[SyncQueue] Processing…');

    try {
      const pending = await db.syncQueue
        .where('synced')
        .equals(0)           // Dexie stores booleans as 0/1 in indexes
        .sortBy('timestamp');

      for (const op of pending) {
        try {
          await this.syncOperation(op);
          await db.syncQueue.update(op.id!, { synced: true });
          console.log(`[SyncQueue] Synced op #${op.id} (${op.collection}.${op.operation})`);
        } catch (err) {
          const retries = (op.retries ?? 0) + 1;
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (retries >= MAX_RETRIES) {
            console.error(`[SyncQueue] Giving up on op #${op.id} after ${MAX_RETRIES} retries`);
            await db.syncQueue.update(op.id!, {
              synced: true,   // Mark processed (failed)
              failed: true,
              retries,
              last_error: errorMsg,
            });
          } else {
            await db.syncQueue.update(op.id!, {
              retries,
              last_error: errorMsg,
            });
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Start a periodic background sync worker.
   */
  startAutoSync(intervalMs = AUTO_SYNC_INTERVAL_MS): void {
    this.stopAutoSync();
    this.syncInterval = setInterval(() => {
      if (navigator.onLine) {
        this.processQueue();
      }
    }, intervalMs);

    // Also listen for online events to sync immediately
    window.addEventListener('online', this.onOnline);
    console.log(`[SyncQueue] Auto-sync started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop the periodic background sync worker.
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    window.removeEventListener('online', this.onOnline);
  }

  /**
   * Return the count of pending (unsynced, non-failed) operations.
   */
  async pendingCount(): Promise<number> {
    return db.syncQueue
      .where('synced')
      .equals(0)
      .count();
  }

  /* ---------------------------------------------------------------- */
  /*  Internal                                                         */
  /* ---------------------------------------------------------------- */

  private onOnline = (): void => {
    console.log('[SyncQueue] Network restored — flushing queue');
    this.processQueue();
  };

  /**
   * Route a single sync operation to the correct REST endpoint.
   */
  private async syncOperation(op: {
    collection: string;
    operation: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    const { collection, operation, data } = op;

    switch (collection) {
      case 'tasks':
        if (operation === 'update' && data.id) {
          await api.patch(`/api/v1/tasks/${data.id}`, data);
        } else if (operation === 'create') {
          await api.post('/api/v1/tasks', data);
        } else if (operation === 'delete' && data.id) {
          await api.delete(`/api/v1/tasks/${data.id}`);
        }
        break;

      case 'teams':
        if (operation === 'update' && data.id) {
          await api.patch(`/api/v1/teams/${data.id}/status`, data);
        }
        break;

      default:
        console.warn(`[SyncQueue] Unknown collection: ${collection}`);
    }
  }
}

export const syncQueue = new SyncQueue();
