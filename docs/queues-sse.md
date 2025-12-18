# Queue SSE (Server-Sent Events)

This document describes the SSE-based live update mechanism for the Queue page.

## Endpoint

- `GET /api/queues/stream` — returns a `text/event-stream` SSE stream.

Events published:
- `init` — initial snapshot when a client connects (payload: full array of task summaries).
- `tasks` — periodic / full snapshot (payload: full array of task summaries).
- `task_update` — emitted when a task or item changes (payload: single serialized task object).

## Client behavior

- Connect with `new EventSource('/api/queues/stream')`.
- Listen for `init` / `tasks` to populate the initial list.
- Listen for `task_update` to update a single task entry in-place without reloading the full list.
- The server publishes updates after task creation, cancel, item completion, and on clearing tasks.

## Notes & Operator tips

- The SSE implementation is intentionally lightweight (in-memory). It is suitable for single-instance deployments. For multi-instance deployments, replace with a centralized pub/sub (Redis, etc.) to avoid per-node subscriber isolation.
- The browser's `EventSource` will attempt automatic reconnects on network error. The frontend shows a small connection status indicator.
- For local debugging, you can `curl -N http://localhost:8000/api/queues/stream` to observe events (the curl session will stay open and print SSE frames).

## Manual recovery / tests

- If the queue appears stuck, you can run the provided scripts:
  - `python backend/scripts/list_queue.py` — list tasks and item statuses
  - `python backend/scripts/clear_queue.py` — mark queued/running tasks as deleted/canceled
- There's a unit test `backend/tests/test_sse_queue.py` verifying the publisher delivers an SSE message into a subscriber queue.

