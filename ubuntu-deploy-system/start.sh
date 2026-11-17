#!/usr/bin/env bash
# ==============================================================================
# Ubuntu Deploy System - Start Script
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f ".env" ]; then
    echo "[ERROR] .env configuration file not found!"
    echo "Please copy .env.example to .env and configure your FOG API tokens."
    exit 1
fi

# Check if already running
if [ -f .pid ] && kill -0 "$(cat .pid)" 2>/dev/null; then
    echo "Application is already running (PID: $(cat .pid))"
    echo "Use ./stop.sh to stop it first."
    exit 1
fi

# Activate venv if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Read port from .env or default to 8000
PORT=$(grep -E '^BACKEND_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 8000)
PORT=${PORT:-8000}

echo "Starting Ubuntu Deploy System on port $PORT..."
nohup python3 -m uvicorn backend.app.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --env-file .env \
    > app.log 2>&1 &

echo $! > .pid
echo "Started successfully (PID: $(cat .pid))"
echo "Log file:   app.log"
echo "Dashboard:  http://192.168.50.10:$PORT"
