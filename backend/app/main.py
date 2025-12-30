import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.database import init_db
from app.routers import movies, tvshows, library, health, search, settings as settings_router, tautulli
from app.routers import plex
from app.routers import queues as queues_router
from app.services.logging_service import setup_database_logging
from app.services.queue import QueueWorker
# Import models to ensure all tables are registered with SQLAlchemy
from app import models  # noqa: F401

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events"""
    # Ensure console logging level is set for startup audit logs
    log_level = logging.DEBUG if settings.debug else logging.INFO
    logging.basicConfig(level=log_level)

    # Startup audit information
    logger.info(f"Starting {settings.app_name} (version {settings.app_version})")
    logger.info(f"Server host={settings.host} port={settings.port} debug={settings.debug}")
    logger.info(f"MB_AUTO_MOVE_DB={os.getenv('MB_AUTO_MOVE_DB', 'false')} PUID={os.getenv('PUID')} PGID={os.getenv('PGID')}")
    logger.info(f"TMDB key configured={bool(settings.tmdb_api_key)} OMDB key configured={bool(settings.omdb_api_key)}")
    logger.info(f"Data dir: {settings.data_dir} (exists={settings.data_dir.exists()})")
    logger.info(f"Log dir: {settings.log_dir} (exists={settings.log_dir.exists()})")

    # Show which database URL will be used
    db_url = settings.database_url
    logger.info(f"Database URL: {db_url}")
    # If using sqlite file, show the file path and size
    if isinstance(db_url, str) and (db_url.startswith('sqlite') or 'sqlite' in db_url):
        # extract path after ':///' occurrences
        path_part = db_url.split(':///')[-1]
        try:
            db_path = Path(path_part)
            logger.info(f"Resolved DB path: {db_path} (exists={db_path.exists()} size={'{:,}'.format(db_path.stat().st_size) if db_path.exists() else 'n/a'})")
        except Exception:
            logger.info("Resolved DB path: could not parse path from database URL")

    # Initialize database
    await init_db()

    # Initialize database logging (now that DB is available)
    setup_database_logging(level=log_level)


    # Recover any stale RUNNING tasks left from a previous crash
    from app.services.queue import clear_queued_tasks
    try:
        recovered = await clear_queued_tasks(older_than_seconds=60 * 30)  # clear tasks older than 30m
        if recovered and recovered.get('tasks_cleared'):
            logger.warning(f"Recovered and cleared {recovered['tasks_cleared']} stale queue task(s) on startup")
    except Exception as e:
        logger.exception(f"Failed to recover stale tasks on startup: {e}")

    # Start queue worker
    app.state.queue_worker = QueueWorker()
    await app.state.queue_worker.start()

    yield

    # Shutdown: stop worker
    await app.state.queue_worker.stop()


app = FastAPI(
    title="MediaPruner API",
    description="A modern web-based media management tool",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(health.router, tags=["Health"])
app.include_router(library.router, prefix="/api/library", tags=["Library"])
app.include_router(movies.router, prefix="/api/movies", tags=["Movies"])
app.include_router(tvshows.router, prefix="/api/tvshows", tags=["TV Shows"])
app.include_router(
    settings_router.router,
    prefix="/api/settings",
    tags=["Settings"])

# Search endpoint
app.include_router(search.router, prefix="/api")
app.include_router(
    tautulli.router,
    prefix="/api/integrations/tautulli",
    tags=["Tautulli"])
app.include_router(plex.router, prefix="/api/integrations/plex", tags=["Plex"])
app.include_router(queues_router.router, prefix="/api/queues", tags=["Queues"])

# Serve static files in production (when frontend is built)
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount(
        "/assets",
        StaticFiles(
            directory=static_dir /
            "assets"),
        name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA for all non-API routes"""
        # Don't intercept API routes
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}

        # Try to serve the exact file
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # Fall back to index.html for SPA routing
        return FileResponse(static_dir / "index.html")
else:
    @app.get("/")
    async def root():
        return {
            "message": f"Welcome to {settings.app_name} API",
            "version": settings.app_version,
            "docs": "/api/docs" if settings.debug else "Disabled in production"
        }