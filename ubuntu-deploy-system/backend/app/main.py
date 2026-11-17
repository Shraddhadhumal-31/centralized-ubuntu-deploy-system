import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from .config import get_settings
from .database import init_db
from .fog_client import fog_client
from .routers import auth_router, dashboard, computers, deployments, images, wol

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialised and migrated")
    settings = get_settings()
    logger.info(f"FOG URL: {settings.FOG_BASE_URL}")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="Ubuntu Deploy System",
    description="Centralized Ubuntu Deployment System for Computer Laboratory",
    version="1.0.0",
    lifespan=lifespan,
)

# Global exception handler ensuring all errors return valid JSON (never plain text or HTML)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )


settings = get_settings()
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(dashboard.router)
app.include_router(computers.router)
app.include_router(deployments.router)
app.include_router(images.router)
app.include_router(wol.router)


@app.get("/api/health")
async def health_check():
    fog_ok = await fog_client.check_connection()
    return {"status": "ok", "fog_connected": fog_ok, "version": "1.0.0"}


# ── Serve built frontend in production ──
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=str(frontend_dist / "assets")),
        name="static-assets",
    )

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Guard: API routes must never return HTML
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail=f"API route '/{full_path}' not found")

        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist / "index.html"))
