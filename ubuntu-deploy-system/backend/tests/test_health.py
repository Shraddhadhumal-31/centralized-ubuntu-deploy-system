import os
os.environ.setdefault("FOG_API_TOKEN", "test")
os.environ.setdefault("FOG_USER_TOKEN", "test")
os.environ.setdefault("JWT_SECRET", "testsecret")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "fog_connected" in data
    assert "version" in data


def test_login_required_for_dashboard():
    r = client.get("/api/dashboard")
    assert r.status_code == 403


def test_login_invalid_credentials():
    r = client.post(
        "/api/auth/login",
        json={"username": "wrong", "password": "wrong"},
    )
    assert r.status_code == 401


def test_login_success():
    r = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin"},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()
