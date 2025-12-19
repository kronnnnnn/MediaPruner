"""
OMDb API Service - Fetches ratings from IMDB, Rotten Tomatoes, and Metacritic
via the Open Movie Database API (omdbapi.com)

Free tier: 1,000 requests/day
Get your API key at: http://www.omdbapi.com/apikey.aspx
"""
import httpx
import logging
from typing import Optional
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

OMDB_BASE_URL = "https://www.omdbapi.com"


async def get_omdb_api_key_from_db(db: AsyncSession) -> Optional[str]:
    """Get OMDb API key from database settings"""
    from app.models import AppSettings

    result = await db.execute(
        select(AppSettings).where(AppSettings.key == "omdb_api_key")
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


@dataclass
class OMDbRatings:
    """Ratings from various sources via OMDb"""
    imdb_rating: Optional[float] = None
    imdb_votes: Optional[int] = None
    # Critics score (Tomatometer) 0-100
    rotten_tomatoes_score: Optional[int] = None
    rotten_tomatoes_audience: Optional[int] = None  # Audience score 0-100
    metacritic_score: Optional[int] = None  # Metascore 0-100


@dataclass
class OMDbTVShowResult:
    """TV Show metadata from OMDb"""
    title: str
    year: Optional[str]
    imdb_id: Optional[str]
    plot: Optional[str]
    poster: Optional[str]
    genre: Optional[str]
    runtime: Optional[str]
    total_seasons: Optional[int]
    imdb_rating: Optional[float]
    imdb_votes: Optional[int]


@dataclass
class OMDbEpisodeResult:
    """Episode metadata from OMDb"""
    title: str
    episode_number: int
    imdb_id: Optional[str]
    released: Optional[str]
    imdb_rating: Optional[float]


class OMDbService:
    """Service for fetching ratings from OMDb API"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=30.0)
        # Diagnostics: remember last request params
        self.last_request_params = None
    async def close(self):
        await self.client.aclose()

    async def search_tvshow(
            self,
            title: str,
            year: Optional[int] = None) -> Optional[OMDbTVShowResult]:
        """
        Search for a TV series by title

        Args:
            title: TV show title
            year: Optional start year

        Returns:
            OMDbTVShowResult object or None if not found
        """
        try:
            params = {
                'apikey': self.api_key,
                't': title,
                'type': 'series',
                'plot': 'full'
            }
            if year:
                params['y'] = str(year)
            
            self.last_request_params = params
            response = await self.client.get(OMDB_BASE_URL, params=params)
            logger.debug(f"OMDb request params: {params}")
            response.raise_for_status()
            data = response.json()

            if data.get('Response') == 'False':
                logger.warning(f"OMDb: TV show not found for '{title}' ({year}): {data.get('Error')} (params: {params})")
                return None

            return self._parse_tvshow(data)

        except httpx.HTTPStatusError as e:
            logger.error(f"OMDb API HTTP error for TV show '{title}': {e}")
            return None
        except Exception as e:
            logger.error(f"OMDb API error for TV show '{title}': {e}")
            return None

    async def get_tvshow_by_imdb_id(
            self, imdb_id: str) -> Optional[OMDbTVShowResult]:
        """
        Fetch TV show details by IMDB ID

        Args:
            imdb_id: IMDB ID (e.g., 'tt1234567')

        Returns:
            OMDbTVShowResult object or None if not found
        """
        if not imdb_id:
            return None

        if not imdb_id.startswith('tt'):
            imdb_id = f'tt{imdb_id}'

        try:
            params = {
                'apikey': self.api_key,
                'i': imdb_id,
                'type': 'series',
                'plot': 'full'
            }
            self.last_request_params = params
            response = await self.client.get(OMDB_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if data.get('Response') == 'False':
                logger.warning(f"OMDb: TV show not found for '{title}' ({year}): {data.get('Error')} (params: {params})")
                return None

            return self._parse_tvshow(data)

        except httpx.HTTPStatusError as e:
            logger.error(f"OMDb API HTTP error for {imdb_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"OMDb API error for {imdb_id}: {e}")
            return None

    async def get_season_episodes(
            self,
            imdb_id: str,
            season_number: int) -> list[OMDbEpisodeResult]:
        """
        Fetch episode list for a season

        Args:
            imdb_id: IMDB ID of the show
            season_number: Season number

        Returns:
            List of OMDbEpisodeResult objects
        """
        if not imdb_id:
            return []

        if not imdb_id.startswith('tt'):
            imdb_id = f'tt{imdb_id}'

        try:
            params = {
                'apikey': self.api_key,
                'i': imdb_id,
                'Season': str(season_number)
            }
            self.last_request_params = params
            response = await self.client.get(OMDB_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if data.get('Response') == 'False':
                logger.warning(f"OMDb: Season {season_number} not found for {imdb_id}: {data.get('Error')}")
                return []

            episodes = []
            for ep in data.get('Episodes', []):
                imdb_rating = None
                if ep.get('imdbRating') and ep.get('imdbRating') != 'N/A':
                    try:
                        imdb_rating = float(ep['imdbRating'])
                    except ValueError:
                        pass

                episodes.append(OMDbEpisodeResult(
                    title=ep.get('Title', ''),
                    episode_number=int(ep.get('Episode', 0)),
                    imdb_id=ep.get('imdbID'),
                    released=ep.get('Released'),
                    imdb_rating=imdb_rating
                ))

            return episodes

        except httpx.HTTPStatusError as e:
            logger.error(
                f"OMDb API HTTP error for season {season_number}: {e}")
            return []
        except Exception as e:
            logger.error(f"OMDb API error for season {season_number}: {e}")
            return []

    def _parse_tvshow(self, data: dict) -> OMDbTVShowResult:
        """Parse OMDb TV show response"""
        imdb_rating = None
        if data.get('imdbRating') and data.get('imdbRating') != 'N/A':
            try:
                imdb_rating = float(data['imdbRating'])
            except ValueError:
                pass

        imdb_votes = None
        if data.get('imdbVotes') and data.get('imdbVotes') != 'N/A':
            try:
                imdb_votes = int(data['imdbVotes'].replace(',', ''))
            except ValueError:
                pass

        total_seasons = None
        if data.get('totalSeasons') and data.get('totalSeasons') != 'N/A':
            try:
                total_seasons = int(data['totalSeasons'])
            except ValueError:
                pass

        return OMDbTVShowResult(
            title=data.get('Title', ''),
            year=data.get('Year'),
            imdb_id=data.get('imdbID'),
            plot=data.get('Plot') if data.get('Plot') != 'N/A' else None,
            poster=data.get('Poster') if data.get('Poster') != 'N/A' else None,
            genre=data.get('Genre') if data.get('Genre') != 'N/A' else None,
            runtime=data.get('Runtime') if data.get('Runtime') != 'N/A' else None,
            total_seasons=total_seasons,
            imdb_rating=imdb_rating,
            imdb_votes=imdb_votes
        )

    async def get_ratings_by_imdb_id(
            self, imdb_id: str) -> Optional[OMDbRatings]:
        """
        Fetch ratings for a movie by IMDB ID

        Args:
            imdb_id: IMDB ID (e.g., 'tt1234567')

        Returns:
            OMDbRatings object with ratings from multiple sources, or None if not found
        """
        if not imdb_id:
            return None

        # Ensure proper format
        if not imdb_id.startswith('tt'):
            imdb_id = f'tt{imdb_id}'

        try:
            params = {
                'apikey': self.api_key,
                'i': imdb_id,
                'plot': 'short'
            }
            self.last_request_params = params
            response = await self.client.get(OMDB_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if data.get('Response') == 'False':
                logger.warning(f"OMDb: TV show not found for {imdb_id}: {data.get('Error')} (params: {params})")
                return None

            return self._parse_ratings(data)

        except httpx.HTTPStatusError as e:
            logger.error(f"OMDb API HTTP error for {imdb_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"OMDb API error for {imdb_id}: {e}")
            return None

    async def get_ratings_by_title(
            self,
            title: str,
            year: Optional[int] = None) -> Optional[OMDbRatings]:
        """
        Fetch ratings for a movie by title and optional year

        Args:
            title: Movie title
            year: Optional release year for more accurate matching

        Returns:
            OMDbRatings object with ratings from multiple sources, or None if not found
        """
        try:
            params = {
                'apikey': self.api_key,
                't': title,
                'type': 'movie',
                'plot': 'short'
            }
            if year:
                params['y'] = str(year)

            # Record params for diagnostics
            self.last_request_params = params
            response = await self.client.get(OMDB_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if data.get('Response') == 'False':
                logger.warning(f"OMDb: Movie not found for '{title}' ({year}): {data.get('Error')} (params: {params})")
                logger.debug(f"OMDb request params: {params}")
                return None

            return self._parse_ratings(data)

        except httpx.HTTPStatusError as e:
            logger.error(f"OMDb API HTTP error for '{title}': {e}")
            return None
        except Exception as e:
            logger.error(f"OMDb API error for '{title}': {e}")
            return None

    def _parse_ratings(self, data: dict) -> OMDbRatings:
        """Parse OMDb response and extract ratings from various sources"""
        ratings = OMDbRatings()

        # Parse IMDB rating (e.g., "7.5" -> 7.5)
        imdb_rating_str = data.get('imdbRating', 'N/A')
        if imdb_rating_str and imdb_rating_str != 'N/A':
            try:
                ratings.imdb_rating = float(imdb_rating_str)
            except ValueError:
                pass

        # Parse IMDB votes (e.g., "1,234,567" -> 1234567)
        imdb_votes_str = data.get('imdbVotes', 'N/A')
        if imdb_votes_str and imdb_votes_str != 'N/A':
            try:
                ratings.imdb_votes = int(imdb_votes_str.replace(',', ''))
            except ValueError:
                pass

        # Parse Metacritic (e.g., "75" -> 75)
        metascore_str = data.get('Metascore', 'N/A')
        if metascore_str and metascore_str != 'N/A':
            try:
                ratings.metacritic_score = int(metascore_str)
            except ValueError:
                pass

        # Parse ratings array for Rotten Tomatoes
        ratings_array = data.get('Ratings', [])
        for rating_item in ratings_array:
            source = rating_item.get('Source', '')
            value = rating_item.get('Value', '')

            if source == 'Rotten Tomatoes':
                # Format: "85%" -> 85
                try:
                    ratings.rotten_tomatoes_score = int(value.replace('%', ''))
                except ValueError:
                    pass

        return ratings


async def fetch_omdb_ratings(
    db: AsyncSession,
    imdb_id: Optional[str] = None,
    title: Optional[str] = None,
    year: Optional[int] = None
) -> Optional[OMDbRatings]:
    """
    Convenience function to fetch OMDb ratings

    Args:
        db: Database session for retrieving API key
        imdb_id: IMDB ID (preferred, more accurate)
        title: Movie title (fallback if no IMDB ID)
        year: Release year (helps with title matching)

    Returns:
        OMDbRatings object or None
    """
    api_key = await get_omdb_api_key_from_db(db)
    if not api_key:
        logger.debug("OMDb API key not configured, skipping ratings fetch")
        return None

    service = OMDbService(api_key)
    try:
        if imdb_id:
            return await service.get_ratings_by_imdb_id(imdb_id)
        elif title:
            return await service.get_ratings_by_title(title, year)
        return None
    finally:
        await service.close()


async def fetch_omdb_tvshow(
    db: AsyncSession,
    title: str,
    year: Optional[int] = None
) -> Optional[OMDbTVShowResult]:
    """
    Convenience function to fetch TV show metadata from OMDb

    Args:
        db: Database session for retrieving API key
        title: TV show title
        year: Optional start year

    Returns:
        OMDbTVShowResult object or None
    """
    api_key = await get_omdb_api_key_from_db(db)
    if not api_key:
        logger.debug("OMDb API key not configured, skipping TV show fetch")
        return None

    service = OMDbService(api_key)
    try:
        return await service.search_tvshow(title, year)
    finally:
        await service.close()


async def fetch_omdb_season_episodes(
    db: AsyncSession,
    imdb_id: str,
    season_number: int
) -> list[OMDbEpisodeResult]:
    """
    Convenience function to fetch season episodes from OMDb

    Args:
        db: Database session for retrieving API key
        imdb_id: IMDB ID of the show
        season_number: Season number

    Returns:
        List of OMDbEpisodeResult objects
    """
    api_key = await get_omdb_api_key_from_db(db)
    if not api_key:
        logger.debug("OMDb API key not configured, skipping episode fetch")
        return []

    service = OMDbService(api_key)
    try:
        return await service.get_season_episodes(imdb_id, season_number)
    finally:
        await service.close()