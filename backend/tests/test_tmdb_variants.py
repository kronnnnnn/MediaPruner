import pytest

from app.services.tmdb import TMDBService


def test_title_variants():
    s = TMDBService(api_key="dummy")
    title = "The Matrix (1999): Reloaded!"
    variants = s._title_variants(title)

    # Basic expectations
    assert title in variants
    assert "Matrix (1999): Reloaded!" in variants or "Matrix" in variants
    assert "The Matrix" not in variants or variants[0] == title
    assert any('Reloaded' in v for v in variants)


@pytest.mark.asyncio
async def test_search_movie_records_last_search_tried(monkeypatch):
    s = TMDBService(api_key="dummy")

    async def fake_search_movie(query, year=None):
        # simulate no results for any query
        return []

    monkeypatch.setattr(s, 'search_movie', fake_search_movie)

    res = await s.search_movie_and_get_details("Some Movie (2013): Director's Cut", year=2013)
    assert res is None
    assert isinstance(s.last_search_tried, list)
    assert len(s.last_search_tried) > 0
    # Ensure the first tried query matches the first variant
    first = s._title_variants("Some Movie (2013): Director's Cut")[0]
    assert s.last_search_tried[0]['query'] == first
