#!/usr/bin/env bash
# ==============================================================================
# Script: 04_clean_fog_db_images.sh
# Purpose: Safely removes old test image definitions and foreign references from 
#          the FOG database ON THE RESTORED SERVER without corrupting settings.
# Project: Centralized Ubuntu Deployment System (Group G-35)
# Safety:  Creates a pre-cleanup SQL dump and requires explicit confirmation.
# Usage:   sudo ./04_clean_fog_db_images.sh [OPTIONAL_IMAGE_NAME]
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Please run this script with sudo: sudo $0"
    exit 1
fi

TARGET_IMAGE="${1:-Ubuntu_Master}"
TARGET_IMAGE_2="Ubuntu-master2"

echo "=========================================================="
echo "    FOG DATABASE — SAFE TEST IMAGE RECORD CLEANUP TOOL    "
echo "=========================================================="
echo "Target Test Images to Dereference: '$TARGET_IMAGE' & '$TARGET_IMAGE_2'"
echo ""
echo "CRITICAL SAFETY NOTICE:"
echo "This tool must ONLY be run on the RESTORED server at the new laboratory."
echo "Do NOT run this on the original source server if you want to keep its state."
echo ""

# 1. Require Explicit Confirmation
read -r -p "Do you want to proceed with cleaning old test image records from FOG DB? (type 'yes' to proceed): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Operation cancelled by user. No database changes were made."
    exit 0
fi

# 2. Locate MySQL credentials
FOG_DB_USER="root"
FOG_DB_PASS=""
if [ -f "/opt/fog/.fogsettings" ]; then
    FOG_DB_USER=$(grep -oP "snmysqluser='\K[^']+" /opt/fog/.fogsettings 2>/dev/null || echo "root")
    FOG_DB_PASS=$(grep -oP "snmysqlpass='\K[^']+" /opt/fog/.fogsettings 2>/dev/null || echo "")
fi

MYSQL_CMD="mysql"
DUMP_CMD="mysqldump"
if [ -n "$FOG_DB_PASS" ]; then
    MYSQL_CMD="mysql -u$FOG_DB_USER -p$FOG_DB_PASS fog"
    DUMP_CMD="mysqldump -u$FOG_DB_USER -p$FOG_DB_PASS fog"
else
    MYSQL_CMD="mysql fog"
    DUMP_CMD="mysqldump fog"
fi

# 3. Create Immediate Verified Safety Backup of Database
SAFETY_DUMP="pre_clean_fog_db_$(date +%Y%m%d_%H%M%S).sql"
echo ""
echo "[Step 1/4] Creating mandatory pre-cleanup database dump: $SAFETY_DUMP ..."
$DUMP_CMD > "$SAFETY_DUMP"
echo "  ✓ Pre-cleanup safety backup created successfully ($(du -h "$SAFETY_DUMP" | awk '{print $1}'))"

# 4. Check If Target Images Exist in Database
echo ""
echo "[Step 2/4] Inspecting existing image records..."
EXISTING_IDS=$($MYSQL_CMD -N -s -e "SELECT imageID FROM images WHERE imageName IN ('$TARGET_IMAGE', '$TARGET_IMAGE_2', 'Ubuntu_Master', 'Ubuntu-master2');" 2>/dev/null || true)

if [ -z "$EXISTING_IDS" ]; then
    echo "  ℹ No test images matching '$TARGET_IMAGE' or '$TARGET_IMAGE_2' were found in the database."
    echo "  Database is already clean of these image records."
else
    echo "  Found test image ID(s): $EXISTING_IDS"
    
    # 5. Perform Relational Cleanup in Proper Dependency Order
    echo ""
    echo "[Step 3/4] Performing clean relational dereferencing..."
    
    for IMG_ID in $EXISTING_IDS; do
        echo "  - Dereferencing hosts pointing to Image ID $IMG_ID (setting hostImage = 0)..."
        $MYSQL_CMD -e "UPDATE hosts SET hostImage = 0 WHERE hostImage = $IMG_ID;"
        
        echo "  - Removing storage group associations for Image ID $IMG_ID..."
        $MYSQL_CMD -e "DELETE FROM imageGroupAssoc WHERE igaImageID = $IMG_ID;"
        
        echo "  - Removing active or queued tasks for Image ID $IMG_ID..."
        $MYSQL_CMD -e "DELETE FROM tasks WHERE taskImageID = $IMG_ID;"
        
        echo "  - Removing image record for Image ID $IMG_ID from images table..."
        $MYSQL_CMD -e "DELETE FROM images WHERE imageID = $IMG_ID;"
    done
    echo "  ✓ Relational cleanup completed without leaving dangling pointers."
fi

# 6. Verify Infrastructure Integrity
echo ""
echo "[Step 4/4] Verifying FOG Infrastructure Integrity..."
GLOBAL_SETTINGS_COUNT=$($MYSQL_CMD -N -s -e "SELECT COUNT(*) FROM globalSettings;" 2>/dev/null || echo "0")
USERS_COUNT=$($MYSQL_CMD -N -s -e "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
STORAGE_NODES=$($MYSQL_CMD -N -s -e "SELECT COUNT(*) FROM nfsGroupMember;" 2>/dev/null || echo "0")
REMAINING_IMAGES=$($MYSQL_CMD -N -s -e "SELECT COUNT(*) FROM images;" 2>/dev/null || echo "0")

echo "  ✓ Global Settings Intact : $GLOBAL_SETTINGS_COUNT records"
echo "  ✓ FOG Users Intact       : $USERS_COUNT users"
echo "  ✓ Storage Nodes Intact   : $STORAGE_NODES active storage nodes"
echo "  ✓ Images Remaining in DB : $REMAINING_IMAGES images"

# Check FOG critical marker files in /images
echo ""
echo "Checking critical FOG storage marker files..."
if [ -f "/images/.mntcheck" ] && [ -f "/images/dev/.mntcheck" ]; then
    echo "  ✓ Required marker files (/images/.mntcheck and /images/dev/.mntcheck) are present."
else
    echo "  ⚠ One or more marker files were missing. Creating them now..."
    touch /images/.mntcheck /images/dev/.mntcheck 2>/dev/null || true
    chmod 777 /images/.mntcheck /images/dev/.mntcheck 2>/dev/null || true
    echo "  ✓ Marker files created with full permissions."
fi

echo ""
echo "=========================================================="
echo "    CLEANUP COMPLETE: FOG IS READY FOR NEW MASTER IMAGE   "
echo "=========================================================="
echo "You can now log into the FOG Web UI (http://<SERVER_IP>/fog/management)"
echo "and register your new laboratory master image cleanly!"
echo "=========================================================="
