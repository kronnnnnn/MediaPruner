# Queue System — Design & API (placeholder)

📌 Purpose

This document outlines the design goals and minimal API for the new backend "queue" system. The queue will centralize and standardize long-running backend operations (analysis, refresh, library scans, renames, etc.), replace ad-hoc progress modules, and provide a single source of truth for progress, cancellation, and UI presentation.

## Goals

- All backend requests that perform work (long-running or batched) must be enqueued instead of being handled inline.
- Queue entries are hierarchical: a parent request can contain multiple child items (expandable UI style).
- Parent requests can be canceled at any time; cancellation propagates to running child tasks where possible.
- When folders are added to the app, the resulting scan job is enqueued immediately (not performed from Settings > Library manually).
- Expose a small, stable HTTP API and optional realtime events (WebSocket/Server-Sent Events) for UI updates.

---

## High-level design

- Persistence: store queue items in DB (e.g., `queue_tasks` and `queue_items`) so state survives restarts.
- Worker: a background worker process (single-thread or multiprocessing/async) picks queued parents and runs child items sequentially or with configurable concurrency.
- API surface: REST endpoints to create tasks, list tasks, get task details, cancel tasks.
- Notifications: broadcast events via WebSocket/SSE for clients that want realtime updates; HTTP polling also supported.
- Idempotency: tasks should be safe to retry for transient errors.
- Authorization: only authorized users (admins) can enqueue certain system operations and cancel them.

---

## Data model (suggested)

QueueTask (parent)
- id: UUID / int
- type: str (e.g., "scan", "analyze", "refresh_metadata", "rename")
- status: enum (queued, running, canceled, completed, failed)
- created_by: user id or system
- created_at, started_at, finished_at
- total_items: int
- completed_items: int
- canceled_at: nullable
- meta: json (free-form payload / original request)

QueueItem (child)
- id: UUID / int
- task_id: FK -> QueueTask
- index: int
- status: enum (queued, running, canceled, completed, failed)
- payload: json (e.g., movieId, filePath)
- result: json (error or success details)
- started_at, finished_at
- logs: optional text or linked LogEntry

---

## Minimal HTTP API

POST /api/queues/tasks
- Create a parent task
- Body (example):
```json
{
  "type": "scan",
  "items": [{"path": "C:/media/movies"}, {"path": "D:/media"}],
  "meta": {"trigger": "folder_add", "origin": "settings"}
}
```
- Response: 201 Created → { "task_id": 123 }

GET /api/queues
- List tasks (with filter support: status, type, created_by, limit/offset)
- Response: list of QueueTask summaries (include counts and top-level status)

GET /api/queues/{task_id}
- Return task details including child items and per-item statuses (expandable)

POST /api/queues/{task_id}/cancel
- Cancel the parent task. Response: 202 Accepted
- Behavior: mark task canceled and propagate cancel to running items.

GET /api/queues/{task_id}/items/{item_id}
- Get item details and logs

GET /api/queues/ongoing
- Short listing for HUD-type view (current task(s), percent complete)

---

## Realtime notifications (optional)

- Use WebSocket on /ws/queues or Server-Sent Events /events/queues
- Events: task.created, task.updated, item.updated, task.completed, task.canceled
- Payloads should include task_id, item_id (as applicable), status, progress fields

---

## UI Contract / Behavior

- Task list shows recent tasks with status and small progress bar (completed/total items). Clicking a task expands to show child items (in expandable/accordion style).
- Parent task row includes a Cancel button (if cancelable) and a small running indicator. Cancel sends POST /api/queues/{task_id}/cancel.
- For item-level errors, clicking an item shows the error message and link to logs/details.
- When a folder is added in the UI, the client calls the existing endpoint to add the folder; server will enqueue a scan task automatically and return the created task id to the client for immediate navigation if desired.

---

## Worker semantics & cancellation

- Worker marks a parent as `running` and processes items in order (or with configured parallelism).
- For cancellable sub-tasks, workers should check a cancellation flag before starting each item and, where possible, during the item execution (if the underlying operation supports cancellation). On cancellation, mark current item as `canceled` or `interrupted` and parent as `canceled`.
- Use DB updates + publish events for progress updates so UI remains consistent.

---

## Migration notes

- New DB tables: `queue_tasks`, `queue_items` (with indexes on status, created_at)
- Add models: `QueueTask`, `QueueItem` in `backend/app/models.py` and corresponding Pydantic schemas in `schemas.py`.
- Add simple unit tests and integration tests to cover enqueueing, processing, cancelation, and restart recovery.

---

## Acceptance criteria

- All long-running back-end operations can be created as a queue task and the API returns a task id.
- UI can list tasks and expand items to see per-item status.
- Canceling a parent request stops further items and sets status correctly.
- When a folder is added, a scan job is enqueued automatically.
- Tests exist that validate enqueue → process → complete and enqueue → cancel behaviors.

---

## Next steps / TODO

- [ ] Add DB models & migrations
- [ ] Implement a lightweight worker (async) and attach to FastAPI startup
- [ ] Wire current operations (analyze, refresh, fetch ratings, scan) to enqueue instead of running inline
- [ ] Add endpoints & schemas and unit tests
- [ ] Add WebSocket/SSE notifications and UI integration

---

If you want, I can now create the model scaffolding + migration and a minimal worker skeleton on the `implement-queue` branch.

---

*This file is a placeholder and will be refined as we implement functional components.*
