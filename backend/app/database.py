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
