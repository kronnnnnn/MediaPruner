"""Queue service: create tasks, list, cancel, and worker helpers"""
import json
import asyncio
import logging
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from app.database import async_session
from app.models import QueueTask, QueueItem, QueueStatus

logger = logging.getLogger(__name__)


async def create_task(task_type: str, items: List[dict], meta: Optional[dict] = None, created_by: Optional[str] = None):
    """Create a queue task with items. Returns task id."""
    async with async_session() as session:
        task = QueueTask(
            type=task_type,
            status=QueueStatus.QUEUED,
            created_by=created_by,
            created_at=datetime.utcnow(),
            total_items=len(items),
            completed_items=0,
            meta=json.dumps(meta) if meta is not None else None,
        )
        session.add(task)
        await session.flush()

        for idx, payload in enumerate(items):
            item = QueueItem(
                task_id=task.id,
                index=idx,
                status=QueueStatus.QUEUED,
                payload=json.dumps(payload) if payload is not None else None,
            )
            session.add(item)

        await session.commit()
        await session.refresh(task)
        logger.info(f"Created queue task {task.id} type={task_type} items={len(items)}")
        return task


async def list_tasks(limit: int = 50):
    async with async_session() as session:
        result = await session.execute(QueueTask.__table__.select().limit(limit))
        rows = result.fetchall()
        return [dict(r) for r in rows]


async def get_task(task_id: int):
    async with async_session() as session:
        t = await session.get(QueueTask, task_id)
        return t


async def cancel_task(task_id: int):
    async with async_session() as session:
        task = await session.get(QueueTask, task_id)
        if not task:
            return None
        task.status = QueueStatus.CANCELED
        task.canceled_at = datetime.utcnow()
        # Mark queued items as canceled
        for item in task.items:
            if item.status in (QueueStatus.QUEUED, QueueStatus.RUNNING):
                item.status = QueueStatus.CANCELED
        await session.commit()
        return task


class QueueWorker:
    """Simple async worker that polls for queued tasks and processes them."""

    def __init__(self, poll_interval: float = 2.0):
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self.poll_interval = poll_interval

    async def start(self):
        logger.info("Starting queue worker")
        self._stop.clear()
        self._task = asyncio.create_task(self.run())

    async def stop(self):
        logger.info("Stopping queue worker")
        self._stop.set()
        if self._task:
            await self._task

    async def process_one(self) -> bool:
        """Process a single queued task if present. Returns True if a task was processed."""
        from sqlalchemy import select
        from app.services.scanner import scan_movie_directory, scan_tvshow_directory

        async with async_session() as session:
            from sqlalchemy.orm import selectinload
            q = await session.execute(
                select(QueueTask).where(QueueTask.status == QueueStatus.QUEUED).order_by(QueueTask.created_at).options(selectinload(QueueTask.items))
            )
            task = q.scalars().first()
            if not task:
                return False

            # Lock and mark running
            task.status = QueueStatus.RUNNING
            task.started_at = datetime.utcnow()
            await session.commit()
            await session.refresh(task)

            logger.info(f"Processing queue task {task.id} type={task.type}")

            # Process items sequentially
            for item in sorted(task.items, key=lambda x: x.index):
                if task.status == QueueStatus.CANCELED:
                    logger.info(f"Task {task.id} canceled before item {item.id}")
                    break

                if item.status != QueueStatus.QUEUED:
                    continue

                # Mark item running
                item.status = QueueStatus.RUNNING
                item.started_at = datetime.utcnow()
                await session.commit()

                payload = json.loads(item.payload) if item.payload else {}

                try:
                    # Simple handler: support 'scan' tasks
                    if task.type == 'scan':
                        # payload: { "path": "/path/to/dir", "media_type": "movie|tv" }
                        path = payload.get('path')
                        media_type = payload.get('media_type', 'movie')
                        if media_type == 'movie':
                            results = await asyncio.to_thread(scan_movie_directory, Path(path))
                        else:
                            results = await asyncio.to_thread(scan_tvshow_directory, Path(path))
                        item.result = json.dumps({'found': len(results)})
                        item.status = QueueStatus.COMPLETED
                        task.completed_items = (task.completed_items or 0) + 1
                    else:
                        # Unknown task - mark failed
                        item.result = json.dumps({'error': 'unknown task type'})
                        item.status = QueueStatus.FAILED

                except Exception as e:
                    logger.exception(f"Error processing item {item.id} for task {task.id}: {e}")
                    item.result = json.dumps({'error': str(e)})
                    item.status = QueueStatus.FAILED

                item.finished_at = datetime.utcnow()
                await session.commit()

            # Finalize task
            if task.status != QueueStatus.CANCELED:
                # Determine final status
                if any(i.status == QueueStatus.FAILED for i in task.items):
                    task.status = QueueStatus.FAILED
                else:
                    task.status = QueueStatus.COMPLETED
                task.finished_at = datetime.utcnow()
                await session.commit()
                logger.info(f"Task {task.id} finished with status {task.status}")

        return True

    async def run(self):
        while not self._stop.is_set():
            try:
                processed = await self.process_one()
                if not processed:
                    await asyncio.sleep(self.poll_interval)
            except Exception as e:
                logger.exception(f"Queue worker encountered an error: {e}")
                await asyncio.sleep(self.poll_interval)
