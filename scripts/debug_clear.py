import asyncio
from pathlib import Path
import sys

# Ensure backend package is importable
repo_root = Path(__file__).resolve().parents[1]
backend_dir = repo_root / 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database import async_session
from sqlalchemy import select
from app.models import QueueTask, QueueStatus

async def main():
    async with async_session() as session:
        q = await session.execute(select(QueueTask).where(QueueTask.status.in_([QueueStatus.QUEUED, QueueStatus.RUNNING])))
        tasks = q.scalars().all()
        print('SQLAlchemy selected tasks:', [ (t.id, t.status) for t in tasks ])

        # Also run a raw SQL that compares LOWER(status) to 'queued'
        from sqlalchemy import text
        res = await session.execute(text("SELECT id, status FROM queue_tasks WHERE LOWER(status)='queued'"))
        print('Raw LOWER(status)=queued:', res.fetchall())

        # Show all distinct statuses
        res2 = await session.execute(text("SELECT DISTINCT status FROM queue_tasks"))
        print('Distinct statuses:', res2.fetchall())

        # Try update to set status=UPPER(status) for any mismatched
        # (not executing now, just showing)

asyncio.run(main())
