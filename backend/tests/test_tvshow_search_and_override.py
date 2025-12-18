import pytest
import asyncio

from app.services.queue import create_task, QueueWorker, get_task
from app.models import LibraryPath, TVShow
from app.services.tmdb import TMDBService
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_search_endpoint_returns_candidates(temp_db, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_session

    async with async_session() as s:
        lp = LibraryPath(path='/tmp/shows', name='Shows', media_type='tv')
        s.add(lp)
        await s.flush()
        show = TVShow(folder_path='/tmp/shows/dummy', folder_name='dummy', title='Dummy Show', library_path_id=lp.id)
        s.add(show)
        await s.commit()
        show_id = show.id

    class DummyTMDB:
        def __init__(self):
            self.is_configured = True
            self.last_search_tried = None

        async def search_tvshow(self, query, year=None):
            return [{'id': 42, 'name': 'Dummy Show (Remaster)', 'first_air_date': '2020-01-01', 'overview': 'A show'}]

    async def fake_create_with_db_key(db):
        return DummyTMDB()

    monkeypatch.setattr(TMDBService, 'create_with_db_key', classmethod(lambda cls, db: fake_create_with_db_key(db)))

    # Call the search endpoint via the app test client
    from app.main import app
    from httpx import AsyncClient, ASGITransport

    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        r = await client.get(f'/api/tvshows/{show_id}/search')
        assert r.status_code == 200
        data = r.json()
        assert data['provider'] == 'tmdb'
        assert len(data['results']) == 1
        assert data['results'][0]['tmdb_id'] == 42


async def test_scrape_with_tmdb_override_applies_details(temp_db, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_session
    from app.models import TVShow
    from app.services.queue import QueueWorker

    # Create a show
    async with async_session() as s:
        lp = LibraryPath(path='/tmp/shows', name='Shows', media_type='tv')
        s.add(lp)
        await s.flush()
        show = TVShow(folder_path='/tmp/shows/dummy', folder_name='dummy', title='Dummy Show', library_path_id=lp.id)
        s.add(show)
        await s.commit()
        show_id = show.id

    # Dummy tmdb details
    class DummyDetails:
        tmdb_id = 42
        title = 'Dummy Show (Remaster)'
        overview = 'Overview'
        poster_path = '/poster.jpg'
        backdrop_path = '/backdrop.jpg'
        imdb_id = 'tt1234567'

    class DummyTMDB:
        def __init__(self):
            self.is_configured = True
        async def get_tvshow_details(self, tmdb_id):
            return DummyDetails()

    async def fake_create_with_db_key(db):
        return DummyTMDB()

    monkeypatch.setattr(TMDBService, 'create_with_db_key', classmethod(lambda cls, db: fake_create_with_db_key(db)))

    # Enqueue a scrape with override tmdb_id
    from app.main import app
    from httpx import AsyncClient

    async with AsyncClient(app=app, base_url='http://test') as client:
        r = await client.post(f'/api/tvshows/{show_id}/scrape', json={'tmdb_id': 42})
        assert r.status_code == 200
        data = r.json()
        assert 'task_id' in data
        task_id = data['task_id']

    # Run worker to process the task
    worker = QueueWorker(poll_interval=0.01)
    await worker.process_one()

    # Verify show updated
    async with async_session() as s:
        res = await s.execute(select(TVShow).where(TVShow.id == show_id))
        updated = res.scalar_one_or_none()
        assert updated is not None
        assert updated.tmdb_id == 42
        assert updated.title == 'Dummy Show (Remaster)'

