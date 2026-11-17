from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, timezone, timedelta
from ..auth import verify_token
from ..database import get_db
from ..models import DeploymentRecord, RegisteredHost, RegisteredImage, ReportingReset, SystemSetting
from ..fog_client import fog_client
from ..config import get_settings
from .deployments import reconcile_active_tasks, format_utc_iso

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

IST = timezone(timedelta(hours=5, minutes=30))


def get_current_master_hostname(db: Session) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "master_hostname").first()
    if setting and setting.value:
        return setting.value.strip()
    return get_settings().MASTER_HOSTNAME


class ResetCountersRequest(BaseModel):
    scope: str = "all"  # "all", "deployment", "capture"


def check_and_apply_monthly_reset(db: Session, now_ist: datetime) -> ReportingReset:
    """
    Checks if a monthly reset entry exists for the current IST month.
    If not, automatically records a monthly baseline reset at the start of this month.
    """
    current_month_str = now_ist.strftime("%Y-%m")
    
    existing = (
        db.query(ReportingReset)
        .filter(ReportingReset.period_month == current_month_str)
        .order_by(ReportingReset.reset_at.desc())
        .first()
    )

    if not existing:
        # Create start of month in IST, converted to UTC
        month_start_ist = datetime(now_ist.year, now_ist.month, 1, 0, 0, 0, tzinfo=IST)
        month_start_utc = month_start_ist.astimezone(timezone.utc).replace(tzinfo=None)

        new_reset = ReportingReset(
            period_month=current_month_str,
            scope="all",
            reset_at=month_start_utc,
            reset_by="system",
            is_automatic=True,
        )
        db.add(new_reset)
        db.commit()
        db.refresh(new_reset)
        return new_reset

    return existing


@router.get("")
@router.get("/")
async def get_dashboard(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(IST)
    master_name = get_current_master_hostname(db).lower()

    # 1. Automatic Monthly Reset Check
    latest_reset = check_and_apply_monthly_reset(db, now_ist)
    baseline_time = latest_reset.reset_at if latest_reset else datetime(now_ist.year, now_ist.month, 1, 0, 0, 0)

    # 2. Fetch live data from FOG
    try:
        hosts = await fog_client.get_hosts()
    except Exception:
        hosts = []

    try:
        images = await fog_client.get_images()
    except Exception:
        images = []

    try:
        active_tasks = await fog_client.get_active_tasks()
    except Exception:
        active_tasks = []

    # 3. Reconcile active tasks
    reconcile_active_tasks(db, active_tasks, now_utc)

    # 4. Classify hosts
    master_host = None
    target_hosts = []
    for h in hosts:
        name = h.get("name", "")
        raw_mac = h.get("primac", h.get("mac", ""))
        entry = {
            "id": h.get("id"),
            "name": name,
            "mac": raw_mac,
            "ip": h.get("ip", ""),
            "imageID": h.get("imageID", ""),
            "imageName": h.get("imagename", h.get("imageName", "")),
        }
        if name.lower() == master_name:
            master_host = entry
        else:
            target_hosts.append(entry)

    # If master_host not in FOG, check SQLite
    if not master_host:
        db_master = db.query(RegisteredHost).filter(RegisteredHost.name.ilike(master_name)).first()
        if db_master:
            master_host = {
                "id": db_master.fog_id or db_master.id,
                "name": db_master.name,
                "mac": db_master.mac,
                "ip": db_master.ip or "",
                "imageID": db_master.image_id or "",
                "imageName": db_master.image_name or "",
            }

    # Helper function to compute statistics for a specific task type and time range
    def compute_stats(t_type: str, since_dt: Optional[datetime] = None):
        q = db.query(DeploymentRecord).filter(func.lower(DeploymentRecord.task_type) == t_type.lower())
        if since_dt:
            q = q.filter(func.coalesce(DeploymentRecord.started_at, DeploymentRecord.created_at) >= since_dt)

        total = q.count()
        completed = q.filter(DeploymentRecord.status == "Completed").count()
        failed = q.filter(DeploymentRecord.status == "Failed").count()
        cancelled = q.filter(DeploymentRecord.status == "Cancelled").count()
        running = q.filter(DeploymentRecord.status.in_(["Running", "Deploying"])).count()
        pending = q.filter(DeploymentRecord.status.in_(["Pending", "Queued", "Waiting"])).count()

        return {
            "total": total,
            "completed": completed,
            "in_progress": running + pending,
            "running": running,
            "pending": pending,
            "failed": failed,
            "cancelled": cancelled,
        }

    # Period Statistics (since baseline reset)
    deploy_stats_period = compute_stats("Deployment", baseline_time)
    capture_stats_period = compute_stats("Image Capture", baseline_time)

    # Lifetime Statistics
    deploy_stats_lifetime = compute_stats("Deployment", None)
    capture_stats_lifetime = compute_stats("Image Capture", None)

    # Combined totals
    active_deploy_running = deploy_stats_period["running"]
    active_deploy_pending = deploy_stats_period["pending"]
    active_capture_running = capture_stats_period["running"]
    active_capture_pending = capture_stats_period["pending"]

    # 5. Fetch 10 most recent activities
    recent_records = (
        db.query(DeploymentRecord)
        .order_by(DeploymentRecord.id.desc())
        .limit(10)
        .all()
    )
    recent_list = []
    for r in recent_records:
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

        recent_list.append({
            "id": r.id,
            "task_type": r.task_type or "Deployment",
            "host_id": r.host_id,
            "host_name": r.host_name,
            "host_mac": r.host_mac,
            "image_name": r.image_name,
            "status": norm_status,
            "percent": r.percent or ("100" if norm_status == "Completed" else "0"),
            "started_at": format_utc_iso(r.started_at),
            "completed_at": format_utc_iso(r.completed_at),
            "created_at": format_utc_iso(r.created_at),
            "duration_seconds": duration_sec,
            "error_message": r.error_message,
        })

    # 6. Fetch live active tasks
    active_db_records = (
        db.query(DeploymentRecord)
        .filter(DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Deploying"]))
        .order_by(DeploymentRecord.id.desc())
        .all()
    )
    active_list = []
    for r in active_db_records:
        elapsed = 0
        ref_time = r.started_at or r.created_at
        if ref_time:
            s = ref_time.replace(tzinfo=timezone.utc) if ref_time.tzinfo is None else ref_time
            elapsed = max(0, (now_utc - s).total_seconds())

        active_list.append({
            "id": r.id,
            "task_type": r.task_type or "Deployment",
            "host_id": r.host_id,
            "host_name": r.host_name,
            "host_mac": r.host_mac,
            "image_name": r.image_name,
            "status": "Running" if r.status in ["Running", "Deploying"] else "Pending",
            "percent": r.percent or "0",
            "elapsed_seconds": round(elapsed),
            "started_at": format_utc_iso(r.started_at),
            "created_at": format_utc_iso(r.created_at),
        })

    # Format reporting baseline period label in IST
    base_ist = baseline_time.replace(tzinfo=timezone.utc).astimezone(IST)
    reporting_period_label = base_ist.strftime("%B %Y")
    reset_timestamp_str = base_ist.strftime("%d %b %Y, %I:%M %p IST")

    return {
        "master_host": master_host,
        "master_hostname": master_name,
        "total_hosts": len(target_hosts),
        "total_images": len(images),
        "target_hosts": target_hosts,
        "reporting_period": {
            "period_month": now_ist.strftime("%Y-%m"),
            "label": reporting_period_label,
            "reset_at": format_utc_iso(baseline_time),
            "reset_at_formatted": reset_timestamp_str,
            "reset_by": latest_reset.reset_by if latest_reset else "system",
            "is_automatic": latest_reset.is_automatic if latest_reset else True,
        },
        # Separate Deployment and Capture Statistics
        "deployment_stats": deploy_stats_period,
        "capture_stats": capture_stats_period,
        "lifetime_stats": {
            "deployment": deploy_stats_lifetime,
            "capture": capture_stats_lifetime,
        },
        # Backward compatibility fields
        "active_tasks_count": active_deploy_running + active_deploy_pending + active_capture_running + active_capture_pending,
        "running_count": active_deploy_running + active_capture_running,
        "pending_count": active_deploy_pending + active_capture_pending,
        "completed_count": deploy_stats_period["completed"],
        "failed_count": deploy_stats_period["failed"] + deploy_stats_period["cancelled"],
        "active_deployments": active_list,
        "recent_deployments": recent_list,
    }


@router.post("/reset-counters")
@router.post("/reset-counters/")
async def reset_reporting_counters(
    req: ResetCountersRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(IST)
    current_month_str = now_ist.strftime("%Y-%m")

    new_reset = ReportingReset(
        period_month=current_month_str,
        scope=req.scope,
        reset_at=now_utc.replace(tzinfo=None),
        reset_by=username,
        is_automatic=False,
    )
    db.add(new_reset)
    db.commit()
    db.refresh(new_reset)

    ist_str = now_ist.strftime("%d %b %Y, %I:%M %p IST")

    return {
        "success": True,
        "message": f"Dashboard reporting counters reset successfully for scope '{req.scope}' (Baseline: {ist_str}). Lifetime task history remains completely preserved.",
        "reset_at": format_utc_iso(now_utc),
        "reset_formatted": ist_str,
        "scope": req.scope,
    }


@router.get("/tasks-by-status")
@router.get("/tasks-by-status/")
async def get_tasks_by_status(
    status: str = Query(..., description="Target status (e.g. Failed, Cancelled, Running, Pending, Completed, active)"),
    task_type: Optional[str] = Query(None, description="Deployment or Image Capture"),
    period: str = Query("current", description="'current' for current reporting period, 'lifetime' for all time"),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Returns tasks filtered by status for the interactive click-to-inspect modal on the dashboard cards.
    """
    now_ist = datetime.now(IST)
    latest_reset = check_and_apply_monthly_reset(db, now_ist)
    baseline_time = latest_reset.reset_at if latest_reset else datetime(now_ist.year, now_ist.month, 1, 0, 0, 0)

    query = db.query(DeploymentRecord)

    if period == "current" and baseline_time:
        query = query.filter(func.coalesce(DeploymentRecord.started_at, DeploymentRecord.created_at) >= baseline_time)

    if task_type and task_type.lower() not in ["all", ""]:
        query = query.filter(func.lower(DeploymentRecord.task_type) == task_type.lower())

    norm_s = status.strip().lower()
    if norm_s == "in_progress" or norm_s == "active":
        query = query.filter(DeploymentRecord.status.in_(["Pending", "Running", "Queued", "Waiting", "Deploying"]))
    elif norm_s == "running":
        query = query.filter(DeploymentRecord.status.in_(["Running", "Deploying"]))
    elif norm_s == "pending":
        query = query.filter(DeploymentRecord.status.in_(["Pending", "Queued", "Waiting"]))
    elif norm_s == "failed":
        query = query.filter(DeploymentRecord.status == "Failed")
    elif norm_s == "cancelled":
        query = query.filter(DeploymentRecord.status == "Cancelled")
    elif norm_s == "completed":
        query = query.filter(DeploymentRecord.status == "Completed")
    else:
        query = query.filter(func.lower(DeploymentRecord.status) == norm_s)

    records = query.order_by(DeploymentRecord.id.desc()).limit(100).all()

    tasks_out = []
    for r in records:
        duration_sec = None
        if r.started_at and r.completed_at:
            s = r.started_at.replace(tzinfo=timezone.utc) if r.started_at.tzinfo is None else r.started_at
            c = r.completed_at.replace(tzinfo=timezone.utc) if r.completed_at.tzinfo is None else r.completed_at
            duration_sec = max(0, round((c - s).total_seconds()))

        tasks_out.append({
            "id": r.id,
            "task_type": r.task_type or "Deployment",
            "host_id": r.host_id,
            "host_name": r.host_name,
            "host_mac": r.host_mac,
            "image_name": r.image_name,
            "status": r.status,
            "percent": r.percent or ("100" if r.status == "Completed" else "0"),
            "started_at": format_utc_iso(r.started_at),
            "completed_at": format_utc_iso(r.completed_at),
            "created_at": format_utc_iso(r.created_at),
            "duration_seconds": duration_sec,
            "error_message": r.error_message,
        })

    return {
        "status": status,
        "task_type": task_type or "All",
        "period": period,
        "count": len(tasks_out),
        "tasks": tasks_out,
    }
