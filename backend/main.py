"""TRIAGE V2 – FastAPI entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from database import init_db
from routes.tasks import router as tasks_router
from routes.teams import router as teams_router
from routes.zones import router as zones_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Startup: create tables
    await init_db()
    print("[OK] Database initialised")
    yield
    # Shutdown
    print("[STOP] Shutting down")


app = FastAPI(
    title="TRIAGE V2 API",
    description="Offline-First Afet Yönetim Sistemi – Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS – permissive for LAN usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(tasks_router)
app.include_router(teams_router)
app.include_router(zones_router)


@app.get("/health", tags=["system"])
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "triage-v2"}
