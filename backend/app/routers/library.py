from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pathlib import Path
import os
import string

from app.database import get_db
from app.models import LibraryPath, Movie, TVShow, Episode, Season, MediaType
from app.schemas import LibraryPathCreate, LibraryPathResponse, ScanResult
from app.services.scanner import scan_movie_directory, scan_tvshow_directory, is_video_file, find_associated_subtitle

router = APIRouter()


@router.get("/browse")
async def browse_directory(path: str = Query(default="")):
    """Browse filesystem directories for folder selection"""

    # If no path provided, return available drives/roots
    if not path:
        # Windows: list available drives
        if os.name == 'nt':
            drives = []
            for letter in string.ascii_uppercase:
                drive = f"{letter}:\\"
                if os.path.exists(drive):
                    drives.append({
                        "name": f"{letter}:",
                        "path": drive,
                        "is_dir": True
                    })
            return {"current_path": "", "parent_path": None, "items": drives}
        else:
            # Unix: start at root
            path = "/"

    # Handle UNC paths (network paths like \\server\share)
    is_unc = path.startswith("\\\\") or path.startswith("//")

    # Normalize path separators for UNC
    if is_unc:
        path = path.replace("/", "\\")
        # Ensure it starts with \\
        if not path.startswith("\\\\"):
            path = "\\\\" + path.lstrip("\\")

    path_obj = Path(path)

    # For UNC paths, check existence differently
    try:
        exists = path_obj.exists()
    except OSError:
        # Some network paths throw OSError when checking existence
        exists = False

    if not exists:
        # For UNC server root (like \\server\), try to list shares
        if is_unc:
            parts = path.replace("\\\\", "").rstrip("\\").split("\\")
            if len(parts) == 1:
                # This is just a server name like \\server - try to enumerate
                # shares
                server = parts[0]
                items = []
                try:
                    # Try using net view command to list shares
                    import subprocess
                    result = subprocess.run(
                        ['net', 'view', f'\\\\{server}'],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if result.returncode == 0:
                        lines = result.stdout.split('\n')
                        for line in lines:
                            line = line.strip()
                            # Share names are typically at the start of lines
                            # after the header
                            if line and not line.startswith(
                                    '-') and not line.startswith('Share') and not line.startswith('The command'):
                                # Parse share name (first word before spaces)
                                parts_line = line.split()
                                if parts_line:
                                    share_name = parts_line[0]
                                    # Skip administrative shares
                                    if not share_name.endswith('$'):
                                        items.append({
                                            "name": share_name,
                                            "path": f"\\\\{server}\\{share_name}",
                                            "is_dir": True
                                        })
                except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
                    pass

                return {
                    "current_path": f"\\\\{server}",
                    "parent_path": "",
                    "items": items
                }

        raise HTTPException(
            status_code=404,
            detail=f"Path does not exist: {path}")

    if not path_obj.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    # Get parent path for UNC paths
    if is_unc:
        parts = str(path_obj).replace("\\\\", "").rstrip("\\").split("\\")
        if len(parts) <= 2:
            # At server or share root level, parent goes back to drive
            # selection
            if len(parts) == 1:
                parent = ""  # Go back to drive selection
            else:
                parent = f"\\\\{parts[0]}"  # Go to server root
        else:
            parent = str(path_obj.parent)
    else:
        parent = str(path_obj.parent) if path_obj.parent != path_obj else None

    # List directories only (no files for folder selection)
    items = []
    try:
        for item in sorted(path_obj.iterdir()):
            try:
                if item.is_dir():
                    # Skip hidden directories and system directories
                    if item.name.startswith('.') or item.name.startswith('$'):
                        continue
                    items.append({
                        "name": item.name,
                        "path": str(item),
                        "is_dir": True
                    })
            except (PermissionError, OSError):
                continue  # Skip inaccessible items
    except PermissionError:
        pass  # Can't access this directory
    except OSError:
        pass  # Other OS errors

    return {
        "current_path": str(path_obj),
        "parent_path": parent,
        "items": items
    }


@router.get("/paths", response_model=list[LibraryPathResponse])
async def get_library_paths(db: AsyncSession = Depends(get_db)):
    """Get all configured library paths"""
    result = await db.execute(select(LibraryPath))
    paths = result.scalars().all()

    responses = []
    for path in paths:
        path_obj = Path(path.path)
        exists = path_obj.exists()

        # Get counts from database instead of scanning filesystem
        if path.media_type == MediaType.MOVIE:
            count_result = await db.execute(
                select(func.count(Movie.id)).where(Movie.library_path_id == path.id)
            )
            file_count = count_result.scalar() or 0
        else:
            count_result = await db.execute(
                select(func.count(Episode.id)).join(TVShow).where(TVShow.library_path_id == path.id)
            )
            file_count = count_result.scalar() or 0

        responses.append(LibraryPathResponse(
            id=path.id,
            path=path.path,
            media_type=path.media_type.value,
            name=path.name,
            exists=exists,
            file_count=file_count,
            created_at=path.created_at
        ))

    return responses


@router.post("/paths", response_model=LibraryPathResponse)
async def add_library_path(
    library_path: LibraryPathCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add a new library path"""
    path_obj = Path(library_path.path)

    # Validate path exists
    if not path_obj.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist: {
                library_path.path}")

    if not path_obj.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path is not a directory: {
                library_path.path}")

    # Check for duplicates
    existing = await db.execute(
        select(LibraryPath).where(LibraryPath.path == str(path_obj.absolute()))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400,
                            detail="Path already exists in library")

    # Count files
    file_count = sum(1 for _ in path_obj.rglob("*") if _.is_file())

    # Create library path
    media_type = MediaType.MOVIE if library_path.media_type == "movie" else MediaType.TV
    db_path = LibraryPath(
        path=str(path_obj.absolute()),
        name=library_path.name or path_obj.name,
        media_type=media_type
    )

    db.add(db_path)
    await db.commit()
    await db.refresh(db_path)

    return LibraryPathResponse(
        id=db_path.id,
        path=db_path.path,
        media_type=db_path.media_type.value,
        name=db_path.name,
        exists=True,
        file_count=file_count,
        created_at=db_path.created_at
    )


@router.delete("/paths/{path_id}")
async def remove_library_path(
        path_id: int,
        db: AsyncSession = Depends(get_db)):
    """Remove a library path and all associated media"""
    result = await db.execute(select(LibraryPath).where(LibraryPath.id == path_id))
    path = result.scalar_one_or_none()

    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    # Delete associated media based on path type
    if path.media_type == MediaType.MOVIE:
        # Delete all movies in this library path
        await db.execute(
            Movie.__table__.delete().where(Movie.library_path_id == path_id)
        )
    else:
        # Get all TV shows in this path
        shows_result = await db.execute(
            select(TVShow.id).where(TVShow.library_path_id == path_id)
        )
        show_ids = [row[0] for row in shows_result.fetchall()]

        if show_ids:
            # Delete all episodes for these shows
            await db.execute(
                Episode.__table__.delete().where(Episode.tvshow_id.in_(show_ids))
            )
            # Delete all seasons for these shows
            await db.execute(
                Season.__table__.delete().where(Season.tvshow_id.in_(show_ids))
            )
            # Delete the TV shows
            await db.execute(
                TVShow.__table__.delete().where(TVShow.library_path_id == path_id)
            )

    # Finally delete the library path itself
    await db.delete(path)
    await db.commit()

    return {"message": "Path removed successfully"}


@router.post("/cleanup-episodes")
async def cleanup_invalid_episodes(db: AsyncSession = Depends(get_db)):
    """Remove episode entries that are not valid video files (e.g., subtitle files)"""
    # Get all episodes
    result = await db.execute(select(Episode))
    episodes = result.scalars().all()

    removed_count = 0
    for episode in episodes:
        if not episode.file_path:
            await db.delete(episode)
            removed_count += 1
            continue

        file_path = Path(episode.file_path)
        # Remove if file doesn't exist or is not a video file
        if not file_path.exists() or not is_video_file(file_path):
            await db.delete(episode)
            removed_count += 1

    await db.commit()

    # Update episode counts for all shows
    shows_result = await db.execute(select(TVShow))
    shows = shows_result.scalars().all()
    for show in shows:
        ep_count_result = await db.execute(
            select(func.count(Episode.id)).where(Episode.tvshow_id == show.id)
        )
        show.episode_count = ep_count_result.scalar() or 0

    await db.commit()

    return {
        "message": f"Removed {removed_count} invalid episode entries",
        "removed": removed_count}


@router.post("/update-subtitles")
async def update_all_subtitles(db: AsyncSession = Depends(get_db)):
    """Scan all movies and episodes and update their external subtitle file paths"""

    # Update movies
    movies_result = await db.execute(select(Movie))
    movies = movies_result.scalars().all()

    movies_updated = 0
    for movie in movies:
        if not movie.file_path:
            continue

        file_path = Path(movie.file_path)
        if not file_path.exists():
            continue

        # Find associated subtitle file
        subtitle_path = find_associated_subtitle(file_path)

        if subtitle_path:
            movie.subtitle_path = subtitle_path
            movie.has_subtitle = True
            movies_updated += 1
        else:
            # Clear subtitle path if file no longer exists
            if movie.subtitle_path and not Path(movie.subtitle_path).exists():
                movie.subtitle_path = None
                movie.has_subtitle = False

    # Update episodes
    episodes_result = await db.execute(select(Episode))
    episodes = episodes_result.scalars().all()

    episodes_updated = 0
    for episode in episodes:
        if not episode.file_path:
            continue

        file_path = Path(episode.file_path)
        if not file_path.exists():
            continue

        # Find associated subtitle file
        subtitle_path = find_associated_subtitle(file_path)

        if subtitle_path:
            episode.subtitle_path = subtitle_path
            episode.has_subtitle = True
            episodes_updated += 1
        else:
            # Clear subtitle path if file no longer exists
            if episode.subtitle_path and not Path(
                    episode.subtitle_path).exists():
                episode.subtitle_path = None
                episode.has_subtitle = False

    await db.commit()

    return {
        "message": f"Updated {movies_updated} movies and {episodes_updated} episodes with subtitle info",
        "movies_updated": movies_updated,
        "episodes_updated": episodes_updated}


@router.post("/paths/{path_id}/scan", response_model=ScanResult)
async def scan_single_path(
    path_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Scan a single library path"""
    result = await db.execute(select(LibraryPath).where(LibraryPath.id == path_id))
    lib_path = result.scalar_one_or_none()

    if not lib_path:
        raise HTTPException(status_code=404, detail="Path not found")

    path = Path(lib_path.path)
    if not path.exists():
        raise HTTPException(status_code=400, detail="Path no longer exists")

    movies_found = 0
    tvshows_found = 0
    episodes_found = 0
    errors = []

    try:
        if lib_path.media_type == MediaType.MOVIE:
            movies = scan_movie_directory(path)

            for parsed in movies:
                existing = await db.execute(
                    select(Movie).where(Movie.file_path == parsed.file_path)
                )
                if existing.scalar_one_or_none():
                    continue

                movie = Movie(
                    library_path_id=lib_path.id,
                    file_path=parsed.file_path,
                    file_name=parsed.file_name,
                    folder_name=parsed.folder_name,
                    file_size=parsed.file_size,
                    title=parsed.title,
                    year=parsed.year,
                    release_group=parsed.release_group,
                    quality=parsed.quality,
                    edition=parsed.edition
                )
                db.add(movie)
                movies_found += 1

        else:
            shows = scan_tvshow_directory(path)

            for parsed_show in shows:
                existing = await db.execute(
                    select(TVShow).where(TVShow.folder_path == parsed_show.folder_path)
                )
                existing_show = existing.scalar_one_or_none()

                if existing_show:
                    show = existing_show
                else:
                    show = TVShow(
                        library_path_id=lib_path.id,
                        folder_path=parsed_show.folder_path,
                        folder_name=parsed_show.folder_name,
                        title=parsed_show.title
                    )
                    db.add(show)
                    await db.flush()
                    tvshows_found += 1

                seasons_found_set = set()
                for parsed_ep in parsed_show.episodes:
                    ep_existing = await db.execute(
                        select(Episode).where(Episode.file_path == parsed_ep.file_path)
                    )
                    if ep_existing.scalar_one_or_none():
                        continue

                    episode = Episode(
                        tvshow_id=show.id,
                        file_path=parsed_ep.file_path,
                        file_name=parsed_ep.file_name,
                        file_size=parsed_ep.file_size,
                        season_number=parsed_ep.season_number,
                        episode_number=parsed_ep.episode_number,
                        title=parsed_ep.episode_title,
                        subtitle_path=parsed_ep.subtitle_path,
                        has_subtitle=parsed_ep.subtitle_path is not None
                    )
                    db.add(episode)
                    episodes_found += 1
                    seasons_found_set.add(parsed_ep.season_number)

                show.episode_count = len(parsed_show.episodes)
                show.season_count = len(seasons_found_set)

                for season_num in seasons_found_set:
                    existing_season = await db.execute(
                        select(Season).where(
                            Season.tvshow_id == show.id,
                            Season.season_number == season_num
                        )
                    )
                    if not existing_season.scalar_one_or_none():
                        ep_count = sum(
                            1 for e in parsed_show.episodes if e.season_number == season_num)
                        season = Season(
                            tvshow_id=show.id,
                            season_number=season_num,
                            name=f"Season {season_num}",
                            episode_count=ep_count
                        )
                        db.add(season)

        await db.commit()

    except Exception as e:
        errors.append(str(e))

    return ScanResult(
        path=lib_path.path,
        media_type=lib_path.media_type.value,
        movies_found=movies_found,
        tvshows_found=tvshows_found,
        episodes_found=episodes_found,
        errors=errors
    )


@router.post("/scan")
async def scan_all_libraries(db: AsyncSession = Depends(get_db)):
    """Trigger a scan of all library paths"""
    result = await db.execute(select(LibraryPath))
    paths = result.scalars().all()

    if not paths:
        return {"message": "No library paths configured", "paths_to_scan": 0}

    total_movies = 0
    total_shows = 0
    total_episodes = 0
    all_errors = []

    for lib_path in paths:
        path = Path(lib_path.path)
        if not path.exists():
            all_errors.append(f"Path not found: {lib_path.path}")
            continue

        try:
            if lib_path.media_type == MediaType.MOVIE:
                movies = scan_movie_directory(path)
                for parsed in movies:
                    existing = await db.execute(
                        select(Movie).where(Movie.file_path == parsed.file_path)
                    )
                    if existing.scalar_one_or_none():
                        continue
                    movie = Movie(
                        library_path_id=lib_path.id,
                        file_path=parsed.file_path,
                        file_name=parsed.file_name,
                        folder_name=parsed.folder_name,
                        file_size=parsed.file_size,
                        title=parsed.title,
                        year=parsed.year,
                        release_group=parsed.release_group,
                        quality=parsed.quality,
                        edition=parsed.edition
                    )
                    db.add(movie)
                    total_movies += 1
            else:
                shows = scan_tvshow_directory(path)
                for parsed_show in shows:
                    existing = await db.execute(
                        select(TVShow).where(TVShow.folder_path == parsed_show.folder_path)
                    )
                    if existing.scalar_one_or_none():
                        continue
                    show = TVShow(
                        library_path_id=lib_path.id,
                        folder_path=parsed_show.folder_path,
                        folder_name=parsed_show.folder_name,
                        title=parsed_show.title,
                        episode_count=len(parsed_show.episodes),
                        season_count=len(set(e.season_number for e in parsed_show.episodes))
                    )
                    db.add(show)
                    await db.flush()
                    total_shows += 1

                    for parsed_ep in parsed_show.episodes:
                        episode = Episode(
                            tvshow_id=show.id,
                            file_path=parsed_ep.file_path,
                            file_name=parsed_ep.file_name,
                            file_size=parsed_ep.file_size,
                            season_number=parsed_ep.season_number,
                            episode_number=parsed_ep.episode_number,
                            title=parsed_ep.episode_title,
                            subtitle_path=parsed_ep.subtitle_path,
                            has_subtitle=parsed_ep.subtitle_path is not None
                        )
                        db.add(episode)
                        total_episodes += 1
        except Exception as e:
            all_errors.append(f"Error scanning {lib_path.path}: {str(e)}")

    await db.commit()

    return {
        "message": "Library scan completed",
        "movies_found": total_movies,
        "tvshows_found": total_shows,
        "episodes_found": total_episodes,
        "errors": all_errors
    }


@router.get("/stats")
async def get_library_stats(db: AsyncSession = Depends(get_db)):
    """Get library statistics"""
    movie_count = await db.execute(select(func.count(Movie.id)))
    tvshow_count = await db.execute(select(func.count(TVShow.id)))
    episode_count = await db.execute(select(func.count(Episode.id)))
    path_count = await db.execute(select(func.count(LibraryPath.id)))

    return {
        "movies": movie_count.scalar() or 0,
        "tvshows": tvshow_count.scalar() or 0,
        "episodes": episode_count.scalar() or 0,
        "library_paths": path_count.scalar() or 0
    }


@router.post("/refresh")
async def refresh_library(db: AsyncSession = Depends(get_db)):
    """
    Refresh library: remove missing files from DB and add new files.
    This is a full resync of the library.
    """
    result = await db.execute(select(LibraryPath))
    paths = result.scalars().all()

    if not paths:
        return {"message": "No library paths configured"}

    removed_movies = 0
    removed_episodes = 0
    added_movies = 0
    added_shows = 0
    added_episodes = 0
    errors = []

    for lib_path in paths:
        path = Path(lib_path.path)
        if not path.exists():
            errors.append(f"Path not found: {lib_path.path}")
            continue

        try:
            if lib_path.media_type == MediaType.MOVIE:
                # Get all movies in this library path
                movies_result = await db.execute(
                    select(Movie).where(Movie.library_path_id == lib_path.id)
                )
                existing_movies = list(movies_result.scalars().all())

                # Scan for current files on disk
                scanned = scan_movie_directory(path)
                scanned_paths = {p.file_path for p in scanned}
                existing_paths = {m.file_path for m in existing_movies}

                # Build lookup for scanned movies by title+year for matching
                scanned_by_key = {}
                for parsed in scanned:
                    key = (parsed.title.lower().strip(), parsed.year)
                    scanned_by_key[key] = parsed

                # Check existing movies
                movies_to_delete = []
                for movie in existing_movies:
                    if movie.file_path in scanned_paths:
                        # File still exists at same path - keep as is
                        continue
                    elif not Path(movie.file_path).exists():
                        # File is missing - check if it moved (same title+year
                        # at different path)
                        key = (movie.title.lower().strip(), movie.year)
                        if key in scanned_by_key:
                            # Found matching movie at new path - UPDATE instead
                            # of delete+add
                            new_parsed = scanned_by_key[key]
                            movie.file_path = new_parsed.file_path
                            movie.file_name = new_parsed.file_name
                            movie.file_size = new_parsed.file_size
                            # Remove from scanned so we don't add it again
                            del scanned_by_key[key]
                            # Don't count as removed/added since we're updating
                        else:
                            # No matching movie found - truly deleted
                            movies_to_delete.append(movie)
                            removed_movies += 1

                # Delete movies that are truly gone
                for movie in movies_to_delete:
                    await db.delete(movie)

                # Add new movies that don't exist in DB
                for parsed in scanned:
                    if parsed.file_path not in existing_paths:
                        # Check if we already handled this via update
                        key = (parsed.title.lower().strip(), parsed.year)
                        if key not in scanned_by_key:
                            continue  # Was matched to existing movie

                        movie = Movie(
                            library_path_id=lib_path.id,
                            file_path=parsed.file_path,
                            file_name=parsed.file_name,
                            folder_name=parsed.folder_name,
                            file_size=parsed.file_size,
                            title=parsed.title,
                            year=parsed.year,
                            release_group=parsed.release_group,
                            quality=parsed.quality,
                            edition=parsed.edition
                        )
                        db.add(movie)
                        added_movies += 1

            else:
                # TV Shows - check episodes
                shows_result = await db.execute(
                    select(TVShow).where(TVShow.library_path_id == lib_path.id)
                )
                existing_shows = shows_result.scalars().all()

                for show in existing_shows:
                    # Check each episode
                    eps_result = await db.execute(
                        select(Episode).where(Episode.tvshow_id == show.id)
                    )
                    episodes = eps_result.scalars().all()

                    for ep in episodes:
                        if not Path(ep.file_path).exists():
                            await db.delete(ep)
                            removed_episodes += 1

                    # Check if show folder still exists
                    if not Path(show.folder_path).exists():
                        await db.delete(show)

                # Scan for new shows/episodes
                scanned_shows = scan_tvshow_directory(path)

                for parsed_show in scanned_shows:
                    existing_show = await db.execute(
                        select(TVShow).where(TVShow.folder_path == parsed_show.folder_path)
                    )
                    show = existing_show.scalar_one_or_none()

                    if not show:
                        show = TVShow(
                            library_path_id=lib_path.id,
                            folder_path=parsed_show.folder_path,
                            folder_name=parsed_show.folder_name,
                            title=parsed_show.title,
                            episode_count=len(parsed_show.episodes),
                            season_count=len(set(e.season_number for e in parsed_show.episodes))
                        )
                        db.add(show)
                        await db.flush()
                        added_shows += 1

                    # Check for new episodes
                    for parsed_ep in parsed_show.episodes:
                        ep_exists = await db.execute(
                            select(Episode).where(Episode.file_path == parsed_ep.file_path)
                        )
                        if not ep_exists.scalar_one_or_none():
                            episode = Episode(
                                tvshow_id=show.id,
                                file_path=parsed_ep.file_path,
                                file_name=parsed_ep.file_name,
                                file_size=parsed_ep.file_size,
                                season_number=parsed_ep.season_number,
                                episode_number=parsed_ep.episode_number,
                                title=parsed_ep.episode_title,
                                subtitle_path=parsed_ep.subtitle_path,
                                has_subtitle=parsed_ep.subtitle_path is not None)
                            db.add(episode)
                            added_episodes += 1

        except Exception as e:
            errors.append(f"Error refreshing {lib_path.path}: {str(e)}")

    await db.commit()

    return {
        "message": "Library refreshed",
        "removed": {
            "movies": removed_movies,
            "episodes": removed_episodes
        },
        "added": {
            "movies": added_movies,
            "tvshows": added_shows,
            "episodes": added_episodes
        },
        "errors": errors
    }
