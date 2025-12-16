from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from pathlib import Path

# Database path - use data directory for persistence
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/mediapruner.db"

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
        import os
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

    # Ensure queue tables exist (migration added this)
    async with engine.begin() as conn:
        await _ensure_queue_tables(conn)

    # Normalize any existing media_type values to lowercase to match Enum values (e.g., 'TV' -> 'tv')
    async with engine.begin() as conn:
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
