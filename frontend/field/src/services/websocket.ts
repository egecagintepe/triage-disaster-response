/**
 * TRIAGE — WebSocket Client (Field)
 *
 * Native WebSocket client with automatic reconnection.
 * When the server pushes task/team updates, this service:
 *   1. Writes the change to the local Dexie DB
 *   2. Updates the Zustand store (so React re-renders)
 *
 * Field-specific: also handles NEW_TASK_ASSIGNMENT with vibration
 * and location reporting.
 *
 * Reference: architecture.md Section 8.2
 */

import ReconnectingWebSocket from 'reconnecting-websocket';
import { db } from './localDb';
import { getWsBase } from './api';
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

  connect(deviceId: string): void {
    this.deviceId = deviceId;
    this.intentionalClose = false;
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    window.dispatchEvent(new CustomEvent('ws_status_change', { detail: false }));
    console.log('[WS] Disconnected');
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(message: Record<string, unknown>): void {
    if (!this.isConnected) {
      console.warn('[WS] Cannot send — not connected');
      return;
    }
    this.socket!.send(JSON.stringify(message));
  }

  /**
   * Report device GPS location to the server.
   */
  sendLocation(lat: number, lng: number): void {
    this.send({
      type: 'LOCATION_UPDATE',
      device_id: this.deviceId,
      lat,
      lng,
      timestamp: Date.now(),
    });
  }

  /**
   * Send full telemetry (battery + location) to server.
   */
  sendTelemetry(lat: number, lng: number, battery: number): void {
    this.send({
      type: 'TELEMETRY_UPDATE',
      device_id: this.deviceId,
      lat,
      lng,
      battery,
      timestamp: Date.now(),
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Full sync on reconnection                                        */
  /* ---------------------------------------------------------------- */

  private async performFullSync(): Promise<void> {
    // 1. Push offline changes via REST (sync queue)
    await syncQueue.processQueue();

    // 2. Pull server updates via WebSocket
    const lastSync = await db.settings.get('last_sync_timestamp');
    this.send({
      type: 'SYNC_REQUEST',
      device_id: this.deviceId,
      last_sync_timestamp: lastSync?.value ?? 0,
      pending_changes: [],
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Internal: socket wiring                                          */
  /* ---------------------------------------------------------------- */

  private openSocket(): void {
    const url = `${getWsBase()}/ws/${this.deviceId}`;
    console.log(`[WS] Connecting to ${url}…`);

    try {
      this.socket = new ReconnectingWebSocket(url, [], {
        maxReconnectionDelay: 5000,
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
        await this.handleNewTask(msg.data as Record<string, unknown>, msg);
        break;

      case 'DEVICE_LOCATION':
        // Field devices don't track other devices (admin-only concern)
        break;

      case 'EMERGENCY_ALERT':
        this.handleEmergencyAlert(msg);
        break;

      case 'EMERGENCY_CLEAR':
        window.dispatchEvent(new CustomEvent('emergency_clear'));
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

    // Conflicts — server wins
    for (const conflict of conflicts) {
      const serverData = (conflict.server_data ?? conflict) as any;
      if (serverData.id) {
        await db.tasks.update(serverData.id, serverData);
        useTaskStore.getState().updateTask(serverData);
      }
    }

    await db.settings.put({
      key: 'last_sync_timestamp',
      value: Date.now(),
    });
  }

  /**
   * Extract target device ID from assigned_team_id safely.
   * Backend may send string device_id, integer PK, or populated object.
   */
  private extractTargetId(raw: unknown): string | null {
    if (!raw) return null;
    if (typeof raw === 'object' && raw !== null) {
      return (raw as any).device_id || (raw as any).device_name || String((raw as any).id ?? '');
    }
    return String(raw);
  }

  private async handleTaskUpdate(data: Record<string, unknown>): Promise<void> {
    if (!data || !data.id) return;

    // HOTFIX: Defensive filter — only process tasks assigned to this device
    const myDeviceId = localStorage.getItem('device_name');
    const targetId = this.extractTargetId(data.assigned_team_id);
    if (targetId && targetId !== myDeviceId) {
      // Check if we already have this task locally (it was previously ours)
      const existing = useTaskStore.getState().tasks.find(t => t.id === data.id);
      if (!existing) {
        console.warn(`[WS] Received TASK_UPDATE for team ${targetId}, not mine (${myDeviceId}). Ignoring.`);
        return;
      }
      // If we had it and it's now reassigned away, remove it locally
      await db.tasks.delete(data.id as number);
      useTaskStore.getState().removeTask(data.id as number);
      console.log(`[WS] Task #${data.id} reassigned away from me. Removed locally.`);
      return;
    }

    const existing = useTaskStore.getState().tasks.find(t => t.id === data.id);
    if (existing) {
      // HOTFIX: Deep equality check — skip write if nothing changed
      if (
        existing.status === data.status &&
        existing.priority === data.priority &&
        existing.assigned_team_id === data.assigned_team_id &&
        existing.notes === data.notes
      ) {
        return; // Identical — skip Dexie write to prevent storage spam
      }
      try {
        await db.tasks.update(data.id as number, data as any);
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError' || e?.message?.includes('QuotaExceeded')) {
          console.error('[STORAGE] QuotaExceeded on task update — purging stale cache');
          await db.tasks.clear();
          await db.syncQueue.clear();
        }
        return;
      }
      useTaskStore.getState().updateTask(data as any);
    } else {
      // New task arriving via broadcast — add it
      try {
        await db.tasks.put(data as any);
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError' || e?.message?.includes('QuotaExceeded')) {
          console.error('[STORAGE] QuotaExceeded on task put — purging stale cache');
          await db.tasks.clear();
          await db.syncQueue.clear();
        }
        return;
      }
      useTaskStore.getState().addTask(data as any);
    }
  }

  private async handleNewTask(
    data: Record<string, unknown>,
    msg: Record<string, unknown>,
  ): Promise<void> {
    if (!data || !data.id) return;

    // HOTFIX: Defensive filter — only accept tasks assigned to this device
    const myDeviceId = localStorage.getItem('device_name');
    const targetId = this.extractTargetId(data.assigned_team_id);
    if (targetId && targetId !== myDeviceId) {
      console.warn(`[WS] Received NEW_TASK for team ${targetId}, not mine (${myDeviceId}). Ignoring.`);
      return;
    }

    // HOTFIX: Skip if we already have this exact task
    const existingTask = useTaskStore.getState().tasks.find(t => t.id === data.id);
    if (existingTask) {
      // Already have it — treat as update only if changed
      if (
        existingTask.status === data.status &&
        existingTask.priority === data.priority &&
        existingTask.assigned_team_id === data.assigned_team_id
      ) {
        return; // Identical — skip to prevent storage spam
      }
      try {
        await db.tasks.update(data.id as number, data as any);
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError' || e?.message?.includes('QuotaExceeded')) {
          await db.tasks.clear();
          await db.syncQueue.clear();
        }
        return;
      }
      useTaskStore.getState().updateTask(data as any);
    } else {
      try {
        await db.tasks.put(data as any);
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError' || e?.message?.includes('QuotaExceeded')) {
          await db.tasks.clear();
          await db.syncQueue.clear();
        }
        return;
      }
      useTaskStore.getState().addTask(data as any);
    }

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Yeni Görev!', {
        body: `${data.priority} öncelikli görev: ${data.address ?? 'Adres bilgisi yok'}`,
      });
    }

    // Vibrate on mobile (field-specific)
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  }

  private handleEmergencyAlert(msg: Record<string, unknown>): void {
    // Dispatch event for UI overlay
    window.dispatchEvent(new CustomEvent('emergency_alert', { detail: msg }));

    // Vibrate aggressively
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }

    // Play synthetic alarm beep via Web Audio API (no external files)
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playBeep = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      // Siren pattern: alternating frequencies
      for (let i = 0; i < 6; i++) {
        playBeep(880, ctx.currentTime + i * 0.4, 0.2);
        playBeep(660, ctx.currentTime + i * 0.4 + 0.2, 0.2);
      }
    } catch (e) {
      console.error('[WS] Audio beep failed:', e);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reconnection                                                     */
  /* ---------------------------------------------------------------- */
}

export const wsManager = new WebSocketManager();
