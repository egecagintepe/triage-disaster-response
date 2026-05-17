/**
 * TRIAGE — Admin (Komuta Merkezi) Local Database
 *
 * Dexie.js wrapper over IndexedDB.  Even the admin dashboard benefits from a
 * local cache so that the UI remains responsive while the server is being
 * queried and to survive brief network interruptions on the LAN.
 *
 * Schema matches architecture.md Section 4.3.2 / Section 5 exactly.
 */

import Dexie, { type Table } from 'dexie';

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces (aligned with backend SQLAlchemy models)    */
/* ------------------------------------------------------------------ */

export interface Task {
  id: number;
  zone_id: number;
  assigned_team_id: number | string | null;
  status: 'pending_approval' | 'pending' | 'assigned' | 'in_progress' | 'needs_backup' | 'false_alarm' | 'resolved';
  priority: 'RED' | 'YELLOW' | 'GREEN';
  lat: number;
  lng: number;
  address: string;
  building_type?: string;
  reported_damage_level?: string;
  created_at?: string;
  updated_at?: string;
  local_updated_at?: number;   // Client-side timestamp for conflict resolution
  assigned_at?: string;
  started_at?: string;
  completed_at?: string;
  notes?: string;
}

export interface Team {
  id: number;
  device_ip: string;
  device_id: string;
  name: string;
  status: 'offline' | 'idle' | 'busy';
  last_seen?: string;
  current_lat?: number;
  current_lng?: number;
  battery_level?: number;
  ping_ms?: number;
  is_online?: boolean;
  created_at?: string;
}

export interface Zone {
  id: number;
  name: string;
  priority_score: number;
  geometry: object;             // GeoJSON polygon
  estimated_casualties?: number;
  building_density?: number;
  population_density?: number;
  infrastructure_risk?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SyncQueueEntry {
  id?: number;                  // Auto-incremented
  collection: string;           // 'tasks' | 'teams' | 'zones'
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
  synced: boolean;
  retries?: number;
  last_error?: string;
  failed?: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
}

/* ------------------------------------------------------------------ */
/*  Database class                                                    */
/* ------------------------------------------------------------------ */

class TriageAdminDB extends Dexie {
  tasks!: Table<Task, number>;
  teams!: Table<Team, number>;
  zones!: Table<Zone, number>;
  syncQueue!: Table<SyncQueueEntry, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('TriageAdminDB');

    this.version(1).stores({
      tasks: 'id, zone_id, assigned_team_id, status, priority, updated_at',
      teams: 'id, device_id, status',
      zones: 'id, priority_score',
      syncQueue: '++id, timestamp, synced',
      settings: 'key',
    });
  }
}

export const db = new TriageAdminDB();

/* ------------------------------------------------------------------ */
/*  Sync queue helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Add an operation to the offline sync outbox.
 */
export async function queueForSync(
  collection: string,
  operation: 'create' | 'update' | 'delete',
  data: Record<string, unknown>,
): Promise<void> {
  await db.syncQueue.add({
    collection,
    operation,
    data,
    timestamp: Date.now(),
    synced: false,
    retries: 0,
  });
}

/**
 * Update a task locally and queue the change for server sync.
 */
export async function updateTaskLocal(
  taskId: number,
  updates: Partial<Task>,
): Promise<void> {
  const timestamp = Date.now();

  await db.tasks.update(taskId, {
    ...updates,
    local_updated_at: timestamp,
  });

  await queueForSync('tasks', 'update', {
    id: taskId,
    ...updates,
    local_updated_at: timestamp,
  });
}
