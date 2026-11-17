from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import extract, or_, func
from datetime import datetime, timezone, timedelta
from ..auth import verify_token
from ..database import get_db
from ..models import DeploymentRecord, SystemSetting
from ..fog_client import fog_client
from ..config import get_settings

router = APIRouter(prefix="/api/deployments", tags=["deployments"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_current_master_hostname(db: Session) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "master_hostname").first()
    if setting and setting.value:
        return setting.value.strip()
    return get_settings().MASTER_HOSTNAME


class DeployRequest(BaseModel):
    host_ids: List[int]
    image_id: int


def format_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    """Ensures datetime strings are serialized with explicit UTC designation."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def reconcile_active_tasks(db: Session, fog_tasks: list, now: datetime) -> dict:
    """
    Reconciles live FOG tasks with SQLite deployment records.

    Lifecycle:
      - Pending: Task is queued in FOG, waiting for target PC to PXE boot (stateID: 0 or 1).
      - Running: Client PC booted into FOS / Partclone and is actively cloning (stateID: 2 or pct > 0).
      - Completed: Finished cloning (stateID: 3/4 or task was Running and vanished from active queue).
      - Failed: Error or task aborted by FOG engine (stateID: 5 or timeout).
      - Cancelled: Manually cancelled by user.
    """
    fog_by_host = {}
    fog_by_task_id = {}
    for t in fog_tasks:
        hid = str(t.get("hostID") or t.get("host", {}).get("id") or "")
        tid = str(t.get("id") or "")
        if hid and hid != "0":
            fog_by_host[hid] = t
        if tid:
            fog_by_task_id[tid] = t

    db_active = (
        db.query(DeploymentRecord)
        .filter(DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Waiting", "Deploying"]))
        .all()
    )

    db_active_hosts = set()
    for rec in db_active:
        hid_str = str(rec.host_id)
        tid_str = str(rec.fog_task_id or "")
        db_active_hosts.add(hid_str)

        # Match live FOG task by task ID or host ID
        ft = fog_by_task_id.get(tid_str) or fog_by_host.get(hid_str)

        if ft:
            sid = str(ft.get("stateID") or ft.get("taskStateID") or "0")
            pct = str(ft.get("percent") or ft.get("pct") or "").replace("%", "").strip()

            if pct:
                rec.percent = pct

            if sid in ["0", "1"]:
                rec.status = "Pending"
            elif sid == "2" or (pct and pct != "0" and pct != "100"):
                rec.status = "Running"
                if not rec.started_at:
                    rec.started_at = now
            elif sid in ["3", "4"]:
                rec.status = "Completed"
                rec.percent = "100"
                if not rec.completed_at:
                    rec.completed_at = now
            elif sid == "5":
                rec.status = "Failed"
                rec.error_message = "Task cancelled or aborted by FOG engine"
                if not rec.completed_at:
                    rec.completed_at = now

            db.commit()
        else:
            # Task is no longer in active FOG tasks list
            if rec.status in ["Running", "Deploying"]:
                # Finished cloning successfully!
                rec.status = "Completed"
                rec.percent = "100"
                if not rec.completed_at:
                    rec.completed_at = now
                db.commit()
            elif rec.status in ["Pending", "Queued", "Waiting"]:
                age_seconds = 0
                ref_time = rec.created_at or rec.started_at
                if ref_time:
                    t_tz = ref_time.replace(tzinfo=timezone.utc) if ref_time.tzinfo is None else ref_time
                    age_seconds = (now - t_tz).total_seconds()

                if age_seconds > 600:
                    rec.status = "Failed"
                    rec.error_message = "Deployment timed out waiting for client PC to boot into network PXE"
                    rec.completed_at = now
                    db.commit()

    # Track external FOG tasks not initiated through this interface
    for hid_str, ft in fog_by_host.items():
        if hid_str not in db_active_hosts:
            sid = str(ft.get("stateID") or ft.get("taskStateID") or "0")
            type_id = ft.get("typeID") or ft.get("taskTypeID") or 1
            is_capture = (str(type_id) == "2")
            task_type = "Image Capture" if is_capture else "Deployment"

            status = "Running" if (sid == "2") else ("Completed" if sid in ["3", "4"] else "Pending")
            hname = ft.get("host", {}).get("name") or ft.get("name") or f"Host-{hid_str}"
            imgname = ft.get("image", {}).get("name") or ("Captured_Image" if is_capture else "Ubuntu_Master")
            fog_tid = ft.get("id")

            existing = None
            if fog_tid:
                existing = db.query(DeploymentRecord).filter(DeploymentRecord.fog_task_id == fog_tid).first()

            if not existing:
                new_rec = DeploymentRecord(
                    fog_task_id=fog_tid,
                    task_type=task_type,
                    host_id=int(hid_str) if hid_str.isdigit() else 0,
                    host_name=hname,
                    host_mac="",
                    image_id=0,
                    image_name=imgname,
                    status=status,
                    started_at=now if status == "Running" else None,
                    created_at=now,
                    created_by="FOG System",
                )
                db.add(new_rec)
                db.commit()

    return fog_by_host


@router.post("")
@router.post("/")
async def create_deployment(
    req: DeployRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    master_name = get_current_master_hostname(db).lower()

    if not req.host_ids:
        raise HTTPException(status_code=400, detail="No target computers selected for deployment")

    image = await fog_client.get_image(req.image_id)
    if not image:
        raise HTTPException(
            status_code=404, detail=f"Image ID {req.image_id} not found in FOG"
        )
    image_name = image.get("name", f"Image-{req.image_id}")

    # Reconcile first
    now = datetime.now(timezone.utc)
    active_fog_tasks = await fog_client.get_active_tasks()
    reconcile_active_tasks(db, active_fog_tasks, now)

    # Active hosts currently in DB
    active_in_db = {
        r.host_id: r
        for r in db.query(DeploymentRecord)
        .filter(DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Deploying"]))
        .all()
    }

    results = []

    for host_id in req.host_ids:
        host = await fog_client.get_host(host_id)
        if not host:
            results.append({
                "host_id": host_id,
                "host_name": f"Host-{host_id}",
                "success": False,
                "error": "Host not found in FOG",
            })
            continue

        host_name = host.get("name", f"Host-{host_id}")
        host_mac = host.get("primac", host.get("mac", ""))

        # Check if already has an active pending/running deployment
        if host_id in active_in_db:
            active_rec = active_in_db[host_id]
            results.append({
                "host_id": host_id,
                "host_name": host_name,
                "success": False,
                "error": f"Host '{host_name}' already has an active {active_rec.task_type or 'deployment'} task ({active_rec.status}). Cancel it before redeploying.",
            })
            continue

        # Redeployment after cancellation or failure: Always create a fresh new record with unique ID!
        record = DeploymentRecord(
            fog_task_id=None,
            task_type="Deployment",
            host_id=host_id,
            host_name=host_name,
            host_mac=host_mac,
            image_id=req.image_id,
            image_name=image_name,
            status="Pending",
            percent="0",
            created_at=now,
            started_at=None,
            created_by=username,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        try:
            task_result = await fog_client.create_deploy_task(host_id, req.image_id)
            fog_tid = task_result.get("id") if isinstance(task_result, dict) else None
            if fog_tid:
                record.fog_task_id = int(fog_tid)
                db.commit()

            results.append({
                "host_id": host_id,
                "host_name": host_name,
                "success": True,
                "task_id": record.id,
                "fog_task_id": fog_tid,
                "status": "Pending",
                "message": f"Deployment queued. Reboot {host_name} into network PXE to start imaging.",
            })
        except Exception as e:
            record.status = "Failed"
            record.error_message = str(e)
            record.completed_at = now
            db.commit()

            results.append({
                "host_id": host_id,
                "host_name": host_name,
                "success": False,
                "task_id": record.id,
                "error": str(e),
            })

    return {"results": results}


@router.get("/active")
@router.get("/active/")
async def get_active_deployments(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    fog_tasks = await fog_client.get_active_tasks()
    fog_by_host = reconcile_active_tasks(db, fog_tasks, now)

    current_active = (
        db.query(DeploymentRecord)
        .filter(DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Deploying"]))
        .order_by(DeploymentRecord.id.desc())
        .all()
    )

    tasks_out = []
    for r in current_active:
        ft = fog_by_host.get(str(r.host_id))
        elapsed = 0
        ref_time = r.started_at or r.created_at
        if ref_time:
            started = ref_time.replace(tzinfo=timezone.utc) if ref_time.tzinfo is None else ref_time
            elapsed = max(0, (now - started).total_seconds())

        pct = r.percent or ""
        if ft:
            f_pct = ft.get("percent") or ft.get("pct")
            if f_pct:
                pct = str(f_pct).replace("%", "").strip()

        tasks_out.append({
            "id": r.id,
            "fog_task_id": r.fog_task_id,
            "task_type": r.task_type or "Deployment",
            "host_id": r.host_id,
            "host_name": r.host_name,
            "host_mac": r.host_mac,
            "image_name": r.image_name,
            "status": "Running" if r.status in ["Running", "Deploying"] else "Pending",
            "percent": pct,
            "started_at": format_utc_iso(r.started_at),
            "created_at": format_utc_iso(r.created_at),
            "elapsed_seconds": round(elapsed),
        })

    return {"tasks": tasks_out}


@router.delete("/cancel/{host_id}")
@router.delete("/cancel/{host_id}/")
async def cancel_deployment(
    host_id: int,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    try:
        await fog_client.cancel_task(host_id)
        recs = (
            db.query(DeploymentRecord)
            .filter(
                DeploymentRecord.host_id == host_id,
                DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Deploying"]),
            )
            .all()
        )
        for r in recs:
            r.status = "Cancelled"
            r.completed_at = now
            r.error_message = f"Cancelled by {username}"
        db.commit()
        return {"success": True, "message": f"Task for host ID {host_id} successfully cancelled. Computer is ready for redeployment."}
    except Exception as e:
        # Even if FOG returned an error (e.g. task already gone), mark local record cancelled
        recs = (
            db.query(DeploymentRecord)
            .filter(
                DeploymentRecord.host_id == host_id,
                DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Deploying"]),
            )
            .all()
        )
        for r in recs:
            r.status = "Cancelled"
            r.completed_at = now
            r.error_message = f"Cancelled locally by {username} ({e})"
        db.commit()
        return {"success": True, "message": f"Task for host ID {host_id} marked as cancelled."}


@router.get("/history")
@router.get("/history/")
async def get_deployment_history(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
    year: Optional[int] = Query(None, description="Filter by year e.g. 2026"),
    month: Optional[int] = Query(None, description="Filter by month 1-12"),
    task_type: Optional[str] = Query(None, description="Filter by task type ('Deployment' or 'Image Capture')"),
    status: Optional[str] = Query(None, description="Filter by status ('Pending', 'Running', 'Completed', 'Failed', 'Cancelled')"),
    search: Optional[str] = Query(None, description="Search term for PC name, MAC, or image"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=200, description="Items per page"),
):
    now = datetime.now(timezone.utc)
    fog_tasks = await fog_client.get_active_tasks()
    reconcile_active_tasks(db, fog_tasks, now)

    query = db.query(DeploymentRecord)

    # Filter task_type
    if task_type and task_type.lower() not in ["all", ""]:
        query = query.filter(func.lower(DeploymentRecord.task_type) == task_type.lower())

    # Filter status
    if status and status.lower() not in ["all", ""]:
        norm_s = status.strip().title()
        if norm_s == "Pending":
            query = query.filter(DeploymentRecord.status.in_(["Pending", "Queued", "Waiting"]))
        elif norm_s == "Running":
            query = query.filter(DeploymentRecord.status.in_(["Running", "Deploying"]))
        else:
            query = query.filter(DeploymentRecord.status == norm_s)

    # Filter year / month on created_at or started_at
    if year:
        query = query.filter(extract("year", func.coalesce(DeploymentRecord.started_at, DeploymentRecord.created_at)) == year)
    if month:
        query = query.filter(extract("month", func.coalesce(DeploymentRecord.started_at, DeploymentRecord.created_at)) == month)

    # Search filter
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(DeploymentRecord.host_name).like(term),
                func.lower(DeploymentRecord.host_mac).like(term),
                func.lower(DeploymentRecord.image_name).like(term),
                func.lower(DeploymentRecord.created_by).like(term),
            )
        )

    # Calculate distinct available years for frontend dropdown
    available_years = [
        int(r[0])
        for r in db.query(extract("year", func.coalesce(DeploymentRecord.started_at, DeploymentRecord.created_at)).label("yr"))
        .distinct()
        .all()
        if r[0] is not None
    ]
    current_year = datetime.now(IST).year
    if current_year not in available_years:
        available_years.append(current_year)
    available_years.sort(reverse=True)

    total_count = query.count()
    offset = (page - 1) * page_size
    records = query.order_by(DeploymentRecord.id.desc()).offset(offset).limit(page_size).all()

    history = []
    for r in records:
        norm_status = r.status
        if norm_status in ["Queued", "Waiting"]:
            norm_status = "Pending"
        elif norm_status == "Deploying":
            norm_status = "Running"

        duration_sec = None
        if r.started_at and r.completed_at:
            s = r.started_at.replace(tzinfo=timezone.utc) if r.started_at.tzinfo is None else r.started_at
            c = r.completed_at.replace(tzinfo=timezone.utc) if r.completed_at.tzinfo is None else r.completed_at
            duration_sec = max(0, round((c - s).total_seconds()))

        history.append({
            "id": r.id,
            "fog_task_id": r.fog_task_id,
            "task_type": r.task_type or "Deployment",
            "host_id": r.host_id,
            "host_name": r.host_name,
            "host_mac": r.host_mac,
            "image_id": r.image_id,
            "image_name": r.image_name,
            "status": norm_status,
            "percent": r.percent or ("100" if norm_status == "Completed" else "0"),
            "started_at": format_utc_iso(r.started_at),
            "completed_at": format_utc_iso(r.completed_at),
            "created_at": format_utc_iso(r.created_at),
            "duration_seconds": duration_sec,
            "error_message": r.error_message,
            "created_by": r.created_by,
        })

    return {
        "deployments": history,
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "available_years": available_years,
    }


@router.delete("/history")
@router.delete("/history/")
@router.delete("/history/clear")
async def clear_deployment_history(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    count = db.query(DeploymentRecord).count()
    db.query(DeploymentRecord).delete()
    db.commit()
    return {
        "success": True,
        "message": f"Successfully cleared all {count} history record(s).",
        "cleared_count": count,
    }

