from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import asyncio
import logging
import json

from app.database import get_db
from app.services.queue import (
    create_task,
    get_task,
    list_tasks,
    cancel_task,
    clear_queued_tasks,
    subscribe_events,
    unsubscribe_events,
    QueueWorker,
)
from app.schemas import QueueTaskResponse, QueueItemResponse
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["queues"])


@router.post("/tasks")
async def api_create_task(body: dict, db: AsyncSession = Depends(get_db)):
    """Create a queue task. Body should have: type, items (list of payloads), meta (optional)"""
    task_type = body.get("type")
    items = body.get("items", [])
    meta = body.get("meta")
    created_by = body.get("created_by")

    if not task_type:
        raise HTTPException(status_code=400, detail="type is required")

    task = await create_task(task_type, items, meta=meta, created_by=created_by)
    return {"task_id": task.id, "status": task.status.value}


@router.get("/tasks")
async def api_list_tasks(limit: int = 50):
    tasks = await list_tasks(limit=limit)
    return tasks


@router.get("/tasks/{task_id}")
async def api_get_task(task_id: int):
    task = await get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")


    # Basic serialization
    items = []
    for i in task.items:
        items.append({
            "id": i.id,
            "index": i.index,
            "status": i.status.value,
            "payload": i.payload,
            "result": i.result,
            "started_at": i.started_at,
            "finished_at": i.finished_at,
        })

    return {
        "id": task.id,
        "type": task.type,
        "status": task.status.value,
        "created_by": task.created_by,
        "created_at": task.created_at,
        "started_at": task.started_at,
        "finished_at": task.finished_at,
        "total_items": task.total_items,
        "completed_items": task.completed_items,
        "meta": task.meta,
        "items": items,
    }


@router.post("/tasks/{task_id}/cancel")
async def api_cancel_task(task_id: int):

    t = await cancel_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": t.id, "status": t.status.value}
>>>>>>> d028972 (feat(queue): add QueueTask/QueueItem models, service, worker, router; enqueue scans on folder add)


@router.get("/ongoing")
async def api_ongoing():
    # Return short summary - implemented by listing tasks and filtering here
    tasks = await list_tasks(limit=10)
    return tasks
<<<<<<< HEAD
<<<<<<< HEAD


@router.get("/worker")
async def api_worker_status(request: Request):
    """Return worker running status."""
    worker = getattr(request.app.state, 'queue_worker', None)
    return {"running": bool(worker and worker.is_running())}


@router.post("/worker/run-once")
async def api_worker_run_once(request: Request):
    """Trigger a single worker iteration immediately (DEBUG only).

    Useful to force processing and surface exceptions synchronously during debugging.
    """
    if not settings.debug:
        raise HTTPException(status_code=403, detail="Run-once is only allowed in debug mode")

    worker = getattr(request.app.state, 'queue_worker', None)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not available")

    import traceback
    try:
        processed = await worker.process_one()
        return {"processed": bool(processed)}
    except Exception as e:
        # Log full traceback
        tb = traceback.format_exc()
        logger.exception(f"Worker run-once failed: {e}\n{tb}")
        # In debug, return the full traceback for easier diagnosis; otherwise keep generic
        if settings.debug:
            raise HTTPException(status_code=500, detail=tb)
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/stream')
async def api_queues_stream(request: Request):
    """Server-sent events stream of queue changes (init + task_update events)."""
    # subscribe
    q = subscribe_events()

    client = getattr(request, 'client', None)
    client_info = f"{client.host}:{client.port}" if client else 'unknown'
    logger.info(f"SSE client connected: {client_info}")

    async def event_generator():
        # Send initial snapshot
        try:
            initial = await list_tasks()
            yield f"event: init\ndata: {json.dumps(initial, default=str)}\n\n"
        except Exception as e:
            logger.exception(f"Failed to send initial task list: {e}")

        try:
            # Keepalive ping to prevent idle timeouts/closed proxies
            ping_interval = 15
            last_send = asyncio.get_event_loop().time()
            while True:
                try:
                    # If there's a queued message, send it immediately
                    msg = None
                    try:
                        msg = q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass

                    if msg:
                        yield msg
                        last_send = asyncio.get_event_loop().time()
                    else:
                        now = asyncio.get_event_loop().time()
                        if now - last_send >= ping_interval:
                            # send a ping comment (some clients ignore comments, so we send a ping event)
                            yield f"event: ping\ndata: {{}}\n\n"
                            last_send = now
                        # small sleep to avoid tight loop
                        await asyncio.sleep(1)
                except asyncio.CancelledError:
                    raise
        except asyncio.CancelledError:
            # Client disconnected
            logger.info(f"SSE client disconnected: {client_info}")
            pass
        finally:
            unsubscribe_events(q)

    return StreamingResponse(event_generator(), media_type='text/event-stream')

@router.post("/tasks/clear")
async def api_clear_tasks(scope: str | None = 'current', older_than_seconds: int | None = None):
    """Hard purge tasks by scope (DEBUG only).

    scope values: 'current' (queued/running), 'history' (completed/failed/canceled/deleted), 'all'.
    Permanently DELETEs matching tasks and their items (irreversible). Only enabled when app is running in debug mode.
    """
    if not settings.debug:
        raise HTTPException(status_code=403, detail="Clearing tasks is only allowed in debug mode")
    try:
        res = await clear_queued_tasks(scope=scope, older_than_seconds=older_than_seconds)
    except ValueError:
        raise HTTPException(status_code=400, detail='Invalid scope')
    return res


@router.get('/worker/debug')
async def api_worker_debug(request: Request):
    """Return worker debug info: running, last_processed_at, last_error."""
    worker = getattr(request.app.state, 'queue_worker', None)
    if not worker:
        raise HTTPException(status_code=404, detail='Worker not available')
    info = {
        'running': bool(worker and worker.is_running()),
        'last_processed_at': worker.last_processed_at.isoformat() if getattr(worker, 'last_processed_at', None) else None,
        'last_error': getattr(worker, 'last_error', None),
    }
    return info


@router.post('/worker/start')
async def api_worker_start(request: Request):
    """Start the queue worker (debug only)."""
    if not settings.debug:
        raise HTTPException(status_code=403, detail='Start/stop only allowed in debug mode')
    worker = getattr(request.app.state, 'queue_worker', None)
    if worker and worker.is_running():
        return {'started': False, 'reason': 'worker already running'}
    if not worker:
        request.app.state.queue_worker = QueueWorker()
        worker = request.app.state.queue_worker
    await worker.start()
    return {'started': True}


@router.post('/worker/stop')
async def api_worker_stop(request: Request):
    """Stop the queue worker (debug only)."""
    if not settings.debug:
        raise HTTPException(status_code=403, detail='Start/stop only allowed in debug mode')
    worker = getattr(request.app.state, 'queue_worker', None)
    if not worker or not worker.is_running():
        return {'stopped': False, 'reason': 'worker not running'}
    await worker.stop()
    return {'stopped': True}

