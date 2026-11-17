import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from ..auth import verify_token
from ..database import get_db
from ..models import RegisteredHost, SystemSetting, DeploymentRecord
from ..fog_client import fog_client
from ..config import get_settings

router = APIRouter(prefix="/api/computers", tags=["computers"])


def get_current_master_hostname(db: Session) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "master_hostname").first()
    if setting and setting.value:
        return setting.value.strip()
    return get_settings().MASTER_HOSTNAME


class RegisterHostRequest(BaseModel):
    hostname: str
    mac: str
    image_id: int = 0
    role: str = "client"  # "client" or "target_workstation"

    @field_validator("hostname")
    @classmethod
    def validate_hostname(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 63:
            raise ValueError("Hostname must be 1-63 characters")
        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9\-_]*$", v):
            raise ValueError(
                "Hostname must start with an alphanumeric character and contain only letters, numbers, hyphens, and underscores"
            )
        return v

    @field_validator("mac")
    @classmethod
    def validate_mac(cls, v: str) -> str:
        v = v.strip().upper()
        mac_clean = re.sub(r"[^A-F0-9]", "", v)
        if len(mac_clean) != 12:
            raise ValueError("Invalid MAC address. Must be 12 hexadecimal characters (e.g. AA:BB:CC:DD:EE:FF)")
        return ":".join(mac_clean[i : i + 2] for i in range(0, 12, 2))


class RegisterMasterRequest(BaseModel):
    hostname: str
    mac: str
    image_id: int = 0

    @field_validator("hostname")
    @classmethod
    def validate_hostname(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 63:
            raise ValueError("Hostname must be 1-63 characters")
        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9\-_]*$", v):
            raise ValueError(
                "Hostname must start with an alphanumeric character and contain only letters, numbers, hyphens, and underscores"
            )
        return v

    @field_validator("mac")
    @classmethod
    def validate_mac(cls, v: str) -> str:
        v = v.strip().upper()
        mac_clean = re.sub(r"[^A-F0-9]", "", v)
        if len(mac_clean) != 12:
            raise ValueError("Invalid MAC address. Must be 12 hexadecimal characters (e.g. AA:BB:CC:DD:EE:FF)")
        return ":".join(mac_clean[i : i + 2] for i in range(0, 12, 2))


class BatchRegisterRequest(BaseModel):
    hosts: List[RegisterHostRequest]


class UpdateRoleRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ["master", "client", "target_workstation"]:
            raise ValueError("Role must be one of: master, client, target_workstation")
        return v


@router.get("")
@router.get("/")
async def list_computers(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    master_name = get_current_master_hostname(db).lower()

    try:
        fog_hosts = await fog_client.get_hosts()
    except Exception:
        fog_hosts = []

    db_hosts = db.query(RegisteredHost).all()
    db_by_name = {h.name.lower(): h for h in db_hosts}
    db_by_mac = {h.mac.upper(): h for h in db_hosts}
    db_by_fid = {h.fog_id: h for h in db_hosts if h.fog_id}

    result = []
    seen_names = set()

    for h in fog_hosts:
        hname = h.get("name", "")
        raw_mac = h.get("primac", h.get("mac", "")).upper()
        clean_mac = re.sub(r"[^A-F0-9]", "", raw_mac)
        formatted_mac = ":".join(clean_mac[i : i + 2] for i in range(0, 12, 2)) if len(clean_mac) == 12 else raw_mac
        fid = int(h.get("id")) if str(h.get("id", "")).isdigit() else None
        is_m = (hname.lower() == master_name)

        existing = db_by_fid.get(fid) or db_by_name.get(hname.lower()) or db_by_mac.get(formatted_mac)
        role = "master" if is_m else "client"

        if existing:
            existing.fog_id = fid
            existing.name = hname
            existing.mac = formatted_mac
            existing.ip = h.get("ip", "")
            existing.image_id = int(h.get("imageID")) if str(h.get("imageID", "")).isdigit() else None
            existing.image_name = h.get("imagename", h.get("imageName", ""))
            existing.is_master = is_m
            if is_m:
                existing.role = "master"
            elif existing.role == "master" and not is_m:
                existing.role = "client"
            role = existing.role
        else:
            new_h = RegisteredHost(
                fog_id=fid,
                name=hname,
                mac=formatted_mac,
                ip=h.get("ip", ""),
                role="master" if is_m else "client",
                image_id=int(h.get("imageID")) if str(h.get("imageID", "")).isdigit() else None,
                image_name=h.get("imagename", h.get("imageName", "")),
                is_master=is_m,
            )
            db.add(new_h)
            role = new_h.role

        seen_names.add(hname.lower())
        result.append({
            "id": h.get("id"),
            "name": hname,
            "mac": formatted_mac,
            "ip": h.get("ip", ""),
            "role": role,
            "imageID": h.get("imageID", ""),
            "imageName": h.get("imagename", h.get("imageName", "Ubuntu_Master")),
            "is_master": is_m,
        })

    db.commit()

    for db_h in db_hosts:
        if db_h.name.lower() not in seen_names:
            is_m = (db_h.name.lower() == master_name)
            result.append({
                "id": db_h.fog_id or db_h.id,
                "name": db_h.name,
                "mac": db_h.mac,
                "ip": db_h.ip or "",
                "role": db_h.role or ("master" if is_m else "client"),
                "imageID": db_h.image_id or "",
                "imageName": db_h.image_name or "Ubuntu_Master",
                "is_master": is_m,
            })

    return {"hosts": result}


@router.get("/master")
@router.get("/master/")
async def get_master_computer(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    master_name = get_current_master_hostname(db)
    
    db_master = (
        db.query(RegisteredHost)
        .filter(
            (RegisteredHost.name == master_name) | (RegisteredHost.is_master == True)
        )
        .first()
    )

    fog_master = None
    try:
        fog_hosts = await fog_client.get_hosts()
        for h in fog_hosts:
            if h.get("name", "").lower() == master_name.lower():
                fog_master = h
                break
    except Exception:
        pass

    if fog_master:
        raw_mac = fog_master.get("primac", fog_master.get("mac", "")).upper()
        clean_mac = re.sub(r"[^A-F0-9]", "", raw_mac)
        formatted_mac = ":".join(clean_mac[i : i + 2] for i in range(0, 12, 2)) if len(clean_mac) == 12 else raw_mac
        return {
            "master_host": {
                "id": fog_master.get("id"),
                "name": fog_master.get("name"),
                "mac": formatted_mac,
                "ip": fog_master.get("ip", ""),
                "role": "master",
                "is_master": True,
            }
        }
    elif db_master:
        return {
            "master_host": {
                "id": db_master.fog_id or db_master.id,
                "name": db_master.name,
                "mac": db_master.mac,
                "ip": db_master.ip or "",
                "role": "master",
                "is_master": True,
            }
        }
    else:
        return {"master_host": None}


@router.post("/master")
@router.post("/master/")
async def register_master_computer(
    req: RegisterMasterRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    clean_req_mac = re.sub(r"[^A-F0-9]", "", req.mac.upper())
    clean_name = req.hostname.strip()

    # Demote existing master in SQLite
    db.query(RegisteredHost).filter(RegisteredHost.is_master == True).update({"is_master": False, "role": "client"})

    # Update system setting
    setting = db.query(SystemSetting).filter(SystemSetting.key == "master_hostname").first()
    if not setting:
        setting = SystemSetting(key="master_hostname", value=clean_name, updated_at=datetime.now(timezone.utc))
        db.add(setting)
    else:
        setting.value = clean_name
        setting.updated_at = datetime.now(timezone.utc)

    # Check if host exists in FOG
    fog_host_id = None
    try:
        existing_fog = await fog_client.get_hosts()
        for h in existing_fog:
            h_mac_clean = re.sub(r"[^A-F0-9]", "", str(h.get("primac") or h.get("mac") or "").upper())
            if h.get("name", "").lower() == clean_name.lower() or h_mac_clean == clean_req_mac:
                fog_host_id = int(h.get("id"))
                break
    except Exception:
        pass

    # If not in FOG, create it
    if not fog_host_id:
        try:
            target_img_id = req.image_id or 1
            res = await fog_client.create_host(name=clean_name, mac=req.mac, image_id=target_img_id)
            if res and isinstance(res, dict) and res.get("id"):
                fog_host_id = int(res["id"])
        except Exception:
            pass

    # Save / update in SQLite
    db_host = (
        db.query(RegisteredHost)
        .filter((RegisteredHost.name == clean_name) | (RegisteredHost.mac == req.mac))
        .first()
    )
    if db_host:
        db_host.name = clean_name
        db_host.mac = req.mac
        db_host.role = "master"
        db_host.is_master = True
        if fog_host_id:
            db_host.fog_id = fog_host_id
    else:
        db_host = RegisteredHost(
            fog_id=fog_host_id,
            name=clean_name,
            mac=req.mac,
            role="master",
            is_master=True,
            image_name="Ubuntu_Master",
        )
        db.add(db_host)

    db.commit()

    return {
        "success": True,
        "message": f"Master PC '{clean_name}' ({req.mac}) registered successfully as the golden image source.",
        "master_host": {
            "id": fog_host_id or db_host.id,
            "name": clean_name,
            "mac": req.mac,
            "role": "master",
            "is_master": True,
        },
    }


@router.post("")
@router.post("/")
async def register_computer(
    req: RegisterHostRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    clean_req_mac = re.sub(r"[^A-F0-9]", "", req.mac.upper())

    # Check duplicates in FOG
    existing = await fog_client.get_hosts()
    for h in existing:
        h_name = h.get("name", "")
        h_mac_clean = re.sub(r"[^A-F0-9]", "", str(h.get("primac") or h.get("mac") or "").upper())

        if h_name.lower() == req.hostname.lower():
            raise HTTPException(
                status_code=409,
                detail=f"A computer with hostname '{req.hostname}' is already registered in FOG (Host ID: {h.get('id')}).",
            )
        if h_mac_clean == clean_req_mac:
            raise HTTPException(
                status_code=409,
                detail=f"MAC address '{req.mac}' is already registered to '{h_name}'.",
            )

    # Check duplicates in SQLite database
    db_dup = (
        db.query(RegisteredHost)
        .filter((RegisteredHost.name == req.hostname) | (RegisteredHost.mac == req.mac))
        .first()
    )
    if db_dup:
        if db_dup.name.lower() == req.hostname.lower():
            raise HTTPException(status_code=409, detail=f"Hostname '{req.hostname}' is already registered in database.")
        if db_dup.mac == req.mac:
            raise HTTPException(status_code=409, detail=f"MAC '{req.mac}' is already registered to '{db_dup.name}' in database.")

    # Determine default image ID if none specified
    target_img_id = req.image_id
    if not target_img_id or target_img_id <= 0:
        try:
            imgs = await fog_client.get_images()
            if imgs:
                target_img_id = int(imgs[0].get("id", 1))
        except Exception:
            target_img_id = 1

    try:
        result = await fog_client.create_host(
            name=req.hostname,
            mac=req.mac,
            image_id=target_img_id,
        )
        fog_id = result.get("id") if isinstance(result, dict) else None

        db_host = RegisteredHost(
            fog_id=int(fog_id) if fog_id and str(fog_id).isdigit() else None,
            name=req.hostname,
            mac=req.mac,
            role="client",
            image_id=target_img_id,
            image_name="Ubuntu_Master",
            is_master=False,
        )
        db.add(db_host)
        db.commit()
        db.refresh(db_host)

        return {
            "success": True,
            "message": f"Client computer '{req.hostname}' ({req.mac}) registered successfully!",
            "data": {
                "id": fog_id or db_host.id,
                "name": req.hostname,
                "mac": req.mac,
                "role": "client",
                "image_id": target_img_id,
                "is_master": False,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to register computer in FOG: {str(e)}"
        )


@router.post("/batch")
@router.post("/batch/")
async def batch_register_computers(
    req: BatchRegisterRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    if not req.hosts:
        raise HTTPException(status_code=400, detail="Host list cannot be empty")

    succeeded = []
    failed = []

    for item in req.hosts:
        try:
            res = await register_computer(item, username, db)
            succeeded.append({
                "hostname": item.hostname,
                "mac": item.mac,
                "role": "client",
                "detail": "Successfully registered",
            })
        except HTTPException as he:
            failed.append({
                "hostname": item.hostname,
                "mac": item.mac,
                "error": he.detail,
            })
        except Exception as ex:
            failed.append({
                "hostname": item.hostname,
                "mac": item.mac,
                "error": str(ex),
            })

    return {
        "success": len(succeeded) > 0,
        "total": len(req.hosts),
        "succeeded_count": len(succeeded),
        "failed_count": len(failed),
        "succeeded": succeeded,
        "failed": failed,
    }


@router.put("/{host_id}/role")
@router.put("/{host_id}/role/")
async def update_computer_role(
    host_id: int,
    req: UpdateRoleRequest,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    host = await fog_client.get_host(host_id)
    hostname = host.get("name") if host else None

    db_h = (
        db.query(RegisteredHost)
        .filter((RegisteredHost.fog_id == host_id) | (RegisteredHost.id == host_id))
        .first()
    )

    if not db_h and not hostname:
        raise HTTPException(status_code=404, detail=f"Host ID {host_id} not found")

    h_name = hostname or (db_h.name if db_h else f"Host-{host_id}")

    if req.role == "master":
        setting = db.query(SystemSetting).filter(SystemSetting.key == "master_hostname").first()
        if not setting:
            db.add(SystemSetting(key="master_hostname", value=h_name))
        else:
            setting.value = h_name

        db.query(RegisteredHost).filter(RegisteredHost.is_master == True).update({"is_master": False, "role": "client"})

    if db_h:
        db_h.role = req.role
        db_h.is_master = (req.role == "master")
    else:
        db_h = RegisteredHost(
            fog_id=host_id,
            name=h_name,
            mac=host.get("primac", "") if host else "",
            role=req.role,
            is_master=(req.role == "master"),
        )
        db.add(db_h)

    db.commit()
    return {"success": True, "message": f"Updated role for '{h_name}' to '{req.role}'"}


@router.delete("/{host_id}")
@router.delete("/{host_id}/")
async def delete_computer(
    host_id: int,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    host = await fog_client.get_host(host_id)
    if not host:
        db_h = db.query(RegisteredHost).filter(RegisteredHost.id == host_id).first()
        if not db_h:
            raise HTTPException(status_code=404, detail=f"Host ID {host_id} not found")
        hostname = db_h.name
    else:
        hostname = host.get("name", "")

    try:
        await fog_client.delete_host(host_id)
        db.query(RegisteredHost).filter(
            (RegisteredHost.fog_id == host_id) | (RegisteredHost.id == host_id) | (RegisteredHost.name == hostname)
        ).delete()
        db.commit()

        return {
            "success": True,
            "message": f"Computer '{hostname}' removed from registration successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete computer from FOG: {str(e)}"
        )
