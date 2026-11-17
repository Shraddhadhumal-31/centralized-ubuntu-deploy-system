from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from datetime import datetime, timezone
from .database import Base


class DeploymentRecord(Base):
    __tablename__ = "deployment_history"

    id = Column(Integer, primary_key=True, index=True)
    fog_task_id = Column(Integer, nullable=True)
    task_type = Column(String(50), default="Deployment")  # "Deployment" or "Image Capture"
    host_id = Column(Integer, nullable=False)
    host_name = Column(String(255), nullable=False)
    host_mac = Column(String(17), nullable=True)
    image_id = Column(Integer, nullable=False)
    image_name = Column(String(255), nullable=False)  # Clean image name without prefixes
    status = Column(String(50), default="Pending")  # Pending, Running, Completed, Failed, Cancelled
    percent = Column(String(10), default="0")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_by = Column(String(100), default="admin")


class RegisteredHost(Base):
    __tablename__ = "registered_hosts"

    id = Column(Integer, primary_key=True, index=True)
    fog_id = Column(Integer, nullable=True, unique=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    mac = Column(String(17), nullable=False, unique=True, index=True)
    ip = Column(String(50), nullable=True)
    role = Column(String(50), default="client")  # "master", "client", "target_workstation"
    image_id = Column(Integer, nullable=True)
    image_name = Column(String(255), nullable=True)
    is_master = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RegisteredImage(Base):
    __tablename__ = "registered_images"

    id = Column(Integer, primary_key=True, index=True)
    fog_id = Column(Integer, nullable=True, unique=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    path = Column(String(255), nullable=False)
    size = Column(String(100), nullable=True)
    size_gb = Column(String(50), nullable=True)
    image_type_id = Column(Integer, default=1)
    os_id = Column(Integer, default=50)
    image_partition_type_id = Column(Integer, default=1)
    status = Column(String(50), default="ready")  # "ready", "pending_capture", "failed", "incomplete"
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ReportingReset(Base):
    __tablename__ = "reporting_resets"

    id = Column(Integer, primary_key=True, index=True)
    period_month = Column(String(7), nullable=False, index=True)  # e.g. "2026-10"
    scope = Column(String(50), default="all")  # "all", "deployment", "capture"
    reset_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    reset_by = Column(String(100), default="system")
    is_automatic = Column(Boolean, default=False)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
