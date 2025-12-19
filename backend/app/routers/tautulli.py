"""
Tautulli integration routes for watch history
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pydantic import BaseModel

from app.database import get_db
from app.services.tautulli import get_tautulli_service

router = APIRouter(tags=["tautulli"])


class WatchHistoryItem(BaseModel):
    """Watch history item from Tautulli"""
    id: int
    date: int  # Unix timestamp
    user: str
    title: str
    year: Optional[int] = None
    media_type: str
    rating_key: Optional[int] = None
    parent_rating_key: Optional[int] = None
    grandparent_rating_key: Optional[int] = None
    parent_media_index: Optional[int] = None  # Season number
    media_index: Optional[int] = None  # Episode number
    watched_status: Optional[int] = None
    percent_complete: Optional[int] = None
    stopped: Optional[int] = None  # Unix timestamp
    duration: Optional[int] = None  # Duration in seconds


class WatchHistoryResponse(BaseModel):
    """Response containing watch history"""
    total_count: int
    history: List[dict]


@router.get("/test-connection")
async def test_tautulli_connection(db: AsyncSession = Depends(get_db)):
    """Test Tautulli connection"""
    tautulli = await get_tautulli_service(db)

    if not tautulli:
        raise HTTPException(status_code=404, detail="Tautulli not configured")

    # Try to get library stats to test connection
    result = await tautulli._make_request("get_library_names")

    if result:
        return {
            "status": "connected",
            "libraries": result
        }
    else:
        raise HTTPException(status_code=500,
                            detail="Failed to connect to Tautulli")


@router.get("/movie-history")
async def get_movie_watch_history(
        title: Optional[str] = Query(
            None,
            description="Movie title"),
        year: Optional[int] = Query(
            None,
            description="Movie year"),
        imdb_id: Optional[str] = Query(
            None,
            description="IMDB id (tt1234567)"),
        rating_key: Optional[int] = Query(
            None,
            description="Plex rating_key for the media item"),
        db: AsyncSession = Depends(get_db)):
    """
    Get watch history for a specific movie

    Args:
        title: Movie title to search for
        year: Optional year to narrow search

    Returns:
        Watch history entries for the movie
    """
    tautulli = await get_tautulli_service(db)

    if not tautulli:
        raise HTTPException(status_code=404, detail="Tautulli not configured")

    if not any([title, imdb_id]):
        raise HTTPException(
            status_code=400,
            detail="Either title or IMDB id must be provided")

    # If a rating_key is provided (from stored Movie.rating_key), skip
    # resolution and get history directly
    if rating_key:
        history = await tautulli.get_history(rating_key=rating_key)
        return WatchHistoryResponse(total_count=len(history), history=history)

    # Prefer searching by IMDB id when provided (more reliable)
    history, resolved_rating_key = await tautulli.search_movie_history(title, year, imdb_id=imdb_id, db=db)

    return WatchHistoryResponse(
        total_count=len(history),
        history=history
    )


@router.get("/raw-search")
async def raw_tautulli_search(
    query: str = Query(..., description="Raw query to pass to Tautulli's search API"),
    db: AsyncSession = Depends(get_db)
):
    """Return raw Tautulli 'search' API response for debugging."""
    tautulli = await get_tautulli_service(db)

    if not tautulli:
        raise HTTPException(status_code=404, detail="Tautulli not configured")

    result = await tautulli._make_request("search", {"query": query})
    return result


@router.get("/movie-history-by-rating-key")
async def get_movie_history_by_rating_key(
    rating_key: int = Query(..., description="Plex rating_key for the media item"),
    db: AsyncSession = Depends(get_db)
):
    """Get history directly by rating_key for debugging and verification."""
    tautulli = await get_tautulli_service(db)

    if not tautulli:
        raise HTTPException(status_code=404, detail="Tautulli not configured")

    history = await tautulli.get_history(rating_key=rating_key)
    return WatchHistoryResponse(total_count=len(history), history=history)


@router.get("/tvshow-history")
async def get_tvshow_watch_history(
    title: str = Query(..., description="TV show title"),
    season: Optional[int] = Query(None, description="Season number"),
    episode: Optional[int] = Query(None, description="Episode number"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get watch history for a TV show, optionally filtered by season/episode

    Args:
        title: TV show title to search for
        season: Optional season number
        episode: Optional episode number (requires season)

    Returns:
        Watch history entries for the TV show
    """
    tautulli = await get_tautulli_service(db)

    if not tautulli:
        raise HTTPException(status_code=404, detail="Tautulli not configured")

    history = await tautulli.search_tvshow_history(title, season, episode)

    return WatchHistoryResponse(
        total_count=len(history),
        history=history
    )


@router.get("/history")
async def get_watch_history(
    length: int = Query(25, description="Number of results to return"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get recent watch history

    Args:
        length: Number of results to return (default: 25)

    Returns:
        Recent watch history entries
    """
    tautulli = await get_tautulli_service(db)

    if not tautulli:
        raise HTTPException(status_code=404, detail="Tautulli not configured")

    history = await tautulli.get_history(length=length)

    return WatchHistoryResponse(
        total_count=len(history),
        history=history
    )