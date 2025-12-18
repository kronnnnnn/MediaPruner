"""Tests for queue worker metadata refresh functionality."""
import pytest
from sqlalchemy import select

from app.models import LogEntry, QueueTask, QueueItem, QueueStatus
from app.services.queue import QueueWorker, create_task


class MockTMDBResult:
    """Mock TMDB result object."""
    def __init__(self, title="Updated Title", tmdb_id=12345, success=True):
        self.success = success
        if success:
            self.tmdb_id = tmdb_id
            self.title = title
            self.original_title = title
            self.overview = "Test overview"
            self.tagline = "Test tagline"
            self.release_date = None
            self.runtime = 120
            self.genres = ["Action", "Drama"]
            self.poster_path = "/poster.jpg"
            self.backdrop_path = "/backdrop.jpg"
            self.imdb_id = "tt1234567"
            self.rating = 7.5
            self.votes = 1000


class MockTMDBService:
    """Mock TMDB service for testing."""
    def __init__(self, return_result=True):
        self.is_configured = True
        self.return_result = return_result
        self.last_search_tried = "mock_search"
        
    async def search_movie_and_get_details(self, title, year=None):
        """Mock movie search."""
        if self.return_result:
            return MockTMDBResult()
        return None
    
    async def search_tvshow_and_get_details(self, title, year=None):
        """Mock TV show search."""
        if self.return_result:
            result = MockTMDBResult()
            result.tmdb_id = 54321
            return result
        return None
    
    @staticmethod
    async def create_with_db_key(session):
        """Factory method to create service."""
        return MockTMDBService(return_result=True)


class MockTMDBServiceNoResult:
    """Mock TMDB service that returns no results."""
    def __init__(self):
        self.is_configured = True
        self.last_search_tried = "mock_search_no_result"
        
    async def search_movie_and_get_details(self, title, year=None):
        """Mock movie search with no results."""
        return None
    
    async def search_tvshow_and_get_details(self, title, year=None):
        """Mock TV show search with no results."""
        return None
    
    @staticmethod
    async def create_with_db_key(session):
        """Factory method to create service."""
        return MockTMDBServiceNoResult()


@pytest.mark.asyncio
async def test_scrape_with_tmdb_override_applies_details(test_session, sample_movie, mock_async_session, monkeypatch):
    """Test that TMDB override in queue worker properly persists metadata updates.
    
    This test verifies that when a movie is refreshed via the queue with TMDB results,
    the movie record is properly updated and committed so the changes are visible
    to subsequent database queries.
    """
    # Patch TMDBService to return mock results - patch in the tmdb module where it's defined
    monkeypatch.setattr("app.services.tmdb.TMDBService", MockTMDBService)
    
    # Patch async_session in queue module to use test database
    monkeypatch.setattr("app.services.queue.async_session", mock_async_session)
    
    # Create a refresh_metadata task
    task = await create_task(
        'refresh_metadata',
        items=[{"movie_id": sample_movie.id}],
        meta={"trigger": "test"}
    )
    
    # Process the task with the queue worker
    worker = QueueWorker()
    processed = await worker.process_one()
    
    assert processed is True, "Worker should have processed a task"
    
    # Refresh the movie from the database to see the updates
    await test_session.refresh(sample_movie)
    
    # Verify the movie was updated with TMDB data
    assert sample_movie.tmdb_id == 12345, "TMDB ID should be updated"
    assert sample_movie.title == "Updated Title", "Title should be updated"
    assert sample_movie.scraped is True, "Movie should be marked as scraped"
    assert sample_movie.overview == "Test overview", "Overview should be updated"
    assert sample_movie.rating == 7.5, "Rating should be updated"
    
    # Verify the task completed successfully
    result = await test_session.execute(select(QueueTask).where(QueueTask.id == task.id))
    updated_task = result.scalar_one()
    assert updated_task.status == QueueStatus.COMPLETED, "Task should be completed"
    assert updated_task.completed_items == 1, "Should have completed 1 item"
    
    # Verify the queue item has the correct result
    result = await test_session.execute(
        select(QueueItem).where(QueueItem.task_id == task.id)
    )
    item = result.scalar_one()
    assert item.status == QueueStatus.COMPLETED, "Item should be completed"
    assert "tmdb" in item.result.lower(), "Result should indicate TMDB update"


@pytest.mark.asyncio
async def test_refresh_metadata_show_no_metadata(test_session, sample_tvshow, mock_async_session, monkeypatch):
    """Test that when TMDB returns no results for a TV show, a LogEntry is properly persisted.
    
    This test verifies that when the queue worker attempts to refresh metadata for a show
    but TMDB returns no results, the worker creates and commits a LogEntry to the database
    so the no-result event is visible to subsequent queries.
    """
    # Patch TMDBService to return no results - patch in the tmdb module where it's defined
    monkeypatch.setattr("app.services.tmdb.TMDBService", MockTMDBServiceNoResult)
    
    # Patch async_session in queue module to use test database
    monkeypatch.setattr("app.services.queue.async_session", mock_async_session)
    
    # Count existing log entries
    result = await test_session.execute(select(LogEntry))
    initial_log_count = len(result.scalars().all())
    
    # Create a refresh_metadata task for the TV show
    task = await create_task(
        'refresh_metadata',
        items=[{"show_id": sample_tvshow.id}],
        meta={"trigger": "test"}
    )
    
    # Process the task with the queue worker
    worker = QueueWorker()
    processed = await worker.process_one()
    
    assert processed is True, "Worker should have processed a task"
    
    # Verify the task completed (not failed, since no metadata is acceptable)
    result = await test_session.execute(select(QueueTask).where(QueueTask.id == task.id))
    updated_task = result.scalar_one()
    assert updated_task.status == QueueStatus.COMPLETED, "Task should be completed even with no metadata"
    assert updated_task.completed_items == 1, "Should have completed 1 item"
    
    # Verify the queue item result indicates no metadata found
    result = await test_session.execute(
        select(QueueItem).where(QueueItem.task_id == task.id)
    )
    item = result.scalar_one()
    assert item.status == QueueStatus.COMPLETED, "Item should be completed"
    assert "no metadata found" in item.result.lower(), "Result should indicate no metadata"
    
    # CRITICAL TEST: Verify a LogEntry was created and persisted to the database
    result = await test_session.execute(
        select(LogEntry).order_by(LogEntry.timestamp.desc())
    )
    log_entries = result.scalars().all()
    
    assert len(log_entries) > initial_log_count, "At least one new LogEntry should be created"
    
    # Find the log entry related to TMDB no-result
    tmdb_logs = [log for log in log_entries if "tmdb" in log.message.lower() and "no result" in log.message.lower()]
    assert len(tmdb_logs) > 0, "Should have at least one LogEntry about TMDB no-result"
    
    # Verify log entry details
    tmdb_log = tmdb_logs[0]
    assert tmdb_log.logger_name == "QueueWorker", "Log should be from QueueWorker"
    assert sample_tvshow.title in tmdb_log.message, "Log should mention the show title"
    assert tmdb_log.level in ["INFO", "WARNING"], "Log level should be INFO or WARNING"
