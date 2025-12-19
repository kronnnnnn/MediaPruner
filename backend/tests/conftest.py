import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

import app.database as database


@pytest_asyncio.fixture
async def temp_db(tmp_path):
    db_file = tmp_path / "test_db.sqlite"
    url = f"sqlite+aiosqlite:///{db_file}"
    engine = create_async_engine(url, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Patch database engine/session
    orig_engine = database.engine
    orig_session = database.async_session
    database.engine = engine
    database.async_session = async_session

    # Initialize schema
    await database.init_db()

    # Yield the session factory so tests can `async with temp_db() as session:`
    yield async_session

    await engine.dispose()
    database.engine = orig_engine
    database.async_session = orig_session
