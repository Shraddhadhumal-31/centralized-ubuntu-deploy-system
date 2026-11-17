#!/usr/bin/env bash
# ==============================================================================
# Script: 02b_create_reusable_os_archive.sh
# Purpose: Non-destructive, full-system archive of Ubuntu Server + FOG + Dashboard
#          while STRICTLY EXCLUDING large test images (~20 GiB).
# Project: Centralized Ubuntu Deployment System (Group G-35)
# Usage:   sudo ./02b_create_reusable_os_archive.sh [DESTINATION_DIR]
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run this script with sudo: sudo $0"
    exit 1
fi

DEST_DIR="${1:-/media/backup_usb}"
mkdir -p "$DEST_DIR"

ARCHIVE_NAME="ubuntu_fog_clean_system_$(date +%Y%m%d_%H%M%S).tar.gz"
OUTPUT_PATH="$DEST_DIR/$ARCHIVE_NAME"

echo "=========================================================="
echo "    CREATING CLEAN REUSABLE OS + FOG SYSTEM ARCHIVE       "
echo "=========================================================="
echo "Destination Archive: $OUTPUT_PATH"
echo "Excluded Data      : /images/Ubuntu* (Old test images), virtual filesystems"
echo "Preserved Data     : Entire OS, FOG, MySQL DB, Dashboard, Services, Configs"
echo ""

START_TIME=$(date +%s)

# Create system archive with exact exclusions
echo "[1/3] Archiving live server filesystem (this takes 4-7 minutes)..."
tar --exclude='/images/Ubuntu*' \
    --exclude='/images/dev/*' \
    --exclude='/proc/*' \
    --exclude='/sys/*' \
    --exclude='/dev/*' \
    --exclude='/tmp/*' \
    --exclude='/run/*' \
    --exclude='/mnt/*' \
    --exclude='/media/*' \
    --exclude='/lost+found' \
    --exclude="$DEST_DIR" \
    -cpzf "$OUTPUT_PATH" \
    -C / .

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "  ✓ Clean system archive created in ${DURATION}s"
echo "  ✓ Archive size: $(du -h "$OUTPUT_PATH" | awk '{print $1}')"

# Verify critical FOG marker files are inside archive
echo ""
echo "[2/3] Verifying presence of required FOG infrastructure inside archive..."
tar -tzf "$OUTPUT_PATH" images/.mntcheck images/postdownloadscripts 2>/dev/null && \
    echo "  ✓ Confirmed: FOG marker files (.mntcheck) preserved in archive." || \
    echo "  ⚠ Note: Ensure /images/.mntcheck is present on destination."

# Generate SHA256 checksum
echo ""
echo "[3/3] Generating verification checksum (SHA-256)..."
cd "$DEST_DIR"
sha256sum "$ARCHIVE_NAME" >> SHA256SUMS.txt
echo "  ✓ Checksum appended to $DEST_DIR/SHA256SUMS.txt"

echo ""
echo "=========================================================="
echo "Clean system archive completed successfully!"
echo "Size: $(du -h "$OUTPUT_PATH" | awk '{print $1}') (Saved ~20 GiB of test images!)"
echo "=========================================================="
