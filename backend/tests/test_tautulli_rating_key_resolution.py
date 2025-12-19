import pytest
from app.services.tautulli import TautulliService
import app.database as database
from app.models import Movie


@pytest.mark.asyncio
async def test_imdb_plex_lookup_and_persist(temp_db, monkeypatch):
    # Create a movie record with imdb_id but no rating_key
    async with database.async_session() as session:
        m = Movie(title='Test Movie', imdb_id='tt0000001', file_path='/tmp/test', file_name='test.mkv', library_path_id=1)
        session.add(m)
        await session.commit()

    # Prepare a fake plex service
    class FakePlex:
        async def get_rating_key_by_imdb(self, imdb_id):
            assert imdb_id == 'tt0000001'
            return 99999

    async def fake_get_plex_service(db):
        return FakePlex()

    monkeypatch.setattr('app.services.plex.get_plex_service', fake_get_plex_service)

    # Prepare a tautulli service with a fake get_history
    tautulli = TautulliService('http://example', 'apikey')

    async def fake_get_history(rating_key=None, **kwargs):
        assert rating_key == 99999
        return [{'id': 1, 'title': 'Test Movie', 'rating_key': rating_key}]

    tautulli.get_history = fake_get_history

    # Perform the search - should resolve via plex and persist rating_key
    async with database.async_session() as session:
        history, rk = await tautulli.search_movie_history(title=None, year=None, imdb_id='tt0000001', db=session)
        assert rk == 99999
        assert len(history) == 1

        # Verify the Movie record was updated
        from sqlalchemy import text
        db_movie = (await session.execute(text("SELECT * FROM movies WHERE imdb_id = 'tt0000001'")))
        row = db_movie.first()
        assert row is not None
        # row is a SQLAlchemy Row - rating_key column should be present
        assert row._mapping['rating_key'] == 99999
