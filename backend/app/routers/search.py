from fastapi import APIRouter, Query, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Movie, TVShow

router = APIRouter(tags=["search"])

@router.get("/search")
async def api_search(q: str = Query(..., min_length=1), limit_per_type: int = 5, db: AsyncSession = Depends(get_db)):
    """Search movies and TV shows by title (case-insensitive, simple LIKE). Returns up to limit_per_type results per type."""
    like = f"%{q}%"
    movies = []
    tvshows = []

    mq = await db.execute(select(Movie.id, Movie.title).where(Movie.title.ilike(like)).limit(limit_per_type))
    movies = [{"id": r[0], "title": r[1]} for r in mq.fetchall()]

    tq = await db.execute(select(TVShow.id, TVShow.title).where(TVShow.title.ilike(like)).limit(limit_per_type))
    tvshows = [{"id": r[0], "title": r[1]} for r in tq.fetchall()]

    return {"query": q, "movies": movies, "tvshows": tvshows}
