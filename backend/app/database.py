from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from pathlib import Path

# Database path - use data directory for persistence
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/mediapruner.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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
    """Run database migrations for new columns"""
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
            # Plex rating key to persist resolved rating_key for quicker lookups
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


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Run migrations for any new columns
    await migrate_db()

    # Ensure queue tables exist (new feature)
    await _ensure_queue_tables(conn)


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
