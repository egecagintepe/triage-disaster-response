#!/usr/bin/env bash
# ============================================================================
# TRIAGE — Linux/macOS Auto-Start Script
# ============================================================================
# Detects LAN IP, updates frontend .env files, starts all 3 services.
#
# Usage:
#   chmod +x start_linux.sh
#   ./start_linux.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
ADMIN_DIR="$SCRIPT_DIR/frontend/admin"
FIELD_DIR="$SCRIPT_DIR/frontend/field"

echo "=================================================="
echo "  TRIAGE — Linux Auto-Start Script"
echo "=================================================="
echo ""

# ====================================================
# 1. Detect LAN IP
# ====================================================
echo "[1/5] Detecting LAN IP address..."

LAN_IP=""

# Try hostname -I first (Linux)
if command -v hostname &> /dev/null; then
    for ip in $(hostname -I 2>/dev/null || true); do
        case "$ip" in
            192.168.*|10.*|172.*|169.254.*)
                LAN_IP="$ip"
                break
                ;;
        esac
    done
fi

# Fallback: ip route (Linux)
if [ -z "$LAN_IP" ] && command -v ip &> /dev/null; then
    LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") print $(i+1)}' || true)
fi

# Fallback: ifconfig (macOS)
if [ -z "$LAN_IP" ] && command -v ifconfig &> /dev/null; then
    LAN_IP=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1 || true)
fi

if [ -z "$LAN_IP" ]; then
    echo "[WARN] No LAN IP found. Using 127.0.0.1"
    LAN_IP="127.0.0.1"
fi

echo "[OK] Using LAN IP: $LAN_IP"
echo ""

# ====================================================
# 2. Update frontend .env files
# ====================================================
echo "[2/5] Updating frontend .env files..."

cat > "$ADMIN_DIR/.env" << EOF
VITE_API_URL=http://${LAN_IP}:8000
VITE_WS_URL=ws://${LAN_IP}:8000
EOF
echo "      Admin .env -> http://${LAN_IP}:8000"

cat > "$FIELD_DIR/.env" << EOF
VITE_API_URL=http://${LAN_IP}:8000
VITE_WS_URL=ws://${LAN_IP}:8000
EOF
echo "      Field .env -> http://${LAN_IP}:8000"

echo "[OK] Frontend .env files updated"
echo ""

# ====================================================
# 3. Install dependencies if needed
# ====================================================
echo "[3/5] Checking dependencies..."

if [ ! -d "$ADMIN_DIR/node_modules" ]; then
    echo "      Installing admin deps..."
    (cd "$ADMIN_DIR" && npm install --silent)
fi

if [ ! -d "$FIELD_DIR/node_modules" ]; then
    echo "      Installing field deps..."
    (cd "$FIELD_DIR" && npm install --silent)
fi

echo "[OK] Dependencies ready"
echo ""

# ====================================================
# 4. Start Backend
# ====================================================
echo "[4/5] Starting Backend on 0.0.0.0:8000..."

cd "$BACKEND_DIR"

# Activate venv if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

uvicorn main:app --host 0.0.0.0 --port 8000 --reload --proxy-headers --forwarded-allow-ips "*" &
BACKEND_PID=$!
echo "[OK] Backend PID: $BACKEND_PID"

sleep 2
echo ""

# ====================================================
# 5. Start Frontends
# ====================================================
echo "[5/5] Starting Frontend dev servers..."

(cd "$ADMIN_DIR" && npm run dev -- --host 0.0.0.0 --port 5173) &
ADMIN_PID=$!
echo "[OK] Admin (Komuta) PID: $ADMIN_PID — port 5173"

(cd "$FIELD_DIR" && npm run dev -- --host 0.0.0.0 --port 5174) &
FIELD_PID=$!
echo "[OK] Field (Saha) PID: $FIELD_PID — port 5174"

# ====================================================
# Summary
# ====================================================
echo ""
echo "=================================================="
echo "  ALL SERVICES STARTED"
echo "=================================================="
echo ""
echo "  LAN IP:     $LAN_IP"
echo ""
echo "  Backend:    http://${LAN_IP}:8000/docs"
echo "  Admin:      http://${LAN_IP}:5173"
echo "  Field:      http://${LAN_IP}:5174"
echo ""
echo "  Share these URLs with your team!"
echo "  Phones: http://${LAN_IP}:5174"
echo "  PCs:    http://${LAN_IP}:5173"
echo ""
echo "  Press Ctrl+C to stop all services."
echo "=================================================="

# Trap Ctrl+C to kill all background processes
cleanup() {
    echo ""
    echo "[STOP] Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $ADMIN_PID 2>/dev/null || true
    kill $FIELD_PID 2>/dev/null || true
    echo "[OK] All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait
