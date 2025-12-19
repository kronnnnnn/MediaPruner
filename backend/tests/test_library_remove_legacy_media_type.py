import sys
sys.path.insert(0, '.')
import pytest
from httpx import AsyncClient, ASGITransport
from app.database import async_session
from sqlalchemy import text
from app.main import app as fastapi_app

@pytest.mark.asyncio
async def test_remove_legacy_media_type_path(temp_db):
    # Use patched session from temp_db fixture
    from app.database import async_session as patched_async_session
    async with patched_async_session() as s:
        await s.execute(text("INSERT INTO library_paths (path, name, media_type, created_at) VALUES (:path, 'LegacyRemove', 'tv', datetime('now'))"), {'path': '/tmp/legacy_remove'})
        await s.commit()
        res = await s.execute(text("SELECT id FROM library_paths WHERE path = :path"), {'path': '/tmp/legacy_remove'})
        row = res.fetchone()
        path_id = row[0] if row else None

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        # remove it
        r = await client.delete(f'/api/library/paths/{path_id}')
        assert r.status_code == 200

        # confirm gone
        r2 = await client.get('/api/library/paths')
        assert r2.status_code == 200
        data = r2.json()
        assert not any(p['id'] == path_id for p in data)