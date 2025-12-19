"""
Settings API Router - Manages application settings stored in the database
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.status import HTTP_200_OK, HTTP_400_BAD_REQUEST
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete, func
from pydantic import BaseModel
from typing import Optional, List, Dict
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

    class Config:
        from_attributes = True


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
        tmdb_api_key=tmdb_key
        , plex_host=plex_host
        , plex_token=plex_token
    )


@router.get("/tmdb-api-key/status")
async def get_tmdb_api_key_status(db: AsyncSession = Depends(get_db)):
    """Check if TMDB API key is configured"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "tmdb_api_key")
    )
    setting = result.scalar_one_or_none()
    
    has_key = setting is not None and setting.value is not None and len(setting.value) > 0
    
    return {
        "configured": has_key,
        "masked_value": ("•" * (len(setting.value) - 4) + setting.value[-4:]) if has_key and len(setting.value) > 4 else None
    }


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
    except Exception as e:
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
    
    has_key = setting is not None and setting.value is not None and len(setting.value) > 0
    
    return {
        "configured": has_key,
        "masked_value": ("•" * (len(setting.value) - 4) + setting.value[-4:]) if has_key and len(setting.value) > 4 else None
    }


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
            description="OMDb API Key for IMDB/Rotten Tomatoes/Metacritic ratings"
        )
        db.add(setting)
    
    await db.commit()
    
    return {"message": "OMDb API key saved successfully"}


@router.delete("/omdb-api-key")
async def delete_omdb_api_key(db: AsyncSession = Depends(get_db)):
    """Delete the OMDb API key"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "omdb_api_key")
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        await db.delete(setting)
        await db.commit()
    
    return {"message": "OMDb API key removed"}


@router.post("/omdb-api-key/verify")
async def verify_omdb_api_key(
    data: OmdbApiKeyUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Verify if the provided OMDb API key is valid by making a test request to OMDb."""
    from app.services.omdb import OMDbService
    
    # Use the provided key for verification
    omdb_service = OMDbService(api_key=data.api_key)
    result = None
    try:
        # Try fetching ratings for a well-known movie (Star Wars - tt0076759)
        result = await omdb_service.get_ratings_by_imdb_id("tt0076759")
    except Exception:
        return {"valid": False}
    finally:
        await omdb_service.close()

    if result:
        return {"valid": True}
    else:
        return {"valid": False}


# Tautulli Settings Endpoints
class TautulliSettingsUpdate(BaseModel):
    host: str
    api_key: str


@router.get("/tautulli/status")
async def get_tautulli_status(db: AsyncSession = Depends(get_db)):
    """Check if Tautulli is configured"""
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_host")
    )
    result_key = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_api_key")
    )
    
    host_setting = result_host.scalar_one_or_none()
    key_setting = result_key.scalar_one_or_none()
    
    has_host = host_setting is not None and host_setting.value is not None and len(host_setting.value) > 0
    has_key = key_setting is not None and key_setting.value is not None and len(key_setting.value) > 0
    
    return {
        "configured": has_host and has_key,
        "host": host_setting.value if has_host else None,
        "masked_api_key": ("•" * (len(key_setting.value) - 4) + key_setting.value[-4:]) if has_key and len(key_setting.value) > 4 else None
    }


@router.put("/tautulli")
async def set_tautulli_settings(
    data: TautulliSettingsUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Set Tautulli host and API key"""
    # Update or create host setting
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_host")
    )
    host_setting = result_host.scalar_one_or_none()
    
    if host_setting:
        host_setting.value = data.host
    else:
        host_setting = AppSettings(
            key="tautulli_host",
            value=data.host,
            description="Tautulli server URL (e.g., http://localhost:8181)"
        )
        db.add(host_setting)
    
    # Update or create API key setting
    result_key = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_api_key")
    )
    key_setting = result_key.scalar_one_or_none()
    
    if key_setting:
        key_setting.value = data.api_key
    else:
        key_setting = AppSettings(
            key="tautulli_api_key",
            value=data.api_key,
            description="Tautulli API key for watch history tracking"
        )
        db.add(key_setting)
    
    await db.commit()
    
    return {"message": "Tautulli settings saved successfully"}


@router.delete("/tautulli")
async def delete_tautulli_settings(db: AsyncSession = Depends(get_db)):
    """Delete Tautulli settings"""
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_host")
    )
    result_key = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_api_key")
    )
    
    host_setting = result_host.scalar_one_or_none()
    key_setting = result_key.scalar_one_or_none()
    
    if host_setting:
        await db.delete(host_setting)
    if key_setting:
        await db.delete(key_setting)
    
    await db.commit()
    
    return {"message": "Tautulli settings removed"}


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
    except Exception as e:
        return {"valid": False}


# Plex Settings Endpoints
class PlexSettingsUpdate(BaseModel):
    host: str
    token: str


@router.get("/plex/status")
async def get_plex_status(db: AsyncSession = Depends(get_db)):
    """Check if Plex is configured"""
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "plex_host")
    )
    result_token = await db.execute(
        select(AppSettings).where(AppSettings.key == "plex_token")
    )

    host_setting = result_host.scalar_one_or_none()
    token_setting = result_token.scalar_one_or_none()

    has_host = host_setting is not None and host_setting.value is not None and len(host_setting.value) > 0
    has_token = token_setting is not None and token_setting.value is not None and len(token_setting.value) > 0

    return {
        "configured": has_host and has_token,
        "host": host_setting.value if has_host else None,
        "masked_token": ("•" * (len(token_setting.value) - 4) + token_setting.value[-4:]) if has_token and len(token_setting.value) > 4 else None
    }


@router.put("/plex")
async def set_plex_settings(
    data: PlexSettingsUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Set Plex host and token"""
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "plex_host")
    )
    host_setting = result_host.scalar_one_or_none()

    if host_setting:
        host_setting.value = data.host
    else:
        host_setting = AppSettings(
            key="plex_host",
            value=data.host,
            description="Plex server URL (e.g., http://192.168.1.50:32400)"
        )
        db.add(host_setting)

    result_token = await db.execute(
        select(AppSettings).where(AppSettings.key == "plex_token")
    )
    token_setting = result_token.scalar_one_or_none()

    if token_setting:
        token_setting.value = data.token
    else:
        token_setting = AppSettings(
            key="plex_token",
            value=data.token,
            description="Plex X-Plex-Token for server access"
        )
        db.add(token_setting)

    await db.commit()

    return {"message": "Plex settings saved successfully"}


@router.delete("/plex")
async def delete_plex_settings(db: AsyncSession = Depends(get_db)):
    """Delete Plex settings"""
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "plex_host")
    )
    result_token = await db.execute(
        select(AppSettings).where(AppSettings.key == "plex_token")
    )

    host_setting = result_host.scalar_one_or_none()
    token_setting = result_token.scalar_one_or_none()

    if host_setting:
        await db.delete(host_setting)
    if token_setting:
        await db.delete(token_setting)

    await db.commit()

    return {"message": "Plex settings removed"}


class PlexFetchTokenRequest(BaseModel):
    username: str
    password: str
    save: bool = False


@router.post("/plex/fetch-token")
async def fetch_plex_token(data: PlexFetchTokenRequest, db: AsyncSession = Depends(get_db)):
    """Fetch Plex authentication token from Plex.tv using username/password.

    WARNING: Password is only used for this request and not stored by default unless `save` is true.
    """
    import httpx

    try:
        # Use Plex.tv sign-in endpoint
        url = "https://plex.tv/users/sign_in.json"
        headers = {
            "X-Plex-Product": "MediaPruner",
            "X-Plex-Platform": "MediaPruner",
            "X-Plex-Device": "MediaPruner",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, auth=(data.username, data.password), headers=headers)
            resp.raise_for_status()
            payload = resp.json()

        token = payload.get("user", {}).get("auth_token")
        if not token:
            return {"token": None, "message": "No token returned from Plex.tv"}

        if data.save:
            # Persist token into settings
            result_token = await db.execute(select(AppSettings).where(AppSettings.key == "plex_token"))
            token_setting = result_token.scalar_one_or_none()
            if token_setting:
                token_setting.value = token
            else:
                token_setting = AppSettings(key="plex_token", value=token, description="Plex X-Plex-Token for server access")
                db.add(token_setting)
            await db.commit()

        return {"token": token}

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch token: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch token: {str(e)}")


# Allow testing a host/token pair without saving credentials
class PlexTestRequest(BaseModel):
    host: str
    token: str


@router.post('/plex/test')
async def test_plex_settings(data: PlexTestRequest):
    """Test provided Plex host and token by making a simple request against the server.

    This endpoint does not store any credentials; it only validates connectivity and token.
    """
    from app.services.plex import PlexService

    svc = PlexService(data.host, data.token)
    # Try fetching root XML to validate token/access
    root = await svc._make_request('/')
    if root is None:
        raise HTTPException(status_code=400, detail='Failed to connect to Plex or invalid token')

    # Try to extract some basic info (friendlyName, machineIdentifier) from root or children
    info = {}
    try:
        # Many Plex endpoints include a MediaContainer or similar with attributes
        info = dict(root.attrib) if root.attrib else {}
        # Also try first child
        first = next(iter(root), None)
        if first is not None and hasattr(first, 'attrib'):
            info.update({k: v for k, v in first.attrib.items() if k not in info})
    except Exception:
        pass

    return {"success": True, "info": info}


# Internal function to get raw setting value (for use by other services)
async def get_setting_value(db: AsyncSession, key: str) -> Optional[str]:
    """Get a setting value by key (internal use)"""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


# ================== Logs Endpoints ==================

class LogEntryResponse(BaseModel):
    id: int
    timestamp: datetime
    level: str
    logger_name: str
    message: str
    module: Optional[str]
    function: Optional[str]
    line_number: Optional[int]
    exception: Optional[str]

    class Config:
        from_attributes = True


class LogsResponse(BaseModel):
    logs: List[LogEntryResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("/logs", response_model=LogsResponse)
async def get_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=10, le=500),
    level: Optional[str] = Query(None, description="Filter by log level: DEBUG, INFO, WARNING, ERROR, CRITICAL"),
    search: Optional[str] = Query(None, description="Search in message text"),
    db: AsyncSession = Depends(get_db)
):
    """Get application logs with pagination and filtering"""
    # Build query
    query = select(LogEntry)
    count_query = select(func.count(LogEntry.id))
    
    # Filter by level
    if level:
        query = query.where(LogEntry.level == level.upper())
        count_query = count_query.where(LogEntry.level == level.upper())
    
    # Search in message
    if search:
        search_pattern = f"%{search}%"
        query = query.where(LogEntry.message.ilike(search_pattern))
        count_query = count_query.where(LogEntry.message.ilike(search_pattern))
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Order by timestamp descending (newest first)
    query = query.order_by(desc(LogEntry.timestamp))
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    
    return LogsResponse(
        logs=[LogEntryResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/logs/stats")
async def get_log_stats(db: AsyncSession = Depends(get_db)):
    """Get log statistics by level"""
    result = await db.execute(
        select(LogEntry.level, func.count(LogEntry.id))
        .group_by(LogEntry.level)
    )
    stats = {row[0]: row[1] for row in result.all()}
    
    return {
        "debug": stats.get("DEBUG", 0),
        "info": stats.get("INFO", 0),
        "warning": stats.get("WARNING", 0),
        "error": stats.get("ERROR", 0),
        "critical": stats.get("CRITICAL", 0),
        "total": sum(stats.values())
    }


@router.delete("/logs")
async def clear_logs(
    level: Optional[str] = Query(None, description="Only clear logs of this level"),
    db: AsyncSession = Depends(get_db)
):
    """Clear all logs or logs of a specific level"""
    if level:
        await db.execute(delete(LogEntry).where(LogEntry.level == level.upper()))
        message = f"Cleared all {level.upper()} logs"
    else:
        await db.execute(delete(LogEntry))
        message = "Cleared all logs"
    
    await db.commit()
    return {"message": message}


# ================== Frontend Logging Endpoint ==================

class FrontendLogEntry(BaseModel):
    level: str  # INFO, WARNING, ERROR, DEBUG
    category: str  # navigation, action, filter, sort, ui, error
    action: str  # e.g., "button_click", "page_view", "filter_change"
    details: Optional[str] = None  # Additional context
    component: Optional[str] = None  # React component name
    page: Optional[str] = None  # Current page/route
    metadata: Optional[dict] = None  # Any additional data


class FrontendLogBatch(BaseModel):
    logs: List[FrontendLogEntry]


@router.post("/logs/frontend")
async def log_frontend_event(
    log_entry: FrontendLogEntry,
    db: AsyncSession = Depends(get_db)
):
    """Log a single frontend event"""
    # Format message for storage
    message = f"[{log_entry.category.upper()}] {log_entry.action}"
    if log_entry.component:
        message += f" in {log_entry.component}"
    if log_entry.page:
        message += f" on {log_entry.page}"
    if log_entry.details:
        message += f": {log_entry.details}"
    if log_entry.metadata:
        message += f" | {log_entry.metadata}"
    
    entry = LogEntry(
        timestamp=datetime.utcnow(),
        level=log_entry.level.upper(),
        logger_name="frontend",
        message=message,
        module=log_entry.component,
        function=log_entry.action,
    )
    db.add(entry)
    await db.commit()
    
    return {"status": "logged"}


@router.post("/logs/frontend/batch")
async def log_frontend_events_batch(
    batch: FrontendLogBatch,
    db: AsyncSession = Depends(get_db)
):
    """Log multiple frontend events at once (for batched logging)"""
    for log_entry in batch.logs:
        message = f"[{log_entry.category.upper()}] {log_entry.action}"
        if log_entry.component:
            message += f" in {log_entry.component}"
        if log_entry.page:
            message += f" on {log_entry.page}"
        if log_entry.details:
            message += f": {log_entry.details}"
        if log_entry.metadata:
            message += f" | {log_entry.metadata}"
        
        entry = LogEntry(
            timestamp=datetime.utcnow(),
            level=log_entry.level.upper(),
            logger_name="frontend",
            message=message,
            module=log_entry.component,
            function=log_entry.action,
        )
        db.add(entry)
    
    await db.commit()
    return {"status": "logged", "count": len(batch.logs)}
