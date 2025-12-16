from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pathlib import Path
from typing import Optional
import logging
import re

from app.database import get_db
from app.models import TVShow, Episode, Season
from app.schemas import TVShowResponse, TVShowListResponse, TVShowUpdate, EpisodeResponse, SeasonResponse
from app.services.tmdb import TMDBService
from app.services.omdb import fetch_omdb_tvshow, fetch_omdb_season_episodes
from app.services.renamer import (
    rename_episode, get_episode_filename, parse_quality, parse_resolution, 
    parse_release_group, EPISODE_RENAME_PRESETS, EPISODE_PLACEHOLDERS
)

logger = logging.getLogger(__name__)

router = APIRouter()


def clean_search_title(title: str) -> str:
    """
    Clean a title for search by removing common prefixes, suffixes, and noise.
    Examples:
        '1a Batman - The Animated Series (1992-99)' -> 'Batman The Animated Series'
        'Batman.TAS.Complete' -> 'Batman TAS Complete'
    """
    # Remove leading numbers/letters like '1a', '2b', etc.
    cleaned = re.sub(r'^\d+[a-z]?\s*', '', title, flags=re.IGNORECASE)
    
    # Remove year patterns like (1992), (1992-99), (1992-1999)
    cleaned = re.sub(r'\s*\(?\d{4}(?:-\d{2,4})?\)?\s*', ' ', cleaned)
    
    # Remove common separators and replace with spaces
    cleaned = re.sub(r'[\._\-]+', ' ', cleaned)
    
    # Remove extra whitespace
    cleaned = ' '.join(cleaned.split())
    
    return cleaned.strip()


async def _scrape_episodes_with_tmdb(show: TVShow, db: AsyncSession) -> dict:
    """Scrape episode metadata using TMDB"""
    updated_count = 0
    
    if not show.tmdb_id:
        return {"updated": 0, "source": None, "error": "No TMDB ID available"}
    
    tmdb_service = await TMDBService.create_with_db_key(db)
    if not tmdb_service.is_configured:
        return {"updated": 0, "source": None, "error": "TMDB API key not configured"}
    
    # Get all seasons
    seasons_result = await db.execute(
        select(Season).where(Season.tvshow_id == show.id)
    )
    seasons = seasons_result.scalars().all()
    
    logger.debug(f"[{show.title}] Using TMDB (ID: {show.tmdb_id}) for episode metadata")
    for season in seasons:
        logger.debug(f"[{show.title}] Fetching Season {season.season_number} episodes from TMDB")
        tmdb_episodes = await tmdb_service.get_season_details(show.tmdb_id, season.season_number)
        
        for tmdb_ep in tmdb_episodes:
            ep_result = await db.execute(
                select(Episode).where(
                    Episode.tvshow_id == show.id,
                    Episode.season_number == tmdb_ep.season_number,
                    Episode.episode_number == tmdb_ep.episode_number
                )
            )
            episode = ep_result.scalar_one_or_none()
            
            if episode:
                old_title = episode.title
                episode.title = tmdb_ep.title
                episode.overview = tmdb_ep.overview
                episode.air_date = tmdb_ep.air_date
                episode.runtime = tmdb_ep.runtime
                episode.still_path = tmdb_ep.still_path
                updated_count += 1
                logger.debug(f"[{show.title}] S{tmdb_ep.season_number:02d}E{tmdb_ep.episode_number:02d}: '{old_title}' -> '{tmdb_ep.title}'")
    
    logger.info(f"[{show.title}] Episode metadata complete: {updated_count} episodes updated from TMDB")
    return {"updated": updated_count, "source": "tmdb"}


async def _scrape_episodes_with_omdb(show: TVShow, db: AsyncSession) -> dict:
    """Scrape episode metadata using OMDb"""
    updated_count = 0
    
    if not show.imdb_id:
        return {"updated": 0, "source": None, "error": "No IMDB ID available"}
    
    # Get all seasons
    seasons_result = await db.execute(
        select(Season).where(Season.tvshow_id == show.id)
    )
    seasons = seasons_result.scalars().all()
    
    logger.debug(f"[{show.title}] Using OMDb (IMDB: {show.imdb_id}) for episode metadata")
    for season in seasons:
        logger.debug(f"[{show.title}] Fetching Season {season.season_number} episodes from OMDb")
        omdb_episodes = await fetch_omdb_season_episodes(db, show.imdb_id, season.season_number)
        
        for omdb_ep in omdb_episodes:
            ep_result = await db.execute(
                select(Episode).where(
                    Episode.tvshow_id == show.id,
                    Episode.season_number == season.season_number,
                    Episode.episode_number == omdb_ep.episode_number
                )
            )
            episode = ep_result.scalar_one_or_none()
            
            if episode:
                old_title = episode.title
                episode.title = omdb_ep.title
                updated_count += 1
                logger.debug(f"[{show.title}] S{season.season_number:02d}E{omdb_ep.episode_number:02d}: '{old_title}' -> '{omdb_ep.title}'")
    
    logger.info(f"[{show.title}] Episode metadata complete: {updated_count} episodes updated from OMDb")
    return {"updated": updated_count, "source": "omdb"}


async def _scrape_episodes_internal(show: TVShow, db: AsyncSession, provider: Optional[str] = None) -> dict:
    """
    Internal helper to scrape episode metadata for a TV show.
    
    Args:
        show: The TV show to scrape episodes for
        db: Database session
        provider: Optional provider to use ('tmdb' or 'omdb'). If None, auto-selects.
    
    Returns dict with updated count and source.
    """
    # Get all seasons
    seasons_result = await db.execute(
        select(Season).where(Season.tvshow_id == show.id)
    )
    seasons = seasons_result.scalars().all()
    
    logger.info(f"[{show.title}] Scraping episode metadata for {len(seasons)} seasons (provider: {provider or 'auto'})")
    
    # If a specific provider is requested, use only that one
    if provider == "tmdb":
        return await _scrape_episodes_with_tmdb(show, db)
    elif provider == "omdb":
        return await _scrape_episodes_with_omdb(show, db)
    
    # Auto mode: Try TMDB first if we have a TMDB ID
    if show.tmdb_id:
        result = await _scrape_episodes_with_tmdb(show, db)
        if result.get("updated", 0) > 0:
            return result
    
    # Fallback to OMDb if we have an IMDB ID
    if show.imdb_id:
        return await _scrape_episodes_with_omdb(show, db)
    
    logger.warning(f"[{show.title}] No TMDB ID or IMDB ID available for episode scraping")
    return {"updated": 0, "source": None}


@router.get("", response_model=TVShowListResponse)
async def get_tvshows(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    genre: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: str = Query("title", pattern="^(title|first_air_date|rating|created_at)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db)
):
    """Get paginated list of TV shows with filtering and sorting"""
    query = select(TVShow).options(selectinload(TVShow.seasons))
    
    # Apply filters
    if search:
        query = query.where(TVShow.title.ilike(f"%{search}%"))
    
    if genre:
        query = query.where(TVShow.genres.ilike(f"%{genre}%"))
    
    if status:
        query = query.where(TVShow.status == status)
    
    # Get total count
    count_query = select(func.count()).select_from(select(TVShow).subquery())
    if search:
        count_query = select(func.count()).select_from(
            select(TVShow).where(TVShow.title.ilike(f"%{search}%")).subquery()
        )
    total = (await db.execute(count_query)).scalar() or 0
    
    # Apply sorting
    sort_column = getattr(TVShow, sort_by, TVShow.title)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    shows = result.scalars().unique().all()
    
    total_pages = (total + page_size - 1) // page_size
    
    return TVShowListResponse(
        shows=[TVShowResponse.model_validate(s) for s in shows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{show_id}", response_model=TVShowResponse)
async def get_tvshow(show_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific TV show by ID"""
    result = await db.execute(
        select(TVShow)
        .options(selectinload(TVShow.seasons))
        .where(TVShow.id == show_id)
    )
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    return TVShowResponse.model_validate(show)


@router.get("/{show_id}/episodes", response_model=list[EpisodeResponse])
async def get_show_episodes(
    show_id: int,
    season: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get episodes for a TV show"""
    query = select(Episode).where(Episode.tvshow_id == show_id)
    
    if season is not None:
        query = query.where(Episode.season_number == season)
    
    query = query.order_by(Episode.season_number, Episode.episode_number)
    
    result = await db.execute(query)
    episodes = result.scalars().all()
    
    return [EpisodeResponse.model_validate(ep) for ep in episodes]


@router.get("/{show_id}/seasons", response_model=list[SeasonResponse])
async def get_show_seasons(show_id: int, db: AsyncSession = Depends(get_db)):
    """Get seasons for a TV show"""
    result = await db.execute(
        select(Season)
        .where(Season.tvshow_id == show_id)
        .order_by(Season.season_number)
    )
    seasons = result.scalars().all()
    
    return [SeasonResponse.model_validate(s) for s in seasons]


@router.patch("/{show_id}", response_model=TVShowResponse)
async def update_tvshow(
    show_id: int,
    update: TVShowUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update TV show metadata"""
    result = await db.execute(
        select(TVShow)
        .options(selectinload(TVShow.seasons))
        .where(TVShow.id == show_id)
    )
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(show, key, value)
    
    await db.commit()
    await db.refresh(show)
    
    return TVShowResponse.model_validate(show)


@router.post("/{show_id}/scrape")
async def scrape_tvshow_metadata(
    show_id: int, 
    provider: Optional[str] = Query(None, pattern="^(tmdb|omdb)$", description="Force a specific provider (tmdb or omdb)"),
    db: AsyncSession = Depends(get_db)
):
    """Scrape metadata for a TV show and its episodes from TMDB or OMDb
    
    Args:
        show_id: ID of the TV show
        provider: Optional provider to force ('tmdb' or 'omdb'). If not specified, tries TMDB first then OMDb.
    """
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    # Clean the title for better search results
    original_title = show.title
    search_title = clean_search_title(original_title)
    logger.info(f"[{original_title}] Starting metadata refresh (search term: '{search_title}', provider: {provider or 'auto'})")
    
    tmdb_result = None
    omdb_result = None
    source = None
    
    # Try TMDB (if not forcing OMDb)
    if provider != "omdb":
        tmdb_service = await TMDBService.create_with_db_key(db)
        
        if tmdb_service.is_configured:
            logger.debug(f"[{original_title}] Searching TMDB with term: '{search_title}'")
            tmdb_result = await tmdb_service.search_tvshow_and_get_details(search_title)
            
            # If cleaned title didn't work, try original title
            if not tmdb_result and search_title != original_title:
                logger.debug(f"[{original_title}] TMDB search failed with cleaned title, trying original")
                tmdb_result = await tmdb_service.search_tvshow_and_get_details(original_title)
        else:
            if provider == "tmdb":
                raise HTTPException(status_code=400, detail="TMDB API key not configured")
            logger.warning(f"[{original_title}] TMDB API key not configured")
    
    if tmdb_result:
        logger.info(f"[{original_title}] Found on TMDB: '{tmdb_result.title}' (TMDB ID: {tmdb_result.tmdb_id}, IMDB: {tmdb_result.imdb_id})")
        # Update show with TMDB data
        show.tmdb_id = tmdb_result.tmdb_id
        show.title = tmdb_result.title
        show.original_title = tmdb_result.original_title
        show.overview = tmdb_result.overview
        show.first_air_date = tmdb_result.first_air_date
        show.last_air_date = tmdb_result.last_air_date
        show.status = tmdb_result.status
        show.genres = ",".join(tmdb_result.genres) if tmdb_result.genres else None
        show.poster_path = tmdb_result.poster_path
        show.backdrop_path = tmdb_result.backdrop_path
        show.imdb_id = tmdb_result.imdb_id
        show.rating = tmdb_result.rating
        show.votes = tmdb_result.votes
        show.season_count = tmdb_result.season_count
        show.scraped = True
        source = "tmdb"
        
        await db.commit()
        
        # Also scrape episode metadata using the specified provider (or the show's source)
        episode_result = await _scrape_episodes_internal(show, db, provider)
        await db.commit()
        
        logger.info(f"[{show.title}] Metadata refresh complete: show from TMDB, {episode_result['updated']} episodes updated")
        return {
            "message": f"TV show and {episode_result['updated']} episodes updated from TMDB",
            "tmdb_id": tmdb_result.tmdb_id,
            "source": source,
            "episodes_updated": episode_result['updated'],
            "episode_source": episode_result.get('source')
        }
    
    # Try OMDb (if not forcing TMDB or TMDB didn't find it)
    if provider != "tmdb":
        logger.debug(f"[{original_title}] Trying OMDb with term: '{search_title}'")
        omdb_result = await fetch_omdb_tvshow(db, search_title)
        
        # If cleaned title didn't work, try original title
        if not omdb_result and search_title != original_title:
            logger.debug(f"[{original_title}] OMDb search failed with cleaned title, trying original")
            omdb_result = await fetch_omdb_tvshow(db, original_title)
    
    if omdb_result:
        logger.info(f"[{original_title}] Found on OMDb: '{omdb_result.title}' (IMDB: {omdb_result.imdb_id})")
        # Update show with OMDb data
        show.title = omdb_result.title
        show.overview = omdb_result.plot
        show.genres = omdb_result.genre
        show.poster_path = omdb_result.poster
        show.imdb_id = omdb_result.imdb_id
        show.rating = omdb_result.imdb_rating
        show.votes = omdb_result.imdb_votes
        show.season_count = omdb_result.total_seasons or 0
        show.scraped = True
        source = "omdb"
        
        await db.commit()
        
        # Also scrape episode metadata using the specified provider (or omdb)
        episode_result = await _scrape_episodes_internal(show, db, provider or "omdb")
        await db.commit()
        
        logger.info(f"[{show.title}] Metadata refresh complete: show from OMDb, {episode_result['updated']} episodes updated")
        return {
            "message": f"TV show and {episode_result['updated']} episodes updated from OMDb",
            "imdb_id": omdb_result.imdb_id,
            "source": source,
            "episodes_updated": episode_result['updated'],
            "episode_source": episode_result.get('source')
        }
    
    # Neither found the show
    provider_msg = f" using {provider.upper()}" if provider else " on TMDB or OMDb"
    logger.warning(f"[{original_title}] Not found{provider_msg} (search term: '{search_title}')")
    raise HTTPException(
        status_code=404, 
        detail=f"TV show not found{provider_msg}. Searched for: '{search_title}'. Please check the show title or try a different provider."
    )


@router.post("/{show_id}/scrape-episodes")
async def scrape_episode_metadata(
    show_id: int, 
    provider: Optional[str] = Query(None, pattern="^(tmdb|omdb)$", description="Force a specific provider (tmdb or omdb)"),
    db: AsyncSession = Depends(get_db)
):
    """Scrape episode metadata from TMDB or OMDb (standalone endpoint)
    
    Args:
        show_id: ID of the TV show
        provider: Optional provider to force ('tmdb' or 'omdb'). If not specified, auto-selects based on available IDs.
    """
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    if not show.scraped:
        raise HTTPException(status_code=400, detail="Show must be scraped first to get metadata source")
    
    logger.info(f"[{show.title}] Standalone episode metadata refresh requested (provider: {provider or 'auto'})")
    
    # Use the shared helper function with provider
    episode_result = await _scrape_episodes_internal(show, db, provider)
    await db.commit()
    
    if episode_result['updated'] == 0 and episode_result['source'] is None:
        error_msg = episode_result.get('error', "No TMDB ID or IMDB ID available. Please scrape the show metadata first.")
        raise HTTPException(status_code=400, detail=error_msg)
    
    return {
        "message": f"Updated {episode_result['updated']} episodes from {episode_result['source'].upper()}",
        "source": episode_result['source'],
        "updated": episode_result['updated']
    }


@router.get("/rename-presets")
async def get_episode_rename_presets():
    """Get available episode rename presets and placeholders"""
    return {
        "presets": EPISODE_RENAME_PRESETS,
        "placeholders": EPISODE_PLACEHOLDERS
    }


@router.get("/{show_id}/rename-preview")
async def preview_episode_rename(
    show_id: int,
    pattern: str = "{show} - S{season:02d}E{episode:02d} - {title}",
    replace_spaces_with: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Preview how episodes will be renamed with a given pattern"""
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    # Get first episode for preview
    ep_result = await db.execute(
        select(Episode)
        .where(Episode.tvshow_id == show.id)
        .order_by(Episode.season_number, Episode.episode_number)
        .limit(1)
    )
    episode = ep_result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail="No episodes found for preview")
    
    # Parse release info from current filename
    current_name = episode.file_name or Path(episode.file_path).name if episode.file_path else "Unknown"
    quality = parse_quality(current_name) if current_name else None
    resolution = parse_resolution(current_name) if current_name else None
    release_group = parse_release_group(current_name) if current_name else None
    
    # Get extension
    extension = Path(episode.file_path).suffix if episode.file_path else ".mkv"
    
    # Generate new name
    new_name = get_episode_filename(
        show_title=show.title,
        season_number=episode.season_number,
        episode_number=episode.episode_number,
        episode_title=episode.title,
        extension=extension,
        pattern=pattern,
        quality=quality,
        resolution=resolution,
        release_group=release_group,
        replace_spaces_with=replace_spaces_with
    )
    
    return {
        "current_name": current_name,
        "new_name": new_name,
        "parsed_info": {
            "quality": quality,
            "resolution": resolution,
            "release_group": release_group
        },
        "sample_episode": {
            "season": episode.season_number,
            "episode": episode.episode_number,
            "title": episode.title
        }
    }


@router.post("/{show_id}/rename")
async def rename_show_episodes(
    show_id: int,
    episode_pattern: str = "{show} - S{season:02d}E{episode:02d} - {title}",
    organize_in_season_folder: bool = True,
    replace_spaces_with: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Rename all episodes for a TV show"""
    logger.info(f"Starting episode rename for show ID: {show_id}")
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        logger.warning(f"TV show not found for rename: ID {show_id}")
        raise HTTPException(status_code=404, detail="TV show not found")
    
    logger.info(f"[{show.title}] Renaming episodes with pattern: {episode_pattern}")
    
    # Get all episodes
    episodes_result = await db.execute(
        select(Episode).where(Episode.tvshow_id == show.id)
    )
    episodes = episodes_result.scalars().all()
    
    logger.info(f"[{show.title}] Found {len(episodes)} episodes to process")
    
    renamed = 0
    skipped = 0
    errors = []
    
    for episode in episodes:
        if not episode.file_path:
            skipped += 1
            continue
        
        file_path = Path(episode.file_path)
        if not file_path.exists():
            error_msg = f"File not found: {episode.file_path}"
            logger.warning(f"[{show.title}] {error_msg}")
            errors.append(error_msg)
            continue
        
        old_name = file_path.name
        
        # Parse quality/resolution/release_group from current filename
        quality = parse_quality(old_name)
        resolution = parse_resolution(old_name)
        release_group = parse_release_group(old_name)
        
        # Get subtitle path if present
        subtitle_path = Path(episode.subtitle_path) if episode.subtitle_path else None
        
        rename_result = rename_episode(
            file_path=file_path,
            show_title=show.title,
            season_number=episode.season_number,
            episode_number=episode.episode_number,
            episode_title=episode.title,
            episode_pattern=episode_pattern,
            organize_in_season_folder=organize_in_season_folder,
            quality=quality,
            resolution=resolution,
            release_group=release_group,
            replace_spaces_with=replace_spaces_with,
            subtitle_path=subtitle_path
        )
        
        if rename_result.success:
            episode.file_path = rename_result.new_path
            episode.file_name = Path(rename_result.new_path).name
            # Update subtitle path if it was renamed
            if subtitle_path and subtitle_path.exists() is False:
                # Subtitle was moved, update the path
                new_subtitle_name = Path(rename_result.new_path).stem + subtitle_path.suffix
                new_subtitle_path = Path(rename_result.new_path).parent / new_subtitle_name
                if new_subtitle_path.exists():
                    episode.subtitle_path = str(new_subtitle_path)
            renamed += 1
            logger.debug(f"[{show.title}] Renamed: '{old_name}' -> '{episode.file_name}'")
        else:
            error_msg = f"Failed to rename {episode.file_name}: {rename_result.error}"
            logger.error(f"[{show.title}] {error_msg}")
            errors.append(error_msg)
    
    await db.commit()
    
    logger.info(f"[{show.title}] Episode rename complete: {renamed} renamed, {skipped} skipped, {len(errors)} errors")
    
    return {
        "message": f"Renamed {renamed} episodes",
        "renamed": renamed,
        "total": len(episodes),
        "errors": errors
    }


@router.post("/{show_id}/nfo")
async def generate_tvshow_nfo(show_id: int, db: AsyncSession = Depends(get_db)):
    """Generate NFO files for TV show"""
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    folder_path = Path(show.folder_path)
    nfo_path = folder_path / "tvshow.nfo"
    
    # Generate show NFO content (Kodi-compatible format)
    nfo_content = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
    <title>{show.title}</title>
    <originaltitle>{show.original_title or show.title}</originaltitle>
    <plot>{show.overview or ''}</plot>
    <status>{show.status or ''}</status>
    <premiered>{show.first_air_date or ''}</premiered>
    <rating>{show.rating or ''}</rating>
    <votes>{show.votes or ''}</votes>
    <uniqueid type="tmdb">{show.tmdb_id or ''}</uniqueid>
    <uniqueid type="tvdb">{show.tvdb_id or ''}</uniqueid>
    <uniqueid type="imdb">{show.imdb_id or ''}</uniqueid>
    <thumb aspect="poster">{show.poster_path or ''}</thumb>
    <fanart><thumb>{show.backdrop_path or ''}</thumb></fanart>
</tvshow>
"""
    
    try:
        with open(nfo_path, 'w', encoding='utf-8') as f:
            f.write(nfo_content)
        
        return {"message": "Show NFO generated successfully", "path": str(nfo_path)}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate NFO: {str(e)}")


@router.delete("/{show_id}")
async def delete_tvshow(show_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a TV show from the library (does not delete files)"""
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    await db.delete(show)
    await db.commit()
    
    return {"message": "TV show removed from library"}


@router.post("/{show_id}/episodes/{episode_id}/analyze")
async def analyze_episode_file(
    show_id: int,
    episode_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Analyze episode file with MediaInfo to extract technical metadata"""
    from app.services import mediainfo
    
    result = await db.execute(
        select(Episode).where(Episode.id == episode_id, Episode.tvshow_id == show_id)
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    
    if not episode.file_path:
        raise HTTPException(status_code=400, detail="Episode has no file path")
    
    if not mediainfo.is_available():
        raise HTTPException(
            status_code=500,
            detail="MediaInfo library not available. Please install MediaInfo on the system."
        )
    
    # Analyze the file
    info = mediainfo.analyze_file(episode.file_path)
    
    if not info.success:
        raise HTTPException(status_code=400, detail=info.error or "Failed to analyze file")
    
    # Update episode with media info
    episode.duration = info.duration
    episode.video_codec = info.video_codec
    episode.video_resolution = info.video_resolution
    episode.video_width = info.video_width
    episode.video_height = info.video_height
    episode.audio_codec = info.audio_codec
    episode.audio_channels = info.audio_channels
    episode.audio_language = info.audio_language
    episode.subtitle_languages = mediainfo.get_subtitle_languages_json(info)
    episode.container = info.container
    episode.file_size = info.file_size
    episode.media_info_scanned = True
    
    await db.commit()
    
    return {
        "message": "Episode file analyzed successfully",
        "media_info": {
            "container": info.container,
            "duration": info.duration,
            "video_codec": info.video_codec,
            "video_resolution": info.video_resolution,
            "audio_codec": info.audio_codec,
            "audio_channels": info.audio_channels,
            "subtitle_languages": info.subtitle_languages,
        }
    }


@router.post("/{show_id}/analyze-all")
async def analyze_all_episodes(show_id: int, db: AsyncSession = Depends(get_db)):
    """Analyze all episode files in a TV show with MediaInfo"""
    from app.services import mediainfo
    
    try:
        result = await db.execute(select(TVShow).where(TVShow.id == show_id))
        show = result.scalar_one_or_none()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    if not mediainfo.is_available():
        raise HTTPException(
            status_code=500,
            detail="MediaInfo library not available. Please install MediaInfo on the system."
        )
    
    # Get all episodes
    try:
        episodes_result = await db.execute(
            select(Episode).where(Episode.tvshow_id == show_id)
        )
        episodes = episodes_result.scalars().all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch episodes: {str(e)}")
    
    analyzed = 0
    errors = []
    
    for episode in episodes:
        if not episode.file_path:
            continue
        
        try:
            info = mediainfo.analyze_file(episode.file_path)
            
            if info.success:
                episode.duration = info.duration
                episode.video_codec = info.video_codec
                episode.video_resolution = info.video_resolution
                episode.video_width = info.video_width
                episode.video_height = info.video_height
                episode.audio_codec = info.audio_codec
                episode.audio_channels = info.audio_channels
                episode.audio_language = info.audio_language
                episode.subtitle_languages = mediainfo.get_subtitle_languages_json(info)
                episode.container = info.container
                episode.file_size = info.file_size
                episode.media_info_scanned = True
                analyzed += 1
            else:
                errors.append(f"S{episode.season_number}E{episode.episode_number}: {info.error}")
        except Exception as e:
            errors.append(f"S{episode.season_number}E{episode.episode_number}: {str(e)}")
    
    try:
        await db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save analysis results: {str(e)}")
    
    return {
        "message": f"Analyzed {analyzed} of {len(episodes)} episodes",
        "analyzed": analyzed,
        "total": len(episodes),
        "errors": errors[:10] if errors else []  # Limit errors to 10
    }


@router.get("/{show_id}/mux-subtitles-preview")
async def get_mux_subtitles_preview(
    show_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a preview of subtitle muxing for all episodes in a TV show"""
    from app.services import ffmpeg
    
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    # Get episodes with external subtitles
    episodes_result = await db.execute(
        select(Episode).where(
            Episode.tvshow_id == show_id,
                Episode.subtitle_path.isnot(None),
                Episode.has_subtitle
        )
    )
    episodes = episodes_result.scalars().all()
    
    if not episodes:
        raise HTTPException(status_code=400, detail="No episodes with external subtitles found")
    
    previews = []
    total_video_size = 0
    total_subtitle_size = 0
    valid_count = 0
    
    for ep in episodes:
        video_path = Path(ep.file_path) if ep.file_path else None
        subtitle_path = Path(ep.subtitle_path) if ep.subtitle_path else None
        
        if not video_path or not subtitle_path:
            continue
        
        video_exists = video_path.exists()
        subtitle_exists = subtitle_path.exists()
        
        video_size = video_path.stat().st_size if video_exists else 0
        subtitle_size = subtitle_path.stat().st_size if subtitle_exists else 0
        
        if video_exists and subtitle_exists:
            valid_count += 1
            total_video_size += video_size
            total_subtitle_size += subtitle_size
        
        previews.append({
            'episode_id': ep.id,
            'season_number': ep.season_number,
            'episode_number': ep.episode_number,
            'episode_title': ep.title,
            'video_file': video_path.name,
            'video_size': video_size,
            'video_exists': video_exists,
            'subtitle_file': subtitle_path.name,
            'subtitle_size': subtitle_size,
            'subtitle_exists': subtitle_exists,
            'can_mux': video_exists and subtitle_exists,
            'output_file': video_path.with_suffix('.mkv').name,
            'detected_language': ffmpeg.detect_subtitle_language(subtitle_path) if subtitle_exists else None,
        })
    
    return {
        'show_id': show.id,
        'show_title': show.title,
        'total_episodes_with_subtitles': len(episodes),
        'valid_for_muxing': valid_count,
        'total_video_size': total_video_size,
        'total_subtitle_size': total_subtitle_size,
        'ffmpeg_available': ffmpeg.is_available(),
        'episodes': previews
    }


@router.post("/{show_id}/mux-subtitles")
async def mux_all_subtitles(
    show_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Mux external subtitles into all episodes of a TV show"""
    from app.services import ffmpeg
    
    result = await db.execute(select(TVShow).where(TVShow.id == show_id))
    show = result.scalar_one_or_none()
    
    if not show:
        raise HTTPException(status_code=404, detail="TV show not found")
    
    if not ffmpeg.is_available():
        raise HTTPException(status_code=500, detail="FFmpeg is not installed on the server")
    
    # Get episodes with external subtitles
    episodes_result = await db.execute(
        select(Episode).where(
            Episode.tvshow_id == show_id,
                Episode.subtitle_path.isnot(None),
                Episode.has_subtitle
        )
    )
    episodes = episodes_result.scalars().all()
    
    if not episodes:
        raise HTTPException(status_code=400, detail="No episodes with external subtitles found")
    
    muxed = 0
    errors = []
    
    for ep in episodes:
        if not ep.file_path or not ep.subtitle_path:
            continue
        
        video_path = Path(ep.file_path)
        subtitle_path = Path(ep.subtitle_path)
        
        if not video_path.exists():
            errors.append(f"S{ep.season_number}E{ep.episode_number}: Video file not found")
            continue
        
        if not subtitle_path.exists():
            errors.append(f"S{ep.season_number}E{ep.episode_number}: Subtitle file not found")
            continue
        
        # Perform the mux
        mux_result = ffmpeg.mux_subtitle_into_video(
            video_path=video_path,
            subtitle_path=subtitle_path,
            delete_originals=True
        )
        
        if mux_result.success:
            # Update episode record
            ep.file_path = mux_result.output_path
            ep.file_name = Path(mux_result.output_path).name
            ep.subtitle_path = None
            ep.has_subtitle = False
            ep.container = "Matroska"
            
            # Update file size
            new_path = Path(mux_result.output_path)
            if new_path.exists():
                ep.file_size = new_path.stat().st_size
            
            muxed += 1
        else:
            errors.append(f"S{ep.season_number}E{ep.episode_number}: {mux_result.error}")
    
    await db.commit()
    
    return {
        "message": f"Muxed subtitles for {muxed} of {len(episodes)} episodes",
        "muxed": muxed,
        "total": len(episodes),
        "errors": errors[:10] if errors else []
    }


@router.get("/{show_id}/episodes/{episode_id}/mux-subtitle-preview")
async def get_episode_mux_preview(
    show_id: int,
    episode_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a preview of subtitle muxing for a single episode"""
    from app.services import ffmpeg
    
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id,
            Episode.tvshow_id == show_id
        )
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    
    if not episode.file_path:
        raise HTTPException(status_code=400, detail="Episode has no file path")
    
    if not episode.subtitle_path:
        raise HTTPException(status_code=400, detail="Episode has no external subtitle file")
    
    video_path = Path(episode.file_path)
    subtitle_path = Path(episode.subtitle_path)
    
    if not video_path.exists():
        raise HTTPException(status_code=400, detail="Video file not found on disk")
    
    if not subtitle_path.exists():
        raise HTTPException(status_code=400, detail="Subtitle file not found on disk")
    
    preview = ffmpeg.get_mux_preview(video_path, subtitle_path)
    preview['episode_id'] = episode.id
    preview['season_number'] = episode.season_number
    preview['episode_number'] = episode.episode_number
    preview['episode_title'] = episode.title
    
    return preview


@router.post("/{show_id}/episodes/{episode_id}/mux-subtitle")
async def mux_episode_subtitle(
    show_id: int,
    episode_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Mux external subtitle into a single episode's video container"""
    from app.services import ffmpeg
    
    result = await db.execute(
        select(Episode).where(
            Episode.id == episode_id,
            Episode.tvshow_id == show_id
        )
    )
    episode = result.scalar_one_or_none()
    
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    
    if not episode.file_path:
        raise HTTPException(status_code=400, detail="Episode has no file path")
    
    if not episode.subtitle_path:
        raise HTTPException(status_code=400, detail="Episode has no external subtitle file")
    
    if not ffmpeg.is_available():
        raise HTTPException(status_code=500, detail="FFmpeg is not installed on the server")
    
    video_path = Path(episode.file_path)
    subtitle_path = Path(episode.subtitle_path)
    
    if not video_path.exists():
        raise HTTPException(status_code=400, detail="Video file not found on disk")
    
    if not subtitle_path.exists():
        raise HTTPException(status_code=400, detail="Subtitle file not found on disk")
    
    # Perform the mux
    mux_result = ffmpeg.mux_subtitle_into_video(
        video_path=video_path,
        subtitle_path=subtitle_path,
        delete_originals=True
    )
    
    if not mux_result.success:
        raise HTTPException(status_code=500, detail=f"Muxing failed: {mux_result.error}")
    
    # Update episode record
    episode.file_path = mux_result.output_path
    episode.file_name = Path(mux_result.output_path).name
    episode.subtitle_path = None
    episode.has_subtitle = False
    episode.container = "Matroska"
    
    # Update file size
    new_path = Path(mux_result.output_path)
    if new_path.exists():
        episode.file_size = new_path.stat().st_size
    
    await db.commit()
    
    return {
        "success": True,
        "message": "Subtitle successfully embedded into episode",
        "new_file_path": mux_result.output_path
    }
