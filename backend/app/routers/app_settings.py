"""
Settings API Router - Manages application settings stored in the database
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete, func
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import AppSettings, LogEntry
from app.services.tmdb import TMDBService


router = APIRouter()


class SettingUpdate(BaseModel):
    value: Optional[str] = None


class TmdbApiKeyUpdate(BaseModel):
    api_key: str


class SettingResponse(BaseModel):
    key: str
    value: Optional[str]
    description: Optional[str]
    model_config = ConfigDict(from_attributes=True)


class AllSettingsResponse(BaseModel):
    tmdb_api_key: Optional[str] = None
    plex_host: Optional[str] = None
    plex_token: Optional[str] = None
    # Add more settings as needed


# Known settings keys
SETTINGS_KEYS = {
    "tmdb_api_key": "TMDB API Key for metadata scraping",
}


@router.get("", response_model=AllSettingsResponse)
async def get_all_settings(db: AsyncSession = Depends(get_db)):
    """Get all application settings"""
    result = await db.execute(select(AppSettings))
    settings_list = result.scalars().all()

    settings_dict = {s.key: s.value for s in settings_list}

    # Mask the API key for security (only show last 4 chars)
    tmdb_key = settings_dict.get("tmdb_api_key")
    if tmdb_key and len(tmdb_key) > 4:
        tmdb_key = "•" * (len(tmdb_key) - 4) + tmdb_key[-4:]

    plex_host = settings_dict.get("plex_host")
    plex_token = settings_dict.get("plex_token")
    if plex_token and len(plex_token) > 4:
        plex_token = "•" * (len(plex_token) - 4) + plex_token[-4:]

    return AllSettingsResponse(
        tmdb_api_key=tmdb_key, plex_host=plex_host, plex_token=plex_token
    )


@router.get("/tmdb-api-key/status")
async def get_tmdb_api_key_status(db: AsyncSession = Depends(get_db)):
    """Check if TMDB API key is configured"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "tmdb_api_key")
    )
    setting = result.scalar_one_or_none()

    has_key = setting is not None and setting.value is not None and len(
        setting.value) > 0

    return {"configured": has_key, "masked_value": (
        "•" * (len(setting.value) - 4) + setting.value[-4:]) if has_key and len(setting.value) > 4 else None}


@router.put("/tmdb-api-key")
async def set_tmdb_api_key(
    data: TmdbApiKeyUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Set the TMDB API key"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "tmdb_api_key")
    )
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = data.api_key
    else:
        setting = AppSettings(
            key="tmdb_api_key",
            value=data.api_key,
            description="TMDB API Key for metadata scraping"
        )
        db.add(setting)

    await db.commit()

    return {"message": "TMDB API key saved successfully"}


@router.delete("/tmdb-api-key")
async def delete_tmdb_api_key(db: AsyncSession = Depends(get_db)):
    """Delete the TMDB API key"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "tmdb_api_key")
    )
    setting = result.scalar_one_or_none()

    if setting:
        await db.delete(setting)
        await db.commit()

    return {"message": "TMDB API key removed"}


@router.post("/tmdb-api-key/verify")
async def verify_tmdb_api_key(
    data: TmdbApiKeyUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Verify if the provided TMDB API key is valid by making a test request to TMDB."""
    # Use the provided key for verification
    tmdb_service = TMDBService(api_key=data.api_key)
    try:
        # Try searching for a well-known movie (Star Wars)
        results = await tmdb_service.search_movie("Star Wars", year=1977)
        await tmdb_service.close()
        if results and len(results) > 0:
            return {"valid": True}
        else:
            return {"valid": False}
    except Exception:
        await tmdb_service.close()
        return {"valid": False}


# OMDb API Key Endpoints
class OmdbApiKeyUpdate(BaseModel):
    api_key: str


@router.get("/omdb-api-key/status")
async def get_omdb_api_key_status(db: AsyncSession = Depends(get_db)):
    """Check if OMDb API key is configured"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "omdb_api_key")
    )
    setting = result.scalar_one_or_none()

    has_key = setting is not None and setting.value is not None and len(
        setting.value) > 0

    return {"configured": has_key, "masked_value": (
        "•" * (len(setting.value) - 4) + setting.value[-4:]) if has_key and len(setting.value) > 4 else None}


@router.put("/omdb-api-key")
async def set_omdb_api_key(
    data: OmdbApiKeyUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Set the OMDb API key for IMDB/Rotten Tomatoes/Metacritic ratings"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "omdb_api_key")
    )
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = data.api_key
    else:
        setting = AppSettings(
            key="omdb_api_key",
            value=data.api_key,
            description="OMDb API Key for IMDB/Rotten Tomatoes/Metacritic ratings")
        db.add(setting)

    await db.commit()

    return {"message": "OMDb API key saved successfully"}


@router.delete("/omdb-api-key")
async def delete_omdb_api_key(db: AsyncSession = Depends(get_db)):
    """Delete the Omdb API key"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "omdb_api_key")
    )
    setting = result.scalar_one_or_none()

    if setting:
        await db.delete(setting)
        await db.commit()

    return {"message": "Omdb API key removed"}


@router.post("/omdb-api-key/verify")
async def verify_omdb_api_key(
    data: OmdbApiKeyUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Verify if the provided Omdb API key is valid by making a test request to Omdb."""
    from app.services.omdb import OMDbService

    # Use the provided key for verification
    omdb_service = OMDbService(api_key=data.api_key)
    try:
        # Try fetching ratings for a well-known movie (Star Wars - tt0076759)
        result = await omdb_service.get_ratings_by_imdb_id("tt0076759")
        await omdb_service.close()
        return {"valid": bool(result)}
    except Exception:
        await omdb_service.close()
        return {"valid": False}


@router.post("/tautulli/verify")
async def verify_tautulli_settings(
    data: TautulliSettingsUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Verify if the provided Tautulli settings are valid by making a test request."""
    from app.services.tautulli import TautulliService
    # Use the provided settings for verification
    tautulli_service = TautulliService(host=data.host, api_key=data.api_key)
    try:
        # Try getting a small amount of history to test connection
        result = await tautulli_service.get_history(length=1)
        if result is not None:
            return {"valid": True}
        else:
            return {"valid": False}
    except Exception:
        return {"valid": False}
    finally:
        if hasattr(tautulli_service, 'close'):
            await tautulli_service.close()
