"""Test configuration and fixtures for backend tests."""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from pathlib import Path
import tempfile
import shutil

from app.database import Base
from app.models import LibraryPath, MediaType, Movie, TVShow


@pytest.fixture(scope="function")
def temp_db_path():
    """Create a temporary database file for testing."""
    temp_dir = tempfile.mkdtemp()
    db_path = Path(temp_dir) / "test.db"
    yield db_path
    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest_asyncio.fixture
async def test_engine(temp_db_path):
    """Create a test database engine."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{temp_db_path}",
        echo=False
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    await engine.dispose()


@pytest_asyncio.fixture
async def test_session(test_engine):
    """Create a test database session."""
    async_session_factory = async_sessionmaker(
        test_engine, 
        class_=AsyncSession, 
        expire_on_commit=False
    )
    
    async with async_session_factory() as session:
        yield session


@pytest.fixture
def mock_async_session(test_engine):
    """Create a mock async_session factory for testing queue operations."""
    from contextlib import asynccontextmanager
    
    async_session_factory = async_sessionmaker(
        test_engine, 
        class_=AsyncSession, 
        expire_on_commit=False
    )
    
    @asynccontextmanager
    async def mock_session():
        async with async_session_factory() as session:
            yield session
    
    return mock_session


@pytest_asyncio.fixture
async def library_path_movie(test_session):
    """Create a library path for movies."""
    lib_path = LibraryPath(
        path="/test/movies",
        name="Test Movies",
        media_type=MediaType.MOVIE
    )
    test_session.add(lib_path)
    await test_session.commit()
    await test_session.refresh(lib_path)
    return lib_path


@pytest_asyncio.fixture
async def library_path_tv(test_session):
    """Create a library path for TV shows."""
    lib_path = LibraryPath(
        path="/test/tv",
        name="Test TV",
        media_type=MediaType.TV
    )
    test_session.add(lib_path)
    await test_session.commit()
    await test_session.refresh(lib_path)
    return lib_path


@pytest_asyncio.fixture
async def sample_movie(test_session, library_path_movie):
    """Create a sample movie for testing."""
    movie = Movie(
        library_path_id=library_path_movie.id,
        title="Test Movie",
        year=2023,
        file_path="/test/path/movie.mkv",
        file_name="Test Movie (2023).mkv",
        folder_name="Test Movie (2023)",
        scraped=False
    )
    test_session.add(movie)
    await test_session.commit()
    await test_session.refresh(movie)
    return movie


@pytest_asyncio.fixture
async def sample_tvshow(test_session, library_path_tv):
    """Create a sample TV show for testing."""
    show = TVShow(
        library_path_id=library_path_tv.id,
        title="Test Show",
        folder_path="/test/path/show",
        folder_name="Test Show",
        scraped=False
    )
    test_session.add(show)
    await test_session.commit()
    await test_session.refresh(show)
    return show
