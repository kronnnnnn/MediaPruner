"""
File Scanner Service - Discovers and parses media files
"""
import re
import os
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

# Import release parsing functions from renamer
from .renamer import parse_release_group, parse_quality, parse_edition, parse_resolution

# Common video extensions
VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.flv', '.webm', '.ts', '.m2ts'}

# Common subtitle extensions
SUBTITLE_EXTENSIONS = {'.srt', '.sub', '.ass', '.ssa', '.vtt'}

# Patterns for parsing TV show episodes (with season and episode)
EPISODE_PATTERNS = [
    # S01E01, S1E1, s01e01, S01E01E02 (multi-episode) - no space
    re.compile(r'[Ss](\d{1,2})[Ee](\d{1,3})(?:[Ee]\d{1,3})*'),
    # S01 E01, S1 E1 (with space between season and episode)
    re.compile(r'[Ss](\d{1,2})\s+[Ee](\d{1,3})'),
    # S01.E01, S01-E01, S01_E01 (with separator)
    re.compile(r'[Ss](\d{1,2})[\.\-_\s][Ee](\d{1,3})'),
    # 1x01, 01x01
    re.compile(r'(\d{1,2})x(\d{1,3})'),
    # Season 1 Episode 1, Season.1.Episode.1
    re.compile(r'[Ss]eason[\s\._-]*(\d{1,2})[\s\._-]*[Ee]pisode[\s\._-]*(\d{1,3})', re.IGNORECASE),
]

# Patterns for episode-only naming (no season in filename)
EPISODE_ONLY_PATTERNS = [
    # E01, E1, Ep01, Ep1, Episode 1, Episode.1
    re.compile(r'(?:^|[\s\._-])(?:[Ee]p?|[Ee]pisode)[\s\._-]*(\d{1,3})(?:[\s\._-]|$)', re.IGNORECASE),
    # Part 1, Part.1, Pt1, Pt.1
    re.compile(r'(?:^|[\s\._-])(?:[Pp]art|[Pp]t)[\s\._-]*(\d{1,3})(?:[\s\._-]|$)', re.IGNORECASE),
]

# Patterns to extract season from folder names
SEASON_FOLDER_PATTERNS = [
    # Season 1, Season.1, Season_1, Season-1
    re.compile(r'[Ss]eason[\s\._-]*(\d{1,2})'),
    # S1, S01 (standalone)
    re.compile(r'^[Ss](\d{1,2})$'),
    # Series 1
    re.compile(r'[Ss]eries[\s\._-]*(\d{1,2})', re.IGNORECASE),
    # Season01, Season1 (no separator)
    re.compile(r'[Ss]eason(\d{1,2})'),
    # Volume 1, Volume.1, Vol 1, Vol.1 - treat as season
    re.compile(r'[Vv]ol(?:ume)?[\s\._-]*(\d{1,2})'),
    # Part 1, Pt 1 - for shows that use Part as season
    re.compile(r'^[Pp](?:art|t)[\s\._-]*(\d{1,2})'),
    # Book 1, Bk 1 - for shows like Avatar that use Book
    re.compile(r'[Bb](?:ook|k)[\s\._-]*(\d{1,2})', re.IGNORECASE),
]

# Fallback pattern for season/episode as 3-4 digit number (risky, only use as last resort)
EPISODE_NUMERIC_PATTERN = re.compile(r'(?:^|[\s\._-])(\d{1,2})(\d{2})(?:[\s\._-]|$)')

# Patterns for parsing movie year
MOVIE_YEAR_PATTERN = re.compile(r'[\(\[\s]?((?:19|20)\d{2})[\)\]\s]?')

# Patterns to clean titles
CLEAN_PATTERNS = [
    re.compile(r'\[.*?\]'),  # Remove [anything]
    re.compile(r'\((?!(?:19|20)\d{2}).*?\)'),  # Remove (anything) except years
    re.compile(r'(?:720p|1080p|2160p|4[kK]|[hH][dD][rR]|[bB]lu[rR]ay|[wW][eE][bB]-?[dD][lL]|[dD][vV][dD]|[xX]264|[xX]265|[hH][eE][vV][cC]|[aA][aA][cC]|[aA][cC]3).*', re.IGNORECASE),
    re.compile(r'[\._]', re.IGNORECASE),  # Replace dots and underscores with spaces
]


@dataclass
class ParsedMovie:
    """Parsed movie information from filename"""
    file_path: str
    file_name: str
    file_size: int
    title: str
    year: Optional[int] = None
    release_group: Optional[str] = None
    quality: Optional[str] = None
    edition: Optional[str] = None
    folder_name: Optional[str] = None  # Parent folder for scraping fallback


@dataclass
class ParsedEpisode:
    """Parsed episode information from filename"""
    file_path: str
    file_name: str
    file_size: int
    show_title: str
    season_number: int
    episode_number: int
    episode_title: Optional[str] = None
    quality: Optional[str] = None
    resolution: Optional[str] = None
    release_group: Optional[str] = None
    subtitle_path: Optional[str] = None  # Path to associated .srt file


@dataclass
class ParsedTVShow:
    """Parsed TV show information"""
    folder_path: str
    folder_name: str
    title: str
    episodes: list[ParsedEpisode]


def is_video_file(path: Path) -> bool:
    """Check if a file is a video file based on extension"""
    return path.suffix.lower() in VIDEO_EXTENSIONS


def is_subtitle_file(path: Path) -> bool:
    """Check if a file is a subtitle file based on extension"""
    return path.suffix.lower() in SUBTITLE_EXTENSIONS


def find_associated_subtitle(video_path: Path) -> Optional[str]:
    """
    Find a subtitle file associated with a video file.
    
    Looks for subtitle files with the same base name as the video file,
    or with common suffixes like .en.srt, .eng.srt, etc.
    
    Args:
        video_path: Path to the video file
        
    Returns:
        Path to the subtitle file as a string, or None if not found
    """
    video_stem = video_path.stem
    video_dir = video_path.parent
    
    # Check for exact match first (video.mkv -> video.srt)
    for ext in SUBTITLE_EXTENSIONS:
        subtitle_path = video_dir / f"{video_stem}{ext}"
        if subtitle_path.exists():
            return str(subtitle_path)
    
    # Check for language-suffixed subtitles (video.en.srt, video.eng.srt, etc.)
    for ext in SUBTITLE_EXTENSIONS:
        for lang_suffix in ['', '.en', '.eng', '.english']:
            subtitle_path = video_dir / f"{video_stem}{lang_suffix}{ext}"
            if subtitle_path.exists():
                return str(subtitle_path)
    
    # Look for any subtitle file that starts with the video name
    for file in video_dir.iterdir():
        if file.is_file() and is_subtitle_file(file):
            if file.stem.startswith(video_stem):
                return str(file)
    
    return None


def clean_title(title: str) -> str:
    """Clean a title by removing common garbage"""
    result = title
    for pattern in CLEAN_PATTERNS:
        result = pattern.sub(' ', result)
    # Clean up whitespace
    result = ' '.join(result.split())
    return result.strip()


def parse_movie_filename(file_path: Path) -> ParsedMovie:
    """Parse movie information from a filename"""
    file_name = file_path.stem
    original_filename = file_path.name
    
    # Try to extract year
    year_match = MOVIE_YEAR_PATTERN.search(file_name)
    year = int(year_match.group(1)) if year_match else None
    
    # Get title (everything before the year, or the whole name)
    if year_match:
        title = file_name[:year_match.start()]
    else:
        title = file_name
    
    title = clean_title(title)
    
    # Parse release info from filename
    release_group = parse_release_group(original_filename)
    quality = parse_quality(original_filename)
    edition = parse_edition(original_filename)
    
    return ParsedMovie(
        file_path=str(file_path),
        file_name=original_filename,
        file_size=file_path.stat().st_size if file_path.exists() else 0,
        title=title or file_path.stem,
        year=year,
        release_group=release_group,
        quality=quality,
        edition=edition
    )


def parse_episode_filename(file_path: Path, show_folder: str = "", season_from_folder: Optional[int] = None) -> Optional[ParsedEpisode]:
    """
    Parse episode information from a filename.
    
    Handles various naming formats:
    - S01E01 format (standard)
    - 1x01 format
    - Episode-only formats (E01, Episode 1) when season is from folder
    - Numeric formats (101 = Season 1 Episode 01)
    
    Args:
        file_path: Path to the video file
        show_folder: Name of the show's root folder
        season_from_folder: Season number detected from folder structure
    """
    file_name = file_path.stem
    
    # Try each pattern to extract season and episode from filename
    season = None
    episode = None
    match_pos = len(file_name)  # Track where the match occurred for title extraction
    
    # First try patterns that include both season and episode
    for pattern in EPISODE_PATTERNS:
        match = pattern.search(file_name)
        if match:
            season = int(match.group(1))
            episode = int(match.group(2))
            match_pos = match.start()
            break
    
    # If no season/episode found, try episode-only patterns
    if episode is None:
        for pattern in EPISODE_ONLY_PATTERNS:
            match = pattern.search(file_name)
            if match:
                episode = int(match.group(1))
                match_pos = match.start()
                # Use season from folder if available, otherwise default to 1
                season = season_from_folder if season_from_folder is not None else 1
                break
    
    # Last resort: try numeric pattern (e.g., 101 = S01E01)
    if episode is None:
        match = EPISODE_NUMERIC_PATTERN.search(file_name)
        if match:
            season = int(match.group(1))
            episode = int(match.group(2))
            match_pos = match.start()
    
    # If we still don't have an episode number, check if season from folder helps
    if episode is None:
        return None
    
    # If we have episode but no season, use folder-derived season or default to 1
    if season is None:
        season = season_from_folder if season_from_folder is not None else 1
    
    # Get show title from folder name or filename
    if show_folder:
        show_title = clean_title(show_folder)
    else:
        # Try to extract from filename (before the episode pattern match)
        show_title = clean_title(file_name[:match_pos])
        if not show_title:
            show_title = clean_title(file_name)
    
    # Extract episode title from filename
    # Episode title typically appears after the season/episode pattern
    episode_title = None
    
    # Find where the season/episode pattern ends
    match_end = 0
    for pattern in EPISODE_PATTERNS:
        match = pattern.search(file_name)
        if match:
            match_end = match.end()
            break
    
    if match_end == 0:
        for pattern in EPISODE_ONLY_PATTERNS:
            match = pattern.search(file_name)
            if match:
                match_end = match.end()
                break
    
    if match_end > 0:
        # Get everything after the episode pattern
        after_episode = file_name[match_end:]
        
        # Common patterns to remove from title extraction
        # Remove quality indicators and everything after
        quality_pattern = re.compile(
            r'[\(\[]?\d{3,4}p|'  # 480p, 720p, 1080p, 2160p
            r'[\(\[]?(?:WEB|HDTV|BluRay|BRRip|DVDRip|HDRip|WEBRip|WEB-DL)[\)\]]?|'
            r'[\(\[]?(?:x264|x265|HEVC|H\.?264|H\.?265|AVC)[\)\]]?|'
            r'[\(\[]?(?:AAC|AC3|DTS|DD5\.?1)[\)\]]?',
            re.IGNORECASE
        )
        
        # Find where quality info starts
        quality_match = quality_pattern.search(after_episode)
        if quality_match:
            after_episode = after_episode[:quality_match.start()]
        
        # Clean up the episode title
        # Remove leading separators like " - ", " _ ", etc.
        episode_title = re.sub(r'^[\s\-\_\.\,]+', '', after_episode)
        # Remove trailing separators
        episode_title = re.sub(r'[\s\-\_\.\,]+$', '', episode_title)
        # Replace multiple separators with single space
        episode_title = re.sub(r'[\._]+', ' ', episode_title)
        episode_title = re.sub(r'\s+', ' ', episode_title)
        episode_title = episode_title.strip()
        
        # If the title is empty or too short, set to None
        if not episode_title or len(episode_title) < 2:
            episode_title = None
    
    # Parse release info from filename and show folder
    original_filename = file_path.name
    quality = parse_quality(original_filename)
    resolution = parse_resolution(original_filename)
    release_group = parse_release_group(original_filename)
    
    # If not found in filename, try the show folder name
    if not release_group and show_folder:
        release_group = parse_release_group(show_folder)
    if not quality and show_folder:
        quality = parse_quality(show_folder)
    if not resolution and show_folder:
        resolution = parse_resolution(show_folder)
    
    # Find associated subtitle file
    subtitle_path = find_associated_subtitle(file_path)
    
    return ParsedEpisode(
        file_path=str(file_path),
        file_name=file_path.name,
        file_size=file_path.stat().st_size if file_path.exists() else 0,
        show_title=show_title,
        season_number=season,
        episode_number=episode,
        episode_title=episode_title,
        quality=quality,
        resolution=resolution,
        release_group=release_group,
        subtitle_path=subtitle_path
    )


def scan_movie_directory(directory: Path) -> list[ParsedMovie]:
    """
    Scan a directory for movie files.
    
    Strategy:
    - Movies directly in the library folder: each video file is a movie
    - Movies in subfolders: the largest video file in each subfolder is the movie
      (this handles movie folders with extras, samples, etc.)
    """
    movies = []
    
    if not directory.exists():
        return movies
    
    # First, handle video files directly in the library root folder
    # Each video file in the root is treated as a separate movie
    for item in directory.iterdir():
        if item.is_file() and is_video_file(item):
            try:
                parsed = parse_movie_filename(item)
                movies.append(parsed)
            except OSError:
                continue
    
    # Then, handle subfolders - each subfolder with videos is treated as one movie
    # We take the largest video file in each folder
    for item in directory.iterdir():
        if item.is_dir():
            # Walk through this subfolder tree
            folder_movies = _scan_movie_subfolder(item, item.name)
            movies.extend(folder_movies)
    
    return movies


def _scan_movie_subfolder(folder: Path, movie_folder_name: str) -> list[ParsedMovie]:
    """
    Scan a movie subfolder. 
    Returns the largest video file as the movie.
    """
    movies = []
    
    # Collect all video files in this folder tree
    all_videos = []
    for root, dirs, files in os.walk(folder):
        root_path = Path(root)
        for f in files:
            file_path = root_path / f
            if is_video_file(file_path):
                try:
                    size = file_path.stat().st_size
                    all_videos.append((file_path, size))
                except OSError:
                    continue
    
    if all_videos:
        # Get the largest video file
        largest_file, largest_size = max(all_videos, key=lambda x: x[1])
        
        # Use folder name if it looks like a movie name (has year), otherwise use filename
        if MOVIE_YEAR_PATTERN.search(movie_folder_name):
            parsed = parse_movie_filename(Path(movie_folder_name + largest_file.suffix))
            parsed.file_path = str(largest_file)
            parsed.file_name = largest_file.name
            parsed.file_size = largest_size
        else:
            parsed = parse_movie_filename(largest_file)
        
        # Always store the folder name for scraping fallback
        parsed.folder_name = movie_folder_name
        
        movies.append(parsed)
    
    return movies


def _extract_season_from_folder(folder_name: str) -> Optional[int]:
    """
    Try to extract a season number from a folder name.
    
    Handles various formats:
    - Season 1, Season.1, Season_1
    - S1, S01
    - Series 1
    """
    for pattern in SEASON_FOLDER_PATTERNS:
        match = pattern.search(folder_name)
        if match:
            return int(match.group(1))
    return None


def scan_tvshow_directory(directory: Path) -> list[ParsedTVShow]:
    """
    Scan a directory for TV shows.
    
    Handles various folder structures:
    1. Show Folder/Season X/episodes - Season subfolders
    2. Show Folder/episodes - All episodes in one folder
    3. Show Folder/SxxExx files - Files with season in name
    4. Show Folder/Episode X files - Episode-only naming (assumes Season 1)
    
    The scanner:
    - Uses the first-level subfolder as the show name
    - Detects season from intermediate "Season X" folders
    - Falls back to extracting season from filename
    - Supports episode-only naming when season is detected from folder
    """
    shows: dict[str, ParsedTVShow] = {}
    
    if not directory.exists():
        return []
    
    # Walk through all subdirectories
    for root, dirs, files in os.walk(directory):
        root_path = Path(root)
        
        # Find video files
        for f in files:
            file_path = root_path / f
            if not is_video_file(file_path):
                continue
            
            # Determine folder structure
            relative = root_path.relative_to(directory)
            parts = relative.parts
            
            show_folder = ""
            show_folder_path = directory
            season_from_folder = None
            
            if len(parts) >= 1:
                # First part is always the show folder
                show_folder = parts[0]
                show_folder_path = directory / show_folder
                
                # Check for season in subsequent folder names
                for part in parts[1:]:
                    detected_season = _extract_season_from_folder(part)
                    if detected_season is not None:
                        season_from_folder = detected_season
                        break
            else:
                # File is directly in the library directory - unusual but handle it
                # Try to get show name from filename
                show_folder = ""
            
            # Parse the episode with folder context
            parsed = parse_episode_filename(file_path, show_folder, season_from_folder)
            if parsed is None:
                # If standard parsing failed, this file might not be a TV episode
                continue
            
            # Add to or create show
            show_key = str(show_folder_path) if show_folder else f"_direct_{parsed.show_title}"
            if show_key not in shows:
                shows[show_key] = ParsedTVShow(
                    folder_path=str(show_folder_path) if show_folder else str(directory),
                    folder_name=show_folder or parsed.show_title,
                    title=clean_title(show_folder) if show_folder else parsed.show_title,
                    episodes=[]
                )
            
            shows[show_key].episodes.append(parsed)
    
    # Sort episodes within each show by season and episode number
    for show in shows.values():
        show.episodes.sort(key=lambda ep: (ep.season_number, ep.episode_number))
    
    return list(shows.values())
