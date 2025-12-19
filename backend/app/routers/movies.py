from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import re
from pathlib import Path
from typing import Optional

import re
import logging
from pydantic import BaseModel

from app.schemas import MovieResponse, MovieListResponse, MovieUpdate
from app.database import get_db
from app.models import Movie
from app.services.renamer import MOVIE_RENAME_PRESETS, parse_filename, get_movie_filename, rename_movie
from app.services.tmdb import TMDBService

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("", response_model=MovieListResponse)
async def get_movies(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    search: Optional[str] = None,
    genre: Optional[str] = None,
    year: Optional[int] = None,
    watched: Optional[bool] = None,
    scraped: Optional[str] = None,
    analyzed: Optional[str] = None,
    hasNfo: Optional[str] = None,
    resolution: Optional[str] = None,
    minRating: Optional[float] = None,
    maxRating: Optional[float] = None,
    minImdbRating: Optional[float] = None,
    maxImdbRating: Optional[float] = None,
    minRottenTomatoes: Optional[int] = None,
    maxRottenTomatoes: Optional[int] = None,
    minMetacritic: Optional[int] = None,
    maxMetacritic: Optional[int] = None,
    sort_by: str = Query("title"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db)
):
    """Get paginated list of movies with filtering and sorting"""
    # Validate sort_by against actual Movie columns
    allowed_sort_columns = [
        'title', 'year', 'rating', 'created_at', 'file_size', 'runtime', 'file_name',
        'release_group', 'quality', 'edition', 'duration', 'video_codec', 'video_resolution',
        'video_width', 'video_height', 'audio_codec', 'audio_channels', 'container',
        'tmdb_id', 'imdb_id', 'genres', 'scraped', 'media_info_scanned', 'has_nfo',
        'original_title', 'votes', 'folder_name',
        # Additional rating sources
        'imdb_rating', 'imdb_votes', 'rotten_tomatoes_score', 'rotten_tomatoes_audience', 'metacritic_score',
        # Watch history
        'watched', 'watch_count', 'last_watched_date'
    ]
    if sort_by not in allowed_sort_columns:
        sort_by = 'title'

    query = select(Movie)

    # Apply filters - search across multiple fields

    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.where(
            or_(
                Movie.title.ilike(search_term),
                Movie.original_title.ilike(search_term),
                Movie.genres.ilike(search_term),
                Movie.release_group.ilike(search_term),
                Movie.quality.ilike(search_term),
                Movie.video_codec.ilike(search_term),
                Movie.audio_codec.ilike(search_term),
                Movie.folder_name.ilike(search_term),
                Movie.file_name.ilike(search_term),
            )
        )

    if genre:
        query = query.where(Movie.genres.ilike(f"%{genre}%"))

    if year:
        query = query.where(Movie.year == year)

    if watched is not None:
        query = query.where(Movie.watched == watched)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply sorting
    sort_column = getattr(Movie, sort_by, Movie.title)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    movies = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size

    return MovieListResponse(
        movies=[MovieResponse.model_validate(m) for m in movies],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/ids/list")
async def get_movie_ids_list(
    search: Optional[str] = None,
    genre: Optional[str] = None,
    year: Optional[int] = None,
    watched: Optional[bool] = None,
    scraped: Optional[str] = None,
    analyzed: Optional[str] = None,
    hasNfo: Optional[str] = None,
    resolution: Optional[str] = None,
    minRating: Optional[float] = None,
    maxRating: Optional[float] = None,
    minImdbRating: Optional[float] = None,
    maxImdbRating: Optional[float] = None,
    minRottenTomatoes: Optional[int] = None,
    maxRottenTomatoes: Optional[int] = None,
    minMetacritic: Optional[int] = None,
    maxMetacritic: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Return a list of movie ids matching the provided filters (no pagination).

    This endpoint mirrors the client-side filters so the frontend can request
    a full set of matching IDs that respects `scraped`, `analyzed`, `hasNfo`,
    rating ranges, resolution, and other filters.
    """
    query = select(Movie.id)

    # Basic text search
    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.where(
            or_(
                Movie.title.ilike(search_term),
                Movie.original_title.ilike(search_term),
                Movie.genres.ilike(search_term),
                Movie.release_group.ilike(search_term),
                Movie.quality.ilike(search_term),
                Movie.video_codec.ilike(search_term),
                Movie.audio_codec.ilike(search_term),
                Movie.folder_name.ilike(search_term),
                Movie.file_name.ilike(search_term),
            )
        )

    # Straightforward filters
    if genre:
        query = query.where(Movie.genres.ilike(f"%{genre}%"))

    if year:
        query = query.where(Movie.year == year)

    if watched is not None:
        query = query.where(Movie.watched == watched)

    # Client-only filters now supported server-side
    if scraped == 'yes':
        query = query.where(Movie.scraped.is_(True))
    elif scraped == 'no':
        query = query.where(Movie.scraped.is_(False))

    if analyzed == 'yes':
        query = query.where(Movie.media_info_scanned.is_(True))
    elif analyzed == 'no':
        query = query.where(Movie.media_info_scanned.is_(False))
    elif analyzed == 'failed':
        query = query.where(Movie.media_info_failed.is_(True))

    if hasNfo == 'yes':
        query = query.where(Movie.has_nfo.is_(True))
    elif hasNfo == 'no':
        query = query.where(Movie.has_nfo.is_(False))

    # Resolution filters
    if resolution:
        r = resolution.lower()
        if r == '4k':
            query = query.where(Movie.video_resolution.ilike(
                '%2160%') | Movie.video_resolution.ilike('%4k%'))
        elif r == '1080p':
            query = query.where(Movie.video_resolution.ilike('%1080%'))
        elif r == '720p':
            query = query.where(Movie.video_resolution.ilike('%720%'))
        elif r == 'sd':
            from sqlalchemy import or_
            query = query.where(~or_(
                Movie.video_resolution.ilike('%2160%'),
                Movie.video_resolution.ilike('%1080%'),
                Movie.video_resolution.ilike('%720%')
            ))

    # Rating ranges
    if minRating is not None:
        query = query.where(Movie.rating >= minRating)
    if maxRating is not None:
        query = query.where(Movie.rating <= maxRating)

    if minImdbRating is not None:
        query = query.where(Movie.imdb_rating >= minImdbRating)
    if maxImdbRating is not None:
        query = query.where(Movie.imdb_rating <= maxImdbRating)

    if minRottenTomatoes is not None:
        query = query.where(Movie.rotten_tomatoes_score >= minRottenTomatoes)
    if maxRottenTomatoes is not None:
        query = query.where(Movie.rotten_tomatoes_score <= maxRottenTomatoes)

    if minMetacritic is not None:
        query = query.where(Movie.metacritic_score >= minMetacritic)
    if maxMetacritic is not None:
        query = query.where(Movie.metacritic_score <= maxMetacritic)

    result = await db.execute(query)
    ids = [r[0] for r in result.all()]
    return {"ids": ids, "total": len(ids)}


@router.get("/rename-presets")
async def get_rename_presets():
    """Get available rename pattern presets (like Radarr/Sonarr)"""
    return {
        "presets": MOVIE_RENAME_PRESETS,
        "placeholders": {
            "{title}": "Movie title",
            "{year}": "Release year",
            "{quality}": "Source quality (BluRay, WEB-DL, etc.)",
            "{resolution}": "Video resolution (1080p, 2160p, etc.)",
            "{edition}": "Edition (Extended, Director's Cut, etc.)",
            "{release_group}": "Release group (HushRips, RARBG, etc.)",
        }
    }


@router.get("/{movie_id}", response_model=MovieResponse)
async def get_movie(movie_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific movie by ID"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    return MovieResponse.model_validate(movie)


@router.patch("/{movie_id}", response_model=MovieResponse)
async def update_movie(
    movie_id: int,
    update: MovieUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update movie metadata"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(movie, key, value)

    await db.commit()
    await db.refresh(movie)

    return MovieResponse.model_validate(movie)


# Patterns to extract IDs from filenames
IMDB_ID_PATTERN = re.compile(
    r'(?:^|[_\.\s\-])tt(\d{7,8})(?:[_\.\s\-]|$)',
    re.IGNORECASE)
TMDB_ID_PATTERN = re.compile(
    r'(?:tmdb|themoviedb)[_\.\s\-]?(\d+)',
    re.IGNORECASE)


def extract_ids_from_string(text: str) -> dict:
    """Extract IMDB and TMDB IDs from a string"""
    result = {"imdb_id": None, "tmdb_id": None}

    # Look for IMDB ID (tt followed by 7-8 digits)
    imdb_match = IMDB_ID_PATTERN.search(text)
    if imdb_match:
        result["imdb_id"] = f"tt{imdb_match.group(1)}"

    # Look for TMDB ID
    tmdb_match = TMDB_ID_PATTERN.search(text)
    if tmdb_match:
        result["tmdb_id"] = int(tmdb_match.group(1))

    return result


def parse_title_from_string(text: str) -> tuple[str, int | None]:
    """Parse a title and year from a string (filename or folder name)"""
    # Remove extension if present
    if '.' in text:
        name_part = text.rsplit('.', 1)[0] if text.rsplit(
            '.', 1)[-1].lower() in ['mkv', 'mp4', 'avi', 'mov'] else text
    else:
        name_part = text

    # Try to extract year
    year_match = re.search(r'[\(\[\s]?((?:19|20)\d{2})[\)\]\s]?', name_part)
    year = int(year_match.group(1)) if year_match else None

    # Get title (everything before the year, or clean the whole name)
    if year_match:
        title = name_part[:year_match.start()]
    else:
        title = name_part

    # Clean up the title
    title = re.sub(r'\[.*?\]', ' ', title)  # Remove [anything]
    title = re.sub(r'[\._]', ' ', title)  # Replace dots and underscores
    title = re.sub(
        r'(?:720p|1080p|2160p|4[kK]|[hH][dD][rR]|[bB]lu[rR]ay|[wW][eE][bB]-?[dD][lL]).*',
        '',
        title,
        flags=re.IGNORECASE)
    title = ' '.join(title.split()).strip()

    return title, year


@router.post("/{movie_id}/scrape")
async def scrape_movie_metadata(movie_id: int, include_ratings: bool = False, db: AsyncSession = Depends(get_db)):
    """
    Scrape metadata for a movie from TMDB using multiple strategies. If `include_ratings` is true, the worker will also fetch OMDb ratings and persist them.
    """
    # Enqueue a refresh_metadata task so metadata refresh runs in the queue worker
    from app.services.queue import create_task

    meta = {"trigger": "manual"}
    if include_ratings:
        meta['include_ratings'] = True

    task = await create_task('refresh_metadata', items=[{"movie_id": movie_id}], meta=meta)
    return {"task_id": task.id, "status": task.status.value}


class ScrapeNowRequest(BaseModel):
    title: Optional[str] = None
    year: Optional[int] = None


@router.post("/{movie_id}/scrape-now")
async def scrape_movie_metadata_now(movie_id: int, request: ScrapeNowRequest | None = None, db: AsyncSession = Depends(get_db)):
    """Immediately scrape metadata for a single movie (runs inline and returns result). Accepts optional `title` and `year` overrides to customize the search."""
    tmdb_service = await TMDBService.create_with_db_key(db)

    if not tmdb_service.is_configured:
        raise HTTPException(status_code=400, detail="TMDB API key not configured. Please set it in Settings.")

    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    tmdb_result = None
    search_method = None

    # Record attempted strategies for diagnostics
    tried_searches: list[dict] = []

    # If user provided an override title/year, try that first
    if request and request.title:
        tried_searches.append({'method': 'override', 'title': request.title, 'year': request.year})
        tmdb_result = await tmdb_service.search_movie_and_get_details(request.title, request.year)
        if tmdb_result:
            search_method = f"Override search: '{request.title}' ({request.year or 'no year'})"

    # Strategy 1: Check for IMDB/TMDB ID in filename
    if not tmdb_result:
        ids_from_filename = extract_ids_from_string(movie.file_name or '')
        if ids_from_filename.get('imdb_id'):
            tried_searches.append({'method': 'imdb_from_filename', 'imdb_id': ids_from_filename['imdb_id']})
            tmdb_result = await tmdb_service.find_movie_by_imdb(ids_from_filename['imdb_id'])
            if tmdb_result:
                search_method = f"IMDB ID from filename ({ids_from_filename['imdb_id']})"
        if not tmdb_result and ids_from_filename.get('tmdb_id'):
            tried_searches.append({'method': 'tmdb_from_filename', 'tmdb_id': ids_from_filename['tmdb_id']})
            tmdb_result = await tmdb_service.find_movie_by_tmdb_id(ids_from_filename['tmdb_id'])
            if tmdb_result:
                search_method = f"TMDB ID from filename ({ids_from_filename['tmdb_id']})"

    # Strategy 2: Check folder name for IDs
    if not tmdb_result and movie.folder_name:
        ids_from_folder = extract_ids_from_string(movie.folder_name)
        if ids_from_folder.get('imdb_id'):
            tried_searches.append({'method': 'imdb_from_folder', 'imdb_id': ids_from_folder['imdb_id']})
            tmdb_result = await tmdb_service.find_movie_by_imdb(ids_from_folder['imdb_id'])
            if tmdb_result:
                search_method = f"IMDB ID from folder ({ids_from_folder['imdb_id']})"
        if not tmdb_result and ids_from_folder.get('tmdb_id'):
            tried_searches.append({'method': 'tmdb_from_folder', 'tmdb_id': ids_from_folder['tmdb_id']})
            tmdb_result = await tmdb_service.find_movie_by_tmdb_id(ids_from_folder['tmdb_id'])
            if tmdb_result:
                search_method = f"TMDB ID from folder ({ids_from_folder['tmdb_id']})"

    # Strategy 3: Folder title search
    if not tmdb_result and movie.folder_name:
        folder_title, folder_year = parse_title_from_string(movie.folder_name)
        if folder_title and len(folder_title) > 2:
            tried_searches.append({'method': 'folder_title', 'title': folder_title, 'year': folder_year})
            tmdb_result = await tmdb_service.search_movie_and_get_details(folder_title, folder_year)
            if tmdb_result:
                search_method = f"Folder name search: '{folder_title}' ({folder_year or 'no year'})"

    # Strategy 4: Stored title search
    if not tmdb_result:
        tried_searches.append({'method': 'stored_title', 'title': movie.title, 'year': movie.year})
        tmdb_result = await tmdb_service.search_movie_and_get_details(movie.title or '', movie.year)
        if tmdb_result:
            search_method = f"Title search: '{movie.title}' ({movie.year or 'no year'})"

    # Strategy 5: Filename parsing fallback
    if not tmdb_result:
        file_title, file_year = parse_title_from_string(movie.file_name or '')
        if file_title and file_title != movie.title and len(file_title) > 2:
            tried_searches.append({'method': 'parsed_filename', 'title': file_title, 'year': file_year})
            tmdb_result = await tmdb_service.search_movie_and_get_details(file_title, file_year)
            if tmdb_result:
                search_method = f"Filename re-parse: '{file_title}' ({file_year or 'no year'})"

    # Strategy 6: Try stored title without year (broader search)
    if not tmdb_result and movie.title:
        tried_searches.append({'method': 'stored_title_no_year', 'title': movie.title})
        tmdb_result = await tmdb_service.search_movie_and_get_details(movie.title, None)
        if tmdb_result:
            search_method = f"Title without year: '{movie.title}'"

    omdb_ratings = None
    already_has_omdb = movie.imdb_rating is not None or movie.rotten_tomatoes_score is not None or movie.metacritic_score is not None

    if tmdb_result:
        # Update movie with TMDB data
        movie.tmdb_id = tmdb_result.tmdb_id
        movie.title = tmdb_result.title
        movie.original_title = tmdb_result.original_title
        movie.overview = tmdb_result.overview
        movie.tagline = tmdb_result.tagline
        movie.release_date = tmdb_result.release_date
        movie.runtime = tmdb_result.runtime
        movie.genres = ",".join(tmdb_result.genres) if tmdb_result.genres else None
        movie.poster_path = tmdb_result.poster_path
        movie.backdrop_path = tmdb_result.backdrop_path
        movie.imdb_id = tmdb_result.imdb_id
        movie.rating = tmdb_result.rating
        movie.votes = tmdb_result.votes
        movie.scraped = True
        if tmdb_result.release_date:
            movie.year = tmdb_result.release_date.year

        # Fetch additional ratings from OMDb (IMDB, Rotten Tomatoes, Metacritic)
        if tmdb_result.imdb_id and not already_has_omdb:
            from app.services.omdb import fetch_omdb_ratings
            omdb_ratings = await fetch_omdb_ratings(db, imdb_id=tmdb_result.imdb_id)

            if omdb_ratings:
                movie.imdb_rating = omdb_ratings.imdb_rating or movie.imdb_rating
                movie.imdb_votes = omdb_ratings.imdb_votes or movie.imdb_votes
                movie.rotten_tomatoes_score = omdb_ratings.rotten_tomatoes_score or movie.rotten_tomatoes_score
                movie.rotten_tomatoes_audience = omdb_ratings.rotten_tomatoes_audience or movie.rotten_tomatoes_audience
                movie.metacritic_score = omdb_ratings.metacritic_score or movie.metacritic_score

        await db.commit()

        return {
            "message": "Movie metadata updated",
            "tmdb_id": tmdb_result.tmdb_id,
            "title": tmdb_result.title,
            "search_method": search_method,
            "omdb_ratings_fetched": omdb_ratings is not None,
            "omdb_skipped": already_has_omdb
        }

    # Try OMDb fallback for ratings/metadata if TMDB failed
    from app.services.omdb import fetch_omdb_ratings, get_omdb_api_key_from_db
    api_key = await get_omdb_api_key_from_db(db)
    if api_key:
        omdb_ratings = await fetch_omdb_ratings(db, title=movie.title, year=movie.year)
        if omdb_ratings:
            # Persist OMDb ratings and mark as scraped (best-effort fallback)
            movie.imdb_rating = omdb_ratings.imdb_rating or movie.imdb_rating
            movie.imdb_votes = omdb_ratings.imdb_votes or movie.imdb_votes
            movie.rotten_tomatoes_score = omdb_ratings.rotten_tomatoes_score or movie.rotten_tomatoes_score
            movie.rotten_tomatoes_audience = omdb_ratings.rotten_tomatoes_audience or movie.rotten_tomatoes_audience
            movie.metacritic_score = omdb_ratings.metacritic_score or movie.metacritic_score
            movie.scraped = True
            await db.commit()
            logger.info(f"OMDb fallback succeeded for movie_id={movie.id}: applied OMDb ratings")
            return {
                "message": "Metadata updated from OMDb (fallback)",
                "omdb_ratings_fetched": True
            }

    # Not found anywhere — log and return helpful error with attempted searches
    details = [f"Filename: {movie.file_name}"]
    if movie.folder_name:
        details.append(f"Folder: {movie.folder_name}")
    details.append(f"Parsed title: {movie.title}")
    if movie.year:
        details.append(f"Year: {movie.year}")

    logger.warning(f"Scrape failed for movie_id={movie.id}: Tried: {'; '.join(details)}")
    raise HTTPException(status_code=404, detail={"message": "Movie not found on TMDB and OMDb fallback unavailable", "tried": tried_searches})


@router.get("/{movie_id}/rename-preview")
async def preview_rename(
    movie_id: int,
    pattern: str = "{title} ({year})",
    db: AsyncSession = Depends(get_db)
):
    """Preview what the renamed file would look like"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    file_path = Path(movie.file_path)
    extension = file_path.suffix

    # Parse existing filename for release info
    parsed = parse_filename(movie.file_name)

    # Use stored values if available, otherwise use parsed
    quality = movie.quality or parsed.quality
    edition = movie.edition or parsed.edition
    release_group = movie.release_group or parsed.release_group
    resolution = parsed.resolution

    # If we have video_resolution from mediainfo, use that for a cleaner format
    if movie.video_resolution:
        # Convert "1920x1080" to "1080p" format
        height = movie.video_height
        if height:
            if height >= 2160:
                resolution = "2160p"
            elif height >= 1080:
                resolution = "1080p"
            elif height >= 720:
                resolution = "720p"
            else:
                resolution = "480p"

    new_filename = get_movie_filename(
        title=movie.title,
        year=movie.year,
        extension=extension,
        pattern=pattern,
        quality=quality,
        resolution=resolution,
        edition=edition,
        release_group=release_group,
    )

    return {
        "current_name": movie.file_name,
        "new_name": new_filename,
        "pattern": pattern,
        "parsed_info": {
            "quality": quality,
            "resolution": resolution,
            "edition": edition,
            "release_group": release_group,
        }
    }


@router.post("/{movie_id}/rename")
async def rename_movie_files(
    movie_id: int,
    pattern: str = "{title} ({year})",
    db: AsyncSession = Depends(get_db)
):
    """Rename movie file according to naming pattern (renames in place, no folder creation)"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    file_path = Path(movie.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=400, detail="Movie file not found")

    # Parse existing filename for release info
    parsed = parse_filename(movie.file_name)

    # Use stored values if available, otherwise use parsed
    quality = movie.quality or parsed.quality
    edition = movie.edition or parsed.edition
    release_group = movie.release_group or parsed.release_group
    resolution = parsed.resolution

    # If we have video info from mediainfo, use that
    if movie.video_height:
        if movie.video_height >= 2160:
            resolution = "2160p"
        elif movie.video_height >= 1080:
            resolution = "1080p"
        elif movie.video_height >= 720:
            resolution = "720p"
        else:
            resolution = "480p"

    rename_result = rename_movie(
        file_path=file_path,
        title=movie.title,
        year=movie.year,
        file_pattern=pattern,
        quality=quality,
        resolution=resolution,
        edition=edition,
        release_group=release_group,
    )

    if not rename_result.success:
        raise HTTPException(status_code=400, detail=rename_result.error)

    # Update database with new path and parsed info
    movie.file_path = rename_result.new_path
    movie.file_name = Path(rename_result.new_path).name

    # Store parsed release info if not already set
    if not movie.quality and quality:
        movie.quality = quality
    if not movie.edition and edition:
        movie.edition = edition
    if not movie.release_group and release_group:
        movie.release_group = release_group

    await db.commit()

    return {
        "message": "Movie renamed successfully",
        "old_path": rename_result.old_path,
        "new_path": rename_result.new_path
    }


@router.get("/{movie_id}/rename-folder-preview")
async def preview_folder_rename(
    movie_id: int,
    pattern: str = "{title} ({year})",
    db: AsyncSession = Depends(get_db)
):
    """Preview what the renamed folder would look like"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    file_path = Path(movie.file_path)
    current_folder = file_path.parent
    current_folder_name = current_folder.name

    # Parse existing folder name for release info
    parsed = parse_filename(current_folder_name)

    # Use stored values if available, otherwise use parsed
    quality = movie.quality or parsed.quality
    edition = movie.edition or parsed.edition
    release_group = movie.release_group or parsed.release_group
    resolution = parsed.resolution

    # If we have video_resolution from mediainfo, use that for a cleaner format
    if movie.video_height:
        if movie.video_height >= 2160:
            resolution = "2160p"
        elif movie.video_height >= 1080:
            resolution = "1080p"
        elif movie.video_height >= 720:
            resolution = "720p"
        else:
            resolution = "480p"

    # Generate new folder name (no extension for folders)
    new_folder_name = get_movie_filename(
        title=movie.title,
        year=movie.year,
        extension="",  # No extension for folder
        pattern=pattern,
        quality=quality,
        resolution=resolution,
        edition=edition,
        release_group=release_group,
    )

    return {
        "current_name": current_folder_name,
        "new_name": new_folder_name,
        "current_path": str(current_folder),
        "new_path": str(current_folder.parent / new_folder_name),
        "pattern": pattern,
        "parsed_info": {
            "quality": quality,
            "resolution": resolution,
            "edition": edition,
            "release_group": release_group,
        }
    }


@router.post("/{movie_id}/rename-folder")
async def rename_movie_folder(
    movie_id: int,
    pattern: str = "{title} ({year})",
    db: AsyncSession = Depends(get_db)
):
    """Rename movie folder according to naming pattern"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    file_path = Path(movie.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=400, detail="Movie file not found")

    current_folder = file_path.parent
    parent_folder = current_folder.parent

    # Parse existing folder name for release info
    parsed = parse_filename(current_folder.name)

    # Use stored values if available, otherwise use parsed
    quality = movie.quality or parsed.quality
    edition = movie.edition or parsed.edition
    release_group = movie.release_group or parsed.release_group
    resolution = parsed.resolution

    # If we have video info from mediainfo, use that
    if movie.video_height:
        if movie.video_height >= 2160:
            resolution = "2160p"
        elif movie.video_height >= 1080:
            resolution = "1080p"
        elif movie.video_height >= 720:
            resolution = "720p"
        else:
            resolution = "480p"

    # Generate new folder name
    new_folder_name = get_movie_filename(
        title=movie.title,
        year=movie.year,
        extension="",  # No extension for folder
        pattern=pattern,
        quality=quality,
        resolution=resolution,
        edition=edition,
        release_group=release_group,
    )

    new_folder_path = parent_folder / new_folder_name

    # Check if already named correctly
    if current_folder == new_folder_path:
        return {
            "message": "Folder already has the correct name",
            "old_path": str(current_folder),
            "new_path": str(new_folder_path)
        }

    # Check if target folder already exists
    if new_folder_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Target folder already exists: {new_folder_path}"
        )

    try:
        # Rename the folder
        import shutil
        shutil.move(str(current_folder), str(new_folder_path))

        # Update the file path in database (file is now in new folder)
        old_file_path = str(file_path)
        new_file_path = str(new_folder_path / file_path.name)

        movie.file_path = new_file_path
        movie.folder_name = new_folder_name

        await db.commit()

        return {
            "message": "Folder renamed successfully",
            "old_path": str(current_folder),
            "new_path": str(new_folder_path),
            "old_file_path": old_file_path,
            "new_file_path": new_file_path
        }

    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename folder: {str(e)}")


@router.post("/{movie_id}/nfo")
async def generate_nfo(movie_id: int, db: AsyncSession = Depends(get_db)):
    """Generate NFO file for media centers"""
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    file_path = Path(movie.file_path)
    nfo_path = file_path.with_suffix('.nfo')

    # Generate NFO content (Kodi-compatible format)
    nfo_content = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
    <title>{movie.title}</title>
    <originaltitle>{movie.original_title or movie.title}</originaltitle>
    <year>{movie.year or ''}</year>
    <plot>{movie.overview or ''}</plot>
    <tagline>{movie.tagline or ''}</tagline>
    <runtime>{movie.runtime or ''}</runtime>
    <rating>{movie.rating or ''}</rating>
    <votes>{movie.votes or ''}</votes>
    <uniqueid type="tmdb">{movie.tmdb_id or ''}</uniqueid>
    <uniqueid type="imdb">{movie.imdb_id or ''}</uniqueid>
    <thumb aspect="poster">{movie.poster_path or ''}</thumb>
    <fanart><thumb>{movie.backdrop_path or ''}</thumb></fanart>
</movie>
"""

    try:
        with open(nfo_path, 'w', encoding='utf-8') as f:
            f.write(nfo_content)

        movie.has_nfo = True
        await db.commit()

        return {"message": "NFO generated successfully", "path": str(nfo_path)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate NFO: {str(e)}")


class DeleteMovieRequest(BaseModel):
    delete_file: bool = False
    delete_folder: bool = False


@router.delete("/{movie_id}")
async def delete_movie(
        movie_id: int,
        delete_file: bool = Query(
            False,
            description="Delete the media file from disk"),
        delete_folder: bool = Query(
            False,
            description="Delete the entire folder containing the movie"),
        db: AsyncSession = Depends(get_db)):
    """Remove a movie from the library, optionally deleting files"""
    import shutil

    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    deleted_files = []
    errors = []

    try:
        if delete_folder and movie.file_path:
            # Delete the entire folder
            file_path = Path(movie.file_path)
            folder_path = file_path.parent
            if folder_path.exists() and folder_path.is_dir():
                shutil.rmtree(folder_path)
                deleted_files.append(str(folder_path))
        elif delete_file and movie.file_path:
            # Delete just the file
            file_path = Path(movie.file_path)
            if file_path.exists():
                file_path.unlink()
                deleted_files.append(str(file_path))
    except Exception as e:
        errors.append(f"Failed to delete file/folder: {str(e)}")

    await db.delete(movie)
    await db.commit()

    return {
        "message": "Movie deleted successfully",
        "deleted_files": deleted_files,
        "errors": errors
    }


class BatchDeleteRequest(BaseModel):
    movie_ids: list[int]
    delete_file: bool = False
    delete_folder: bool = False


@router.post("/delete-batch")
async def delete_movies_batch(
    request: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Delete multiple movies from the library, optionally deleting files"""
    import shutil

    deleted = 0
    deleted_files = []
    errors = []

    for movie_id in request.movie_ids:
        result = await db.execute(select(Movie).where(Movie.id == movie_id))
        movie = result.scalar_one_or_none()

        if not movie:
            errors.append(f"Movie {movie_id} not found")
            continue

        try:
            if request.delete_folder and movie.file_path:
                file_path = Path(movie.file_path)
                folder_path = file_path.parent
                if folder_path.exists() and folder_path.is_dir():
                    shutil.rmtree(folder_path)
                    deleted_files.append(str(folder_path))
            elif request.delete_file and movie.file_path:
                file_path = Path(movie.file_path)
                if file_path.exists():
                    file_path.unlink()
                    deleted_files.append(str(file_path))
        except Exception as e:
            errors.append(f"Failed to delete files for movie {movie_id}: {str(e)}")

        await db.delete(movie)
        deleted += 1

    await db.commit()

    return {
        "message": f"Deleted {deleted} of {len(request.movie_ids)} movies",
        "deleted": deleted,
        "total": len(request.movie_ids),
        "deleted_files": deleted_files,
        "errors": errors
    }


class BatchRenameRequest(BaseModel):
    movie_ids: list[int]
    pattern: str = "{title} ({year})"


@router.post("/rename-batch")
async def rename_movies_batch(
    request: BatchRenameRequest,
    db: AsyncSession = Depends(get_db)
):
    """Rename multiple movie files according to naming pattern"""
    renamed = 0
    errors = []

    for movie_id in request.movie_ids:
        result = await db.execute(select(Movie).where(Movie.id == movie_id))
        movie = result.scalar_one_or_none()

        if not movie:
            errors.append(f"Movie {movie_id} not found")
            continue

        try:
            file_path = Path(movie.file_path)
            if not file_path.exists():
                errors.append(f"File not found for movie: {movie.title}")
                continue

            # Parse existing filename for release info
            parsed = parse_filename(movie.file_name)

            quality = movie.quality or parsed.quality
            edition = movie.edition or parsed.edition
            release_group = movie.release_group or parsed.release_group
            resolution = parsed.resolution

            if movie.video_height:
                if movie.video_height >= 2160:
                    resolution = "2160p"
                elif movie.video_height >= 1080:
                    resolution = "1080p"
                elif movie.video_height >= 720:
                    resolution = "720p"
                else:
                    resolution = "480p"

            rename_result = rename_movie(
                file_path=file_path,
                title=movie.title,
                year=movie.year,
                file_pattern=request.pattern,
                quality=quality,
                resolution=resolution,
                edition=edition,
                release_group=release_group,
            )

            if not rename_result.success:
                errors.append(f"Failed to rename {movie.title}: {rename_result.error}")
                continue

            movie.file_path = rename_result.new_path
            movie.file_name = Path(rename_result.new_path).name

            if not movie.quality and quality:
                movie.quality = quality
            if not movie.edition and edition:
                movie.edition = edition
            if not movie.release_group and release_group:
                movie.release_group = release_group

            renamed += 1

        except Exception as e:
            errors.append(f"Error renaming {movie.title}: {str(e)}")

    await db.commit()

    return {
        "message": f"Renamed {renamed} of {len(request.movie_ids)} movies",
        "renamed": renamed,
        "total": len(request.movie_ids),
        "errors": errors
    }


@router.post("/rename-folder-batch")
async def rename_folders_batch(
    request: BatchRenameRequest,
    db: AsyncSession = Depends(get_db)
):
    """Rename multiple movie folders according to naming pattern"""
    renamed = 0
    errors = []

    for movie_id in request.movie_ids:
        result = await db.execute(select(Movie).where(Movie.id == movie_id))
        movie = result.scalar_one_or_none()

        if not movie:
            errors.append(f"Movie {movie_id} not found")
            continue

        try:
            file_path = Path(movie.file_path)
            current_folder = file_path.parent

            if not current_folder.exists():
                errors.append(f"Folder not found for movie: {movie.title}")
                continue

            # Parse existing folder name for release info
            parsed = parse_filename(current_folder.name)

            quality = movie.quality or parsed.quality
            edition = movie.edition or parsed.edition
            release_group = movie.release_group or parsed.release_group
            resolution = parsed.resolution

            if movie.video_height:
                if movie.video_height >= 2160:
                    resolution = "2160p"
                elif movie.video_height >= 1080:
                    resolution = "1080p"
                elif movie.video_height >= 720:
                    resolution = "720p"
                else:
                    resolution = "480p"

            # Generate new folder name
            new_folder_name = get_movie_filename(
                title=movie.title,
                year=movie.year,
                extension="",
                pattern=request.pattern,
                quality=quality,
                resolution=resolution,
                edition=edition,
                release_group=release_group,
            )

            new_folder_path = current_folder.parent / new_folder_name

            if current_folder == new_folder_path:
                continue  # Already has correct name

            if new_folder_path.exists():
                errors.append(f"Target folder already exists for {movie.title}")
                continue

            # Rename the folder
            current_folder.rename(new_folder_path)

            # Update movie's file path
            movie.file_path = str(new_folder_path / file_path.name)
            movie.folder_name = new_folder_name

            renamed += 1

        except Exception as e:
            errors.append(f"Error renaming folder for {movie.title}: {str(e)}")

    await db.commit()

    return {
        "message": f"Renamed {renamed} of {len(request.movie_ids)} folders",
        "renamed": renamed,
        "total": len(request.movie_ids),
        "errors": errors
    }


@router.post("/{movie_id}/analyze")
async def analyze_movie_file(
        movie_id: int,
        db: AsyncSession = Depends(get_db)):
    """Analyze movie file with MediaInfo to extract technical metadata"""
    from app.services import mediainfo

    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    if not mediainfo.is_available():
        raise HTTPException(
            status_code=500,
            detail="MediaInfo library not available. Please install MediaInfo on the system."
        )

    # Analyze the file
    logger.info(f"Starting media analysis for movie_id={movie.id}, path={movie.file_path}")
    try:
        info = mediainfo.analyze_file(movie.file_path)
    except Exception as e:
        logger.error(f"Exception while analyzing movie_id={movie.id}, path={movie.file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Error analyzing file: {str(e)}")

    if not info.success:
        # Mark as failed for follow-up and log details
        movie.media_info_failed = True
        await db.commit()

        # Insert a dedicated log entry so failures are always visible in
        # Settings -> Logs
        from app.models import LogEntry
        from datetime import datetime
        try:
            track_summary = getattr(info, 'error', None) or 'No tracks found'
            log_entry = LogEntry(
                timestamp=datetime.utcnow(),
                level='WARNING',
                logger_name='app.services.mediainfo',
                message=f"Analyze failed for movie_id={movie.id}, path={movie.file_path}: {info.error}",
                module='app.services.mediainfo',
                function='analyze_file',
                exception=track_summary,
            )
            db.add(log_entry)
            await db.commit()
        except Exception:
            # If DB logging fails, still emit a warning to the normal logger
            logger.warning(f"Media analysis failed for movie_id={movie.id}, path={movie.file_path}: {info.error}")

        logger.warning(f"Media analysis failed for movie_id={movie.id}, path={movie.file_path}: {info.error}")
        raise HTTPException(status_code=400,
                            detail=info.error or "Failed to analyze file")

    logger.info(f"Media analysis succeeded for movie_id={movie.id}")
    # Update movie with media info
    movie.duration = info.duration
    movie.video_codec = info.video_codec
    movie.video_profile = info.video_codec_profile
    movie.video_resolution = info.video_resolution
    movie.video_width = info.video_width
    movie.video_height = info.video_height
    movie.video_aspect_ratio = info.video_aspect_ratio
    movie.video_bitrate = info.video_bitrate
    movie.video_framerate = info.video_framerate
    movie.video_hdr = info.video_hdr
    movie.audio_codec = info.audio_codec
    movie.audio_channels = info.audio_channels
    movie.audio_bitrate = info.audio_bitrate
    movie.audio_language = info.audio_language
    movie.audio_tracks = mediainfo.get_audio_tracks_json(info)
    movie.subtitle_languages = mediainfo.get_subtitle_languages_json(info)
    movie.subtitle_count = info.subtitle_count
    movie.container = info.container
    movie.overall_bitrate = info.overall_bitrate
    movie.file_size = info.file_size
    movie.media_info_scanned = True
    movie.media_info_failed = False

    await db.commit()

    return {
        "message": "File analyzed successfully",
        "media_info": {
            "container": info.container,
            "duration": info.duration,
            "video_codec": info.video_codec,
            "video_resolution": info.video_resolution,
            "video_hdr": info.video_hdr,
            "audio_codec": info.audio_codec,
            "audio_channels": info.audio_channels,
            "audio_tracks": len(info.audio_tracks),
            "subtitle_count": info.subtitle_count,
            "subtitle_languages": info.subtitle_languages,
        }
    }


class MovieIdsRequest(BaseModel):
    movie_ids: list[int] | None = None


@router.post("/analyze-batch")
async def analyze_movies_batch(
    request: MovieIdsRequest,
    db: AsyncSession = Depends(get_db)
):
    """Analyze movie files with MediaInfo. If movie_ids provided, only analyze those movies."""
    from app.services import mediainfo

    if not mediainfo.is_available():
        raise HTTPException(
            status_code=500,
            detail="MediaInfo library not available. Please install MediaInfo on the system."
        )

    if request.movie_ids:
        result = await db.execute(select(Movie).where(Movie.id.in_(request.movie_ids)))
    else:
        result = await db.execute(select(Movie))
    movies = result.scalars().all()

    # Enqueue analyze tasks for provided movies
    items = []
    for movie in movies:
        if not movie.file_path:
            logger.warning(f"Skipping analyze enqueue for movie_id={movie.id} because file_path is empty")
            continue
        items.append({"movie_id": movie.id})

    if not items:
        raise HTTPException(status_code=400, detail="No movies with files to analyze")

    from app.services.queue import create_task
    task = await create_task('analyze', items=items, meta={"batch": True})

    return {"task_id": task.id, "status": task.status.value, "total_enqueued": len(items)}

    if not items:
        raise HTTPException(status_code=400, detail="No movies with files to analyze")

    from app.services.queue import create_task
    task = await create_task('analyze', items=items, meta={"batch": True})

    return {"task_id": task.id, "status": task.status.value, "total_enqueued": len(items)}


@router.post("/refresh-batch")
async def refresh_movies_batch(request: MovieIdsRequest, include_ratings: bool = False, db: AsyncSession = Depends(get_db)):
    """Enqueue refresh metadata for a batch of movies. If `include_ratings` is true, the worker will also fetch OMDb ratings for each movie."""
    if not request.movie_ids:
        raise HTTPException(status_code=400, detail="movie_ids required")

    from app.services.queue import create_task

    items = []
    for mid in request.movie_ids:
        items.append({"movie_id": mid})

    meta = {"batch": True}
    if include_ratings:
        meta['include_ratings'] = True

    task = await create_task('refresh_metadata', items=items, meta=meta)
    return {"task_id": task.id, "status": task.status.value, "total_enqueued": len(items)}


@router.post("/analyze-all")
async def analyze_all_movies(db: AsyncSession = Depends(get_db)):
    """Analyze all movie files with MediaInfo to extract technical metadata"""
    from app.services import mediainfo

    if not mediainfo.is_available():
        raise HTTPException(
            status_code=500,
            detail="MediaInfo library not available. Please install MediaInfo on the system."
        )

    result = await db.execute(select(Movie))
    movies = result.scalars().all()

    # Enqueue analyze tasks for provided movies
    items = []
    for movie in movies:
        if not movie.file_path:
            logger.warning(f"Skipping analyze enqueue for movie_id={movie.id} because file_path is empty")
            continue
        items.append({"movie_id": movie.id})

    if not items:
        raise HTTPException(status_code=400, detail="No movies with files to analyze")

    from app.services.queue import create_task
    task = await create_task('analyze', items=items, meta={"batch": True})

    return {"task_id": task.id, "status": task.status.value, "total_enqueued": len(items)}

    return {
        "message": f"Analyzed {analyzed} of {len(movies)} movies",
        "analyzed": analyzed,
        "total": len(movies),
        "errors": errors[:10] if errors else []
    }
    items = []
    for movie in movies:
        if not movie.file_path:
            logger.warning(f"Skipping analyze enqueue for movie_id={movie.id} because file_path is empty")
            continue
    items = []
    for movie in movies:
        if not movie.file_path:
            logger.warning(f"Skipping analyze enqueue for movie_id={movie.id} because file_path is empty")
            continue
        items.append({"movie_id": movie.id})

    if not items:
        raise HTTPException(status_code=400, detail="No movies with files to analyze")

    from app.services.queue import create_task
    task = await create_task('analyze', items=items, meta={"batch": True})

    return {"task_id": task.id, "status": task.status.value, "total_enqueued": len(items)}


@router.post("/scrape-batch")
async def scrape_movies_batch(
    request: MovieIdsRequest,
    db: AsyncSession = Depends(get_db)
):
    """Refresh metadata for movies from TMDB. If movie_ids provided, only scrape those movies."""
    # Create TMDB service with API key from database
    tmdb_service = await TMDBService.create_with_db_key(db)

    if not tmdb_service.is_configured:
        raise HTTPException(
            status_code=400,
            detail="TMDB API key not configured. Please set it in Settings.")

    if request.movie_ids:
        result = await db.execute(select(Movie).where(Movie.id.in_(request.movie_ids)))
    else:
        result = await db.execute(select(Movie))
    movies = result.scalars().all()

    scraped = 0
    errors = []
    omdb_fallbacks = 0

    for movie in movies:
        try:
            tmdb_result = None

            # Strategy 1: Check for IMDB/TMDB ID in filename
            ids_from_filename = extract_ids_from_string(movie.file_name)

            if ids_from_filename["imdb_id"]:
                tmdb_result = await tmdb_service.find_movie_by_imdb(ids_from_filename["imdb_id"])

            if not tmdb_result and ids_from_filename["tmdb_id"]:
                tmdb_result = await tmdb_service.find_movie_by_tmdb_id(ids_from_filename["tmdb_id"])

            # Strategy 2: Check for IMDB/TMDB ID in folder name
            if not tmdb_result and movie.folder_name:
                ids_from_folder = extract_ids_from_string(movie.folder_name)

                if ids_from_folder["imdb_id"]:
                    tmdb_result = await tmdb_service.find_movie_by_imdb(ids_from_folder["imdb_id"])

                if not tmdb_result and ids_from_folder["tmdb_id"]:
                    tmdb_result = await tmdb_service.find_movie_by_tmdb_id(ids_from_folder["tmdb_id"])

            # Strategy 3: Search by folder name
            if not tmdb_result and movie.folder_name:
                folder_title, folder_year = parse_title_from_string(
                    movie.folder_name)
                if folder_title and len(folder_title) > 2:
                    tmdb_result = await tmdb_service.search_movie_and_get_details(folder_title, folder_year)

            # Strategy 4: Search by stored title
            if not tmdb_result:
                tmdb_result = await tmdb_service.search_movie_and_get_details(movie.title, movie.year)

            # Strategy 5: Try filename with fresh parsing
            if not tmdb_result:
                file_title, file_year = parse_title_from_string(
                    movie.file_name)
                if file_title and file_title != movie.title and len(
                        file_title) > 2:
                    tmdb_result = await tmdb_service.search_movie_and_get_details(file_title, file_year)

            # Strategy 6: Try title without year
            if not tmdb_result and movie.title:
                tmdb_result = await tmdb_service.search_movie_and_get_details(movie.title, None)

            if tmdb_result:
                # Update movie with TMDB data
                movie.tmdb_id = tmdb_result.tmdb_id
                movie.title = tmdb_result.title
                movie.original_title = tmdb_result.original_title
                movie.overview = tmdb_result.overview
                movie.tagline = tmdb_result.tagline
                movie.release_date = tmdb_result.release_date
                movie.runtime = tmdb_result.runtime
                movie.genres = ",".join(
                    tmdb_result.genres) if tmdb_result.genres else None
                movie.poster_path = tmdb_result.poster_path
                movie.backdrop_path = tmdb_result.backdrop_path
                movie.imdb_id = tmdb_result.imdb_id
                movie.rating = tmdb_result.rating
                movie.votes = tmdb_result.votes
                movie.scraped = True

                if tmdb_result.release_date:
                    movie.year = tmdb_result.release_date.year

                scraped += 1
            else:
                # Try OMDb fallback if available
                from app.services.omdb import fetch_omdb_ratings, get_omdb_api_key_from_db
                api_key = await get_omdb_api_key_from_db(db)
                omdb_ratings = None
                if api_key:
                    omdb_ratings = await fetch_omdb_ratings(db, title=movie.title, year=movie.year)
                    if omdb_ratings:
                        movie.imdb_rating = omdb_ratings.imdb_rating or movie.imdb_rating
                        movie.imdb_votes = omdb_ratings.imdb_votes or movie.imdb_votes
                        movie.rotten_tomatoes_score = omdb_ratings.rotten_tomatoes_score or movie.rotten_tomatoes_score
                        movie.rotten_tomatoes_audience = omdb_ratings.rotten_tomatoes_audience or movie.rotten_tomatoes_audience
                        movie.metacritic_score = omdb_ratings.metacritic_score or movie.metacritic_score
                        movie.scraped = True
                        scraped += 1
                        omdb_fallbacks += 1
                        logger.info(
                            f"OMDb fallback succeeded for movie_id={movie.id}: applied OMDb ratings")
                    else:
                        err_msg = f"{movie.title}: Not found on TMDB"
                        errors.append(err_msg)
                        logger.warning(f"Scrape failed for movie_id={movie.id}: {err_msg}; filename={movie.file_name}; folder={movie.folder_name}; parsed_title={movie.title}; year={movie.year}")
                else:
                    err_msg = f"{movie.title}: Not found on TMDB"
                    errors.append(err_msg)
                    logger.warning(f"Scrape failed for movie_id={movie.id}: {err_msg}; filename={movie.file_name}; folder={movie.folder_name}; parsed_title={movie.title}; year={movie.year}")

        except Exception as e:
            err_msg = f"{movie.title}: {str(e)}"
            errors.append(err_msg)
            logger.error(f"Exception scraping movie_id={movie.id}: {str(e)}")

    await db.commit()

    return {
        "message": f"Refreshed metadata for {scraped} of {len(movies)} movies",
        "scraped": scraped,
        "total": len(movies),
        "errors": errors[:10] if errors else []
    }


@router.post("/scrape-all")
async def scrape_all_movies(db: AsyncSession = Depends(get_db)):
    """Refresh metadata for all movies from TMDB"""
    # Create TMDB service with API key from database
    tmdb_service = await TMDBService.create_with_db_key(db)

    if not tmdb_service.is_configured:
        raise HTTPException(
            status_code=400,
            detail="TMDB API key not configured. Please set it in Settings.")

    result = await db.execute(select(Movie))
    movies = result.scalars().all()

    scraped = 0
    errors = []
    omdb_fallbacks = 0

    for movie in movies:
        try:
            tmdb_result = None

            # Strategy 1: Check for IMDB/TMDB ID in filename
            ids_from_filename = extract_ids_from_string(movie.file_name)

            if ids_from_filename["imdb_id"]:
                tmdb_result = await tmdb_service.find_movie_by_imdb(ids_from_filename["imdb_id"])

            if not tmdb_result and ids_from_filename["tmdb_id"]:
                tmdb_result = await tmdb_service.find_movie_by_tmdb_id(ids_from_filename["tmdb_id"])

            # Strategy 2: Check for IMDB/TMDB ID in folder name
            if not tmdb_result and movie.folder_name:
                ids_from_folder = extract_ids_from_string(movie.folder_name)

                if ids_from_folder["imdb_id"]:
                    tmdb_result = await tmdb_service.find_movie_by_imdb(ids_from_folder["imdb_id"])

                if not tmdb_result and ids_from_folder["tmdb_id"]:
                    tmdb_result = await tmdb_service.find_movie_by_tmdb_id(ids_from_folder["tmdb_id"])

            # Strategy 3: Search by folder name
            if not tmdb_result and movie.folder_name:
                folder_title, folder_year = parse_title_from_string(
                    movie.folder_name)
                if folder_title and len(folder_title) > 2:
                    tmdb_result = await tmdb_service.search_movie_and_get_details(folder_title, folder_year)

            # Strategy 4: Search by stored title
            if not tmdb_result:
                tmdb_result = await tmdb_service.search_movie_and_get_details(movie.title, movie.year)

            # Strategy 5: Try filename with fresh parsing
            if not tmdb_result:
                file_title, file_year = parse_title_from_string(
                    movie.file_name)
                if file_title and file_title != movie.title and len(
                        file_title) > 2:
                    tmdb_result = await tmdb_service.search_movie_and_get_details(file_title, file_year)

            # Strategy 6: Try title without year
            if not tmdb_result and movie.title:
                tmdb_result = await tmdb_service.search_movie_and_get_details(movie.title, None)

            if tmdb_result:
                # Update movie with TMDB data
                movie.tmdb_id = tmdb_result.tmdb_id
                movie.title = tmdb_result.title
                movie.original_title = tmdb_result.original_title
                movie.overview = tmdb_result.overview
                movie.tagline = tmdb_result.tagline
                movie.release_date = tmdb_result.release_date
                movie.runtime = tmdb_result.runtime
                movie.genres = ",".join(
                    tmdb_result.genres) if tmdb_result.genres else None
                movie.poster_path = tmdb_result.poster_path
                movie.backdrop_path = tmdb_result.backdrop_path
                movie.imdb_id = tmdb_result.imdb_id
                movie.rating = tmdb_result.rating
                movie.votes = tmdb_result.votes
                movie.scraped = True

                if tmdb_result.release_date:
                    movie.year = tmdb_result.release_date.year

                scraped += 1
            else:
                # Try OMDb fallback if available
                from app.services.omdb import fetch_omdb_ratings, get_omdb_api_key_from_db
                api_key = await get_omdb_api_key_from_db(db)
                omdb_ratings = None
                if api_key:
                    omdb_ratings = await fetch_omdb_ratings(db, title=movie.title, year=movie.year)
                    if omdb_ratings:
                        movie.imdb_rating = omdb_ratings.imdb_rating or movie.imdb_rating
                        movie.imdb_votes = omdb_ratings.imdb_votes or movie.imdb_votes
                        movie.rotten_tomatoes_score = omdb_ratings.rotten_tomatoes_score or movie.rotten_tomatoes_score
                        movie.rotten_tomatoes_audience = omdb_ratings.rotten_tomatoes_audience or movie.rotten_tomatoes_audience
                        movie.metacritic_score = omdb_ratings.metacritic_score or movie.metacritic_score
                        movie.scraped = True
                        scraped += 1
                        omdb_fallbacks += 1
                        logger.info(
                            f"OMDb fallback succeeded for movie_id={movie.id}: applied OMDb ratings")
                    else:
                        err_msg = f"{movie.title}: Not found on TMDB"
                        errors.append(err_msg)
                        logger.warning(f"Scrape failed for movie_id={movie.id}: {err_msg}; filename={movie.file_name}; folder={movie.folder_name}; parsed_title={movie.title}; year={movie.year}")
                else:
                    err_msg = f"{movie.title}: Not found on TMDB"
                    errors.append(err_msg)
                    logger.warning(f"Scrape failed for movie_id={movie.id}: {err_msg}; filename={movie.file_name}; folder={movie.folder_name}; parsed_title={movie.title}; year={movie.year}")

        except Exception as e:
            err_msg = f"{movie.title}: {str(e)}"
            errors.append(err_msg)
            logger.error(f"Exception scraping movie_id={movie.id}: {str(e)}")

    await db.commit()

    return {
        "message": f"Refreshed metadata for {scraped} of {len(movies)} movies",
        "scraped": scraped,
        "total": len(movies),
        "errors": errors[:10] if errors else []
    }


@router.post("/fetch-omdb-ratings")
async def fetch_omdb_ratings_batch(
    request: MovieIdsRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Fetch OMDb ratings (IMDB, Rotten Tomatoes, Metacritic) for movies that don't have them yet.
    Only fetches for movies that have an IMDB ID but are missing OMDb ratings.
    This is more efficient than re-scraping as it skips the TMDB lookup.
    """
    from app.services.omdb import fetch_omdb_ratings, get_omdb_api_key_from_db

    # Check if OMDb API key is configured
    api_key = await get_omdb_api_key_from_db(db)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OMDb API key not configured. Please set it in Settings.")

    # Get movies that have IMDB ID but no OMDb ratings
    if request.movie_ids:
        result = await db.execute(
            select(Movie).where(
                Movie.id.in_(request.movie_ids),
                Movie.imdb_id.isnot(None),
                Movie.imdb_rating.is_(None),
                Movie.rotten_tomatoes_score.is_(None),
                Movie.metacritic_score.is_(None)
            )
        )
    else:
        result = await db.execute(
            select(Movie).where(
                Movie.imdb_id.isnot(None),
                Movie.imdb_rating.is_(None),
                Movie.rotten_tomatoes_score.is_(None),
                Movie.metacritic_score.is_(None)
            )
        )
    movies = result.scalars().all()

    fetched = 0
    errors = []

    for movie in movies:
        try:
            omdb_ratings = await fetch_omdb_ratings(db, imdb_id=movie.imdb_id)

            if omdb_ratings:
                movie.imdb_rating = omdb_ratings.imdb_rating
                movie.imdb_votes = omdb_ratings.imdb_votes
                movie.rotten_tomatoes_score = omdb_ratings.rotten_tomatoes_score
                movie.rotten_tomatoes_audience = omdb_ratings.rotten_tomatoes_audience
                movie.metacritic_score = omdb_ratings.metacritic_score
                fetched += 1
            else:
                errors.append(f"{movie.title}: No OMDb data found")

        except Exception as e:
            errors.append(f"{movie.title}: {str(e)}")

    await db.commit()

    return {
        "message": f"Fetched OMDb ratings for {fetched} of {len(movies)} movies",
        "fetched": fetched,
        "total": len(movies),
        "errors": errors[:10] if errors else []
    }


@router.get("/{movie_id}/mux-subtitle-preview")
async def get_mux_subtitle_preview(
    movie_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a preview of the subtitle muxing operation for a movie"""
    from app.services import ffmpeg

    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    if not movie.file_path:
        raise HTTPException(status_code=400, detail="Movie has no file path")

    if not movie.subtitle_path:
        raise HTTPException(status_code=400,
                            detail="Movie has no external subtitle file")

    video_path = Path(movie.file_path)
    subtitle_path = Path(movie.subtitle_path)

    if not video_path.exists():
        raise HTTPException(
            status_code=400,
            detail="Video file not found on disk")

    if not subtitle_path.exists():
        raise HTTPException(status_code=400,
                            detail="Subtitle file not found on disk")

    preview = ffmpeg.get_mux_preview(video_path, subtitle_path)
    preview['movie_id'] = movie.id
    preview['movie_title'] = movie.title
    preview['movie_year'] = movie.year

    return preview


@router.post("/{movie_id}/mux-subtitle")
async def mux_subtitle_into_movie(
    movie_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Mux external subtitle file into the movie's video container"""
    from app.services import ffmpeg

    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    if not movie.file_path:
        raise HTTPException(status_code=400, detail="Movie has no file path")

    if not movie.subtitle_path:
        raise HTTPException(status_code=400,
                            detail="Movie has no external subtitle file")

    if not ffmpeg.is_available():
        raise HTTPException(status_code=500,
                            detail="FFmpeg is not installed on the server")

    video_path = Path(movie.file_path)
    subtitle_path = Path(movie.subtitle_path)

    if not video_path.exists():
        raise HTTPException(
            status_code=400,
            detail="Video file not found on disk")

    if not subtitle_path.exists():
        raise HTTPException(status_code=400,
                            detail="Subtitle file not found on disk")

    # Perform the mux
    mux_result = ffmpeg.mux_subtitle_into_video(
        video_path=video_path,
        subtitle_path=subtitle_path,
        delete_originals=True
    )

    if not mux_result.success:
        raise HTTPException(
            status_code=500,
            detail=f"Muxing failed: {mux_result.error}")

    # Update movie record with new file path
    movie.file_path = mux_result.output_path
    movie.file_name = Path(mux_result.output_path).name
    movie.subtitle_path = None
    movie.has_subtitle = False
    movie.container = "Matroska"

    # Update file size
    new_path = Path(mux_result.output_path)
    if new_path.exists():
        movie.file_size = new_path.stat().st_size

    await db.commit()

    return {
        "success": True,
        "message": "Subtitle successfully embedded into video",
        "new_file_path": mux_result.output_path
    }


@router.post("/{movie_id}/sync-watch-history")
async def sync_movie_watch_history(
        movie_id: int,
        db: AsyncSession = Depends(get_db)):
    """
    Sync watch history for a specific movie from Tautulli to the database
    """
    from app.services.tautulli import get_tautulli_service
    from datetime import datetime

    # Get movie
    result = await db.execute(select(Movie).where(Movie.id == movie_id))
    movie = result.scalar_one_or_none()

    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    # Check if movie has been scraped (has metadata)
    if not movie.scraped or not movie.title:
        raise HTTPException(
            status_code=400,
            detail="Movie must be scraped first. Please refresh metadata before syncing watch history."
        )

    # Get Tautulli service
    tautulli = await get_tautulli_service(db)
    if not tautulli:
        raise HTTPException(status_code=400, detail="Tautulli not configured")

    # If we already have a stored rating_key for this movie, prefer using it
    # (fast and reliable)
    if movie.rating_key:
        history = await tautulli.get_history(rating_key=movie.rating_key)
        resolved_rating_key = movie.rating_key
    else:
        # Search for watch history (include imdb_id when available for more
        # reliable matching)
        history, resolved_rating_key = await tautulli.search_movie_history(movie.title, movie.year, imdb_id=movie.imdb_id, db=db)

        # If we resolved a rating_key from Plex/Tautulli, persist it to the
        # movie record for future syncs
        if resolved_rating_key and movie.rating_key != resolved_rating_key:
            movie.rating_key = resolved_rating_key

        # Try resolving rating_key via Plex first (faster) when available
        resolved_rating_key = None
        from app.services.plex import get_plex_service
        try:
            plex = await get_plex_service(db)
            if plex:
                # Prefer resolving by imdb_id when available
                if movie.imdb_id:
                    rk = await plex.get_rating_key_by_imdb(movie.imdb_id)
                    if rk:
                        resolved_rating_key = rk
                # If still unresolved, attempt a Plex title search
                if not resolved_rating_key and movie.title:
                    plex_results = await plex.search(movie.title)
                    if plex_results:
                        for pr in plex_results:
                            rk = pr.get('ratingKey') or pr.get('rating_key') or pr.get('ratingkey')
                            if rk:
                                try:
                                    resolved_rating_key = int(rk)
                                    break
                                except Exception:
                                    continue
        except Exception:
            # Plex may not be configured or lookup failed; fall back to Tautulli search
            resolved_rating_key = None

        if resolved_rating_key:
            # If Plex resolved the rating_key, use it to fetch history
            history = await tautulli.get_history(rating_key=resolved_rating_key)
            movie.rating_key = resolved_rating_key
        # Try resolving rating_key via Plex first (faster) when available
        resolved_rating_key = None
        from app.services.plex import get_plex_service
        try:
            plex = await get_plex_service(db)
            if plex:
                # Prefer resolving by imdb_id when available
                if movie.imdb_id:
                    rk = await plex.get_rating_key_by_imdb(movie.imdb_id)
                    if rk:
                        resolved_rating_key = rk
                # If still unresolved, attempt a Plex title search
                if not resolved_rating_key and movie.title:
                    plex_results = await plex.search(movie.title)
                    if plex_results:
                        for pr in plex_results:
                            rk = pr.get('ratingKey') or pr.get('rating_key') or pr.get('ratingkey')
                            if rk:
                                try:
                                    resolved_rating_key = int(rk)
                                    break
                                except Exception:
                                    continue
        except Exception:
            # Plex may not be configured or lookup failed; fall back to Tautulli search
            resolved_rating_key = None

        if resolved_rating_key:
            # If Plex resolved the rating_key, use it to fetch history
            history = await tautulli.get_history(rating_key=resolved_rating_key)
            movie.rating_key = resolved_rating_key
        else:
            # Search for watch history via Tautulli (includes multiple fallbacks)
            history, resolved_rating_key = await tautulli.search_movie_history(movie.title, movie.year, imdb_id=movie.imdb_id, db=db)

            # If we resolved a rating_key from Plex/Tautulli, persist it to the movie record for future syncs
            if resolved_rating_key and movie.rating_key != resolved_rating_key:
                movie.rating_key = resolved_rating_key
    
    if history:
        # Update movie watch status
        movie.watched = True
        movie.watch_count = len(history)

        # Get most recent watch
        if history:
            most_recent = history[0]  # History is sorted by date desc
            movie.last_watched_date = datetime.fromtimestamp(
                most_recent.get('date', 0))
            movie.last_watched_user = most_recent.get('user', 'Unknown')

        await db.commit()

        return {
            "success": True,
            "watched": True,
            "watch_count": movie.watch_count,
            "last_watched_date": movie.last_watched_date.isoformat() if movie.last_watched_date else None,
            "last_watched_user": movie.last_watched_user}
    else:
        # No watch history found
        movie.watched = False
        movie.watch_count = 0
        movie.last_watched_date = None
        movie.last_watched_user = None
        await db.commit()

        return {
            "success": True,
            "watched": False,
            "watch_count": 0
        }


@router.post("/sync-watch-history-all")
async def sync_all_movies_watch_history(db: AsyncSession = Depends(get_db)):
    """
    Sync watch history for all movies from Tautulli to the database
    """
    from app.services.tautulli import get_tautulli_service
    from datetime import datetime

    # Get Tautulli service
    tautulli = await get_tautulli_service(db)
    if not tautulli:
        raise HTTPException(status_code=400, detail="Tautulli not configured")

    # Get all movies that have been scraped (have metadata)
    result = await db.execute(
        select(Movie).where(Movie.scraped, Movie.title.isnot(None))
    )
    movies = result.scalars().all()

    # Count total movies for reporting
    total_result = await db.execute(select(func.count(Movie.id)))
    total_movies = total_result.scalar()

    synced_count = 0
    watched_count = 0
    skipped_count = total_movies - len(movies)

    for movie in movies:
        try:
            # Prefer stored rating_key if available
            if movie.rating_key:
                history = await tautulli.get_history(rating_key=movie.rating_key)
                resolved_rating_key = movie.rating_key
            else:
                history, resolved_rating_key = await tautulli.search_movie_history(movie.title, movie.year, imdb_id=movie.imdb_id, db=db)
                if resolved_rating_key and movie.rating_key != resolved_rating_key:
                    movie.rating_key = resolved_rating_key

            if history:
                movie.watched = True
                movie.watch_count = len(history)
                watched_count += 1

                # Get most recent watch
                most_recent = history[0]
                movie.last_watched_date = datetime.fromtimestamp(
                    most_recent.get('date', 0))
                movie.last_watched_user = most_recent.get('user', 'Unknown')
            else:
                movie.watched = False
                movie.watch_count = 0
                movie.last_watched_date = None
                movie.last_watched_user = None

            synced_count += 1
        except Exception as e:
            logger.error(f"Error syncing watch history for movie {movie.id}: {str(e)}")
            continue

    await db.commit()

    return {
        "success": True,
        "total_movies": total_movies,
        "synced_count": synced_count,
        "watched_count": watched_count,
        "skipped_count": skipped_count,
        "message": f"Skipped {skipped_count} movies without metadata. Please scrape metadata first." if skipped_count > 0 else None
    }


@router.post("/sync-watch-history-batch")
async def sync_movies_watch_history_batch(
    request: MovieIdsRequest,
    db: AsyncSession = Depends(get_db)
):
    """Sync watch history for a set of movies (by id list) from Tautulli"""
    from app.services.tautulli import get_tautulli_service
    from datetime import datetime

    # Enqueue a queued task to sync watch history for the requested movies
    movie_ids = request.movie_ids if request.movie_ids else None
    if movie_ids is None:
        # If no specific ids provided, run for all movies (but do not block) by creating a task for all.
        result = await db.execute(select(Movie))
        movie_ids = [m.id for m in result.scalars().all()]

    if not movie_ids:
        raise HTTPException(status_code=400, detail="No movies found to sync")

    from app.services.queue import create_task
    items = [{'movie_id': mid} for mid in movie_ids]
    task = await create_task('sync_watch_history', items)

    return {"task_id": task.id, "status": task.status.value, "requested": len(movie_ids)}
    return {"task_id": task.id, "status": task.status.value, "requested": len(movie_ids)}
