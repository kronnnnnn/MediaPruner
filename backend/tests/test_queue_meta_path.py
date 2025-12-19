import asyncio
import pytest

from app.services.queue import create_task, get_task

@pytest.mark.asyncio
async def test_create_task_with_meta_path(temp_db):
    task = await create_task('analyze', [{'movie_id': 1}], meta={'path': '/mnt/media/movies'})
    assert task is not None
    t = await get_task(task.id)
    assert t is not None
    assert t.get('meta') is not None
    assert t['meta'].get('path') == '/mnt/media/movies'
