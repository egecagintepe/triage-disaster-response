#!/usr/bin/env bash
# ============================================================================
# TRIAGE — Bare-Metal Deployment Script
# ============================================================================
# Target: Linux Master Node (Raspberry Pi / Mini-PC / Any Debian/Ubuntu)
#
# This script:
#   1. Installs system dependencies (Python, Node, Nginx)
#   2. Sets up the Python virtual environment + backend
#   3. Builds both Vite frontend apps
#   4. Generates systemd service files for auto-start
#   5. Generates Nginx config (admin:8080, field:8081, API proxy:8000)
#   6. Enables and starts all services
#
# Usage:
#   chmod +x scripts/setup_server.sh
#   sudo ./scripts/setup_server.sh
#
# ============================================================================

set -euo pipefail

# --- Configuration ---
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
ADMIN_DIR="$PROJECT_DIR/frontend/admin"
FIELD_DIR="$PROJECT_DIR/frontend/field"

BACKEND_PORT=8000
ADMIN_PORT=8080
FIELD_PORT=8081

SERVICE_USER="${SUDO_USER:-$(whoami)}"
PYTHON_BIN="python3"
NODE_BIN="node"
NPM_BIN="npm"

echo "=============================================="
echo "  TRIAGE — Bare-Metal Deployment"
echo "=============================================="
echo "Project: $PROJECT_DIR"
echo "User:    $SERVICE_USER"
echo ""

# --- 1. System Dependencies ---
echo "[1/6] Checking system dependencies..."

install_if_missing() {
    if ! command -v "$1" &> /dev/null; then
        echo "  Installing $2..."
        apt-get update -qq
        apt-get install -y -qq "$2"
    else
        echo "  ✓ $1 found"
    fi
}

install_if_missing python3 python3
install_if_missing pip3 python3-pip
install_if_missing node nodejs
install_if_missing npm npm
install_if_missing nginx nginx
install_if_missing python3-venv python3-venv 2>/dev/null || true

echo ""

# --- 2. Backend Setup ---
echo "[2/6] Setting up Python backend..."

cd "$BACKEND_DIR"

if [ ! -d "venv" ]; then
    echo "  Creating virtual environment..."
    $PYTHON_BIN -m venv venv
fi

echo "  Installing Python dependencies..."
./venv/bin/pip install -q -r requirements.txt

# Create data directory for SQLite
mkdir -p "$BACKEND_DIR/data"

# Create .env if not exists
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "  Creating .env from example..."
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env" 2>/dev/null || \
    cat > "$BACKEND_DIR/.env" << 'ENVEOF'
DATABASE_URL=sqlite+aiosqlite:///./data/triage.db
SECRET_KEY=$(openssl rand -hex 32)
GEMINI_API_KEY=
AFAD_API_URL=https://api.afad.gov.tr/v1
CORS_ORIGINS=*
ENVEOF
fi

echo "  ✓ Backend ready"
echo ""

# --- 3. Build Frontends ---
echo "[3/6] Building frontend applications..."

echo "  Building Admin (Komuta)..."
cd "$ADMIN_DIR"
$NPM_BIN install --silent 2>/dev/null
$NPM_BIN run build

echo "  Building Field (Saha)..."
cd "$FIELD_DIR"
$NPM_BIN install --silent 2>/dev/null
$NPM_BIN run build

echo "  ✓ Both frontends built"
echo ""

# --- 4. Systemd Service ---
echo "[4/6] Creating systemd service..."

cat > /etc/systemd/system/triage-backend.service << SVCEOF
[Unit]
Description=TRIAGE FastAPI Backend
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/venv/bin:/usr/local/bin:/usr/bin"
ExecStart=$BACKEND_DIR/venv/bin/uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT --workers 1
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable triage-backend.service

echo "  ✓ triage-backend.service created"
echo ""

# --- 5. Nginx Configuration ---
echo "[5/6] Configuring Nginx..."

cat > /etc/nginx/sites-available/triage << NGXEOF
# TRIAGE — Admin Dashboard (port $ADMIN_PORT)
server {
    listen $ADMIN_PORT;
    server_name _;

    root $ADMIN_DIR/dist;
    index index.html;

    # PWA Service Worker
    location /sw.js {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # WebSocket Proxy
    location /ws {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json;
}

# TRIAGE — Field App (port $FIELD_PORT)
server {
    listen $FIELD_PORT;
    server_name _;

    root $FIELD_DIR/dist;
    index index.html;

    # PWA Service Worker
    location /sw.js {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # WebSocket Proxy
    location /ws {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }

    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json;
}
NGXEOF

# Enable site
ln -sf /etc/nginx/sites-available/triage /etc/nginx/sites-enabled/triage
# Remove default if exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

echo "  ✓ Nginx configured (admin:$ADMIN_PORT, field:$FIELD_PORT)"
echo ""

# --- 6. Start Services ---
echo "[6/6] Starting services..."

systemctl restart triage-backend.service
systemctl restart nginx

echo ""
echo "=============================================="
echo "  ✅ TRIAGE Deployment Complete!"
echo "=============================================="
echo ""
echo "  Backend API:    http://0.0.0.0:$BACKEND_PORT"
echo "  Admin (Komuta): http://0.0.0.0:$ADMIN_PORT"
echo "  Field (Saha):   http://0.0.0.0:$FIELD_PORT"
echo ""
echo "  Service status: systemctl status triage-backend"
echo "  Logs:           journalctl -u triage-backend -f"
echo ""
echo "  ⚡ LAN Access: connect devices to same WiFi/hotspot"
echo "     and navigate to this machine's IP address."
echo "=============================================="
