import pytest
from app.services.queue import create_task, QueueWorker
from app.models import Movie


@pytest.mark.asyncio
async def test_refresh_metadata_includes_ratings(temp_db, monkeypatch):
    # Create a library path and a movie without ratings
    from app.models import LibraryPath, MediaType
    async with temp_db() as session:
        lp = LibraryPath(path='/tmp', name='tmp', media_type=MediaType.MOVIE)
        session.add(lp)
        await session.flush()
        m = Movie(title='Test Movie', year=2020, file_path='/tmp/test.mp4', file_name='test.mp4', library_path_id=lp.id)
        session.add(m)
        await session.flush()
        movie_id = m.id
        await session.commit()

    # Monkeypatch fetch_omdb_ratings to return a fake ratings object
    class FakeRatings:
        def __init__(self):
            self.imdb_rating = 7.2
            self.imdb_votes = 12345
            self.rotten_tomatoes_score = 84
            self.rotten_tomatoes_audience = None
            self.metacritic_score = 70

    async def fake_fetch_omdb(db, imdb_id=None, title=None, year=None):
        return FakeRatings()

    monkeypatch.setattr('app.services.omdb.fetch_omdb_ratings', fake_fetch_omdb)

    # Enqueue refresh_metadata with include_ratings
    await create_task('refresh_metadata', items=[{'movie_id': movie_id}], meta={'trigger': 'test', 'include_ratings': True})

    # Run worker loop to process the task
    worker = QueueWorker()
    processed = await worker.process_one()
    assert processed is True

    # Verify movie now has ratings
    async with temp_db() as session:
        mv = await session.get(Movie, movie_id)
        assert mv.imdb_rating == 7.2
        assert mv.imdb_votes == 12345
        assert mv.rotten_tomatoes_score == 84
        assert mv.metacritic_score == 70
