import pytest
import httpx

from app.services.omdb import OMDbService


class DummyResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


@pytest.mark.asyncio
async def test_get_ratings_by_title_records_params(monkeypatch):
    s = OMDbService(api_key="key123")

    async def fake_get(url, params=None):
        # ensure it's called
        return DummyResponse({"Response": "True", "imdbRating": "7.5", "Ratings": []})

    monkeypatch.setattr(s.client, 'get', fake_get)

    res = await s.get_ratings_by_title("Some Movie", year=1999)
    assert s.last_request_params is not None
    assert s.last_request_params['apikey'] == 'key123'
    assert s.last_request_params['t'] == 'Some Movie'
    assert s.last_request_params['y'] == '1999'
    assert res is not None


@pytest.mark.asyncio
async def test_get_ratings_by_imdb_id_records_params(monkeypatch):
    s = OMDbService(api_key="key123")

    async def fake_get(url, params=None):
        return DummyResponse({"Response": "True", "imdbRating": "8.0", "Ratings": []})

    monkeypatch.setattr(s.client, 'get', fake_get)

    res = await s.get_ratings_by_imdb_id('tt1234567')
    assert s.last_request_params is not None
    assert s.last_request_params['apikey'] == 'key123'
    assert s.last_request_params['i'] == 'tt1234567'
    assert res is not None
