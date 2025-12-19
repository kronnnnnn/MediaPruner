from pydantic import BaseModel
from typing import Optional, Literal
from datetime import date, datetime


# Library Path Schemas
class LibraryPathCreate(BaseModel):
    path: str
    media_type: Literal["movie", "tv"]
    name: Optional[str] = None


class LibraryPathResponse(BaseModel):
    id: int
    path: str
    media_type: str
    name: str
    exists: bool = True
    file_count: int = 0
    created_at: datetime
    enqueued_task_id: Optional[int] = None

    class Config:
        from_attributes = True


# Movie Schemas
class MovieBase(BaseModel):
    title: str
    original_title: Optional[str] = None
    year: Optional[int] = None
    release_date: Optional[date] = None
    runtime: Optional[int] = None
    overview: Optional[str] = None
    tagline: Optional[str] = None
    genres: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    tmdb_id: Optional[int] = None
    imdb_id: Optional[str] = None
    option_4: Optional[str] = None

    # Ratings - TMDB
    rating: Optional[float] = None  # TMDB rating (0-10)
    votes: Optional[int] = None  # TMDB vote count

    # Ratings - Additional sources (via OMDb)
    imdb_rating: Optional[float] = None  # IMDB rating (0-10)
    imdb_votes: Optional[int] = None  # IMDB vote count
    # Rotten Tomatoes Tomatometer (0-100)
    rotten_tomatoes_score: Optional[int] = None
    # Rotten Tomatoes Audience Score (0-100)
    rotten_tomatoes_audience: Optional[int] = None
    metacritic_score: Optional[int] = None  # Metacritic Metascore (0-100)


class MovieCreate(MovieBase):
    file_path: str
    file_name: str
    library_path_id: int


class MovieUpdate(BaseModel):
    title: Optional[str] = None
    original_title: Optional[str] = None
    year: Optional[int] = None
    overview: Optional[str] = None
    tagline: Optional[str] = None
    genres: Optional[str] = None
    # Allow updating rating_key and option_4 from the frontend
    rating_key: Optional[int] = None
    option_4: Optional[str] = None


class MovieResponse(MovieBase):
    id: int
    file_path: str
    file_name: str
    folder_name: Optional[str] = None
    file_size: int
    has_nfo: bool
    has_trailer: bool
    scraped: bool
    media_info_scanned: bool = False
    created_at: datetime
    updated_at: datetime

    # Release info (parsed from filename)
    release_group: Optional[str] = None
    edition: Optional[str] = None
    quality: Optional[str] = None

    # Technical media info
    duration: Optional[int] = None
    video_codec: Optional[str] = None
    video_profile: Optional[str] = None
    video_resolution: Optional[str] = None
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    video_aspect_ratio: Optional[str] = None
    video_bitrate: Optional[int] = None
    video_framerate: Optional[str] = None
    video_hdr: Optional[str] = None
    audio_codec: Optional[str] = None
    audio_channels: Optional[str] = None
    audio_bitrate: Optional[int] = None
    audio_language: Optional[str] = None
    audio_tracks: Optional[str] = None
    subtitle_languages: Optional[str] = None
    subtitle_count: int = 0
    subtitle_path: Optional[str] = None
    has_subtitle: bool = False
    container: Optional[str] = None
    overall_bitrate: Optional[int] = None

    # Watch history (from Tautulli)
    watched: bool = False
    watch_count: int = 0
    last_watched_date: Optional[datetime] = None
    last_watched_user: Optional[str] = None
    rating_key: Optional[int] = None

    class Config:
        from_attributes = True


# Queue schemas
class QueueItemResponse(BaseModel):
    id: int
    index: int
    status: str
    payload: Optional[str]
    result: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


class QueueTaskResponse(BaseModel):
    id: int
    type: str
    status: str
    created_by: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    total_items: int
    completed_items: int
    meta: Optional[str]
    items: Optional[list[QueueItemResponse]] = None

    class Config:
        from_attributes = True


class MovieListResponse(BaseModel):
    movies: list[MovieResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# TV Show Schemas
class TVShowBase(BaseModel):
    title: str
    original_title: Optional[str] = None
    first_air_date: Optional[date] = None
    last_air_date: Optional[date] = None
    status: Optional[str] = None
    overview: Optional[str] = None
    genres: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    tmdb_id: Optional[int] = None
    tvdb_id: Optional[int] = None
    imdb_id: Optional[str] = None
    rating: Optional[float] = None
    votes: Optional[int] = None


class TVShowUpdate(BaseModel):
    title: Optional[str] = None
    original_title: Optional[str] = None
    overview: Optional[str] = None
    genres: Optional[str] = None


class SeasonResponse(BaseModel):
    id: int
    season_number: int
    name: Optional[str]
    overview: Optional[str]
    air_date: Optional[date]
    poster_path: Optional[str]
    episode_count: int

    class Config:
        from_attributes = True


class EpisodeResponse(BaseModel):
    id: int
    tvshow_id: int
    season_number: int
    episode_number: int
    title: Optional[str]
    air_date: Optional[date]
    overview: Optional[str]
    runtime: Optional[int]
    still_path: Optional[str]
    file_path: Optional[str]
    file_name: Optional[str]
    file_size: int
    has_nfo: bool
    media_info_scanned: bool = False

    # Subtitle file info
    subtitle_path: Optional[str] = None
    has_subtitle: bool = False

    # Technical media info
    duration: Optional[int] = None
    video_codec: Optional[str] = None
    video_resolution: Optional[str] = None
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    audio_codec: Optional[str] = None
    audio_channels: Optional[str] = None
    audio_language: Optional[str] = None
    subtitle_languages: Optional[str] = None
    container: Optional[str] = None

    class Config:
        from_attributes = True


class TVShowResponse(TVShowBase):
    id: int
    folder_path: str
    folder_name: str
    season_count: int
    episode_count: int
    scraped: bool
    created_at: datetime
    updated_at: datetime
    seasons: list[SeasonResponse] = []

    class Config:
        from_attributes = True


class TVShowListResponse(BaseModel):
    shows: list[TVShowResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# Scan Response
class ScanResult(BaseModel):
    path: str
    media_type: str
    movies_found: int = 0
    tvshows_found: int = 0
    episodes_found: int = 0
    errors: list[str] = []
