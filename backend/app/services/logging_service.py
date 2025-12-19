"""
Database Logging Service - Custom handler that stores logs in the database
"""
import logging
import traceback
from datetime import datetime
from queue import Queue, Empty
from threading import Thread
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import LogEntry


class DatabaseLogHandler(logging.Handler):
    """
    Custom logging handler that stores log entries in the database.
    Uses a queue and background thread to avoid blocking the main application.
    """

    def __init__(self, database_url: str, level: int = logging.INFO):
        super().__init__(level)
        self.database_url = database_url
        self.queue: Queue = Queue()
        self._running = True

        # Create a synchronous engine for the background thread
        # Convert async sqlite URL to sync
        sync_url = database_url.replace("sqlite+aiosqlite", "sqlite")
        self.engine = create_engine(
            sync_url, connect_args={
                "check_same_thread": False})
        self.Session = sessionmaker(bind=self.engine)

        # Start background thread for database writes
        self._thread = Thread(target=self._process_queue, daemon=True)
        self._thread.start()

    def emit(self, record: logging.LogRecord) -> None:
        """Emit a log record by adding it to the queue."""
        try:
            # Format exception info if present
            exception_text = None
            if record.exc_info:
                exception_text = ''.join(
                    traceback.format_exception(
                        *record.exc_info))

            # Create a dict with all the info we need
            log_data = {
                'timestamp': datetime.fromtimestamp(record.created),
                'level': record.levelname,
                'logger_name': record.name,
                'message': record.getMessage(),
                'module': record.module,
                'function': record.funcName,
                'line_number': record.lineno,
                'exception': exception_text,
            }

            self.queue.put(log_data)
        except Exception:
            # Don't let logging errors crash the app
            self.handleError(record)

    def _process_queue(self) -> None:
        """Background thread that processes the log queue."""
        while self._running:
            try:
                # Get log entry from queue with timeout
                log_data = self.queue.get(timeout=1.0)

                # Write to database
                session = self.Session()
                try:
                    log_entry = LogEntry(**log_data)
                    session.add(log_entry)
                    session.commit()
                except Exception:
                    session.rollback()
                finally:
                    session.close()

            except Empty:
                continue
            except Exception:
                # Don't let database errors crash the thread
                pass

    def close(self) -> None:
        """Clean up resources."""
        self._running = False
        self._thread.join(timeout=2.0)
        super().close()


# Global handler instance
_db_handler: Optional[DatabaseLogHandler] = None


def setup_database_logging(level: int = logging.INFO) -> None:
    """
    Set up database logging for all app loggers.
    Call this after the database is initialized.
    """
    global _db_handler

    if _db_handler is not None:
        return  # Already set up

    # Create the database handler
    _db_handler = DatabaseLogHandler(settings.database_url, level=level)

    # Set a formatter
    formatter = logging.Formatter('%(message)s')
    _db_handler.setFormatter(formatter)

    # Add to the root logger for our app modules
    # This will capture logs from all app.* loggers
    app_logger = logging.getLogger('app')
    app_logger.addHandler(_db_handler)
    app_logger.setLevel(level)

    # Also add to specific service loggers
    for logger_name in [
        'app.services.tmdb',
        'app.services.omdb',
        'app.services.scanner',
        'app.services.renamer',
        'app.services.mediainfo',
            'app.routers']:
        logger = logging.getLogger(logger_name)
        logger.addHandler(_db_handler)
        logger.setLevel(level)


def get_db_handler() -> Optional[DatabaseLogHandler]:
    """Get the database log handler instance."""
    return _db_handler