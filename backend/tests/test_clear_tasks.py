import pytest
import pytest_asyncio
from sqlalchemy import select, update, func
from fastapi import HTTPException

import app.database as database
from app.services.queue import create_task, clear_queued_tasks
from app.routers.queues import api_clear_tasks
from app.models import QueueTask, QueueStatus

pytestmark = pytest.mark.asyncio


async def test_clear_all_scope_purges_every_status(temp_db):
    # Create a queued task
    t1 = await create_task('scan', [{'path': '/tmp/one'}])
    # Create another task and mark it completed
    t2 = await create_task('refresh_metadata', [{'movie_id': 1}])

    async with database.async_session() as session:
        await session.execute(update(QueueTask).where(QueueTask.id == t2.id).values(status=QueueStatus.COMPLETED))
        await session.commit()

    res = await clear_queued_tasks(scope='all')
    assert isinstance(res, dict)
    assert res.get('tasks_cleared', 0) >= 2

    # Ensure there are no tasks left
    async with database.async_session() as session:
        q = await session.execute(select(func.count()).select_from(QueueTask))
        total = q.scalar_one()
        assert total == 0


async def test_default_api_clear_uses_all(temp_db):
    # Create tasks in different statuses
    t1 = await create_task('scan', [{'path': '/tmp/a'}])
    t2 = await create_task('scan', [{'path': '/tmp/b'}])

    # Call the router function without providing scope (should default to 'all')
    # Since api_clear_tasks raises HTTPException on error, calling it should return a dict
    res = await api_clear_tasks()
    assert 'tasks_cleared' in res


async def test_invalid_scope_raises_bad_request(temp_db):
    with pytest.raises(HTTPException) as exc:
        await api_clear_tasks(scope='invalid')
    assert exc.value.status_code == 400
