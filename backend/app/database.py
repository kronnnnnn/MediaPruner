from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Use Settings for database config so env overrides apply
from .config import settings

# Ensure data dir exists
DATA_DIR = settings.data_dir
DATA_DIR.mkdir(parents=True, exist_ok=True)

import os
import shutil

DATABASE_URL = settings.database_url

# Check for legacy repo-root data file and offer optional automatic migration to backend/data
project_root = Path(__file__).resolve().parents[1]
legacy_db = project_root / 'data' / 'mediapruner.db'
new_db = settings.data_dir / 'mediapruner.db'
if legacy_db.exists() and not new_db.exists():
    auto_move = os.getenv('MB_AUTO_MOVE_DB', 'false').lower() == 'true'
    if auto_move:
        logger.info("MB_AUTO_MOVE_DB=true — attempting to migrate legacy DB into backend data dir")
        try:
            settings.data_dir.mkdir(parents=True, exist_ok=True)
            backup = legacy_db.with_suffix('.bak')
            shutil.copy2(legacy_db, backup)
            try:
                backup_size = backup.stat().st_size
                logger.info(f"Created backup of legacy DB at {backup} ({backup_size} bytes)")
            except Exception:
                logger.info(f"Created backup of legacy DB at {backup}")

            shutil.move(str(legacy_db), str(new_db))
            try:
                new_size = Path(new_db).stat().st_size
                logger.info(f"Moved legacy DB from {legacy_db} to {new_db} (new size {new_size} bytes)")
            except Exception:
                logger.info(f"Moved legacy DB from {legacy_db} to {new_db} (size unknown)")

            logger.info("Legacy DB migration complete. You can remove the backup file if everything looks good.")
        except Exception:
            logger.exception("Failed to move legacy DB — see traceback. You can run backend/scripts/move_db_file.py to try manual migration.")
    else:
        logger.warning(
            f"Found legacy DB at {legacy_db} but not at {new_db}. "
            "Set MB_DATABASE_URL to point to the desired DB or set MB_AUTO_MOVE_DB=true to move automatically."
        )

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """Dependency to get database session"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def migrate_db():
    """Run database migrations for new columns and SQL migration files.

    This function performs two tasks:
    1. Adds any missing columns to tables (backwards-compatible checks).
    2. Runs SQL files placed in `backend/migrations/` that have not yet been applied. A
       simple `migrations` table is used to record applied migrations so they are
       not re-applied.
    """
    async with engine.begin() as conn:
        # Ensure base tables exist (so SQL migrations that reference tables can run)
        try:
            await conn.run_sync(Base.metadata.create_all)
        except Exception as e:
            logger.warning(f"Base table creation failed (may already exist): {e}")

        # Check and add new columns to movies table
        movies_columns = [
            ("release_group", "VARCHAR(128)"),
            ("edition", "VARCHAR(128)"),
            ("quality", "VARCHAR(64)"),
            # Additional rating sources (via OMDb)
            ("imdb_rating", "FLOAT"),
            ("imdb_votes", "INTEGER"),
            ("rotten_tomatoes_score", "INTEGER"),
            ("rotten_tomatoes_audience", "INTEGER"),
            ("metacritic_score", "INTEGER"),
            # Subtitle info
            ("subtitle_path", "VARCHAR(1024)"),
            ("has_subtitle", "BOOLEAN DEFAULT 0"),
            # Watch history (from Tautulli)
            ("watched", "BOOLEAN DEFAULT 0"),
            ("watch_count", "INTEGER DEFAULT 0"),
            ("last_watched_date", "DATETIME"),
            ("last_watched_user", "VARCHAR(128)"),
            # Plex rating key to persist resolved rating_key for quicker
            # lookups
            ("rating_key", "INTEGER"),
            # Option 4: custom external ID field added in UI
            ("option_4", "VARCHAR(255)"),
            # Track if analysis failed
            ("media_info_failed", "BOOLEAN DEFAULT 0"),
        ]

        for col_name, col_type in movies_columns:
            try:
                await conn.execute(text(f"ALTER TABLE movies ADD COLUMN {col_name} {col_type}"))
            except Exception:
                # Column already exists
                pass

        # Check and add new columns to episodes table
        episodes_columns = [
            ("subtitle_path", "VARCHAR(1024)"),
            ("has_subtitle", "BOOLEAN DEFAULT 0"),
        ]

        for col_name, col_type in episodes_columns:
            try:
                await conn.execute(text(f"ALTER TABLE episodes ADD COLUMN {col_name} {col_type}"))
            except Exception:
                # Column already exists
                pass

        # Create a simple migrations table to track applied SQL migrations
        try:
            await conn.execute(text("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)"))
        except Exception:
            pass

        # Apply SQL migration files from backend/migrations in lexicographical order
        migrations_dir = Path(__file__).parent.parent / 'migrations'
        if migrations_dir.exists():
            for sql_file in sorted([p for p in migrations_dir.iterdir() if p.suffix == '.sql']):
                name = sql_file.name
                # Check if applied
                res = await conn.execute(text("SELECT 1 FROM migrations WHERE name = :name"), {"name": name})
                if res.fetchone():
                    continue
                # Read and execute SQL
                sql_text = sql_file.read_text()
                try:
                    await conn.execute(text(sql_text))
                    await conn.execute(text("INSERT INTO migrations (name) VALUES (:name)"), {"name": name})
                except Exception:
                    # Don't let one migration fail the whole sequence - raise to surface in tests
                    raise



async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Run migrations for any new columns
    await migrate_db()

    # Ensure queue tables exist and normalize existing values
    async with engine.begin() as conn:
        await _ensure_queue_tables(conn)

        # Normalize any existing media_type values to lowercase to match Enum values (e.g., 'TV' -> 'tv')
        try:
            await conn.execute(text("UPDATE library_paths SET media_type = LOWER(media_type) WHERE media_type IS NOT NULL AND media_type != LOWER(media_type)"))
        except Exception:
            pass

        # Normalize queue task statuses to lowercase to match QueueStatus enum values
        try:
            await conn.execute(text("UPDATE queue_tasks SET status = LOWER(status) WHERE status IS NOT NULL AND status != LOWER(status)"))
        except Exception:
            pass


async def _ensure_queue_tables(conn):
    # Create queue_tasks table if it doesn't exist
    try:
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS queue_tasks (
                id INTEGER PRIMARY KEY,
                type VARCHAR(64) NOT NULL,
                status VARCHAR(32) DEFAULT 'queued',
                created_by VARCHAR(128),
                created_at DATETIME,
                started_at DATETIME,
                finished_at DATETIME,
                canceled_at DATETIME,
                total_items INTEGER DEFAULT 0,
                completed_items INTEGER DEFAULT 0,
                meta TEXT
            )
        '''))
        await conn.execute(text('CREATE INDEX IF NOT EXISTS ix_queue_tasks_status ON queue_tasks (status)'))

        # Create queue_items table if it doesn't exist
        await conn.execute(text('''
            CREATE TABLE IF NOT EXISTS queue_items (
                id INTEGER PRIMARY KEY,
                task_id INTEGER NOT NULL,
                "index" INTEGER DEFAULT 0,
                status VARCHAR(32) DEFAULT 'queued',
                payload TEXT,
                result TEXT,
                started_at DATETIME,
                finished_at DATETIME,
                FOREIGN KEY(task_id) REFERENCES queue_tasks(id) ON DELETE CASCADE
            )
        '''))
        await conn.execute(text('CREATE INDEX IF NOT EXISTS ix_queue_items_task_id ON queue_items (task_id)'))
    except Exception:
        # Ignore errors when creating tables (might already exist)
        pass