#!/usr/bin/env bash
# ==============================================================================
# Script: 02_create_safeguard_backup.sh
# Purpose: Export FOG Database, Configurations, Network Settings, and Dashboard
# Project: Centralized Ubuntu Deployment System (Group G-35)
# ==============================================================================

set -e

BACKUP_DIR="${1:-$HOME/safeguard_backup_$(date +%Y%m%d_%H%M%S)}"
mkdir -p "$BACKUP_DIR"

echo "=========================================================="
echo "    CREATING PORTABLE SAFEGUARD BACKUP ARCHIVE            "
echo "=========================================================="
echo "Destination Directory: $BACKUP_DIR"
echo ""

# 1. Backup FOG MySQL / MariaDB Database
echo "[1/5] Dumping FOG SQL database..."
if command -v mysqldump >/dev/null 2>&1; then
    # Read credentials from /opt/fog/.fogsettings if present
    FOG_DB_USER="root"
    FOG_DB_PASS=""
    if [ -f "/opt/fog/.fogsettings" ]; then
        FOG_DB_USER=$(grep -oP "snmysqluser='\K[^']+" /opt/fog/.fogsettings 2>/dev/null || echo "root")
        FOG_DB_PASS=$(grep -oP "snmysqlpass='\K[^']+" /opt/fog/.fogsettings 2>/dev/null || echo "")
    fi

    if [ -n "$FOG_DB_PASS" ]; then
        mysqldump -u"$FOG_DB_USER" -p"$FOG_DB_PASS" fog > "$BACKUP_DIR/fog_database.sql" 2>/dev/null || \
        sudo mysqldump fog > "$BACKUP_DIR/fog_database.sql"
    else
        sudo mysqldump fog > "$BACKUP_DIR/fog_database.sql"
    fi
    echo "  ✓ Database dumped successfully ($(du -h "$BACKUP_DIR/fog_database.sql" | awk '{print $1}'))"
else
    echo "  ⚠ mysqldump not found. Skipping SQL export."
fi

# 2. Backup FOG System Configurations
echo "[2/5] Archiving FOG configurations and settings..."
sudo tar -czf "$BACKUP_DIR/fog_configs.tar.gz" \
    /opt/fog/.fogsettings \
    /etc/exports \
    /var/www/html/fog/lib/fog/config.class.php \
    2>/dev/null || true
echo "  ✓ FOG configs archived ($(du -h "$BACKUP_DIR/fog_configs.tar.gz" | awk '{print $1}'))"

# 3. Backup Network & PXE Configurations (Netplan, TFTP, DHCP)
echo "[3/5] Archiving Network, DHCP, and TFTP configuration..."
sudo tar -czf "$BACKUP_DIR/network_tftp_configs.tar.gz" \
    /etc/netplan/ \
    /tftpboot/ \
    /etc/dhcp/ \
    /etc/dnsmasq.d/ \
    2>/dev/null || true
echo "  ✓ Network and TFTP configurations archived ($(du -h "$BACKUP_DIR/network_tftp_configs.tar.gz" | awk '{print $1}'))"

# 4. Backup Dashboard Project (Codebase + deploy_history.db)
echo "[4/5] Archiving Lab Deployment Dashboard Codebase..."
if [ -d "$HOME/ubuntu-deploy-system" ]; then
    tar -czf "$BACKUP_DIR/ubuntu-deploy-system_backup.tar.gz" -C "$HOME" ubuntu-deploy-system
    echo "  ✓ Dashboard project archived ($(du -h "$BACKUP_DIR/ubuntu-deploy-system_backup.tar.gz" | awk '{print $1}'))"
else
    echo "  ⚠ $HOME/ubuntu-deploy-system not found."
fi

# 5. Generate Integrity Checksums (SHA-256)
echo "[5/5] Generating cryptographic verification checksums (SHA-256)..."
cd "$BACKUP_DIR"
sha256sum * > SHA256SUMS.txt
echo "  ✓ Checksums generated:"
cat SHA256SUMS.txt

echo ""
echo "=========================================================="
echo "Safeguard archive created successfully at:"
echo "  $BACKUP_DIR"
echo "Copy this folder to your external USB storage."
echo "=========================================================="
