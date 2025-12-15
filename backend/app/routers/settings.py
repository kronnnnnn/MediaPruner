"""
Settings API Router - Manages application settings stored in the database
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete, func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import AppSettings, LogEntry

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
    
    return AllSettingsResponse(
        tmdb_api_key=tmdb_key
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
