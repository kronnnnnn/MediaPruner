from pydantic_settings import BaseSettings
from pathlib import Path
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings with environment variable support"""

    # Application info
    app_name: str = "MediaPruner"
    app_version: str = "0.1.0"

    # API Keys (stored in database, these are fallbacks)
    tmdb_api_key: Optional[str] = None
    omdb_api_key: Optional[str] = None

    # Tautulli integration
    tautulli_host: Optional[str] = None
    tautulli_api_key: Optional[str] = None

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = os.getenv("MB_DEBUG", "true").lower() == "true"

    # CORS - in production, set this to your actual domain
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173"]

    # Database
    # Default to the stable backend data dir (absolute path) so DB location does not depend on CWD.
    # Override with MB_DATABASE_URL for production DBs if desired.
    _default_data_dir = Path(__file__).parent.parent / "data"
    database_url: str = f"sqlite+aiosqlite:///{_default_data_dir / 'mediapruner.db'}"

    # File paths
    data_dir: Path = _default_data_dir
    log_dir: Path = Path("./logs")

    # Logging
    log_level: str = "INFO"
    log_to_file: bool = True

    class Config:
        env_file = ".env"
        env_prefix = "MB_"
        case_sensitive = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure directories exist
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if self.log_to_file:
            self.log_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()