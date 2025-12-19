import asyncio
import tempfile
from pathlib import Path
import pytest  # type: ignore
import pytest_asyncio

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

import app.database as database
from app.services.queue import create_task, cancel_task, get_task, QueueWorker

# Use pytest-asyncio marker
pytestmark = pytest.mark.asyncio


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

    yield

    await engine.dispose()
    database.engine = orig_engine
    database.async_session = orig_session


async def test_cancel_stops_remaining_items(temp_db, monkeypatch):
    # Make scan_movie_directory slow so we can cancel while it's running
    import time

    def slow_scan(path: Path):
        time.sleep(0.5)
        return []

    monkeypatch.setattr('app.services.scanner.scan_movie_directory', slow_scan)

    # Create a task with two items
    items = [{'path': '/tmp/one', 'media_type': 'movie'}, {'path': '/tmp/two', 'media_type': 'movie'}]
    task = await create_task('scan', items)

    worker = QueueWorker(poll_interval=0.01)

    # Run the worker.process_one in background
    task_proc = asyncio.create_task(worker.process_one())

    # Give the worker a tiny bit of time to start processing the first item
    await asyncio.sleep(0.1)

    # Now cancel the task
    await cancel_task(task.id)

    # Wait for worker to finish processing
    await task_proc

    # Retrieve the task and assert it was canceled and remaining items not processed
    t = await get_task(task.id)
    assert t is not None
    assert t['status'] == 'canceled'

    # Items: first may be completed or canceled depending on timing; second must be canceled
    assert len(t['items']) == 2
    assert t['items'][1]['status'] == 'canceled'
