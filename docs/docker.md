# Docker & Unraid Deployment

This document describes recommended steps to run MediaPruner in Docker (including Unraid).

Quick start (development):
- Build and run with docker-compose:

  docker-compose up --build

Key environment variables
- `MB_TMDB_API_KEY` - TMDB API key (required for TMDb operations)
- `MB_OMDB_API_KEY` - OMDb API key (optional)
- `MB_DATABASE_URL` - Database URL (e.g., `sqlite+aiosqlite:///./data/mediapruner.db` or a Postgres URL)
- `PUID` / `PGID` - If you need files to be owned by a specific host uid/gid (useful on Unraid)
- `MB_DATA_DIR` / `MB_LOG_DIR` - Paths inside container for persistent storage

Notes for Unraid
- Map `MB_DATA_DIR` and `MB_LOG_DIR` to persistent host paths (use named volumes or host paths).
- Avoid running container as `privileged: true` unless absolutely necessary.
- Use `PUID`/`PGID` to ensure file ownership matches your host share permissions.

Upgrading & Migrations
- Set `MB_MIGRATE=true` in the container environment to run DB migrations on startup once.

Building images
- A GitHub Actions workflow (`.github/workflows/docker-build.yml`) builds multi-arch images and pushes to GitHub Container Registry (ghcr.io).

