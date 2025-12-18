"""List queued tasks and their items for quick inspection.

Usage:
  python -m backend.scripts.list_queue

This script prints tasks with status and their items.
"""
import asyncio
from app.database import async_session
from app.models import QueueTask, QueueItem
from sqlalchemy import select
from sqlalchemy.orm import selectinload

async def main():
    async with async_session() as session:
        q = await session.execute(select(QueueTask).order_by(QueueTask.created_at).options(selectinload(QueueTask.items)))
        tasks = q.scalars().all()
        if not tasks:
            print("No tasks found")
            return
        for t in tasks:
            print(f"Task {t.id}: type={t.type} status={t.status} created={t.created_at} items={len(t.items)}")
            for it in sorted(t.items, key=lambda x: x.index):
                print(f"  Item {it.id} idx={it.index} status={it.status} payload={it.payload[:120] if it.payload else None}")

if __name__ == '__main__':
    asyncio.run(main())
