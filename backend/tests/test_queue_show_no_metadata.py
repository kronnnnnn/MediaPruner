import pytest

from sqlalchemy import select
from app.services.queue import create_task, QueueWorker, get_task
from app.services.tmdb import TMDBService
from app.models import LibraryPath, TVShow

pytestmark = pytest.mark.asyncio


async def test_refresh_metadata_show_no_metadata(temp_db, monkeypatch):
    # Create a library path and tvshow
    from app.database import async_session

    async with async_session() as s:
        lp = LibraryPath(path='/tmp/shows', name='Shows', media_type='tv')
        s.add(lp)
        await s.flush()
        show = TVShow(folder_path='/tmp/shows/dummy', folder_name='dummy', title='Dummy Show', library_path_id=lp.id)
        s.add(show)
        await s.commit()
        show_id = show.id

    # Monkeypatch TMDBService.create_with_db_key to return a dummy service that is configured but returns no results
    class DummyTMDB:
        def __init__(self):
            self.is_configured = True
            self.last_search_tried = None

        async def search_tvshow_and_get_details(self, title, year=None):
            # Simulate no match
            self.last_search_tried = [{'query': title, 'year': None}]
            return None

    async def fake_create_with_db_key(db):
        return DummyTMDB()

    monkeypatch.setattr(TMDBService, 'create_with_db_key', classmethod(lambda cls, db: fake_create_with_db_key(db)))

    # Create refresh_metadata task for show
    task = await create_task('refresh_metadata', [{'show_id': show_id}])

    worker = QueueWorker(poll_interval=0.01)
    # process one to handle the task
    await worker.process_one()

    # Fetch the task and assert item marked completed (no-op) and result includes note
    t = await get_task(task.id)
    assert t is not None
    assert len(t['items']) == 1
    it = t['items'][0]
    assert it['status'] == 'completed'
    assert 'note' in (it.get('result') or '')

    # Also ensure a LogEntry was created with the diagnostic message
    from app.database import async_session
    from app.models import LogEntry
    async with async_session() as s:
        q = await s.execute(select(LogEntry).where(LogEntry.logger_name == 'QueueWorker'))
        entries = q.scalars().all()
        assert any('TMDB search for show' in e.message for e in entries)
