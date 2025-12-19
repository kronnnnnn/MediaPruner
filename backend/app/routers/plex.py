"""Plex integration routes for resolving rating_key and metadata"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.plex import get_plex_service

router = APIRouter(tags=["plex"])


@router.get("/rating-key")
async def get_rating_key_by_imdb(
    imdb_id: str = Query(..., description="IMDB id (tt1234567) or other guid"),
    db: AsyncSession = Depends(get_db)
):
    plex = await get_plex_service(db)
    if not plex:
        raise HTTPException(status_code=404, detail="Plex not configured")

    rating_key = await plex.get_rating_key_by_imdb(imdb_id)
    if rating_key:
        return {"rating_key": rating_key}
    else:
        return {"rating_key": None}


@router.get("/raw-search")
async def plex_raw_search(query: str = Query(...,
                                             description="Search query"),
                          db: AsyncSession = Depends(get_db)):
    plex = await get_plex_service(db)
    if not plex:
        raise HTTPException(status_code=404, detail="Plex not configured")

    results = await plex.search(query)
    return {"results": results}


@router.get("/metadata")
async def plex_metadata(rating_key: int = Query(...,
                                                description="rating_key"),
                        db: AsyncSession = Depends(get_db)):
    plex = await get_plex_service(db)
    if not plex:
        raise HTTPException(status_code=404, detail="Plex not configured")

    meta = await plex.get_metadata(rating_key)
    return {"metadata": meta}