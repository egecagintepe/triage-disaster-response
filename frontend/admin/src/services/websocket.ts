/**
 * TRIAGE V2 — WebSocket Client (Admin)
 *
 * Native WebSocket client with automatic reconnection.
 * When the server pushes task/team updates, this service:
 *   1. Writes the change to the local Dexie DB
 *   2. Updates the Zustand store (so React re-renders)
 *
 * Reference: architecture.md Section 8.2
 */

import { db } from './localDb';
import { WS_BASE } from './api';
import { syncQueue } from './syncQueue';
import { useTaskStore } from '../stores/taskStore';
import { useTeamStore } from '../stores/teamStore';

const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 50;

class WebSocketManager {
  private socket: WebSocket | null = null;
  private deviceId: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  /* ---------------------------------------------------------------- */
  /*  Connection lifecycle                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Open a WebSocket connection to the master node.
   */
  connect(deviceId: string): void {
    this.deviceId = deviceId;
    this.intentionalClose = false;
    this.openSocket();
  }

  /**
   * Gracefully close the connection.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    console.log('[WS] Disconnected');
  }

  /**
   * True if the WebSocket is currently connected and open.
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a JSON message to the server.
   */
  send(message: Record<string, unknown>): void {
    if (!this.isConnected) {
      console.warn('[WS] Cannot send — not connected');
      return;
    }
    this.socket!.send(JSON.stringify(message));
  }

  /* ---------------------------------------------------------------- */
  /*  Full sync on reconnection                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Push local offline changes and pull server updates.
   * Called automatically whenever a connection is (re)established.
   */
  private async performFullSync(): Promise<void> {
    // 1. Push any pending offline changes via the sync queue
    await syncQueue.processQueue();

    // 2. Pull server updates since last sync
    const lastSync = await db.settings.get('last_sync_timestamp');
    this.send({
      type: 'SYNC_REQUEST',
      device_id: this.deviceId,
      last_sync_timestamp: lastSync?.value ?? 0,
      pending_changes: [],  // Already pushed via REST in step 1
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Internal: socket wiring                                          */
  /* ---------------------------------------------------------------- */

  private openSocket(): void {
    const url = `${WS_BASE}/ws/${this.deviceId}`;
    console.log(`[WS] Connecting to ${url}…`);

    try {
      this.socket = new WebSocket(url);
    } catch (err) {
      console.error('[WS] Failed to create socket:', err);
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.performFullSync();
    };

    this.socket.onclose = (ev) => {
      console.log(`[WS] Closed (code=${ev.code})`);
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (ev) => {
      console.error('[WS] Error:', ev);
      // onclose will fire right after — reconnect handled there
    };

    this.socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Message handling                                                 */
  /* ---------------------------------------------------------------- */

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    const type = msg.type as string;

    switch (type) {
      case 'SYNC_RESPONSE':
        await this.handleSyncResponse(msg);
        break;

      case 'TASK_UPDATE':
        await this.handleTaskUpdate(msg.data as Record<string, unknown>);
        break;

      case 'NEW_TASK':
      case 'NEW_TASK_ASSIGNMENT':
        await this.handleNewTask(msg.data as Record<string, unknown>);
        break;

      case 'DEVICE_LOCATION':
        this.handleDeviceLocation(msg);
        break;

      case 'BROADCAST':
        console.log(`[WS] Broadcast: ${msg.message}`);
        break;

      case 'ping':
        this.send({ type: 'pong' });
        break;

      default:
        console.log(`[WS] Unknown message type: ${type}`);
    }
  }

  private async handleSyncResponse(msg: Record<string, unknown>): Promise<void> {
    const changes = (msg.changes ?? []) as Array<Record<string, unknown>>;
    const conflicts = (msg.conflicts ?? []) as Array<Record<string, unknown>>;

    for (const change of changes) {
      const entity = change.entity as string;
      const operation = change.operation as string;
      const data = change.data as Record<string, unknown>;

      if (entity === 'task') {
        if (operation === 'create') {
          await db.tasks.put(data as any);
          useTaskStore.getState().addTask(data as any);
        } else if (operation === 'update') {
          await db.tasks.update(data.id as number, data as any);
          useTaskStore.getState().updateTask(data as any);
        }
      } else if (entity === 'team') {
        if (operation === 'update') {
          await db.teams.update(data.id as number, data as any);
          useTeamStore.getState().updateTeam(data as any);
        }
      }
    }

    // Conflicts — server wins (Strategy 1)
    for (const conflict of conflicts) {
      const serverData = (conflict.server_data ?? conflict) as any;
      if (serverData.id) {
        await db.tasks.update(serverData.id, serverData);
        useTaskStore.getState().updateTask(serverData);
      }
    }

    // Update last sync timestamp
    await db.settings.put({
      key: 'last_sync_timestamp',
      value: Date.now(),
    });
  }

  private async handleTaskUpdate(data: Record<string, unknown>): Promise<void> {
    if (!data || !data.id) return;
    try {
      await db.tasks.update(data.id as number, data as any);
      useTaskStore.getState().updateTask(data as any);
    } catch (e) {
      // Task might not exist locally yet — put it
      await db.tasks.put(data as any);
      useTaskStore.getState().addTask(data as any);
    }
  }

  private async handleNewTask(data: Record<string, unknown>): Promise<void> {
    if (!data || !data.id) return;
    await db.tasks.put(data as any);
    useTaskStore.getState().addTask(data as any);

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Yeni Görev!', {
        body: `${data.priority} öncelikli görev: ${data.address ?? 'Adres bilgisi yok'}`,
      });
    }
  }

  private handleDeviceLocation(msg: Record<string, unknown>): void {
    const deviceId = msg.device_id as string;
    const lat = msg.lat as number;
    const lng = msg.lng as number;

    // Find team by device_id and update location in store
    const teams = useTeamStore.getState().teams;
    const team = teams.find((t) => t.device_id === deviceId);
    if (team) {
      useTeamStore.getState().setTeamLocation(team.id, lat, lng);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reconnection                                                     */
  /* ---------------------------------------------------------------- */

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );

    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1})`);
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const wsManager = new WebSocketManager();
