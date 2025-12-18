"""Clear queued/running tasks by marking them deleted/canceled.

Use with caution. This will mark any QUEUED or RUNNING tasks as DELETED and will mark their queued/running items as CANCELED.

Usage:
  python -m backend.scripts.clear_queue
"""
import asyncio
from app.database import async_session
from app.models import QueueTask, QueueItem, QueueStatus
from sqlalchemy import update, select

async def main():
    async with async_session() as session:
        # Find affected tasks
        q = await session.execute(select(QueueTask).where(QueueTask.status.in_([QueueStatus.QUEUED, QueueStatus.RUNNING])))
        tasks = q.scalars().all()
        if not tasks:
            print("No queued or running tasks to clear.")
            return

        ids = [t.id for t in tasks]
        print(f"Clearing {len(ids)} tasks: {ids}")

        await session.execute(
            update(QueueTask).where(QueueTask.id.in_(ids)).values(status=QueueStatus.DELETED)
        )
        res = await session.execute(
            update(QueueItem)
            .where(QueueItem.task_id.in_(ids))
            .where(QueueItem.status.in_([QueueStatus.QUEUED, QueueStatus.RUNNING]))
            .values(status=QueueStatus.CANCELED)
        )
        await session.commit()

        rowcount = getattr(res, 'rowcount', None)
        print(f"Updated items rows affected: {rowcount}")

if __name__ == '__main__':
    asyncio.run(main())
