"""
Simulation script for E2E testing of the TRIAGE WebSocket & Sync Bridge.
This script acts as a simulated field client, connecting to the FastAPI backend,
performing a handshake, and waiting for an incoming task assignment.

Usage:
  python scripts/simulate_field_client.py
"""

import asyncio
import json
import uuid
from websockets.asyncio.client import connect


async def simulate_client():
    device_id = f"SIM-FIELD-{uuid.uuid4().hex[:6]}"
    uri = f"ws://localhost:8000/ws/{device_id}"

    print(f"[*] Starting Field Client Simulator: {device_id}")
    print(f"[*] Connecting to {uri}...")

    try:
        async with connect(uri) as websocket:
            print("[+] Connected to Master Node WebSocket Hub!")

            # Simulate the "Pass-to-Local" Handshake (Initial Sync)
            sync_request = {
                "type": "SYNC_REQUEST",
                "device_id": device_id,
                "last_sync_timestamp": 0,
                "pending_changes": []
            }
            print("[*] Sending SYNC_REQUEST (Empty Outbox)...")
            await websocket.send(json.dumps(sync_request))

            # Wait for response and real-time events
            while True:
                message_str = await websocket.recv()
                message = json.loads(message_str)
                msg_type = message.get("type")

                print(f"\n[INCOMING] <=== Received {msg_type}")

                if msg_type == "SYNC_RESPONSE":
                    changes = message.get("changes", [])
                    print(f"    - Received initial sync state with {len(changes)} changes.")
                    print("    - State stored in simulated Dexie.js db.")

                elif msg_type == "NEW_TASK_ASSIGNMENT":
                    task_id = message.get("task_id")
                    priority = message.get("priority")
                    print(f"    - 🚨 REAL-TIME ALERT: New {priority} task assigned (ID: {task_id})!")
                    print("    - Writing to local storage...")
                    print("    - Updating UI state...")

                elif msg_type == "TASK_UPDATE":
                    task_data = message.get("data", {})
                    task_id = task_data.get("id")
                    status = task_data.get("status")
                    print(f"    - 🔄 REAL-TIME UPDATE: Task {task_id} status changed to {status}.")

                elif msg_type == "BROADCAST":
                    print(f"    - 📢 SYSTEM BROADCAST: {message.get('message')}")

    except Exception as e:
        print(f"[-] Connection Error: {e}")
        print("[-] Ensure the backend is running on ws://localhost:8000")


if __name__ == "__main__":
    try:
        asyncio.run(simulate_client())
    except KeyboardInterrupt:
        print("\n[*] Simulation terminated by user.")
