import sys
sys.path.insert(0, '.')
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app as fastapi_app
from app.database import async_session
import uuid
from app.models import Movie, LibraryPath, MediaType

@pytest.mark.asyncio
async def test_get_task_includes_movie_title():
    async with async_session() as s:
        # create a library path (required by Movie)
        lp = LibraryPath(path=f'/tmp/{uuid.uuid4()}', name='tmp', media_type=MediaType.MOVIE)
        s.add(lp)
        await s.flush()

        # create a movie
        file_path = f'/tmp/fake-{uuid.uuid4()}.mp4'
        file_name = file_path.split('/')[-1]
        m = Movie(library_path_id=lp.id, file_path=file_path, file_name=file_name, title='The Fake Movie')
        s.add(m)
        await s.flush()
        movie_id = m.id
        await s.commit()

    # create a task with an item that references movie_id
    from app.models import QueueTask, QueueItem, QueueStatus

    async with async_session() as s:
        # create task and item via ORM to avoid enum/string mismatch
        t = QueueTask(type='refresh_metadata', status=QueueStatus.QUEUED, total_items=1, completed_items=0)
        s.add(t)
        await s.flush()
        payload_json = f'{{"movie_id": {movie_id}}}'
        it = QueueItem(task_id=t.id, index=0, status=QueueStatus.QUEUED, payload=payload_json)
        s.add(it)
        await s.commit()
        task_id = t.id

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        r = await client.get(f'/api/queues/tasks/{task_id}')
        assert r.status_code == 200
        data = r.json()
        assert data['id'] == task_id
        assert len(data['items']) == 1
        item = data['items'][0]
        assert item.get('movie_title') == 'The Fake Movie'
