from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
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

    # get_task now returns a serialized mapping
    return task


@router.post("/tasks/{task_id}/cancel")
async def api_cancel_task(task_id: int):
    try:
        res = await cancel_task(task_id)
        if not res:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"task_id": res.get('id'), "status": res.get('status')}
    except Exception as e:
        logger.exception(f"Failed to cancel task {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel task")


@router.get("/ongoing")
async def api_ongoing():
    # Return short summary - implemented by listing tasks and filtering here
    tasks = await list_tasks(limit=10)
    return tasks
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
        except Exception:
            logger.exception("Failed to send initial task list")

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
                            yield "event: ping\ndata: {}\n\n"
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
async def api_clear_tasks(scope: str | None = None, older_than_seconds: int | None = None):
    """Clear queued/running tasks (DEBUG only).

    Marks matching tasks as DELETED and queued/running items as CANCELED. Only enabled when app is running in debug mode.
    scope: 'current'|'history'|'all' (default 'all' if not provided)
    """
    if not settings.debug:
        raise HTTPException(status_code=403, detail="Clearing tasks is only allowed in debug mode")
    # Validate and forward scope to service; default to 'all' so UI can call without a scope and purge everything
    try:
        res = await clear_queued_tasks(scope=(scope or 'all'), older_than_seconds=older_than_seconds)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
