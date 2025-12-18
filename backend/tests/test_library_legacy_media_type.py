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
async def test_get_library_paths_handles_lowercase_media_type(monkeypatch, tmp_path):
    # Ensure we have a fresh insertion and then call the API
    async with async_session() as s:
        # Insert a legacy row with lowercase media_type directly via SQL
        await s.execute(text("INSERT INTO library_paths (path, name, media_type, created_at) VALUES ('/tmp/legacy', 'Legacy', 'tv', datetime('now'))"))
        await s.commit()

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        r = await client.get('/api/library/paths')
        assert r.status_code == 200
        data = r.json()
        # Ensure the legacy row is present and has media_type normalized or handled
        assert any(p['path'] == '/tmp/legacy' for p in data)
