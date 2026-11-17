#!/usr/bin/env bash
# ==============================================================================
# Ubuntu Deploy System - 100% Offline Installer
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo "  Ubuntu Deploy System - Offline Installation"
echo "=========================================================="
echo ""

# 1. Verify Python 3 is installed on the server
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] Python 3 is not found on this system."
    exit 1
fi
echo "[1/4] Python 3 detected: $(python3 --version)"

# 2. Setup Virtual Environment (or fallback to user site-packages)
echo "[2/4] Setting up Python environment..."
USE_VENV=false
if python3 -m venv venv 2>/dev/null; then
    echo "  Virtual environment created at ./venv"
    source venv/bin/activate
    USE_VENV=true
else
    echo "  Notice: python3-venv module not present on server."
    echo "  Proceeding with user-level installation (--user)..."
fi

# 3. Offline Pip Installation from wheels directory
echo "[3/4] Installing Python dependencies from local 'wheels/' folder..."
if [ ! -d "wheels" ] || [ -z "$(ls -A wheels 2>/dev/null)" ]; then
    echo "[ERROR] 'wheels/' folder is missing or empty!"
    exit 1
fi

# Detect how to invoke pip (system pip or standalone wheel)
PIP_CMD="python3 -m pip"
if ! python3 -m pip --version &>/dev/null; then
    PIP_WHL=$(ls wheels/pip-*.whl 2>/dev/null | head -n 1)
    if [ -n "$PIP_WHL" ]; then
        echo "  Notice: pip module missing on server. Using bundled standalone pip wheel: $PIP_WHL"
        PIP_CMD="python3 $PIP_WHL/pip"
    else
        echo "[ERROR] Neither system pip nor bundled pip wheel found."
        exit 1
    fi
fi

# Try installing inside venv or with --break-system-packages (standard for Ubuntu 24.04 offline)
if [ "$USE_VENV" = true ]; then
    $PIP_CMD install --no-index --find-links=wheels -r backend/requirements.txt
else
    $PIP_CMD install --no-index --find-links=wheels -r backend/requirements.txt --user --break-system-packages 2>/dev/null || \
    $PIP_CMD install --no-index --find-links=wheels -r backend/requirements.txt --user
fi

# 4. Verify Frontend Pre-built Assets
echo "[4/4] Verifying pre-built frontend distribution..."
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    echo "  Pre-built React UI found (Node.js/npm not required)."
else
    echo "[ERROR] 'frontend/dist' folder missing."
    echo "  The frontend must be pre-built before running this offline installer."
    exit 1
fi

# 5. Create .env from template if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "----------------------------------------------------------"
    echo "  A default configuration file has been created: .env"
    echo "  You MUST configure your FOG API tokens before starting!"
    echo "  Run: nano .env"
    echo "----------------------------------------------------------"
fi

echo ""
echo "=========================================================="
echo "  Offline Installation Complete!"
echo "=========================================================="
echo ""
echo "Next Steps:"
echo "  1. Configure FOG tokens:  nano .env"
echo "  2. Start the service:     ./start.sh"
echo "  3. Open in browser:       http://192.168.50.10:8000"
echo ""
