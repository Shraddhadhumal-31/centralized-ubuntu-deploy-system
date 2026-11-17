import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from ..auth import verify_token
from ..fog_client import fog_client, parse_image_size
from ..database import get_db
from ..models import DeploymentRecord, RegisteredImage
from ..config import get_settings

router = APIRouter(prefix="/api/images", tags=["images"])


class CreateImageRequest(BaseModel):
    name: str
    path: Optional[str] = ""
    description: Optional[str] = ""

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 64:
            raise ValueError("Image name must be between 1 and 64 characters")
        if not re.match(r"^[a-zA-Z0-9_\-\. ]+$", v):
            raise ValueError("Image name can only contain letters, numbers, spaces, dots, hyphens, and underscores")
        return v


class CaptureImageRequest(BaseModel):
    host_id: int
    image_id: Optional[int] = None
    new_image_name: Optional[str] = None


@router.get("")
@router.get("/")
async def list_images(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    try:
        fog_images = await fog_client.get_images()
    except Exception:
        fog_images = []

    # Get recent capture records from DB to verify completion/failure status
    capture_records = (
        db.query(DeploymentRecord)
        .filter(DeploymentRecord.task_type == "Image Capture")
        .order_by(DeploymentRecord.id.desc())
        .all()
    )
    capture_by_img_id = {}
    capture_by_img_name = {}
    for cr in capture_records:
        if cr.image_id and cr.image_id not in capture_by_img_id:
            capture_by_img_id[cr.image_id] = cr
        if cr.image_name and cr.image_name.lower() not in capture_by_img_name:
            capture_by_img_name[cr.image_name.lower()] = cr

    images_out = []
    for img in fog_images:
        iname = img.get("name", "")
        ipath = img.get("path", iname)
        fid = int(img.get("id")) if str(img.get("id", "")).isdigit() else None
        raw_size = img.get("size", "")
        formatted_gb = parse_image_size(raw_size)

        # Check direct filesystem storage on Linux (/images/<path>)
        disk_bytes = None
        for test_path in [Path("/images") / ipath, Path("/images") / iname]:
            if test_path.is_dir():
                try:
                    imgs = list(test_path.glob("*.img"))
                    if imgs:
                        disk_bytes = sum(f.stat().st_size for f in imgs if f.is_file())
                    else:
                        disk_bytes = sum(f.stat().st_size for f in test_path.iterdir() if f.is_file())
                    if disk_bytes and disk_bytes > 0:
                        break
                except Exception:
                    pass

        has_size_on_disk = (disk_bytes is not None and disk_bytes > 10 * 1024 * 1024) or (
            formatted_gb != "—" and not formatted_gb.startswith("0.00 GB")
        )

        if disk_bytes and disk_bytes > 10 * 1024 * 1024:
            formatted_gb = f"{disk_bytes / (1024 ** 3):.2f} GB"

        # Determine image status & usability
        latest_cap = capture_by_img_id.get(fid) or capture_by_img_name.get(iname.lower())

        status = "ready"
        if not has_size_on_disk:
            if latest_cap:
                if latest_cap.status in ["Pending", "Running"]:
                    status = "capturing"
                    formatted_gb = f"Capturing in progress ({latest_cap.percent or '100'}%)"
                elif latest_cap.status in ["Failed", "Cancelled"]:
                    status = "failed"
                else:
                    status = "incomplete"
            else:
                # Definition exists in FOG with no size
                status = "incomplete"

        is_usable = (status == "ready") or has_size_on_disk

        # Sync into SQLite RegisteredImage
        existing = db.query(RegisteredImage).filter(RegisteredImage.name == iname).first()
        if not existing and fid:
            existing = db.query(RegisteredImage).filter(RegisteredImage.fog_id == fid).first()

        if existing:
            existing.fog_id = fid
            existing.path = ipath
            existing.size = str(raw_size or "")
            existing.size_gb = formatted_gb
            existing.status = status
            existing.description = img.get("description", "")
        else:
            new_img = RegisteredImage(
                fog_id=fid,
                name=iname,
                path=ipath,
                size=str(raw_size or ""),
                size_gb=formatted_gb,
                status=status,
                description=img.get("description", ""),
            )
            db.add(new_img)

        images_out.append({
            "id": fid,
            "name": iname,
            "path": ipath,
            "raw_size": raw_size,
            "size_gb": formatted_gb,
            "imageTypeID": img.get("imageTypeID", 1),
            "imagePartitionTypeID": img.get("imagePartitionTypeID", 1),
            "status": status,
            "is_usable": is_usable,
            "description": img.get("description", ""),
        })

    db.commit()
    return {"images": images_out}


@router.get("/usable")
@router.get("/usable/")
async def list_usable_images(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Returns only successfully captured, usable images ready for deployment."""
    all_imgs = await list_images(username=username, db=db)
    usable = [img for img in all_imgs.get("images", []) if img.get("is_usable")]
    return {"images": usable}


@router.post("")
@router.post("/")
async def create_image(
    req: CreateImageRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    clean_name = req.name.strip()
    safe_path = req.path.strip() if req.path else re.sub(r"[^a-zA-Z0-9_\-]", "_", clean_name)

    # Check if already exists in FOG
    try:
        all_imgs = await fog_client.get_images()
        for img in all_imgs:
            if (
                img.get("name", "").lower() == clean_name.lower()
                or img.get("path", "").lower() == safe_path.lower()
            ):
                return {
                    "success": True,
                    "message": f"Image definition '{clean_name}' is already registered in FOG (ID: {img.get('id')}).",
                    "data": img,
                }
    except Exception:
        pass

    try:
        result = await fog_client.create_image(
            name=clean_name,
            path=safe_path,
            image_type_id=1,
            os_id=50,
            image_partition_type_id=1,
            description=req.description or f"Created via Ubuntu Deploy System by {username}",
        )
        img_id = result.get("id") if isinstance(result, dict) else None

        # Save to SQLite as incomplete/pending until captured
        db_img = RegisteredImage(
            fog_id=int(img_id) if img_id and str(img_id).isdigit() else None,
            name=clean_name,
            path=safe_path,
            size_gb="—",
            status="incomplete",
            description=req.description or "",
        )
        db.add(db_img)
        db.commit()
        db.refresh(db_img)

        return {
            "success": True,
            "message": f"Image definition '{clean_name}' created in FOG with partition type 'all'. Schedule capture to complete.",
            "data": result,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create image in FOG: {str(e)}"
        )


@router.delete("/{image_id}")
@router.delete("/{image_id}/")
async def delete_image(
    image_id: int,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    try:
        await fog_client.delete_image(image_id)
        # Delete from SQLite
        db.query(RegisteredImage).filter(
            (RegisteredImage.fog_id == image_id) | (RegisteredImage.id == image_id)
        ).delete()
        db.commit()

        return {
            "success": True,
            "message": f"Image ID {image_id} deleted successfully from FOG",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete image: {str(e)}"
        )


@router.post("/capture")
@router.post("/capture/")
async def capture_image(
    req: CaptureImageRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Triggers an image capture task from a specified host (e.g. Master PC).
    Crucial fix: imagePartitionTypeID=1 is verified on the image definition
    prior to task creation, eliminating the 'No img part type passed' FOS error.
    """
    host = await fog_client.get_host(req.host_id)
    if not host:
        raise HTTPException(status_code=404, detail=f"Host ID {req.host_id} not found in FOG")

    host_name = host.get("name", f"Host-{req.host_id}")
    host_mac = host.get("primac", host.get("mac", ""))

    # Resolve image ID
    image_id = req.image_id
    image_name = ""

    if req.new_image_name and req.new_image_name.strip():
        new_name = req.new_image_name.strip()
        all_imgs = await fog_client.get_images()
        found = next((img for img in all_imgs if img.get("name", "").lower() == new_name.lower()), None)
        if found:
            image_id = found.get("id")
            image_name = found.get("name")
        else:
            img_create_res = await fog_client.create_image(
                name=new_name,
                image_type_id=1,
                os_id=50,
                image_partition_type_id=1,
                description=f"Captured from {host_name} on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
            )
            image_id = img_create_res.get("id")
            image_name = new_name
    elif image_id and int(image_id) > 0:
        img = await fog_client.get_image(image_id)
        if not img:
            raise HTTPException(status_code=404, detail=f"Selected image ID {image_id} not found in FOG")
        image_name = img.get("name", f"Image-{image_id}")
    else:
        # Fall back to host's currently assigned image
        image_id = host.get("imageID")
        image_name = host.get("imagename", "Default Image")
        if not image_id or str(image_id) == "0":
            raise HTTPException(
                status_code=400,
                detail="No image specified and this host does not have an assigned image to capture into. Please provide a new image name.",
            )

    if not image_id or str(image_id) == "0":
        raise HTTPException(
            status_code=400,
            detail="Failed to resolve image ID for capture. Please provide a valid image name.",
        )

    # Clean image name (ensure no brackets or prefixes in the image name itself)
    clean_image_name = image_name.replace("[Capture]", "").strip()

    # Assign image to host and update partition configuration
    try:
        await fog_client.assign_image_to_host(req.host_id, int(image_id))
    except Exception:
        pass

    # Create capture task in FOG (taskTypeID: 2)
    try:
        now = datetime.now(timezone.utc)
        task_res = await fog_client.create_capture_task(req.host_id, int(image_id))
        fog_tid = task_res.get("id") if isinstance(task_res, dict) else None

        record = DeploymentRecord(
            fog_task_id=int(fog_tid) if fog_tid and str(fog_tid).isdigit() else None,
            task_type="Image Capture",  # Dedicated task type!
            host_id=req.host_id,
            host_name=host_name,
            host_mac=host_mac,
            image_id=int(image_id),
            image_name=clean_image_name,  # Clean image name!
            status="Pending",
            percent="0",
            created_at=now,
            started_at=now,
            created_by=username,
        )
        db.add(record)

        # Mark image status in SQLite as pending_capture
        db_img = db.query(RegisteredImage).filter(
            (RegisteredImage.fog_id == int(image_id)) | (RegisteredImage.name == clean_image_name)
        ).first()
        if db_img:
            db_img.status = "pending_capture"

        db.commit()
        db.refresh(record)

        return {
            "success": True,
            "message": f"Image capture task created for '{host_name}' into image '{clean_image_name}'. Reboot {host_name} into network PXE to start capture.",
            "task_id": record.id,
            "task_type": "Image Capture",
            "fog_task_id": record.fog_task_id,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create capture task in FOG: {str(e)}"
        )
