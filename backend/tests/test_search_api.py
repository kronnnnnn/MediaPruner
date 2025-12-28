import pytest
import pytest_asyncio

from app.routers.search import api_search
from app.services.queue import create_task
import app.database as database
from app.models import Movie, TVShow

pytestmark = pytest.mark.asyncio

async def test_search_returns_movies_and_tv(temp_db):
    # Create a movie and a TV show
    async with database.async_session() as session:
        mv = Movie(title='Art of Testing', file_path='/tmp/movie.mkv', file_name='movie.mkv', library_path_id=1)
        tv = TVShow(title='Art Show', folder_path='/tmp/tv', folder_name='tvtest', library_path_id=1)
        session.add(mv)
        session.add(tv)
        await session.commit()

    async with database.async_session() as session:
        res = await api_search(q='Art', limit_per_type=5, db=session)
        # Simple smoke: ensure keys present
        assert 'movies' in res
        assert 'tvshows' in res
