from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.queue import create_task, get_task, list_tasks, cancel_task

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


@router.get("/ongoing")
async def api_ongoing():
    # Return short summary - implemented by listing tasks and filtering here
    tasks = await list_tasks(limit=10)
    return tasks


@router.get("/worker")
async def api_worker_status(request):
    """Return worker running status."""
    worker = getattr(request.app.state, 'queue_worker', None)
    return {"running": bool(worker and worker.is_running())}
