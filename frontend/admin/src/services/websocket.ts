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

import ReconnectingWebSocket from 'reconnecting-websocket';
import { db } from './localDb';
import { WS_BASE } from './api';
import { syncQueue } from './syncQueue';
import { useTaskStore } from '../stores/taskStore';
import { useTeamStore } from '../stores/teamStore';

class WebSocketManager {
  private socket: ReconnectingWebSocket | null = null;
  private deviceId: string = '';
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
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    window.dispatchEvent(new CustomEvent('ws_status_change', { detail: false }));
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
      this.socket = new ReconnectingWebSocket(url, [], {
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 50,
      });
    } catch (err) {
      console.error('[WS] Failed to create socket:', err);
      return;
    }

    this.socket.addEventListener('open', () => {
      console.log('[WS] Connected');
      window.dispatchEvent(new CustomEvent('ws_status_change', { detail: true }));
      this.performFullSync();
    });

    this.socket.addEventListener('close', (ev) => {
      console.log(`[WS] Closed (code=${ev.code})`);
      window.dispatchEvent(new CustomEvent('ws_status_change', { detail: false }));
    });

    this.socket.addEventListener('error', (ev) => {
      console.error('[WS] Error:', ev);
    });

    this.socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg || typeof msg !== 'object') return;
        this.handleMessage(msg);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Message handling                                                 */
  /* ---------------------------------------------------------------- */

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    if (!msg || !msg.type) return;
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

      case 'ZONE_UPDATE':
        await this.handleZoneUpdate(msg.data as Record<string, unknown>);
        break;

      case 'DEVICE_LOCATION':
        this.handleDeviceLocation(msg);
        break;

      case 'DEVICE_TELEMETRY':
        this.handleDeviceTelemetry(msg);
        break;

      case 'TEAM_PRESENCE':
        this.handleTeamPresence(msg.data as Record<string, unknown> || msg);
        break;

      case 'BROADCAST':
        console.log(`[WS] Broadcast: ${msg.message}`);
        window.dispatchEvent(new CustomEvent('ws_broadcast', { detail: msg }));
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

  private async handleZoneUpdate(data: Record<string, unknown>): Promise<void> {
    if (!data || !data.id) return;
    try {
      await db.zones.put(data as any);
      // Direct Zustand store update for instant UI reactivity (cherry-picked from proje_kopyasi)
      const { useZoneStore } = await import('../stores/zoneStore');
      const store = useZoneStore.getState();
      const zoneId = String(data.id);
      const priorityScore = (data.priority_score as number) ?? 3.0;
      const type = priorityScore >= 4.0 ? 'URGENT' : priorityScore >= 2.5 ? 'MEDIUM' : 'SAFE';
      const geo = data.geometry as any;
      const points = geo?.coordinates?.[0]?.map((c: number[]) => [c[1], c[0]]) || [];
      
      const existing = store.zones.findIndex(z => z.id === zoneId);
      const riskZone = { id: zoneId, type, score: Math.round(priorityScore * 20), points } as any;
      
      if (existing >= 0) {
        const updated = [...store.zones];
        updated[existing] = riskZone;
        store.setZones(updated);
      } else {
        store.setZones([...store.zones, riskZone]);
      }
    } catch (e) {
      console.error('[WS] Failed to save zone update:', e);
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

  private handleDeviceTelemetry(msg: Record<string, unknown>): void {
    const deviceId = msg.device_id as string;
    const lat = msg.lat as number;
    const lng = msg.lng as number;
    const battery = msg.battery as number;

    const teams = useTeamStore.getState().teams;
    const team = teams.find((t) => t.device_id === deviceId);
    if (team) {
      useTeamStore.getState().setTeamLocation(team.id, lat, lng);
      // Dispatch battery event for UI consumption
      window.dispatchEvent(new CustomEvent('device_battery', {
        detail: { deviceId, battery: Math.round(battery * 100) }
      }));
    }
  }

  private handleTeamPresence(msg: Record<string, unknown>): void {
    const data = (msg.data ?? msg) as Record<string, unknown>;
    const teamDeviceId = (data.team_id ?? data.device_id) as string;
    const status = data.status as string;
    const isOnline = status === 'ONLINE' || status === 'idle' || data.is_online === true;
    
    const store = useTeamStore.getState();
    const existing = store.teams.find((t) => t.device_id === teamDeviceId);
    
    if (existing) {
      // Update existing team
      store.updateTeam({ ...existing, is_online: isOnline });
      db.teams.update(existing.id, { is_online: isOnline }).catch(console.error);
    } else if (data.id) {
      // New team — auto-register in store + Dexie (cherry-picked from proje_kopyasi)
      const newTeam = {
        id: data.id as number,
        device_id: teamDeviceId,
        device_ip: (data.device_ip as string) || 'unknown',
        name: (data.name as string) || teamDeviceId,
        status: 'idle' as const,
        is_online: isOnline,
      };
      store.addTeam(newTeam);
      db.teams.put(newTeam).catch(console.error);
      console.log(`[WS] New team registered: ${newTeam.name} (${newTeam.device_id})`);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reconnection                                                     */
  /* ---------------------------------------------------------------- */
}

export const wsManager = new WebSocketManager();
