import Dexie, { type Table } from 'dexie';

export interface Task {
  id: string;
  address: string;
  priority: 'Düşük' | 'Orta' | 'Yüksek';
  lat: number;
  lng: number;
  status: 'pending' | 'in_progress' | 'needs_backup' | 're_assigned' | 'completed';
  updatedAt: number;
}

export interface SyncLog {
  id?: number;
  taskId: string;
  status: string;
  timestamp: number;
  synced: boolean;
}

export class FieldOpsDatabase extends Dexie {
  tasks!: Table<Task>;
  logs!: Table<SyncLog>;

  constructor() {
    super('FieldOpsDB');
    this.version(1).stores({
      tasks: 'id, status, updatedAt',
      logs: '++id, taskId, synced'
    });
  }
}

export const db = new FieldOpsDatabase();

// Initial seed data if empty
export async function seedDatabase() {
  const count = await db.tasks.count();
  if (count === 0) {
    await db.tasks.add({
      id: 'task-1',
      address: 'Atatürk Blv. No:42, Ankara',
      priority: 'Yüksek',
      lat: 39.9334,
      lng: 32.8597,
      status: 'pending',
      updatedAt: Date.now()
    });
  }
}
