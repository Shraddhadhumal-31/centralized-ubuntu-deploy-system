#!/usr/bin/env bash
# ==============================================================================
# Script: 01_inspect_server.sh
# Purpose: Non-destructive, read-only system inspection for Ubuntu Server + FOG
# Project: Centralized Ubuntu Deployment System (Group G-35)
# ==============================================================================

set -e

OUTPUT_DIR="$(pwd)/inspection_reports"
mkdir -p "$OUTPUT_DIR"
REPORT="$OUTPUT_DIR/server_audit_$(date +%Y%m%d_%H%M%S).txt"

echo "=========================================================="
echo "    UBUNTU DEPLOYMENT SYSTEM — PRE-BACKUP AUDIT REPORT   "
echo "=========================================================="
echo "Writing summary to: $REPORT"

exec > >(tee -a "$REPORT") 2>&1

echo ""
echo "Timestamp: $(date)"
echo "Hostname: $(hostname)"
echo "Kernel: $(uname -r)"

echo ""
echo "--- [1. OPERATING SYSTEM & DISK LAYOUT] ---"
lsb_release -a 2>/dev/null || cat /etc/os-release
echo ""
echo "Block Devices (Disks, Partitions, Mount Points):"
lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINTS,UUID

echo ""
echo "Disk Free Space:"
df -hT / /images 2>/dev/null || df -hT /

echo ""
echo "--- [2. FOG PROJECT & STORAGE DIRECTORIES] ---"
if [ -d "/images" ]; then
    echo "Contents of /images:"
    ls -la /images
    echo ""
    echo "Actual disk usage of /images:"
    du -sh /images/* 2>/dev/null || true
    echo ""
    echo "Partition Mount Analysis for /images:"
    IMAGES_MOUNT=$(df -P /images | tail -1 | awk '{print $6}')
    ROOT_MOUNT=$(df -P / | tail -1 | awk '{print $6}')
    if [ "$IMAGES_MOUNT" != "$ROOT_MOUNT" ]; then
        echo "  >>> NOTE: /images is on a SEPARATE PARTITION ($IMAGES_MOUNT)!"
        echo "  >>> RECOMMENDATION: In Clonezilla, use 'saveparts' and omit the /images partition to easily exclude test images."
    else
        echo "  >>> NOTE: /images resides directly on the ROOT filesystem ($ROOT_MOUNT)."
        echo "  >>> RECOMMENDATION: Use the Non-Destructive System Archive script (02_create_safeguard_backup.sh) to exclude test images cleanly."
    fi
else
    echo "WARNING: /images directory not found!"
fi

echo ""
echo "--- [3. NETWORK CONFIGURATION] ---"
echo "IP Addresses and Interfaces:"
ip -br addr
echo ""
echo "Default Gateway:"
ip route show default
echo ""
echo "DNS / Resolv Configuration:"
cat /etc/resolv.conf 2>/dev/null || true

echo ""
echo "--- [4. FOG SERVICES & DATABASE STATUS] ---"
for svc in FOGImageReplicator FOGMulticastManager FOGScheduler FOGPingHosts FOGSnapinReplicator mysql mariadb apache2; do
    printf "%-25s : %s\n" "$svc" "$(systemctl is-active $svc 2>/dev/null || echo 'not installed')"
done

echo ""
echo "--- [5. DASHBOARD & DEPLOYMENT SYSTEM STATUS] ---"
if [ -d "$HOME/ubuntu-deploy-system" ]; then
    echo "Dashboard directory located at: $HOME/ubuntu-deploy-system"
    ls -lh "$HOME/ubuntu-deploy-system"
    if [ -f "$HOME/ubuntu-deploy-system/deploy_history.db" ]; then
        echo "SQLite Database Size: $(ls -lh $HOME/ubuntu-deploy-system/deploy_history.db | awk '{print $5}')"
    fi
else
    echo "Dashboard directory not found in $HOME/ubuntu-deploy-system"
fi

echo ""
echo "=========================================================="
echo "Audit complete! File saved to: $REPORT"
echo "=========================================================="
