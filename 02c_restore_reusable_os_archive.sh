#!/usr/bin/env bash
# ==============================================================================
# Script: 02c_restore_reusable_os_archive.sh
# Purpose: Automates restoring the clean system archive onto a destination disk
#          from any Live Linux USB (Ubuntu Live or Clonezilla bash prompt).
# Project: Centralized Ubuntu Deployment System (Group G-35)
# Usage:   sudo ./02c_restore_reusable_os_archive.sh /dev/sdX /path/to/archive.tar.gz
# ==============================================================================

set -e

if [ "$#" -lt 2 ]; then
    echo "Usage: sudo $0 <TARGET_DISK> <ARCHIVE_PATH>"
    echo "Example: sudo $0 /dev/sda /media/usb/ubuntu_fog_clean_system_20261030.tar.gz"
    exit 1
fi

TARGET_DISK="$1"
ARCHIVE_PATH="$2"

if [ ! -b "$TARGET_DISK" ]; then
    echo "ERROR: Target disk $TARGET_DISK does not exist!"
    exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
    echo "ERROR: Archive file $ARCHIVE_PATH not found!"
    exit 1
fi

echo "=========================================================="
echo "    AUTOMATED CLEAN SYSTEM RESTORATION WIZARD             "
echo "=========================================================="
echo "Target Disk : $TARGET_DISK"
echo "Source File : $ARCHIVE_PATH"
echo ""
echo "WARNING: ALL DATA ON $TARGET_DISK WILL BE COMPLETELY ERASED!"
read -r -p "Type 'yes' to proceed with partitioning and restoration: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restoration aborted."
    exit 0
fi

echo ""
echo "[1/6] Creating GPT partition table on $TARGET_DISK..."
parted -s "$TARGET_DISK" mklabel gpt
parted -s "$TARGET_DISK" mkpart ESP fat32 1MiB 513MiB
parted -s "$TARGET_DISK" set 1 esp on
parted -s "$TARGET_DISK" mkpart primary ext4 513MiB 100%

# Handle NVMe vs SATA naming
if [[ "$TARGET_DISK" =~ nvme ]]; then
    EFI_PART="${TARGET_DISK}p1"
    ROOT_PART="${TARGET_DISK}p2"
else
    EFI_PART="${TARGET_DISK}1"
    ROOT_PART="${TARGET_DISK}2"
fi

echo "  ✓ Partition 1 (EFI) : $EFI_PART"
echo "  ✓ Partition 2 (Root): $ROOT_PART"

echo ""
echo "[2/6] Formatting filesystems..."
mkfs.vfat -F32 "$EFI_PART"
mkfs.ext4 -F "$ROOT_PART"
echo "  ✓ Filesystems formatted."

echo ""
echo "[3/6] Mounting target filesystems..."
MOUNT_DIR="/mnt/target_root"
mkdir -p "$MOUNT_DIR"
mount "$ROOT_PART" "$MOUNT_DIR"
mkdir -p "$MOUNT_DIR/boot/efi"
mount "$EFI_PART" "$MOUNT_DIR/boot/efi"

echo ""
echo "[4/6] Extracting clean system archive (approx 3-5 minutes)..."
tar -xpzf "$ARCHIVE_PATH" -C "$MOUNT_DIR" --numeric-owner
echo "  ✓ System extracted successfully."

echo ""
echo "[5/6] Updating /etc/fstab with new partition UUIDs..."
ROOT_UUID=$(blkid -s UUID -o value "$ROOT_PART")
EFI_UUID=$(blkid -s UUID -o value "$EFI_PART")

cat <<EOF > "$MOUNT_DIR/etc/fstab"
# /etc/fstab: static file system information.
UUID=$ROOT_UUID / ext4 errors=remount-ro 0 1
UUID=$EFI_UUID /boot/efi vfat umask=0077 0 1
EOF
echo "  ✓ Updated /etc/fstab: Root=$ROOT_UUID, EFI=$EFI_UUID"

echo ""
echo "[6/6] Installing GRUB bootloader to $TARGET_DISK..."
for dir in /dev /dev/pts /proc /sys /run; do
    mount --bind "$dir" "$MOUNT_DIR$dir"
done

chroot "$MOUNT_DIR" grub-install "$TARGET_DISK"
chroot "$MOUNT_DIR" update-grub

for dir in /run /sys /proc /dev/pts /dev; do
    umount "$MOUNT_DIR$dir" || true
done
umount "$MOUNT_DIR/boot/efi"
umount "$MOUNT_DIR"

echo ""
echo "=========================================================="
echo "    RESTORATION COMPLETE! SYSTEM IS READY TO BOOT!        "
echo "=========================================================="
echo "Remove the Live USB and reboot the destination PC."
echo "On first boot, run:"
echo "  sudo ~/03_adapt_new_network.sh <NEW_IP> [INTERFACE] [GATEWAY]"
echo "  sudo ~/04_clean_fog_db_images.sh"
echo "=========================================================="
