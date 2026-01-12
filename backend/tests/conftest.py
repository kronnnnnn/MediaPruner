import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

import app.database as database
import os
import tempfile
from datetime import datetime, timedelta
import asyncio
from sqlalchemy import text


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


def pytest_sessionfinish(session, exitstatus):
    """Cleanup suspicious library path rows left by tests after the test session.

    This mirrors the behavior of scripts/cleanup_test_library_rows.py but runs
    automatically at the end of pytest to ensure tests don't leave /tmp entries
    visible in the real database.
    """
    try:
        # Import engine from app.database (should be the real DB engine at session end)
        from app.database import engine

        tempdir = tempfile.gettempdir().lower()
        cutoff = datetime.utcnow() - timedelta(days=7)

        async def _cleanup():
            async with engine.begin() as conn:
                to_delete_ids = []

                # Helper to collect rows from a table where a path-like column exists
                async def collect(table, col):
                    rows = await conn.execute(text(f"SELECT id, {col}, created_at FROM {table}"))
                    rows = rows.fetchall()
                    for r in rows:
                        _id, _path, _created_at = r
                        created_at = _created_at
                        if isinstance(created_at, str):
                            try:
                                created_at = datetime.fromisoformat(created_at)
                            except Exception:
                                created_at = datetime.utcnow()

                        if created_at < cutoff:
                            continue

                        p = str(_path).lower() if _path else ''
                        cond_temp = tempdir in p
                        cond_pytest = 'pytest' in p
                        cond_tmp = '/tmp/' in p or p.startswith('/tmp') or '\\tmp\\' in p
                        does_exist = os.path.exists(_path) if _path else False

                        if (cond_temp or cond_pytest or cond_tmp) and not does_exist:
                            to_delete_ids.append((table, _id, _path))

                # Collect suspicious rows from multiple tables
                await collect('library_paths', 'path')
                await collect('movies', 'file_path')
                await collect('tvshows', 'folder_path')
                await collect('episodes', 'file_path')

                if not to_delete_ids:
                    print('Test-session cleanup: no suspicious rows found')
                    return

                # Print details of what will be deleted for visibility
                print('Test-session cleanup: found suspicious rows to delete:')
                for table, _id, _path in to_delete_ids:
                    print(f"  table={table} id={_id} path={_path}")

                # Delete collected ids
                for table, _id, _path in to_delete_ids:
                    await conn.execute(text(f'DELETE FROM {table} WHERE id = :id'), {'id': _id})
                    print(f"Deleted: table={table} id={_id} path={_path}")
                await conn.commit()

        asyncio.run(_cleanup())
    except Exception:
        # Don't fail the test run for cleanup errors; just log to stdout
        try:
            print('Warning: test-session cleanup failed, see logs')
        except Exception:
            pass
