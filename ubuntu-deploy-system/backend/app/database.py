from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import get_settings

settings = get_settings()
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Safe SQLite column migration for existing tables
    try:
        with engine.connect() as conn:
            cursor = conn.connection.cursor()
            
            # deployment_history migrations
            cursor.execute("PRAGMA table_info(deployment_history)")
            dep_cols = [row[1] for row in cursor.fetchall()]
            if "percent" not in dep_cols:
                cursor.execute("ALTER TABLE deployment_history ADD COLUMN percent VARCHAR(10) DEFAULT '0'")
            if "created_at" not in dep_cols:
                cursor.execute("ALTER TABLE deployment_history ADD COLUMN created_at TIMESTAMP")
            if "task_type" not in dep_cols:
                cursor.execute("ALTER TABLE deployment_history ADD COLUMN task_type VARCHAR(50) DEFAULT 'Deployment'")

            # registered_hosts migrations
            cursor.execute("PRAGMA table_info(registered_hosts)")
            host_cols = [row[1] for row in cursor.fetchall()]
            if "role" not in host_cols:
                cursor.execute("ALTER TABLE registered_hosts ADD COLUMN role VARCHAR(50) DEFAULT 'client'")

            # registered_images migrations
            cursor.execute("PRAGMA table_info(registered_images)")
            img_cols = [row[1] for row in cursor.fetchall()]
            if "size_gb" not in img_cols:
                cursor.execute("ALTER TABLE registered_images ADD COLUMN size_gb VARCHAR(50)")
            if "image_partition_type_id" not in img_cols:
                cursor.execute("ALTER TABLE registered_images ADD COLUMN image_partition_type_id INTEGER DEFAULT 1")
            if "status" not in img_cols:
                cursor.execute("ALTER TABLE registered_images ADD COLUMN status VARCHAR(50) DEFAULT 'ready'")

            conn.connection.commit()
    except Exception:
        pass
