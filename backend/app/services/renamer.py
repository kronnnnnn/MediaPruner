"""
File Renaming Service - Renames media files according to naming conventions
Similar to Radarr/Sonarr naming conventions
"""
import re
import shutil
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RenameResult:
    """Result of a rename operation"""
    success: bool
    old_path: str
    new_path: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ParsedFilename:
    """Parsed information from a media filename"""
    title: Optional[str] = None
    year: Optional[int] = None
    release_group: Optional[str] = None
    quality: Optional[str] = None
    edition: Optional[str] = None
    resolution: Optional[str] = None


# Common release groups (case insensitive matching)
RELEASE_GROUPS = [
    'HushRips', 'RARBG', 'SPARKS', 'YTS', 'YIFY', 'ETRG', 'EVO', 'AMZN', 'NTb',
    'FLUX', 'TEPES', 'PSA', 'ION10', 'FGT', 'CM', 'NTG', 'BLOW', 'TOMMY',
    'GECKOS', 'AMIABLE', 'DRONES', 'SiMPLE', 'USURY', 'ROVERS', 'DEFLATE',
    'DIMENSION', 'LOL', 'KILLERS', 'DEMAND', 'W4F', 'STUTTERSHIT', 'MRCS',
    'PLAYNOW', 'CMRG', 'NOGRP', 'MiNX', 'VETO', 'EVOLVE', 'EXT', 'ZR',
]

# Quality patterns
QUALITY_PATTERNS = {
    'BluRay': r'(?:blu[\s\-\.]?ray|bdrip|bd[\s\-\.]?rip)',
    'WEB-DL': r'(?:web[\s\-\.]?dl|webdl)',
    'WEBRip': r'(?:web[\s\-\.]?rip|webrip)',
    'HDRip': r'(?:hd[\s\-\.]?rip|hdrip)',
    'DVDRip': r'(?:dvd[\s\-\.]?rip|dvdrip)',
    'HDTV': r'(?:hdtv)',
    'BRRip': r'(?:br[\s\-\.]?rip|brrip)',
    'CAM': r'(?:cam|camrip|hdcam)',
    'TS': r'(?:telesync|ts|hdts)',
    'AMZN': r'(?:amzn|amazon)',
    'NF': r'(?:netflix|nf)',
    'DSNP': r'(?:dsnp|disney\+?)',
    'HMAX': r'(?:hmax|hbo[\s\-]?max)',
}

# Edition patterns
EDITION_PATTERNS = {
    'Extended': r"(?:extended(?:[\s\-\.]?cut)?|extended[\s\-\.]?edition)",
    "Director's Cut": r"(?:director'?s?[\s\-\.]?cut)",
    'Unrated': r'(?:unrated|uncensored)',
    'Theatrical': r'(?:theatrical(?:[\s\-\.]?cut)?)',
    'Ultimate': r'(?:ultimate(?:[\s\-\.]?cut)?|ultimate[\s\-\.]?edition)',
    'Anniversary': r'(?:anniversary(?:[\s\-\.]?edition)?)',
    'Remastered': r'(?:remastered)',
    'Special Edition': r'(?:special[\s\-\.]?edition)',
    'IMAX': r'(?:imax(?:[\s\-\.]?edition)?)',
    'Criterion': r'(?:criterion(?:[\s\-\.]?collection)?)',
}

# Resolution patterns
RESOLUTION_PATTERNS = {
    '2160p': r'(?:2160p|4k|uhd)',
    '1080p': r'(?:1080p|1080i)',
    '720p': r'(?:720p)',
    '480p': r'(?:480p|sd)',
}


def parse_release_group(filename: str) -> Optional[str]:
    """Extract release group from filename"""
    # Common pattern: name at the end after a dash/hyphen
    # e.g., "Movie.Name.2023.1080p.BluRay.x264-HushRips.mkv"

    # First, remove the extension
    name_without_ext = Path(filename).stem

    # Look for pattern: -ReleaseGroup at the end
    match = re.search(r'[\-\.]([A-Za-z0-9]+)$', name_without_ext)
    if match:
        potential_group = match.group(1)
        # Check if it's a known release group (case-insensitive)
        for group in RELEASE_GROUPS:
            if potential_group.lower() == group.lower():
                return group
        # If not a known group but looks like one (length 2-15, alphanumeric)
        if 2 <= len(potential_group) <= 15 and potential_group.isalnum():
            # Exclude common false positives
            false_positives = [
                'mkv',
                'mp4',
                'avi',
                'x264',
                'x265',
                'h264',
                'h265',
                'hevc',
                'avc']
            if potential_group.lower() not in false_positives:
                return potential_group

    return None


def parse_quality(filename: str) -> Optional[str]:
    """Extract quality/source from filename"""
    filename_lower = filename.lower()
    for quality, pattern in QUALITY_PATTERNS.items():
        if re.search(pattern, filename_lower):
            return quality
    return None


def parse_edition(filename: str) -> Optional[str]:
    """Extract edition from filename"""
    filename_lower = filename.lower()
    for edition, pattern in EDITION_PATTERNS.items():
        if re.search(pattern, filename_lower):
            return edition
    return None


def parse_resolution(filename: str) -> Optional[str]:
    """Extract resolution from filename"""
    filename_lower = filename.lower()
    for resolution, pattern in RESOLUTION_PATTERNS.items():
        if re.search(pattern, filename_lower):
            return resolution
    return None


def parse_filename(filename: str) -> ParsedFilename:
    """Parse a media filename to extract metadata"""
    return ParsedFilename(
        release_group=parse_release_group(filename),
        quality=parse_quality(filename),
        edition=parse_edition(filename),
        resolution=parse_resolution(filename),
    )


def sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a filename"""
    # Replace invalid characters
    invalid_chars = r'[<>:"/\\|?*]'
    name = re.sub(invalid_chars, '', name)

    # Replace multiple spaces with single space
    name = ' '.join(name.split())

    # Trim leading/trailing spaces and dots
    name = name.strip(' .')

    # Limit length (Windows max is 255)
    if len(name) > 200:
        name = name[:200]

    return name


# Preset patterns similar to Radarr
MOVIE_RENAME_PRESETS = {
    "standard": {
        "name": "Standard",
        "pattern": "{title} ({year})",
        "description": "Movie Title (2023)"
    },
    "plex": {
        "name": "Plex",
        "pattern": "{title} ({year})",
        "description": "Movie Title (2023) - Plex recommended format"
    },
    "with_quality": {
        "name": "With Quality",
        "pattern": "{title} ({year}) [{quality}]",
        "description": "Movie Title (2023) [BluRay]"
    },
    "with_resolution": {
        "name": "With Resolution",
        "pattern": "{title} ({year}) [{resolution}]",
        "description": "Movie Title (2023) [1080p]"
    },
    "with_quality_resolution": {
        "name": "Quality + Resolution",
        "pattern": "{title} ({year}) [{quality}-{resolution}]",
        "description": "Movie Title (2023) [BluRay-1080p]"
    },
    "with_edition": {
        "name": "With Edition",
        "pattern": "{title} ({year}) {edition}",
        "description": "Movie Title (2023) Extended"
    },
    "with_release_group": {
        "name": "With Release Group",
        "pattern": "{title} ({year}) - {release_group}",
        "description": "Movie Title (2023) - HushRips"
    },
    "full": {
        "name": "Full Details",
        "pattern": "{title} ({year}) {edition} [{quality}-{resolution}] - {release_group}",
        "description": "Movie Title (2023) Extended [BluRay-1080p] - HushRips"
    },
    "radarr_default": {
        "name": "Radarr Default",
        "pattern": "{title} ({year}) [{quality} {resolution}]",
        "description": "Movie Title (2023) [BluRay 1080p]"
    },
}


# Preset patterns for TV episodes similar to Sonarr
EPISODE_RENAME_PRESETS = {
    "standard": {
        "name": "Standard",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title}",
        "description": "Show Name - S01E01 - Episode Title"
    },
    "plex": {
        "name": "Plex",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title}",
        "description": "Show Name - S01E01 - Episode Title"
    },
    "compact": {
        "name": "Compact",
        "pattern": "{show} S{season:02d}E{episode:02d}",
        "description": "Show Name S01E01"
    },
    "with_quality": {
        "name": "With Quality",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title} [{quality}]",
        "description": "Show Name - S01E01 - Episode Title [WEB-DL]"
    },
    "with_resolution": {
        "name": "With Resolution",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title} [{resolution}]",
        "description": "Show Name - S01E01 - Episode Title [1080p]"
    },
    "with_quality_resolution": {
        "name": "Quality + Resolution",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title} [{quality}-{resolution}]",
        "description": "Show Name - S01E01 - Episode Title [WEB-DL-1080p]"
    },
    "with_release_group": {
        "name": "With Release Group",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title} - {release_group}",
        "description": "Show Name - S01E01 - Episode Title - HushRips"
    },
    "full": {
        "name": "Full Details",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title} [{quality}-{resolution}] - {release_group}",
        "description": "Show Name - S01E01 - Episode Title [WEB-DL-1080p] - HushRips"
    },
    "sonarr_default": {
        "name": "Sonarr Default",
        "pattern": "{show} - S{season:02d}E{episode:02d} - {title} [{quality} {resolution}]",
        "description": "Show Name - S01E01 - Episode Title [WEB-DL 1080p]"
    },
}

# Placeholders available for episode renaming
EPISODE_PLACEHOLDERS = {
    "{show}": "Show title",
    "{season}": "Season number",
    "{season:02d}": "Season number (zero-padded)",
    "{episode}": "Episode number",
    "{episode:02d}": "Episode number (zero-padded)",
    "{title}": "Episode title",
    "{quality}": "Source quality (WEB-DL, BluRay, etc.)",
    "{resolution}": "Video resolution (1080p, 720p, etc.)",
    "{release_group}": "Release group name",
}


def get_movie_filename(
    title: str,
    year: Optional[int] = None,
    extension: str = ".mkv",
    pattern: str = "{title} ({year})",
    quality: Optional[str] = None,
    resolution: Optional[str] = None,
    edition: Optional[str] = None,
    release_group: Optional[str] = None,
) -> str:
    """
    Generate a movie filename based on a pattern.

    Available placeholders:
    - {title}: Movie title
    - {year}: Release year
    - {quality}: Source quality (BluRay, WEB-DL, etc.)
    - {resolution}: Video resolution (1080p, 2160p, etc.)
    - {edition}: Movie edition (Extended, Director's Cut, etc.)
    - {release_group}: Release group name (HushRips, RARBG, etc.)
    """
    filename = pattern

    # Replace title
    filename = filename.replace("{title}", title)

    # Replace year
    if year:
        filename = filename.replace("{year}", str(year))
    else:
        # Remove year placeholder and parentheses if no year
        filename = re.sub(r'\s*\([^)]*\{year\}[^)]*\)', '', filename)
        filename = filename.replace("{year}", "")

    # Replace quality
    if quality:
        filename = filename.replace("{quality}", quality)
    else:
        # Remove quality placeholder and brackets
        filename = re.sub(r'\s*\[?\{quality\}[\-\s]*\]?', '', filename)
        filename = re.sub(
            r'\[\s*\-?\s*\]',
            '',
            filename)  # Clean empty brackets

    # Replace resolution
    if resolution:
        filename = filename.replace("{resolution}", resolution)
    else:
        filename = re.sub(r'[\-\s]*\{resolution\}', '', filename)
        filename = re.sub(r'\[\s*\]', '', filename)  # Clean empty brackets

    # Replace edition
    if edition:
        filename = filename.replace("{edition}", edition)
    else:
        filename = re.sub(r'\s*\{edition\}', '', filename)

    # Replace release group
    if release_group:
        filename = filename.replace("{release_group}", release_group)
    else:
        filename = re.sub(r'\s*[\-\s]*\{release_group\}', '', filename)

    # Clean up any leftover empty brackets or multiple spaces
    filename = re.sub(r'\[\s*\]', '', filename)
    filename = re.sub(r'\(\s*\)', '', filename)
    filename = ' '.join(filename.split())

    filename = sanitize_filename(filename)

    # Add extension
    if not filename.endswith(extension):
        filename += extension

    return filename


def get_movie_folder(
    title: str,
    year: Optional[int] = None,
    pattern: str = "{title} ({year})"
) -> str:
    """Generate a movie folder name based on a pattern"""
    folder = pattern

    folder = folder.replace("{title}", title)

    if year:
        folder = folder.replace("{year}", str(year))
    else:
        folder = re.sub(r'\s*\([^)]*\{year\}[^)]*\)', '', folder)
        folder = folder.replace("{year}", "")

    return sanitize_filename(folder)


def get_tvshow_folder(
    title: str,
    year: Optional[int] = None,
    pattern: str = "{title}"
) -> str:
    """Generate a TV show folder name based on a pattern"""
    folder = pattern

    folder = folder.replace("{title}", title)

    if year:
        folder = folder.replace("{year}", str(year))
    else:
        folder = re.sub(r'\s*\([^)]*\{year\}[^)]*\)', '', folder)
        folder = folder.replace("{year}", "")

    return sanitize_filename(folder)


def get_season_folder(
    season_number: int,
    pattern: str = "Season {season:02d}"
) -> str:
    """Generate a season folder name based on a pattern"""
    folder = pattern.replace("{season:02d}", f"{season_number:02d}")
    folder = folder.replace("{season}", str(season_number))
    return sanitize_filename(folder)


def get_episode_filename(
    show_title: str,
    season_number: int,
    episode_number: int,
    episode_title: Optional[str] = None,
    extension: str = ".mkv",
    pattern: str = "{show} - S{season:02d}E{episode:02d} - {title}",
    quality: Optional[str] = None,
    resolution: Optional[str] = None,
    release_group: Optional[str] = None,
    replace_spaces_with: Optional[str] = None,
) -> str:
    """
    Generate an episode filename based on a pattern.

    Available placeholders:
    - {show}: Show title
    - {season}: Season number
    - {season:02d}: Season number zero-padded
    - {episode}: Episode number
    - {episode:02d}: Episode number zero-padded
    - {title}: Episode title
    - {quality}: Source quality (WEB-DL, BluRay, etc.)
    - {resolution}: Video resolution (1080p, 720p, etc.)
    - {release_group}: Release group name

    Args:
        replace_spaces_with: Character to replace spaces with (e.g., '.', '_', or None to keep spaces)
    """
    filename = pattern

    # Replace placeholders
    filename = filename.replace("{show}", show_title)
    filename = filename.replace("{season:02d}", f"{season_number:02d}")
    filename = filename.replace("{season}", str(season_number))
    filename = filename.replace("{episode:02d}", f"{episode_number:02d}")
    filename = filename.replace("{episode}", str(episode_number))

    if episode_title:
        filename = filename.replace("{title}", episode_title)
    else:
        # Remove title placeholder and separator if no title
        filename = re.sub(r'\s*-\s*\{title\}', '', filename)
        filename = filename.replace("{title}", "")

    # Replace quality
    if quality:
        filename = filename.replace("{quality}", quality)
    else:
        filename = re.sub(r'\s*\[?\{quality\}[\-\s]*\]?', '', filename)
        filename = re.sub(r'\[\s*\-?\s*\]', '', filename)

    # Replace resolution
    if resolution:
        filename = filename.replace("{resolution}", resolution)
    else:
        filename = re.sub(r'[\-\s]*\{resolution\}', '', filename)
        filename = re.sub(r'\[\s*\]', '', filename)

    # Replace release group
    if release_group:
        filename = filename.replace("{release_group}", release_group)
    else:
        filename = re.sub(r'\s*[\-\s]*\{release_group\}', '', filename)

    # Clean up any leftover empty brackets or multiple spaces
    filename = re.sub(r'\[\s*\]', '', filename)
    filename = re.sub(r'\(\s*\)', '', filename)
    filename = ' '.join(filename.split())

    # Replace spaces with specified character if provided
    if replace_spaces_with is not None and replace_spaces_with != '' and replace_spaces_with != ' ':
        filename = filename.replace(' ', replace_spaces_with)

    filename = sanitize_filename(filename)

    # Add extension
    if not filename.endswith(extension):
        filename += extension

    return filename


def rename_file(
    old_path: Path,
    new_name: str,
    create_folder: bool = False,
    new_folder: Optional[Path] = None
) -> RenameResult:
    """
    Rename a file.

    Args:
        old_path: Current file path
        new_name: New filename (without path)
        create_folder: Whether to create the target folder
        new_folder: Optional new folder to move the file to
    """
    try:
        if not old_path.exists():
            logger.warning(f"Rename failed - file does not exist: {old_path}")
            return RenameResult(
                success=False,
                old_path=str(old_path),
                error="File does not exist"
            )

        # Determine target folder
        target_folder = new_folder if new_folder else old_path.parent

        if create_folder and not target_folder.exists():
            logger.debug(f"Creating folder: {target_folder}")
            target_folder.mkdir(parents=True, exist_ok=True)

        new_path = target_folder / new_name

        # Check if target already exists
        if new_path.exists() and new_path != old_path:
            logger.warning(f"Rename failed - target exists: {new_path}")
            return RenameResult(
                success=False,
                old_path=str(old_path),
                error=f"Target file already exists: {new_path}"
            )

        # Rename/move the file
        logger.info(f"Renaming: '{old_path.name}' -> '{new_name}'")
        shutil.move(str(old_path), str(new_path))

        return RenameResult(
            success=True,
            old_path=str(old_path),
            new_path=str(new_path)
        )

    except Exception as e:
        logger.error(f"Rename error for {old_path}: {str(e)}")
        return RenameResult(
            success=False,
            old_path=str(old_path),
            error=str(e)
        )


def rename_movie(
    file_path: Path,
    title: str,
    year: Optional[int] = None,
    file_pattern: str = "{title} ({year})",
    quality: Optional[str] = None,
    resolution: Optional[str] = None,
    edition: Optional[str] = None,
    release_group: Optional[str] = None,
) -> RenameResult:
    """
    Rename a movie file in place (same folder).
    Does not reorganize into folders - just renames the file.
    """
    extension = file_path.suffix

    new_filename = get_movie_filename(
        title=title,
        year=year,
        extension=extension,
        pattern=file_pattern,
        quality=quality,
        resolution=resolution,
        edition=edition,
        release_group=release_group,
    )

    # Rename in the same folder (no folder reorganization)
    return rename_file(file_path, new_filename)


def rename_movie_with_folder(
    file_path: Path,
    title: str,
    year: Optional[int] = None,
    file_pattern: str = "{title} ({year})",
    folder_pattern: str = "{title} ({year})",
    quality: Optional[str] = None,
    resolution: Optional[str] = None,
    edition: Optional[str] = None,
    release_group: Optional[str] = None,
) -> RenameResult:
    """
    Rename a movie file and organize into a folder.
    Use this when you want to create a movie folder structure.
    """
    extension = file_path.suffix

    # Create movie folder
    folder_name = get_movie_folder(title, year, folder_pattern)
    new_folder = file_path.parent / folder_name
    new_filename = get_movie_filename(
        title=title,
        year=year,
        extension=extension,
        pattern=file_pattern,
        quality=quality,
        resolution=resolution,
        edition=edition,
        release_group=release_group,
    )
    return rename_file(
        file_path,
        new_filename,
        create_folder=True,
        new_folder=new_folder)


def rename_episode(
    file_path: Path,
    show_title: str,
    season_number: int,
    episode_number: int,
    episode_title: Optional[str] = None,
    episode_pattern: str = "{show} - S{season:02d}E{episode:02d} - {title}",
    organize_in_season_folder: bool = True,
    season_folder_pattern: str = "Season {season:02d}",
    quality: Optional[str] = None,
    resolution: Optional[str] = None,
    release_group: Optional[str] = None,
    replace_spaces_with: Optional[str] = None,
    subtitle_path: Optional[Path] = None,
) -> RenameResult:
    """
    Rename an episode file and optionally organize into a season folder.
    Also renames associated subtitle file if provided.
    """
    extension = file_path.suffix
    new_filename = get_episode_filename(
        show_title=show_title,
        season_number=season_number,
        episode_number=episode_number,
        episode_title=episode_title,
        extension=extension,
        pattern=episode_pattern,
        quality=quality,
        resolution=resolution,
        release_group=release_group,
        replace_spaces_with=replace_spaces_with
    )

    if organize_in_season_folder:
        season_folder = get_season_folder(season_number, season_folder_pattern)
        # Assume show folder is the parent
        show_folder = file_path.parent.parent if "Season" in file_path.parent.name else file_path.parent
        new_folder = show_folder / season_folder
        result = rename_file(
            file_path,
            new_filename,
            create_folder=True,
            new_folder=new_folder)
    else:
        new_folder = None
        result = rename_file(file_path, new_filename)

    # Also rename subtitle file if present
    if result.success and subtitle_path and subtitle_path.exists():
        # Generate subtitle filename with same base name but subtitle extension
        subtitle_ext = subtitle_path.suffix
        new_subtitle_filename = get_episode_filename(
            show_title=show_title,
            season_number=season_number,
            episode_number=episode_number,
            episode_title=episode_title,
            extension=subtitle_ext,
            pattern=episode_pattern,
            quality=quality,
            resolution=resolution,
            release_group=release_group,
            replace_spaces_with=replace_spaces_with
        )

        if new_folder:
            rename_file(
                subtitle_path,
                new_subtitle_filename,
                create_folder=True,
                new_folder=new_folder)
        else:
            rename_file(subtitle_path, new_subtitle_filename)

    return result