#!/usr/bin/env bash
# Ubuntu Deploy System - Stop

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .pid ]; then
    echo "No PID file found. Application may not be running."
    exit 0
fi

PID=$(cat .pid)
if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping application (PID: $PID)..."
    kill "$PID"
    sleep 2
    if kill -0 "$PID" 2>/dev/null; then
        echo "Force killing..."
        kill -9 "$PID"
    fi
    echo "Stopped."
else
    echo "Process $PID is not running."
fi

rm -f .pid
