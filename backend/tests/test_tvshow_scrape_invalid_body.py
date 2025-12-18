import pytest
from httpx import AsyncClient, ASGITransport

pytestmark = pytest.mark.asyncio

async def test_scrape_rejects_string_body(temp_db):
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        # Create a dummy show first
        from app.database import async_session
        from app.models import TVShow, LibraryPath
        async with async_session() as s:
            lp = LibraryPath(path='/tmp/shows', name='Shows', media_type='tv')
            s.add(lp)
            await s.flush()
            show = TVShow(folder_path='/tmp/shows/d1', folder_name='d1', title='Dummy', library_path_id=lp.id)
            s.add(show)
            await s.commit()
            show_id = show.id

        # Send a plain string body (common mistake)
        r = await client.post(f'/api/tvshows/{show_id}/scrape', json='omdb')
        assert r.status_code == 400
        data = r.json()
        assert 'Request body must be a JSON object' in data.get('detail', '')
