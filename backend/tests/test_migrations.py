import sys
sys.path.insert(0, '.')
from app.database import migrate_db, engine
from sqlalchemy import text
import pytest

@pytest.mark.asyncio
async def test_migration_applies_normalize_media_type():
    # Run migrations (migrate_db should create migrations table and apply SQL files)
    await migrate_db()

    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT name FROM migrations WHERE name='001_normalize_media_type.sql'"))
        row = res.fetchone()
        assert row is not None, "Migration 001_normalize_media_type.sql should be recorded in migrations table"
