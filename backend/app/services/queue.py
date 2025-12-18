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

# Simple in-memory SSE broadcaster
_subscribers: set[asyncio.Queue] = set()
_SUBSCRIBER_QUEUE_MAXSIZE = 10


def subscribe_events():
    """Create and return a subscription queue for SSE clients."""
    q: asyncio.Queue = asyncio.Queue(maxsize=_SUBSCRIBER_QUEUE_MAXSIZE)
    _subscribers.add(q)
    return q


def unsubscribe_events(q: asyncio.Queue):
    try:
        _subscribers.discard(q)
    except Exception:
        pass


async def _publish_event(event: str, payload: dict):
    """Publish an event to all subscribers.

    The payload is JSON-serializable. We format it into an SSE message string.
    """
    try:
        data = json.dumps(payload, default=str)
        sse = f"event: {event}\ndata: {data}\n\n"
        for q in list(_subscribers):
            try:
                q.put_nowait(sse)
            except asyncio.QueueFull:
                # If the subscriber queue is full, drop the oldest item to make room
                try:
                    q.get_nowait()
                except Exception:
                    pass
                try:
                    q.put_nowait(sse)
                except Exception:
                    # If it still fails, remove the subscriber to keep things healthy
                    try:
                        _subscribers.discard(q)
                    except Exception:
                        pass
    except Exception as e:
        logger.exception(f"Failed to publish SSE event: {e}")


async def publish_task_update(task_id: int):
    """Publish a serialized task object to subscribers so clients can update live."""
    try:
        task = await get_task(task_id)
        if task:
            await _publish_event('task_update', task)
    except Exception as e:
        logger.exception(f"Failed to publish task update for {task_id}: {e}")


async def publish_task_list():
    """Publish full task list snapshot."""
    try:
        tasks = await list_tasks()
        await _publish_event('tasks', tasks)
    except Exception as e:
        logger.exception(f"Failed to publish task list: {e}")


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
        # Notify SSE subscribers about the new task
        try:
            await publish_task_update(task.id)
        except Exception:
            logger.exception("Failed to publish create task event")
        return task


async def list_tasks(limit: int = 50):
    async with async_session() as session:
        result = await session.execute(
            QueueTask.__table__.select().order_by(QueueTask.created_at.desc()).limit(limit)
        )
        # Use mappings() to get dict-like objects that can be converted to plain dicts
        mappings = result.mappings().all()

        tasks: list[dict] = []
        for m in mappings:
            d = dict(m)
            # Parse JSON meta if present
            if d.get('meta') and isinstance(d['meta'], (str, bytes)):
                try:
                    d['meta'] = json.loads(d['meta'])
                except Exception:
                    # leave as-is if it's not valid JSON
                    pass

            # Convert Enum status to its value
            status = d.get('status')
            try:
                # QueueStatus is an enum class; convert to string if needed
                d['status'] = status.value if hasattr(status, 'value') else str(status)
            except Exception:
                d['status'] = str(status)

            # Convert datetimes to ISO strings for JSON serialization
            for dt_field in ('created_at', 'started_at', 'finished_at', 'canceled_at'):
                v = d.get(dt_field)
                if v is not None and hasattr(v, 'isoformat'):
                    d[dt_field] = v.isoformat()

            tasks.append(d)

        return tasks


async def get_task(task_id: int):
    """Return a serialized dict for the task including child items."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    async with async_session() as session:
        q = await session.execute(
            select(QueueTask).where(QueueTask.id == task_id).options(selectinload(QueueTask.items))
        )
        task = q.scalars().first()
        if not task:
            return None

        # Serialize
        data = {
            'id': task.id,
            'type': task.type,
            'status': task.status.value if hasattr(task.status, 'value') else str(task.status),
            'created_by': task.created_by,
            'created_at': task.created_at.isoformat() if task.created_at else None,
            'started_at': task.started_at.isoformat() if task.started_at else None,
            'finished_at': task.finished_at.isoformat() if task.finished_at else None,
            'total_items': task.total_items,
            'completed_items': task.completed_items,
            'meta': None,
            'items': [],
        }

        # parse meta if available
        if task.meta:
            try:
                data['meta'] = json.loads(task.meta)
            except Exception:
                data['meta'] = task.meta

        for i in task.items:
            data['items'].append({
                'id': i.id,
                'index': i.index,
                'status': i.status.value if hasattr(i.status, 'value') else str(i.status),
                'payload': i.payload,
                'result': i.result,
                'started_at': i.started_at.isoformat() if i.started_at else None,
                'finished_at': i.finished_at.isoformat() if i.finished_at else None,
            })

        return data


async def cancel_task(task_id: int):
    """Cancel a task and mark queued/running items as canceled without lazy-loading relationships.

    Returns a simple mapping with task id and status on success, or None if not found.
    """
    from sqlalchemy import update, select

    async with async_session() as session:
        # Check task exists
        t = await session.get(QueueTask, task_id)
        if not t:
            return None

        # Update task row directly
        await session.execute(
            update(QueueTask)
            .where(QueueTask.id == task_id)
            .values(status=QueueStatus.DELETED, canceled_at=datetime.utcnow())
        )

        # Update queued/running items without loading relationship
        res = await session.execute(
            update(QueueItem)
            .where(QueueItem.task_id == task_id)
            .where(QueueItem.status.in_([QueueStatus.QUEUED, QueueStatus.RUNNING]))
            .values(status=QueueStatus.CANCELED)
        )

        await session.commit()

        # Logging: report how many items were affected if available (SQLAlchemy 1.4 returns rowcount on result)
        try:
            rowcount = getattr(res, 'rowcount', None)
            logger.info(f"Canceled task {task_id}; items affected: {rowcount}")
        except Exception:
            logger.info(f"Canceled task {task_id}")

        # Publish update so SSE clients can react
        try:
            await publish_task_update(task_id)
        except Exception:
            logger.exception("Failed to publish cancel task event")

        # Return a simple mapping (avoid returning ORM objects outside session)
        return {"id": task_id, "status": QueueStatus.CANCELED.value if hasattr(QueueStatus.CANCELED, 'value') else str(QueueStatus.CANCELED)}


async def clear_queued_tasks(older_than_seconds: int | None = None):
    """Clear queued or running tasks and cancel their items.

    If older_than_seconds is provided, only tasks with started_at older than that (or tasks created_at older than that when not started) are affected.
    Returns a dict with counts.
    """
    from sqlalchemy import update, select, and_, or_
    from datetime import datetime, timedelta

    async with async_session() as session:
        # Build where clause
        where_clause = QueueTask.status.in_([QueueStatus.QUEUED, QueueStatus.RUNNING])
        if older_than_seconds is not None:
            cutoff = datetime.utcnow() - timedelta(seconds=older_than_seconds)
            # If task started_at exists, compare started_at, else created_at
            where_clause = and_(
                where_clause,
                or_(
                    and_(QueueTask.started_at != None, QueueTask.started_at < cutoff),
                    QueueTask.created_at < cutoff,
                ),
            )

        q = await session.execute(select(QueueTask).where(where_clause))
        tasks = q.scalars().all()
        if not tasks:
            return {"tasks_cleared": 0, "items_affected": 0}

        ids = [t.id for t in tasks]

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
        # Publish update for affected tasks so clients refresh
        try:
            for tid in ids:
                await publish_task_update(tid)
        except Exception:
            logger.exception("Failed to publish updates after clearing tasks")
        return {"tasks_cleared": len(ids), "items_affected": rowcount}


class QueueWorker:
    """Simple async worker that polls for queued tasks and processes them."""

    def __init__(self, poll_interval: float = 2.0):
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self.poll_interval = poll_interval
        # Track last processed timestamp and last error for diagnostics
        self.last_processed_at: Optional[datetime] = None
        self.last_error: Optional[str] = None

    async def start(self):
        logger.info("Starting queue worker")
        self._stop.clear()
        self._task = asyncio.create_task(self.run())

    async def stop(self):
        logger.info("Stopping queue worker")
        self._stop.set()
        if self._task:
            await self._task

    def is_running(self) -> bool:
        """Return whether the worker is actively running."""
        return self._task is not None and not self._task.done() and not self._stop.is_set()

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
                logger.debug("No queued tasks found")
                return False

            # Lock and mark running
            task.status = QueueStatus.RUNNING
            task.started_at = datetime.utcnow()
            await session.commit()
            await session.refresh(task)

            logger.info(f"Processing queue task {task.id} type={task.type} items={len(task.items)} started_at={task.started_at}")

            # Process items sequentially
            for item in sorted(task.items, key=lambda x: x.index):
                # Refresh task row to get latest status (so cancel is noticed quickly)
                await session.refresh(task)
                if task.status in (QueueStatus.CANCELED, QueueStatus.DELETED):
                    logger.info(f"Task {task.id} canceled/deleted before item {item.id}")
                    break

                if item.status != QueueStatus.QUEUED:
                    logger.debug(f"Skipping item {item.id} with status {item.status}")
                    continue

                # Mark item running
                item.status = QueueStatus.RUNNING
                item.started_at = datetime.utcnow()
                await session.commit()

                logger.info(f"Starting item {item.id} (index={item.index}) for task {task.id}")
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

                    # Analyze handler: analyze movie or episode files and update DB
                    elif task.type == 'analyze':
                        from app.services.mediainfo import analyze_file
                        from app.models import Movie, Episode, LogEntry

                        # payload may include movie_id or episode_id
                        if 'movie_id' in payload:
                            movie_id = int(payload['movie_id'])
                            m = await session.get(Movie, movie_id)
                            if not m or not m.file_path:
                                item.result = json.dumps({'error': 'movie not found or missing file_path'})
                                item.status = QueueStatus.FAILED
                            else:
                                info = await asyncio.to_thread(analyze_file, m.file_path)
                                if info.success:
                                    # update movie fields
                                    m.video_codec = info.video_codec
                                    m.video_profile = info.video_codec_profile
                                    m.video_resolution = info.video_resolution
                                    m.video_width = info.video_width
                                    m.video_height = info.video_height
                                    m.video_aspect_ratio = info.video_aspect_ratio
                                    m.video_bitrate = info.video_bitrate
                                    m.video_framerate = info.video_framerate
                                    m.video_hdr = info.video_hdr
                                    m.audio_codec = info.audio_codec
                                    m.audio_channels = info.audio_channels
                                    m.audio_bitrate = info.audio_bitrate
                                    m.audio_language = info.audio_language
                                    m.subtitle_languages = json.dumps(info.subtitle_languages)
                                    m.subtitle_count = info.subtitle_count
                                    m.media_info_scanned = True
                                    m.media_info_failed = False
                                    item.result = json.dumps({'found': True})
                                    item.status = QueueStatus.COMPLETED
                                    task.completed_items = (task.completed_items or 0) + 1
                                else:
                                    m.media_info_failed = True
                                    item.result = json.dumps({'error': info.error})
                                    item.status = QueueStatus.FAILED
                                    # insert a LogEntry row
                                    log = LogEntry(
                                        level='WARNING',
                                        logger_name='QueueWorker',
                                        message=f"Analyze failed for movie_id={m.id}: {info.error}",
                                        module='queue',
                                        function='analyze',
                                    )
                                    session.add(log)

                        elif 'episode_id' in payload:
                            episode_id = int(payload['episode_id'])
                            e = await session.get(Episode, episode_id)
                            if not e or not e.file_path:
                                item.result = json.dumps({'error': 'episode not found or missing file_path'})
                                item.status = QueueStatus.FAILED
                            else:
                                info = await asyncio.to_thread(analyze_file, e.file_path)
                                if info.success:
                                    e.video_codec = info.video_codec
                                    e.video_resolution = info.video_resolution
                                    e.video_width = info.video_width
                                    e.video_height = info.video_height
                                    e.audio_codec = info.audio_codec
                                    e.audio_channels = info.audio_channels
                                    e.media_info_scanned = True
                                    e.media_info_failed = False
                                    item.result = json.dumps({'found': True})
                                    item.status = QueueStatus.COMPLETED
                                    task.completed_items = (task.completed_items or 0) + 1
                                else:
                                    e.media_info_failed = True
                                    item.result = json.dumps({'error': info.error})
                                    item.status = QueueStatus.FAILED
                                    log = LogEntry(
                                        level='WARNING',
                                        logger_name='QueueWorker',
                                        message=f"Analyze failed for episode_id={e.id}: {info.error}",
                                        module='queue',
                                        function='analyze',
                                    )
                                    session.add(log)
                        else:
                            item.result = json.dumps({'error': 'no id provided'})
                            item.status = QueueStatus.FAILED

                    elif task.type == 'refresh_metadata':
                        # Refresh metadata for a movie or TV show
                        from app.services.tmdb import TMDBService
                        from app.services.omdb import fetch_omdb_ratings, get_omdb_api_key_from_db
                        from app.models import Movie, TVShow

                        if 'movie_id' in payload:
                            movie_id = int(payload['movie_id'])
                            m = await session.get(Movie, movie_id)
                            if not m:
                                item.result = json.dumps({'error': 'movie not found'})
                                item.status = QueueStatus.FAILED
                            else:
                                tmdb_service = await TMDBService.create_with_db_key(session)
                                tmdb_result = None
                                if tmdb_service.is_configured:
                                    tmdb_result = await tmdb_service.search_movie_and_get_details(m.title or '', m.year)

                                if tmdb_result:
                                    m.tmdb_id = tmdb_result.tmdb_id
                                    m.title = tmdb_result.title
                                    m.original_title = tmdb_result.original_title
                                    m.overview = tmdb_result.overview
                                    m.release_date = tmdb_result.release_date
                                    m.rating = tmdb_result.rating
                                    m.votes = tmdb_result.votes
                                    m.poster_path = tmdb_result.poster_path
                                    m.backdrop_path = tmdb_result.backdrop_path
                                    m.imdb_id = tmdb_result.imdb_id
                                    m.scraped = True
                                    item.result = json.dumps({'updated_from': 'tmdb'})
                                    item.status = QueueStatus.COMPLETED
                                    task.completed_items = (task.completed_items or 0) + 1
                                else:
                                    # Record what TMDB variants were tried for operator visibility
                                    try:
                                        tried = getattr(tmdb_service, 'last_search_tried', None)
                                        from app.models import LogEntry
                                        msg = f"TMDB search for movie '{m.title}' ({m.year}) returned no result. Tried: {tried}"
                                        logger.info(msg)
                                        log = LogEntry(
                                            level='INFO',
                                            logger_name='QueueWorker',
                                            message=msg,
                                            module='queue',
                                            function='process_one',
                                        )
                                        session.add(log)
                                        await session.commit()
                                    except Exception:
                                        logger.exception('Failed to persist LogEntry for TMDB no-result')

                                    # Try OMDb fallback for ratings only and capture request params
                                    api_key = await get_omdb_api_key_from_db(session)
                                    if api_key:
                                        from app.services.omdb import OMDbService
                                        omdb_service = OMDbService(api_key)
                                        omdb = await omdb_service.get_ratings_by_title(m.title, m.year)
                                        if omdb:
                                            m.imdb_rating = omdb.imdb_rating or m.imdb_rating
                                            m.imdb_votes = omdb.imdb_votes or m.imdb_votes
                                            m.rotten_tomatoes_score = omdb.rotten_tomatoes_score or m.rotten_tomatoes_score
                                            m.scraped = True
                                            item.result = json.dumps({'updated_from': 'omdb'})
                                            item.status = QueueStatus.COMPLETED
                                            task.completed_items = (task.completed_items or 0) + 1
                                        else:
                                            # Log OMDb request params for operator visibility
                                            try:
                                                from app.models import LogEntry
                                                detail_msg = f"OMDb search for '{m.title}' ({m.year}) returned no result. Request params: {omdb_service.last_request_params}"
                                                logger.info(detail_msg)
                                                log = LogEntry(
                                                    level='INFO',
                                                    logger_name='QueueWorker',
                                                    message=detail_msg,
                                                    module='queue',
                                                    function='process_one',
                                                )
                                                session.add(log)
                                                await session.commit()
                                            except Exception:
                                                logger.exception("Failed to persist LogEntry for OMDb no-result")

                                            # No metadata found from either source; mark as completed (no-op)
                                            item.result = json.dumps({'updated_from': None, 'note': 'no metadata found from TMDB or OMDb'})
                                            item.status = QueueStatus.COMPLETED
                                            task.completed_items = (task.completed_items or 0) + 1
                                    else:
                                        # No OMDb provider configured - treat as no-op
                                        item.result = json.dumps({'note': 'no provider available'})
                                        item.status = QueueStatus.COMPLETED
                                        task.completed_items = (task.completed_items or 0) + 1

                        elif 'show_id' in payload:
                            show_id = int(payload['show_id'])
                            s = await session.get(TVShow, show_id)
                            if not s:
                                item.result = json.dumps({'error': 'show not found'})
                                item.status = QueueStatus.FAILED
                            else:
                                tmdb_service = await TMDBService.create_with_db_key(session)
                                if tmdb_service.is_configured:
                                    # Respect payload overrides (tmdb_id, imdb_id, title, year) when provided
                                    override_tmdb = payload.get('tmdb_id')
                                    override_imdb = payload.get('imdb_id')
                                    override_title = payload.get('title')
                                    override_year = payload.get('year')
                                    tmdb_result = None

                                    # If an IMDB id override is provided, prefer OMDb fetch first (it may have better mapping)
                                    if override_imdb:
                                        try:
                                            from app.services.omdb import OMDbService, get_omdb_api_key_from_db
                                            api_key = await get_omdb_api_key_from_db(session)
                                            if api_key:
                                                omdb_svc = OMDbService(api_key)
                                                omdb_res = await omdb_svc.get_tvshow_by_imdb_id(str(override_imdb))
                                                if omdb_res and omdb_res.imdb_id:
                                                    # Set IMDB id and prefer TMDB lookup by searching with title/year
                                                    override_title = omdb_res.title or override_title
                                                    override_year = int(omdb_res.year) if omdb_res.year and omdb_res.year.isdigit() else override_year
                                        except Exception:
                                            logger.exception('Failed to fetch OMDb show by IMDB override')

                                    if override_tmdb:
                                        tmdb_result = await tmdb_service.get_tvshow_details(int(override_tmdb))
                                    elif override_title:
                                        tmdb_result = await tmdb_service.search_tvshow_and_get_details(override_title, override_year)
                                    else:
                                        tmdb_result = await tmdb_service.search_tvshow_and_get_details(s.title or '')
                                    if tmdb_result:
                                        s.tmdb_id = tmdb_result.tmdb_id
                                        s.title = tmdb_result.title
                                        s.overview = tmdb_result.overview
                                        s.poster_path = tmdb_result.poster_path
                                        s.backdrop_path = tmdb_result.backdrop_path
                                        s.imdb_id = tmdb_result.imdb_id
                                        s.scraped = True
                                        item.result = json.dumps({'updated_from': 'tmdb'})
                                        item.status = QueueStatus.COMPLETED
                                        task.completed_items = (task.completed_items or 0) + 1
                                    else:
                                        # No metadata was found for this show; record diagnostics and mark item completed (no-op)
                                        try:
                                            tried = getattr(tmdb_service, 'last_search_tried', None)
                                            from app.models import LogEntry
                                            msg = f"TMDB search for show '{s.title}' ({s.id}) returned no result. Tried: {tried}"
                                            logger.info(msg)
                                            log = LogEntry(
                                                level='INFO',
                                                logger_name='QueueWorker',
                                                message=msg,
                                                module='queue',
                                                function='process_one',
                                            )
                                            session.add(log)
                                            await session.commit()
                                        except Exception:
                                            logger.exception('Failed to persist LogEntry for TMDB no-result (show)')

                                        item.result = json.dumps({'updated_from': None, 'note': 'no metadata found from TMDB or OMDb'})
                                        item.status = QueueStatus.COMPLETED
                                        task.completed_items = (task.completed_items or 0) + 1
                                else:
                                    item.result = json.dumps({'error': 'tmdb not configured'})
                                    item.status = QueueStatus.FAILED

                        elif 'episode_id' in payload:
                            episode_id = int(payload['episode_id'])
                            from app.models import Episode
                            ep = await session.get(Episode, episode_id)
                            if not ep:
                                item.result = json.dumps({'error': 'episode not found'})
                                item.status = QueueStatus.FAILED
                            else:
                                # Need show and tmdb id
                                show = await session.get(TVShow, ep.tvshow_id)
                                if not show or not getattr(show, 'tmdb_id', None):
                                    item.result = json.dumps({'error': 'show missing tmdb id'})
                                    item.status = QueueStatus.FAILED
                                else:
                                    tmdb_service = await TMDBService.create_with_db_key(session)
                                    if not tmdb_service.is_configured:
                                        item.result = json.dumps({'error': 'tmdb not configured'})
                                        item.status = QueueStatus.FAILED
                                    else:
                                        episodes = await tmdb_service.get_season_details(show.tmdb_id, ep.season_number)
                                        matched = [e for e in episodes if e.episode_number == ep.episode_number]
                                        if not matched:
                                            item.result = json.dumps({'error': 'episode not found on tmdb'})
                                            item.status = QueueStatus.FAILED
                                        else:
                                            info = matched[0]
                                            ep.title = info.title
                                            ep.overview = info.overview
                                            ep.air_date = info.air_date
                                            ep.duration = info.runtime
                                            ep.still_path = info.still_path
                                            ep.media_info_scanned = True
                                            item.result = json.dumps({'updated_from': 'tmdb'})
                                            item.status = QueueStatus.COMPLETED
                                            task.completed_items = (task.completed_items or 0) + 1

                    # Sync watch history handler: query Tautulli (prefer rating_key via Plex when possible)
                    elif task.type == 'sync_watch_history':
                        from app.services.tautulli import get_tautulli_service
                        from app.services.plex import get_plex_service
                        from app.models import Movie

                        if 'movie_id' not in payload:
                            item.result = json.dumps({'error': 'no movie_id provided'})
                            item.status = QueueStatus.FAILED
                        else:
                            movie_id = int(payload['movie_id'])
                            m = await session.get(Movie, movie_id)
                            if not m:
                                item.result = json.dumps({'error': 'movie not found'})
                                item.status = QueueStatus.FAILED
                            else:
                                try:
                                    tautulli = await get_tautulli_service(session)
                                except Exception:
                                    tautulli = None

                                if not tautulli:
                                    item.result = json.dumps({'error': 'tautulli not configured'})
                                    item.status = QueueStatus.FAILED
                                else:
                                    resolved_rating_key = None

                                    # Fast path: stored rating_key
                                    if getattr(m, 'rating_key', None):
                                        resolved_rating_key = m.rating_key

                                    # Try Plex when rating_key missing
                                    if not resolved_rating_key:
                                        try:
                                            plex = await get_plex_service(session)
                                            if plex:
                                                if getattr(m, 'imdb_id', None):
                                                    rk = await plex.get_rating_key_by_imdb(m.imdb_id)
                                                    if rk:
                                                        resolved_rating_key = rk
                                                if not resolved_rating_key and getattr(m, 'title', None):
                                                    plex_results = await plex.search(m.title)
                                                    if plex_results:
                                                        for pr in plex_results:
                                                            rk = pr.get('ratingKey') or pr.get('rating_key') or pr.get('ratingkey')
                                                            if rk:
                                                                try:
                                                                    resolved_rating_key = int(rk)
                                                                    break
                                                                except Exception:
                                                                    continue
                                        except Exception:
                                            resolved_rating_key = None

                                    history = []
                                    try:
                                        if resolved_rating_key:
                                            history = await tautulli.get_history(rating_key=resolved_rating_key)
                                            m.rating_key = resolved_rating_key
                                        else:
                                            history, resolved = await tautulli.search_movie_history(m.title, m.year, imdb_id=m.imdb_id, db=session)
                                            if resolved and not m.rating_key:
                                                m.rating_key = resolved

                                        if history:
                                            m.watched = True
                                            m.watch_count = len(history)
                                            most_recent = history[0]
                                            # Use module-level datetime to avoid creating a local binding that
                                            # would make 'datetime' a local name for the whole function
                                            m.last_watched_date = datetime.fromtimestamp(most_recent.get('date', 0))
                                            m.last_watched_user = most_recent.get('user', 'Unknown')
                                            item.result = json.dumps({'watched': True, 'watch_count': m.watch_count})
                                            item.status = QueueStatus.COMPLETED
                                            task.completed_items = (task.completed_items or 0) + 1
                                        else:
                                            m.watched = False
                                            m.watch_count = 0
                                            m.last_watched_date = None
                                            m.last_watched_user = None
                                            item.result = json.dumps({'watched': False})
                                            item.status = QueueStatus.COMPLETED
                                            task.completed_items = (task.completed_items or 0) + 1
                                    except Exception as e:
                                        item.result = json.dumps({'error': str(e)})
                                        item.status = QueueStatus.FAILED
                    else:
                        # Unknown task - mark failed
                        item.result = json.dumps({'error': 'unknown task type'})
                        item.status = QueueStatus.FAILED


                except Exception as e:
                    logger.exception(f"Error processing item {item.id} for task {task.id}: {e}")
                    item.result = json.dumps({'error': str(e)})
                    item.status = QueueStatus.FAILED
                    # store last error for diagnostics
                    self.last_error = str(e)

                item.finished_at = datetime.utcnow()
                await session.commit()

                # If an item failed, log and persist a LogEntry for operator visibility
                if item.status == QueueStatus.FAILED:
                    try:
                        from app.models import LogEntry
                        detail_msg = f"Queue item {item.id} for task {task.id} failed: {item.result}"
                        logger.warning(detail_msg)
                        log = LogEntry(
                            level='ERROR',
                            logger_name='QueueWorker',
                            message=detail_msg,
                            module='queue',
                            function='process_one',
                        )
                        session.add(log)
                        await session.commit()
                    except Exception:
                        logger.exception(f"Failed to persist LogEntry for failed queue item {item.id}")

                # Publish an update after each item completes so clients can update live
                try:
                    await publish_task_update(task.id)
                except Exception:
                    logger.exception(f"Failed to publish update for task {task.id} after item {item.id}")

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

                # If the task failed, persist a summary LogEntry to make this visible in the DB logs
                if task.status == QueueStatus.FAILED:
                    try:
                        from app.models import LogEntry
                        failed_items = [i for i in task.items if i.status == QueueStatus.FAILED]
                        details = ', '.join([f"item={i.id} result={i.result}" for i in failed_items]) if failed_items else 'no item details'
                        log_msg = f"Task {task.id} completed with FAILED items: {details}"
                        logger.warning(log_msg)
                        log = LogEntry(
                            level='ERROR',
                            logger_name='QueueWorker',
                            message=log_msg,
                            module='queue',
                            function='process_one',
                        )
                        session.add(log)
                        await session.commit()
                    except Exception:
                        logger.exception(f"Failed to persist LogEntry for failed task {task.id}")

                # Publish final task update
                try:
                    await publish_task_update(task.id)
                except Exception:
                    logger.exception(f"Failed to publish final update for task {task.id}")

            # record last processed timestamp
            self.last_processed_at = datetime.utcnow()

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
