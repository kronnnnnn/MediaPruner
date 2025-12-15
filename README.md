# MediaPruner

[![CI](https://github.com/YOUR_USERNAME/MediaPruner/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/MediaPruner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MediaPruner is a modern, web-based media management tool. It allows you to organize, search, and manage your movie and TV show collections.

![MediaPruner Screenshot](docs/screenshot.png)

## Key Features

*   **Movie Management:**
    *   Scrape metadata from TMDB (TheMovieDB.org) or OMDb.
    *   Download artwork (fanart, posters, backdrops).
    *   Manual editing of metadata.
    *   Rename movie files and folders based on customizable patterns.
    *   Powerful searching and filtering.
    *   Create NFOs for media centers (Kodi, Plex, etc.).
*   **TV Show Management:**
    *   Robust import engine to detect episode and season information.
    *   Scrape metadata from TMDB or OMDb with provider selection.
    *   Subtitle detection and muxing with FFmpeg.
    *   Download artwork.
    *   Manual editing of metadata.
    *   Create NFOs for media centers.
    *   Episode cleanup (remove unmatched files).
*   **Database:**
    *   SQLite database for lightweight, Docker-integrated storage.
    *   Async database operations for optimal performance.
*   **Library Scanning:**
    *   Automatic detection of movies and TV shows from configured paths.
    *   Support for multiple library paths with media type designation.
    *   Episode parsing with support for multiple naming conventions (S01E01, 1x01, etc.).
*   **File Renaming:**
    *   Pattern-based renaming for movies: `{title} ({year})/{title} ({year}){ext}`.
    *   Pattern-based renaming for episodes: `{show}/Season {season:02d}/{show} - S{season:02d}E{episode:02d} - {title}{ext}`.
    *   Safe filename sanitization.
*   **Subtitle Management:**
    *   Automatic subtitle file detection.
    *   FFmpeg-powered subtitle muxing into video files.
    *   Support for multiple subtitle formats (SRT, ASS, SSA, VTT, SUB).

## Technology Stack

*   **Frontend:** React 18, TypeScript, Tailwind CSS, TanStack Query, React Router
*   **Backend:** Python 3.11+, FastAPI, SQLAlchemy (async), aiosqlite
*   **Database:** SQLite
*   **Media Processing:** FFmpeg (for subtitle muxing)
*   **Build & Development:** Node.js 18+, npm, Vite, concurrently
*   **Deployment:** Docker container with multi-stage build
*   **CI/CD:** GitHub Actions

## Quick Start

### Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/MediaPruner.git
   cd MediaPruner
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your TMDB and OMDb API keys
   ```

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

   This starts both the frontend (http://localhost:5173) and backend (http://localhost:8000) servers with hot reloading.

### Production Build

1. **Build for production:**
   ```bash
   npm run build:prod
   ```

2. **Run production server:**
   ```bash
   npm run start:prod
   ```

### Docker

1. **Build and run with Docker Compose:**
   ```bash
   docker-compose up --build -d
   ```

2. **Or use the quick commands:**
   ```bash
   npm run docker:build
   npm run docker:run
   ```

3. **Access the application:**
   - Application: http://localhost:8000
   - API Docs: http://localhost:8000/docs (development only)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MB_TMDB_API_KEY` | Your TMDB API key (required for metadata scraping) | - |
| `MB_OMDB_API_KEY` | Your OMDb API key (optional, for alternative metadata) | - |
| `MB_DATABASE_URL` | SQLite database URL | `sqlite+aiosqlite:///./data/mediapruner.db` |
| `MB_CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000,http://localhost:5173` |
| `MB_LOG_LEVEL` | Logging level (DEBUG, INFO, WARNING, ERROR) | `INFO` |
| `MB_DEBUG` | Enable debug mode | `false` |
| `MB_DATA_DIR` | Data directory path | `./data` |
| `MB_LOG_DIR` | Log directory path | `./logs` |

## API Endpoints

### Library Management
- `GET /api/library/paths` - Get all configured library paths
- `POST /api/library/paths` - Add a new library path
- `DELETE /api/library/paths/{id}` - Remove a library path
- `POST /api/library/paths/{id}/scan` - Scan a specific library path
- `POST /api/library/scan` - Scan all library paths
- `GET /api/library/stats` - Get library statistics

### Movies
- `GET /api/movies` - Get movies with pagination, sorting, and filtering
- `GET /api/movies/{id}` - Get movie details
- `POST /api/movies/{id}/scrape` - Scrape metadata from TMDB
- `POST /api/movies/{id}/rename` - Rename movie file using pattern
- `POST /api/movies/{id}/nfo` - Generate NFO file for media centers
- `DELETE /api/movies/{id}` - Remove movie from library

### TV Shows
- `GET /api/tvshows` - Get TV shows with pagination, sorting, and filtering
- `GET /api/tvshows/{id}` - Get TV show details
- `GET /api/tvshows/{id}/episodes` - Get episodes for a TV show
- `GET /api/tvshows/{id}/seasons` - Get seasons for a TV show
- `POST /api/tvshows/{id}/scrape` - Scrape show metadata from TMDB
- `POST /api/tvshows/{id}/scrape-episodes` - Scrape episode metadata
- `POST /api/tvshows/{id}/rename` - Rename episode files using pattern
- `POST /api/tvshows/{id}/nfo` - Generate NFO files for media centers

### Health
- `GET /api/health` - Health check endpoint

## Project Structure

```
MediaPruner/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI application entry point
│   │   ├── config.py         # Configuration settings
│   │   ├── database.py       # SQLAlchemy async setup
│   │   ├── models.py         # Database models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── routers/          # API route handlers
│   │   │   ├── health.py
│   │   │   ├── library.py
│   │   │   ├── movies.py
│   │   │   └── tvshows.py
│   │   └── services/         # Business logic
│   │       ├── scanner.py    # File system scanning
│   │       ├── tmdb.py       # TMDB API client
│   │       └── renamer.py    # File renaming logic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/       # UI components
│   │   │   ├── Layout.tsx
│   │   │   ├── MediaCard.tsx
│   │   │   ├── MediaGrid.tsx
│   │   │   ├── MovieDetail.tsx
│   │   │   ├── TVShowDetail.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── pages/            # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Movies.tsx
│   │   │   ├── TVShows.tsx
│   │   │   └── Settings.tsx
│   │   └── services/
│   │       └── api.ts        # API client
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── Dockerfile
├── package.json              # Root package with dev scripts
└── README.md
```

## Getting a TMDB API Key

1. Create an account at [TheMovieDB.org](https://www.themoviedb.org/)
2. Go to Settings → API
3. Request an API key (choose "Developer" option)
4. Copy the API key (v3 auth) and add it to your `.env` file

## Features Roadmap

- [x] SQLite database with SQLAlchemy
- [x] File scanning logic with media detection
- [x] TMDB API integration for metadata scraping
- [x] OMDb API integration as alternative provider
- [x] Movie and TV show detail views
- [x] File renaming with pattern support
- [x] NFO file generation
- [x] Subtitle detection and muxing
- [x] Episode cleanup functionality
- [x] Provider selection for metadata scraping
- [x] Docker production build
- [x] GitHub Actions CI/CD
- [ ] Bulk operations (scrape all, rename all)
- [ ] Subtitle downloading
- [ ] Trailer fetching
- [ ] Movie sets/collections
- [ ] Custom metadata editing
- [ ] Advanced filtering and search
- [ ] Background task queue for long-running operations

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## Getting API Keys

### TMDB API Key

1. Create an account at [TheMovieDB.org](https://www.themoviedb.org/)
2. Go to Settings → API
3. Request an API key (choose "Developer" option)
4. Copy the API key (v3 auth) and add it to your `.env` file

### OMDb API Key

1. Visit [OMDb API](https://www.omdbapi.com/apikey.aspx)
2. Request a free API key
3. Copy the API key and add it to your `.env` file

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
