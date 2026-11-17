#!/usr/bin/env bash
# Ubuntu Deploy System - Status

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Ubuntu Deploy System Status ==="
echo ""

if [ -f .pid ]; then
    PID=$(cat .pid)
    if kill -0 "$PID" 2>/dev/null; then
        echo "Status:  RUNNING (PID: $PID)"
        PORT=$(grep -E '^BACKEND_PORT=' .env 2>/dev/null | cut -d= -f2 || echo 8000)
        PORT=${PORT:-8000}
        echo "URL:     http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):$PORT"
        echo "Log:     $(realpath app.log 2>/dev/null || echo 'app.log')"
        echo ""
        echo "Last 5 log lines:"
        tail -5 app.log 2>/dev/null || echo "  (no log file)"
    else
        echo "Status:  STOPPED (stale PID file)"
        rm -f .pid
    fi
else
    echo "Status:  STOPPED"
fi
