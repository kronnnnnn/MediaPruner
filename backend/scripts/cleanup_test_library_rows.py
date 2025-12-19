"""Cleanup suspicious library path rows inserted by test runs or temp folders.

Deletes rows when all of the following are true:
 - Path does not exist on filesystem
 - Path is inside the system temp directory, or contains 'pytest' or '/tmp/' or '\\tmp\\'
 - The row was created within the last 7 days (safety check)

Usage: python backend/scripts/cleanup_test_library_rows.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta
import tempfile
from sqlalchemy import text

# Ensure package path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.database import engine

THRESHOLD_DAYS = 7

async def cleanup(dry_run=True):
    tempdir = tempfile.gettempdir()
    cutoff = datetime.utcnow() - timedelta(days=THRESHOLD_DAYS)

    async with engine.begin() as conn:
        rows = await conn.execute(text("SELECT id, path, created_at FROM library_paths"))
        rows = rows.fetchall()

        to_delete = []
        for r in rows:
            _id, _path, _created_at = r
            # If created_at is text, parse, else assume it's datetime
            created_at = _created_at
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at)
                except Exception:
                    created_at = datetime.utcnow()

            if created_at < cutoff:
                continue

            # suspicious conditions
            p = str(_path).lower() if _path else ''
            cond_temp = tempdir.lower() in p
            cond_pytest = 'pytest' in p
            cond_tmp = '/tmp/' in p or p.startswith('/tmp') or '\\tmp\\' in p
            does_exist = os.path.exists(_path) if _path else False

            if (cond_temp or cond_pytest or cond_tmp) and not does_exist:
                to_delete.append((_id, _path, created_at))

        if not to_delete:
            print('No suspicious rows found')
            return

        print('Found rows to delete:')
        for t in to_delete:
            print(f"  id={t[0]} path={t[1]} created_at={t[2]}")

        if dry_run:
            print('\nDry run: no changes made. Rerun with dry_run=False to delete.')
            return

        for t in to_delete:
            print(f"Deleting id={t[0]} path={t[1]}")
            await conn.execute(text('DELETE FROM library_paths WHERE id = :id'), {'id': t[0]})
        await conn.commit()
        print('Deletion complete')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--yes', action='store_true', help='Perform deletion (non-dry-run)')
    args = parser.parse_args()
    asyncio.run(cleanup(dry_run=not args.yes))
