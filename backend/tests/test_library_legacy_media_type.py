import asyncio
import pytest
import sys
sys.path.insert(0, '.')
from app.database import async_session
from sqlalchemy import text
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI
from app.main import app as fastapi_app

@pytest.mark.asyncio
async def test_get_library_paths_handles_lowercase_media_type(temp_db, monkeypatch, tmp_path):
    # Ensure we have a fresh insertion and then call the API
    # Use the patched session from the temp_db fixture by importing inside the test
    from app.database import async_session as patched_async_session
    legacy_path = str(tmp_path / 'legacy')
    async with patched_async_session() as s:
        # Insert a legacy row with lowercase media_type directly via SQL (simulate corrupt legacy data)
        await s.execute(text("INSERT INTO library_paths (path, name, media_type, created_at) VALUES (:path, 'Legacy', 'tv', datetime('now'))"), {'path': legacy_path})
        await s.commit()

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        r = await client.get('/api/library/paths')
        assert r.status_code == 200
        data = r.json()
        # Ensure the legacy row we inserted is present in the response (path should match)
        assert any(p['path'] == legacy_path for p in data)
