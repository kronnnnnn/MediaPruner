import asyncio
import pytest

from app.services.queue import subscribe_events, unsubscribe_events, publish_task_update, create_task

pytestmark = pytest.mark.asyncio


async def test_publish_task_update_delivers_message(temp_db):
    q = subscribe_events()
    try:
        # create a minimal task
        task = await create_task('refresh_metadata', [{'movie_id': 1}])
        # publish update
        await publish_task_update(task.id)
        # receive message
        msg = await asyncio.wait_for(q.get(), timeout=2.0)
        assert isinstance(msg, str)
        assert 'task_update' in msg
        assert str(task.id) in msg
    finally:
        unsubscribe_events(q)
