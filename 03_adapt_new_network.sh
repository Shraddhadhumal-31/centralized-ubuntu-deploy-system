#!/usr/bin/env bash
# ==============================================================================
# Script: 03_adapt_new_network.sh
# Purpose: Automatically updates IP configurations for FOG and Dashboard
#          when moving to a laboratory with a different network subnet.
# Project: Centralized Ubuntu Deployment System (Group G-35)
# Usage:   sudo ./03_adapt_new_network.sh <NEW_IP> [INTERFACE_NAME] [GATEWAY]
# ==============================================================================

set -e

if [ "$#" -lt 1 ]; then
    echo "Usage: sudo $0 <NEW_IP> [INTERFACE_NAME] [GATEWAY]"
    echo "Example: sudo $0 192.168.1.100 eth0 192.168.1.1"
    exit 1
fi

NEW_IP="$1"
INTERFACE="${2:-$(ip route show default 2>/dev/null | awk '{print $5}' | head -n1)}"
GATEWAY="$3"

if [ -z "$INTERFACE" ]; then
    INTERFACE=$(ip -br link | awk '$1 !~ /lo/ {print $1; exit}')
fi

OLD_IP=$(ip -br addr show "$INTERFACE" 2>/dev/null | awk '{print $3}' | cut -d/ -f1 | head -n1 || echo "192.168.50.10")

echo "=========================================================="
echo "    ADAPTING LAB DEPLOYMENT NETWORK CONFIGURATION         "
echo "=========================================================="
echo "Old Detected IP : $OLD_IP"
echo "New Target IP   : $NEW_IP"
echo "Interface       : $INTERFACE"
if [ -n "$GATEWAY" ]; then
    echo "Gateway         : $GATEWAY"
fi
echo ""

# 1. Update /opt/fog/.fogsettings
if [ -f "/opt/fog/.fogsettings" ]; then
    echo "[1/4] Updating /opt/fog/.fogsettings..."
    sudo sed -i "s/ipaddress='[^']*'/ipaddress='$NEW_IP'/g" /opt/fog/.fogsettings
    echo "  ✓ .fogsettings updated"
fi

# 2. Update default.ipxe
if [ -f "/tftpboot/default.ipxe" ]; then
    echo "[2/4] Updating /tftpboot/default.ipxe..."
    sudo sed -i "s/$OLD_IP/$NEW_IP/g" /tftpboot/default.ipxe
    echo "  ✓ default.ipxe updated"
fi

# 3. Update FOG MySQL / MariaDB Database Settings
echo "[3/4] Updating FOG Database IP entries..."
if command -v mysql >/dev/null 2>&1; then
    sudo mysql -e "
    UPDATE fog.nfsGroup SET ngHost='$NEW_IP' WHERE ngHost='$OLD_IP';
    UPDATE fog.nfsGroupMember SET ngmHostname='$NEW_IP' WHERE ngmHostname='$OLD_IP';
    UPDATE fog.globalSettings SET settingValue='$NEW_IP' WHERE settingKey IN ('FOG_TFTP_HOST', 'FOG_WEB_HOST');
    " 2>/dev/null && echo "  ✓ FOG Database tables updated with $NEW_IP" || echo "  ⚠ Database update skipped (check credentials if needed)"
fi

# 4. Update Dashboard Backend .env
echo "[4/4] Updating Dashboard backend configuration..."
ENV_FILE="$HOME/ubuntu-deploy-system/.env"
if [ -f "$ENV_FILE" ]; then
    sed -i "s|FOG_BASE_URL=http://[^:]*:|FOG_BASE_URL=http://$NEW_IP:|g" "$ENV_FILE"
    sed -i "s|FOG_BASE_URL=http://[^/]*|FOG_BASE_URL=http://$NEW_IP|g" "$ENV_FILE"
    echo "  ✓ Dashboard .env updated with http://$NEW_IP/fog"
fi

echo ""
echo "=========================================================="
echo "Network adaptation complete!"
echo "If you changed network interfaces, restart networking with:"
echo "  sudo netplan apply"
echo "Then restart FOG and Dashboard services:"
echo "  sudo systemctl restart FOGImageReplicator FOGMulticastManager apache2"
echo "  cd ~/ubuntu-deploy-system && ./start.sh"
echo "=========================================================="
