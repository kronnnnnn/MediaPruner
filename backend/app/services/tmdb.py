"""
TMDB API Service - Fetches metadata from TheMovieDB.org
"""
import httpx
import logging
from typing import Optional
from datetime import date
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings

logger = logging.getLogger(__name__)


TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"


async def get_tmdb_api_key_from_db(db: AsyncSession) -> Optional[str]:
    """Get TMDB API key from database settings"""
    from app.models import AppSettings

    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "tmdb_api_key")
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


@dataclass
class TMDBMovieResult:
    """Movie metadata from TMDB"""
    tmdb_id: int
    title: str
    original_title: Optional[str]
    overview: Optional[str]
    tagline: Optional[str]
    release_date: Optional[date]
    runtime: Optional[int]
    genres: list[str]
    poster_path: Optional[str]
    backdrop_path: Optional[str]
    imdb_id: Optional[str]
    rating: Optional[float]
    votes: Optional[int]


@dataclass
class TMDBTVShowResult:
    """TV Show metadata from TMDB"""
    tmdb_id: int
    title: str
    original_title: Optional[str]
    overview: Optional[str]
    first_air_date: Optional[date]
    last_air_date: Optional[date]
    status: Optional[str]
    genres: list[str]
    poster_path: Optional[str]
    backdrop_path: Optional[str]
    imdb_id: Optional[str]
    rating: Optional[float]
    votes: Optional[int]
    season_count: int
    episode_count: int
    seasons: list[dict]


@dataclass
class TMDBEpisodeResult:
    """Episode metadata from TMDB"""
    season_number: int
    episode_number: int
    title: str
    overview: Optional[str]
    air_date: Optional[date]
    runtime: Optional[int]
    still_path: Optional[str]


def get_full_image_url(
        path: Optional[str],
        size: str = "w500") -> Optional[str]:
    """Convert TMDB image path to full URL"""
    if not path:
        return None
    return f"{TMDB_IMAGE_BASE}/{size}{path}"


class TMDBService:
    """Service for interacting with TMDB API"""

    def __init__(self, api_key: Optional[str] = None):
        # Use provided API key, or fall back to config
        self.api_key = api_key or settings.tmdb_api_key
        # Detect if this is a Bearer token (JWT starts with eyJ)
        self.use_bearer = self.api_key.startswith(
            "eyJ") if self.api_key else False
        self.client = httpx.AsyncClient(timeout=30.0)
        # diagnostics: store last search variants tried
        self.last_search_tried: list | None = None
    
    @classmethod
    async def create_with_db_key(cls, db: AsyncSession) -> "TMDBService":
        """Factory method to create TMDBService with API key from database"""
        db_key = await get_tmdb_api_key_from_db(db)
        # Prefer database key, fall back to environment variable
        return cls(api_key=db_key or settings.tmdb_api_key)

    @property
    def is_configured(self) -> bool:
        """Check if TMDB API key is configured"""
        return bool(self.api_key)

    async def _request(
            self,
            endpoint: str,
            params: dict = None) -> Optional[dict]:
        """Make a request to TMDB API"""
        if not self.api_key:
            logger.warning("TMDB API key not configured")
            return None

        params = params or {}
        headers = {}

        if self.use_bearer:
            # Use Bearer token authentication (for API Read Access Token)
            headers["Authorization"] = f"Bearer {self.api_key}"
        else:
            # Use API key query parameter
            params["api_key"] = self.api_key

        try:
            url = f"{TMDB_BASE_URL}{endpoint}"
            logger.debug(f"TMDB request: {url} params={params} (bearer={self.use_bearer})")
            response = await self.client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                f"TMDB API error: {e.response.status_code} - {e.response.text}")
            return None
        except httpx.HTTPError as e:
            logger.error(f"TMDB HTTP error: {e}")
            return None

    async def search_movie(
            self,
            query: str,
            year: Optional[int] = None) -> list[dict]:
        """Search for movies by title"""
        params = {"query": query}
        if year:
            params["year"] = year

        data = await self._request("/search/movie", params)
        if not data:
            return []

        return data.get("results", [])

    async def get_movie_details(
            self, tmdb_id: int) -> Optional[TMDBMovieResult]:
        """Get detailed movie information"""
        data = await self._request(f"/movie/{tmdb_id}", {"append_to_response": "external_ids"})
        if not data:
            return None

        # Parse release date
        release_date = None
        if data.get("release_date"):
            try:
                release_date = date.fromisoformat(data["release_date"])
            except ValueError:
                pass

        return TMDBMovieResult(
            tmdb_id=data["id"],
            title=data.get("title", ""),
            original_title=data.get("original_title"),
            overview=data.get("overview"),
            tagline=data.get("tagline"),
            release_date=release_date,
            runtime=data.get("runtime"),
            genres=[g["name"] for g in data.get("genres", [])],
            poster_path=get_full_image_url(data.get("poster_path")),
            backdrop_path=get_full_image_url(data.get("backdrop_path"), "w1280"),
            imdb_id=data.get("external_ids", {}).get("imdb_id"),
            rating=data.get("vote_average"),
            votes=data.get("vote_count"),
        )

    
    def _title_variants(self, title: str) -> list[str]:
        """Generate a set of title variants to improve matching."""
        if not title:
            return []
        variants = [title]
        # Remove parenthetical content e.g. "Title (2013)" or "Title (something)"
        import re
        stripped = re.sub(r"\s*\([^\)]*\)", "", title).strip()
        if stripped and stripped not in variants:
            variants.append(stripped)
        # Remove leading articles
        for art in ("The ", "A ", "An "):
            if title.startswith(art):
                v = title[len(art):].strip()
                if v and v not in variants:
                    variants.append(v)
        # Consider portion before colon
        if ':' in title:
            before = title.split(':', 1)[0].strip()
            if before and before not in variants:
                variants.append(before)
        # Clean punctuation-only variants
        cleaned = re.sub(r"[^0-9A-Za-z ]+", "", title).strip()
        if cleaned and cleaned not in variants:
            variants.append(cleaned)
        return variants

    async def search_movie_and_get_details(self, title: str, year: Optional[int] = None) -> Optional[TMDBMovieResult]:
        """Search for a movie and get its details using multiple heuristics to improve match rate."""
        tried = []
        # Try several title variants and year combinations
        import difflib

        def pick_best_result(results_list, target_title, target_year=None):
            """Pick best match from TMDB search results using simple fuzzy matching."""
            best = None
            best_score = 0.0
            for r in results_list:
                name = r.get('title') or r.get('name') or ''
                # Compute similarity
                score = difflib.SequenceMatcher(None, target_title.lower(), name.lower()).ratio()
                # Boost score if the year matches (release_date or first_air_date)
                year_score = 0.0
                try:
                    if target_year:
                        rd = r.get('release_date') or r.get('first_air_date')
                        if rd:
                            rd_year = int(rd.split('-')[0])
                            if rd_year == target_year:
                                year_score = 0.15
                except Exception:
                    pass
                final = score + year_score
                if final > best_score:
                    best_score = final
                    best = r
            # Accept if above threshold (0.5) otherwise None
            return best if best_score >= 0.5 else None

        for t in self._title_variants(title):
            # Try with year first
            if year:
                tried.append({"query": t, "year": year})
                results = await self.search_movie(t, year)
                if results:
                    best = pick_best_result(results, t, year)
                    if best:
                        # Record tried variants for diagnostics and return details
                        self.last_search_tried = tried
                        return await self.get_movie_details(best["id"])
                    # fallback to first
                    self.last_search_tried = tried
                    return await self.get_movie_details(results[0]["id"])
            # Try without year
            tried.append({"query": t, "year": None})
            results = await self.search_movie(t)
            if results:
                best = pick_best_result(results, t)
                if best:
                    # Record tried variants and return
                    self.last_search_tried = tried
                    return await self.get_movie_details(best["id"])
                # Record tried variants and return fallback
                self.last_search_tried = tried
                return await self.get_movie_details(results[0]["id"])

        logger.info(f"TMDB movie search exhausted variants for '{title}' year={year}. Tried: {tried}")
        self.last_search_tried = tried
        return None
    
    async def find_movie_by_imdb(self, imdb_id: str) -> Optional[TMDBMovieResult]:
>>>>>>> 5c065f0 (chore(security): add detect-secrets baseline & CI checks (#5))
        """Find a movie by its IMDB ID"""
        # Ensure imdb_id starts with 'tt'
        if not imdb_id.startswith('tt'):
            imdb_id = f"tt{imdb_id}"

        data = await self._request(f"/find/{imdb_id}", {"external_source": "imdb_id"})
        if not data:
            return None

        movies = data.get("movie_results", [])
        if not movies:
            return None

        # Get full details for the first match
        return await self.get_movie_details(movies[0]["id"])

    async def find_movie_by_tmdb_id(
            self, tmdb_id: int) -> Optional[TMDBMovieResult]:
        """Get movie by TMDB ID directly"""
        return await self.get_movie_details(tmdb_id)

    async def search_tvshow(
            self,
            query: str,
            year: Optional[int] = None) -> list[dict]:
        """Search for TV shows by title"""
        params = {"query": query}
        if year:
            params["first_air_date_year"] = year

        logger.info(f"TMDB TV search: query='{query}', year={year}")
        data = await self._request("/search/tv", params)
        if not data:
            logger.warning(f"TMDB TV search returned no data for: '{query}'")
            return []

        results = data.get("results", [])
        logger.info(
            f"TMDB TV search found {
                len(results)} results for: '{query}'")
        if results:
            logger.debug(
                f"TMDB TV search top results: {[r.get('name', 'Unknown') for r in results[:3]]}")
        return results

    async def get_tvshow_details(
            self, tmdb_id: int) -> Optional[TMDBTVShowResult]:
        """Get detailed TV show information"""
        logger.debug(f"Fetching TMDB TV show details for ID: {tmdb_id}")
        data = await self._request(f"/tv/{tmdb_id}", {"append_to_response": "external_ids"})
        if not data:
            return None

        # Parse dates
        first_air_date = None
        if data.get("first_air_date"):
            try:
                first_air_date = date.fromisoformat(data["first_air_date"])
            except ValueError:
                pass

        last_air_date = None
        if data.get("last_air_date"):
            try:
                last_air_date = date.fromisoformat(data["last_air_date"])
            except ValueError:
                pass

        return TMDBTVShowResult(
            tmdb_id=data["id"],
            title=data.get("name", ""),
            original_title=data.get("original_name"),
            overview=data.get("overview"),
            first_air_date=first_air_date,
            last_air_date=last_air_date,
            status=data.get("status"),
            genres=[g["name"] for g in data.get("genres", [])],
            poster_path=get_full_image_url(data.get("poster_path")),
            backdrop_path=get_full_image_url(data.get("backdrop_path"), "w1280"),
            imdb_id=data.get("external_ids", {}).get("imdb_id"),
            rating=data.get("vote_average"),
            votes=data.get("vote_count"),
            season_count=data.get("number_of_seasons", 0),
            episode_count=data.get("number_of_episodes", 0),
            seasons=data.get("seasons", []),
        )

    async def get_season_details(
            self,
            tmdb_id: int,
            season_number: int) -> list[TMDBEpisodeResult]:
        """Get episodes for a season"""
        data = await self._request(f"/tv/{tmdb_id}/season/{season_number}")
        if not data:
            return []

        episodes = []
        for ep in data.get("episodes", []):
            air_date = None
            if ep.get("air_date"):
                try:
                    air_date = date.fromisoformat(ep["air_date"])
                except ValueError:
                    pass

            episodes.append(TMDBEpisodeResult(
                season_number=ep.get("season_number", season_number),
                episode_number=ep.get("episode_number", 0),
                title=ep.get("name", ""),
                overview=ep.get("overview"),
                air_date=air_date,
                runtime=ep.get("runtime"),
                still_path=get_full_image_url(ep.get("still_path")),
            ))

        return episodes

    async def search_tvshow_and_get_details(
            self,
            title: str,
            year: Optional[int] = None) -> Optional[TMDBTVShowResult]:
        """Search for a TV show and get its details"""
        results = await self.search_tvshow(title, year)
        if not results:
            return None

        # Get details for the first result
        return await self.get_tvshow_details(results[0]["id"])

=======
=======
    
    async def search_tvshow_and_get_details(self, title: str, year: Optional[int] = None) -> Optional[TMDBTVShowResult]:
        """Search for a TV show and get its details using multiple heuristics."""
        tried = []
        import difflib

        def pick_best_result_tv(results_list, target_title, target_year=None):
            best = None
            best_score = 0.0
            for r in results_list:
                name = r.get('name') or r.get('original_name') or ''
                score = difflib.SequenceMatcher(None, target_title.lower(), name.lower()).ratio()
                year_score = 0.0
                try:
                    if target_year:
                        fd = r.get('first_air_date')
                        if fd:
                            fd_year = int(fd.split('-')[0])
                            if fd_year == target_year:
                                year_score = 0.15
                except Exception:
                    pass
                final = score + year_score
                if final > best_score:
                    best_score = final
                    best = r
            return best if best_score >= 0.5 else None

        for t in self._title_variants(title):
            # Try with year first
            if year:
                tried.append({"query": t, "year": year})
                results = await self.search_tvshow(t, year)
                if results:
                    best = pick_best_result_tv(results, t, year)
                    if best:
                        return await self.get_tvshow_details(best["id"])
                    return await self.get_tvshow_details(results[0]["id"])
            # Try without year
            tried.append({"query": t, "year": None})
            results = await self.search_tvshow(t)
            if results:
                best = pick_best_result_tv(results, t)
                if best:
                    return await self.get_tvshow_details(best["id"])
                return await self.get_tvshow_details(results[0]["id"])

        logger.info(f"TMDB TV search exhausted variants for '{title}' year={year}. Tried: {tried}")
        self.last_search_tried = tried
        return None
>>>>>>> 8139644 (recover(queue): apply stashed queue & UI changes)
    
    async def search_tvshow_and_get_details(self, title: str, year: Optional[int] = None) -> Optional[TMDBTVShowResult]:
        """Search for a TV show and get its details using multiple heuristics."""
        tried = []
        import difflib

        def pick_best_result_tv(results_list, target_title, target_year=None):
            best = None
            best_score = 0.0
            for r in results_list:
                name = r.get('name') or r.get('original_name') or ''
                score = difflib.SequenceMatcher(None, target_title.lower(), name.lower()).ratio()
                year_score = 0.0
                try:
                    if target_year:
                        fd = r.get('first_air_date')
                        if fd:
                            fd_year = int(fd.split('-')[0])
                            if fd_year == target_year:
                                year_score = 0.15
                except Exception:
                    pass
                final = score + year_score
                if final > best_score:
                    best_score = final
                    best = r
            return best if best_score >= 0.5 else None

        for t in self._title_variants(title):
            # Try with year first
            if year:
                tried.append({"query": t, "year": year})
                results = await self.search_tvshow(t, year)
                if results:
                    best = pick_best_result_tv(results, t, year)
                    if best:
                        return await self.get_tvshow_details(best["id"])
                    return await self.get_tvshow_details(results[0]["id"])
            # Try without year
            tried.append({"query": t, "year": None})
            results = await self.search_tvshow(t)
            if results:
                best = pick_best_result_tv(results, t)
                if best:
                    return await self.get_tvshow_details(best["id"])
                return await self.get_tvshow_details(results[0]["id"])

        logger.info(f"TMDB TV search exhausted variants for '{title}' year={year}. Tried: {tried}")
        self.last_search_tried = tried
        return None
    
>>>>>>> 5c065f0 (chore(security): add detect-secrets baseline & CI checks (#5))
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()


# Global service instance
tmdb_service = TMDBService()
