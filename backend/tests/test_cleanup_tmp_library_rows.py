import os
import tempfile
from datetime import datetime, timedelta
import pytest
from sqlalchemy import text

# This test is intentionally opt-in. It will only run when the environment
# variable `MB_CLEAN_TMP_DB` is set to a truthy value (e.g. '1' or 'true').
# Running this will remove suspicious library path rows from the real
# backend database when those rows point at non-existing /tmp-style paths
# and were created recently. This prevents accidental deletion during CI.

MB_CLEAN = os.getenv("MB_CLEAN_TMP_DB", "").lower() in ("1", "true", "yes")


@pytest.mark.skipif(not MB_CLEAN, reason="Set MB_CLEAN_TMP_DB=true to enable DB cleanup")
def test_cleanup_tmp_library_rows():
    """Remove suspicious library rows that reference temp paths.

    Safety checks:
    - Only targets rows created within the last 7 days
    - Only deletes rows whose path does not exist on disk
    - Only deletes paths that look like temp/test paths (system temp dir,
      contain 'pytest', or contain '/tmp' or '\\tmp\\')
    """
    from app.database import engine

    tempdir = tempfile.gettempdir().lower()
    cutoff = datetime.utcnow() - timedelta(days=7)

    async def _cleanup():
        async with engine.begin() as conn:
            rows = await conn.execute(text("SELECT id, path, created_at FROM library_paths"))
            rows = rows.fetchall()

            to_delete = []
            for r in rows:
                _id, _path, _created_at = r
                created_at = _created_at
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at)
                    except Exception:
                        created_at = datetime.utcnow()

                if created_at < cutoff:
                    continue

                p = str(_path).lower() if _path else ''
                cond_temp = tempdir in p
                cond_pytest = 'pytest' in p
                cond_tmp = '/tmp/' in p or p.startswith('/tmp') or '\\tmp\\' in p
                does_exist = os.path.exists(_path) if _path else False

                if (cond_temp or cond_pytest or cond_tmp) and not does_exist:
                    to_delete.append((_id, _path))

            if not to_delete:
                pytest.skip("No suspicious rows found to delete")

            # Perform deletions
            for _id, _path in to_delete:
                await conn.execute(text('DELETE FROM library_paths WHERE id = :id'), {'id': _id})
            await conn.commit()

    import asyncio
    asyncio.run(_cleanup())
