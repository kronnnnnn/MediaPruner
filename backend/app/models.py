from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.database import Base


class MediaType(enum.Enum):
    MOVIE = "movie"
    TV = "tv"


class LibraryPath(Base):
    __tablename__ = "library_paths"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String(1024), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    media_type = Column(SQLEnum(MediaType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow)

    # Relationships
    movies = relationship(
        "Movie",
        back_populates="library_path",
        cascade="all, delete-orphan")
    tvshows = relationship(
        "TVShow",
        back_populates="library_path",
        cascade="all, delete-orphan")


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    library_path_id = Column(
        Integer,
        ForeignKey("library_paths.id"),
        nullable=False)

    # File info
    file_path = Column(String(1024), nullable=False, unique=True)
    file_name = Column(String(512), nullable=False)
    # Parent folder name for scraping fallback
    folder_name = Column(String(512))
    file_size = Column(Integer, default=0)

    # Release info (parsed from filename)
    release_group = Column(String(128))  # e.g., HushRips, RARBG, SPARKS
    edition = Column(String(128))  # e.g., Extended, Director's Cut, Unrated
    quality = Column(String(64))  # e.g., BluRay, WEB-DL, HDRip

    # Metadata
    title = Column(String(512), nullable=False)
    original_title = Column(String(512))
    year = Column(Integer)
    release_date = Column(Date)
    runtime = Column(Integer)  # in minutes
    overview = Column(Text)
    tagline = Column(String(512))
    genres = Column(String(512))  # Comma-separated

    # Artwork
    poster_path = Column(String(512))
    backdrop_path = Column(String(512))

    # External IDs
    tmdb_id = Column(Integer, index=True)
    imdb_id = Column(String(20), index=True)

    # Ratings - TMDB
    rating = Column(Float)  # TMDB rating (0-10)
    votes = Column(Integer)  # TMDB vote count

    # Ratings - Additional sources (via OMDb)
    imdb_rating = Column(Float)  # IMDB rating (0-10)
    imdb_votes = Column(Integer)  # IMDB vote count
    # Rotten Tomatoes Tomatometer (0-100)
    rotten_tomatoes_score = Column(Integer)
    # Rotten Tomatoes Audience Score (0-100)
    rotten_tomatoes_audience = Column(Integer)
    metacritic_score = Column(Integer)  # Metacritic Metascore (0-100)

    # Technical Media Info
    duration = Column(Integer)  # Duration in seconds (from file)
    video_codec = Column(String(64))  # e.g., HEVC, AVC, VP9
    video_profile = Column(String(64))  # e.g., Main 10@L4
    video_resolution = Column(String(32))  # e.g., 1920x800
    video_width = Column(Integer)
    video_height = Column(Integer)
    video_aspect_ratio = Column(String(16))  # e.g., 2.40:1
    video_bitrate = Column(Integer)  # in kbps
    video_framerate = Column(String(16))  # e.g., 23.976
    # HDR format if present (HDR10, Dolby Vision, etc.)
    video_hdr = Column(String(32))

    audio_codec = Column(String(64))  # e.g., AAC, AC3, DTS
    audio_channels = Column(String(16))  # e.g., 5.1, 7.1, Stereo
    audio_bitrate = Column(Integer)  # in kbps
    audio_language = Column(String(128))  # Primary audio language
    audio_tracks = Column(Text)  # JSON array of all audio tracks

    subtitle_languages = Column(Text)  # JSON array of subtitle languages
    subtitle_count = Column(Integer, default=0)
    # Path to associated external subtitle file
    subtitle_path = Column(String(1024))
    has_subtitle = Column(Boolean, default=False)  # Has external subtitle file

    container = Column(String(32))  # e.g., Matroska, MP4
    overall_bitrate = Column(Integer)  # in kbps

    # Status
    has_nfo = Column(Boolean, default=False)
    has_trailer = Column(Boolean, default=False)
    scraped = Column(Boolean, default=False)
    media_info_scanned = Column(Boolean, default=False)
    # Set when analysis failed
    media_info_failed = Column(Boolean, default=False)

    # Watch History (from Tautulli)
    watched = Column(Boolean, default=False)  # Has been watched at least once
    watch_count = Column(Integer, default=0)  # Total number of times watched
    # When it was last watched
    last_watched_date = Column(DateTime, nullable=True)
    last_watched_user = Column(String(128),
                               nullable=True)  # Who last watched it
    # Plex rating key for this media item (if known)
    rating_key = Column(Integer, nullable=True, index=True)
    # Optional custom external ID (Option 4)
    option_4 = Column(String(255), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow)

    # Relationships
    library_path = relationship("LibraryPath", back_populates="movies")


class TVShow(Base):
    __tablename__ = "tvshows"

    id = Column(Integer, primary_key=True, index=True)
    library_path_id = Column(
        Integer,
        ForeignKey("library_paths.id"),
        nullable=False)

    # File info
    folder_path = Column(String(1024), nullable=False, unique=True)
    folder_name = Column(String(512), nullable=False)

    # Metadata
    title = Column(String(512), nullable=False)
    original_title = Column(String(512))
    first_air_date = Column(Date)
    last_air_date = Column(Date)
    status = Column(String(50))  # Continuing, Ended, etc.
    overview = Column(Text)
    genres = Column(String(512))  # Comma-separated

    # Artwork
    poster_path = Column(String(512))
    backdrop_path = Column(String(512))

    # External IDs
    tmdb_id = Column(Integer, index=True)
    tvdb_id = Column(Integer, index=True)
    imdb_id = Column(String(20), index=True)

    # Ratings
    rating = Column(Float)
    votes = Column(Integer)

    # Counts
    season_count = Column(Integer, default=0)
    episode_count = Column(Integer, default=0)

    # Status
    scraped = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow)

    # Relationships
    library_path = relationship("LibraryPath", back_populates="tvshows")
    episodes = relationship(
        "Episode",
        back_populates="tvshow",
        cascade="all, delete-orphan")
    seasons = relationship(
        "Season",
        back_populates="tvshow",
        cascade="all, delete-orphan")


class Season(Base):
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True, index=True)
    tvshow_id = Column(Integer, ForeignKey("tvshows.id"), nullable=False)

    season_number = Column(Integer, nullable=False)
    name = Column(String(255))
    overview = Column(Text)
    air_date = Column(Date)
    poster_path = Column(String(512))
    episode_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow)

    # Relationships
    tvshow = relationship("TVShow", back_populates="seasons")


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(Integer, primary_key=True, index=True)
    tvshow_id = Column(Integer, ForeignKey("tvshows.id"), nullable=False)

    # File info
    file_path = Column(String(1024), unique=True)
    file_name = Column(String(512))
    file_size = Column(Integer, default=0)

    # Subtitle info
    subtitle_path = Column(String(1024))  # Path to associated .srt file
    has_subtitle = Column(Boolean, default=False)

    # Episode info
    season_number = Column(Integer, nullable=False)
    episode_number = Column(Integer, nullable=False)
    title = Column(String(512))
    air_date = Column(Date)
    overview = Column(Text)
    runtime = Column(Integer)  # in minutes
    still_path = Column(String(512))

    # Technical Media Info
    duration = Column(Integer)  # Duration in seconds (from file)
    video_codec = Column(String(64))
    video_resolution = Column(String(32))
    video_width = Column(Integer)
    video_height = Column(Integer)
    audio_codec = Column(String(64))
    audio_channels = Column(String(16))
    audio_language = Column(String(128))
    subtitle_languages = Column(Text)
    container = Column(String(32))

    # Status
    has_nfo = Column(Boolean, default=False)
    media_info_scanned = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow)

    # Relationships
    tvshow = relationship("TVShow", back_populates="episodes")


class AppSettings(Base):
    """Application settings stored in database"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), nullable=False, unique=True, index=True)
    value = Column(Text, nullable=True)
    description = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow)


class LogLevel(enum.Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LogEntry(Base):
    """Application log entries stored in database"""
    __tablename__ = "log_entries"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    level = Column(String(20), nullable=False, index=True)
    logger_name = Column(String(255), nullable=False, index=True)
    message = Column(Text, nullable=False)
    module = Column(String(255))
    function = Column(String(255))
    line_number = Column(Integer)
    exception = Column(Text)  # Stack trace if an exception occurred
