"""
Tautulli API integration for watch history tracking
"""
import httpx
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class TautulliService:
    """Service for interacting with Tautulli API"""

    def __init__(self, host: str, api_key: str):
        """Initialize Tautulli service with host and API key"""
        self.host = host.rstrip('/')
        self.api_key = api_key
        self.base_url = f"{self.host}/api/v2"

    async def _make_request(
            self, cmd: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make a request to Tautulli API"""
        if params is None:
            params = {}

        params["apikey"] = self.api_key
        params["cmd"] = cmd

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()

                if data.get("response", {}).get("result") == "success":
                    return data.get("response", {}).get("data", {})
                else:
                    error_msg = data.get(
                        "response", {}).get(
                        "message", "Unknown error")
                    logger.error(f"Tautulli API error: {error_msg}")
                    return {}
        except httpx.HTTPError as e:
            logger.error(f"Tautulli HTTP error: {str(e)}")
            return {}
        except Exception as e:
            logger.error(f"Tautulli unexpected error: {str(e)}")
            return {}

    async def get_history(
        self,
        section_id: Optional[int] = None,
        rating_key: Optional[int] = None,
        parent_rating_key: Optional[int] = None,
        grandparent_rating_key: Optional[int] = None,
        length: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get watch history from Tautulli

        Args:
            section_id: Library section ID to filter by
            rating_key: Specific item rating key (for movies or episodes)
            parent_rating_key: Season rating key (for TV shows)
            grandparent_rating_key: TV show rating key
            length: Number of results to return

        Returns:
            List of watch history items
        """
        params = {
            "length": length,
            "order_column": "date",
            "order_dir": "desc"
        }

        if section_id:
            params["section_id"] = section_id
        if rating_key:
            params["rating_key"] = rating_key
        if parent_rating_key:
            params["parent_rating_key"] = parent_rating_key
        if grandparent_rating_key:
            params["grandparent_rating_key"] = grandparent_rating_key

        result = await self._make_request("get_history", params)
        return result.get("data", [])

    async def search_movie_history(self,
                                   title: Optional[str],
                                   year: Optional[int] = None,
                                   imdb_id: Optional[str] = None,
                                   db=None) -> tuple[list[Dict[str,
                                                               Any]],
                                                     Optional[int]]:
        """
        Search for a movie's watch history.

        Strategy:
        - If `imdb_id` is provided, attempt to find a search result whose data contains that IMDb id
          (flexible parsing of result fields to accommodate different guid shapes).
        - Otherwise (or if IMDb lookup fails), fall back to title (and year) based search and use
          the first matching movie's `rating_key` to fetch history.

        Returns a list of watch history entries for the matched movie, or an empty list if none.
        """
        # Prefer searching by IMDb id when available because it's more specific.
        # Fall back to title if imdb_id does not return usable results.
        queries = []
        if imdb_id:
            queries.append(imdb_id)
        if title and title not in queries:
            queries.append(title)

        def _flatten_to_text(obj: Any) -> str:
            """Recursively stringify dict/list values for heuristic matching."""
            if obj is None:
                return ""
            if isinstance(obj, (str, int, float, bool)):
                return str(obj)
            if isinstance(obj, dict):
                parts: List[str] = []
                for k, v in obj.items():
                    parts.append(str(k))
                    parts.append(_flatten_to_text(v))
                return " ".join([p for p in parts if p])
            if isinstance(obj, list):
                return " ".join([_flatten_to_text(i) for i in obj])
            # Fallback
            try:
                return str(obj)
            except Exception:
                return ""

        # First, try to resolve rating_key from Plex using IMDB GUID (fastest)
        if imdb_id and db is not None:
            try:
                from app.services.plex import get_plex_service
                plex = await get_plex_service(db)
                if plex:
                    rk = await plex.get_rating_key_by_imdb(imdb_id)
                    if rk:
                        logger.debug(f"Tautulli: resolved rating_key={rk} via Plex IMDB GUID lookup for imdb_id={imdb_id}")
                        # Persist the rating_key to the Movie record if present
                        try:
                            from sqlalchemy import select, update
                            from app.models import Movie
                            result = await db.execute(select(Movie).where(Movie.imdb_id == imdb_id))
                            movie = result.scalar_one_or_none()
                            if movie and (not movie.rating_key or movie.rating_key != int(rk)):
                                await db.execute(update(Movie).where(Movie.id == movie.id).values(rating_key=int(rk)))
                                await db.commit()
                                logger.debug(f"Tautulli: persisted rating_key={rk} to Movie id={movie.id}")
                        except Exception as e:
                            logger.debug(f"Tautulli: failed to persist rating_key to Movie: {e}")

                        history = await self.get_history(rating_key=int(rk))
                        return history, int(rk)
            except Exception as e:
                logger.debug(f"Tautulli: Plex IMDB lookup failed: {e}")

        for query in queries:
            logger.debug(
                f"Tautulli: searching for movie with query='{query}' (imdb_id={imdb_id}, year={year})")
            search_results = await self._make_request("search", {"query": query})

            # Log a brief summary for debugging if the search returned no
            # results
            if not search_results or "results" not in search_results:
                logger.debug(
                    f"Tautulli: no search results for query='{query}'")
                # If no results, try scanning recent history directly (some
                # servers don't index guids for search)
                if imdb_id:
                    try:
                        logger.debug(
                            "Tautulli: scanning recent history for imdb_id as fallback when search returns no results")
                        recent = await self.get_history(length=2000)
                        matches = []
                        for entry in recent:
                            try:
                                text = _flatten_to_text(entry)
                            except Exception:
                                text = str(entry)

                            if imdb_id in text:
                                matches.append(entry)

                        if matches:
                            logger.debug(f"Tautulli: found {len(matches)} history entries by scanning recent history for imdb_id")
                            # Try to extract rating_key from matched history
                            # entries
                            rk = None
                            for e in matches:
                                if e.get('rating_key'):
                                    try:
                                        rk = int(e.get('rating_key'))
                                        break
                                    except Exception:
                                        continue
                            return matches, rk
                    except Exception as e:
                        logger.debug(
                            f"Tautulli: recent history scan failed: {e}")

                # If DB is available, try Plex title search as a final fallback
                if db is not None and title:
                    try:
                        from app.services.plex import get_plex_service
                        plex = await get_plex_service(db)
                        if plex:
                            plex_results = await plex.search(title)
                            if plex_results:
                                for pr in plex_results:
                                    rk = pr.get('ratingKey') or pr.get(
                                        'rating_key') or pr.get('ratingkey')
                                    if rk:
                                        try:
                                            rk_int = int(rk)
                                            logger.debug(
                                                f"Tautulli: resolved rating_key={rk_int} via Plex title search fallback for title='{title}'")
                                            history = await self.get_history(rating_key=rk_int)
                                            return history, rk_int
                                        except Exception:
                                            continue
                    except Exception as e:
                        logger.debug(
                            f"Tautulli: Plex fallback after empty search failed: {e}")

                continue

            results = search_results.get("results", [])
            logger.debug(f"Tautulli: search returned {len(results)} results for query='{query}'")

            # Narrow to movies only
            movies = [r for r in results if r.get("media_type") == "movie"]

            # If year provided, filter by year
            if year and movies:
                movies = [m for m in movies if str(m.get("year")) == str(year)]

            # If we have an imdb_id, try to find a result that contains it in any of the
            # result fields (guid, provider ids, nested metadata, etc.). This is intentionally
            # flexible because Tautulli/ Plex store guids in different formats (e.g.
            # 'com.plexapp.agents.imdb://tt1234567?lang=en'). We'll stringify each result
            # and look for the imdb_id substring.
            if imdb_id and movies:
                imdb_match = None
                for m in movies:
                    try:
                        text = _flatten_to_text(m)
                    except Exception:
                        text = str(m)

                    if imdb_id in text:
                        imdb_match = m
                        break

                if imdb_match:
                    rating_key = imdb_match.get("rating_key")
                    logger.debug(
                        f"Tautulli: found imdb match, rating_key={rating_key} for imdb_id={imdb_id}")
                    if rating_key:
                        try:
                            from sqlalchemy import select, update
                            from app.models import Movie
                            result = await db.execute(select(Movie).where(Movie.imdb_id == imdb_id))
                            movie = result.scalar_one_or_none()
                            if movie and (not movie.rating_key or movie.rating_key != int(rating_key)):
                                await db.execute(update(Movie).where(Movie.id == movie.id).values(rating_key=int(rating_key)))
                                await db.commit()
                                logger.debug(f"Tautulli: persisted rating_key={rating_key} to Movie id={movie.id}")
                        except Exception as e:
                            logger.debug(f"Tautulli: failed to persist rating_key to Movie: {e}")

                        history = await self.get_history(rating_key=rating_key)
                        return history, int(rating_key)
                    else:
                        logger.debug(
                            f"Tautulli: imdb match found but no rating_key present in result: {imdb_match}")

            # If we didn't find a match in the filtered movies list, try scanning ALL
            # search results for the imdb id (some Tautulli versions or configurations
            # may present matches outside the 'movie' media_type or omit
            # media_type).
            if imdb_id:
                for r in results:
                    try:
                        text = _flatten_to_text(r)
                    except Exception:
                        text = str(r)

                    if imdb_id in text:
                        rating_key = r.get("rating_key")
                        if rating_key:
                            try:
                                from sqlalchemy import select, update
                                from app.models import Movie
                                result = await db.execute(select(Movie).where(Movie.imdb_id == imdb_id))
                                movie = result.scalar_one_or_none()
                                if movie and (not movie.rating_key or movie.rating_key != int(rating_key)):
                                    await db.execute(update(Movie).where(Movie.id == movie.id).values(rating_key=int(rating_key)))
                                    await db.commit()
                                    logger.debug(f"Tautulli: persisted rating_key={rating_key} to Movie id={movie.id}")
                            except Exception as e:
                                logger.debug(f"Tautulli: failed to persist rating_key to Movie: {e}")

                            logger.debug(f"Tautulli: found imdb match in non-movie result, rating_key={rating_key} for imdb_id={imdb_id}")
                            history = await self.get_history(rating_key=rating_key)
                            return history, int(rating_key)
                        else:
                            logger.debug(
                                f"Tautulli: found imdb id in result but no rating_key present: {r}")

            # If still no rating_key found, attempt to resolve rating_key via
            # Plex (if configured)
            if imdb_id and db is not None:
                try:
                    from app.services.plex import get_plex_service
                    plex = await get_plex_service(db)
                    if plex:
                        rating_key = await plex.get_rating_key_by_imdb(imdb_id)
                        if rating_key:
                            logger.debug(
                                f"Tautulli: resolved rating_key={rating_key} via Plex for imdb_id={imdb_id}")
                            history = await self.get_history(rating_key=rating_key)
                            return history, int(rating_key)
                        # If Plex couldn't resolve via imdb_id, try searching
                        # Plex by title as a fallback
                        if title:
                            try:
                                plex_results = await plex.search(title)
                                if plex_results:
                                    # Prefer movie-type results and grab
                                    # ratingKey if present
                                    for pr in plex_results:
                                        rk = pr.get('ratingKey') or pr.get(
                                            'rating_key') or pr.get('ratingkey')
                                        if rk:
                                            try:
                                                rk_int = int(rk)
                                                logger.debug(
                                                    f"Tautulli: resolved rating_key={rk_int} via Plex title search for title='{title}'")
                                                history = await self.get_history(rating_key=rk_int)
                                                return history, rk_int
                                            except Exception:
                                                continue
                            except Exception as e:
                                logger.debug(
                                    f"Tautulli: Plex title search failed: {e}")
                except Exception as e:
                    logger.debug(f"Tautulli: Plex lookup failed: {e}")


            # At this point we didn't find a direct imdb->rating_key mapping.
            # Fallback strategies (try in order):
            # 1) Use the first movie search result's rating_key (title-based
            # match)
            if movies:
                rating_key = movies[0].get("rating_key")
                if rating_key:
                    try:
                        from sqlalchemy import select, update
                        from app.models import Movie
                        # Try to find movie by imdb_id if available, else try title/year
                        imdb_candidate = None
                        try:
                            imdb_candidate = movies[0].get('guid') or movies[0].get('guid_id') or None
                        except Exception:
                            imdb_candidate = None

                        # Persist rating_key if we can match a Movie
                        if imdb_candidate and imdb_candidate.startswith('com.plexapp.agents.imdb://'):
                            try:
                                imdb_val = imdb_candidate.split('://')[-1].split('?')[0]
                            except Exception:
                                imdb_val = None
                        else:
                            imdb_val = None

                        if imdb_val:
                            result = await db.execute(select(Movie).where(Movie.imdb_id == imdb_val))
                            movie = result.scalar_one_or_none()
                            if movie and (not movie.rating_key or movie.rating_key != int(rating_key)):
                                await db.execute(update(Movie).where(Movie.id == movie.id).values(rating_key=int(rating_key)))
                                await db.commit()
                                logger.debug(f"Tautulli: persisted rating_key={rating_key} to Movie id={movie.id}")
                    except Exception as e:
                        logger.debug(f"Tautulli: failed to persist rating_key to Movie: {e}")

                    logger.debug(f"Tautulli: using first movie search result rating_key={rating_key} for query='{query}'")
                    history = await self.get_history(rating_key=rating_key)
                    return history, int(rating_key)

            # 2) If we have an imdb_id, scan recent history for entries that contain the imdb_id
            #    (some Tautulli instances index guids only in history items, not search results)
            if imdb_id:
                try:
                    logger.debug(
                        "Tautulli: scanning recent history for imdb_id/title matches as fallback")
                    recent = await self.get_history(length=2000)
                    matches = []
                    for entry in recent:
                        try:
                            text = _flatten_to_text(entry)
                        except Exception:
                            text = str(entry)

                        if imdb_id in text:
                            matches.append(entry)
                        elif title and year and str(year) in text and title.lower() in text.lower():
                            matches.append(entry)

                    if matches:
                        logger.debug(f"Tautulli: found {len(matches)} history entries by scanning recent history for imdb_id/title match")
                        rk = None
                        for e in matches:
                            if e.get('rating_key'):
                                try:
                                    rk = int(e.get('rating_key'))
                                    break
                                except Exception:
                                    continue
                        return matches, rk
                except Exception as e:
                    logger.debug(f"Tautulli: recent history scan failed: {e}")

            # No match for this query; continue to next query
            continue

        return [], None

    async def search_tvshow_history(
        self,
        title: str,
        season_number: Optional[int] = None,
        episode_number: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for a TV show's watch history by title

        Args:
            title: TV show title to search for
            season_number: Optional season number to filter
            episode_number: Optional episode number to filter (requires season_number)

        Returns:
            List of watch history entries for the TV show
        """
        # Search in Tautulli library
        search_results = await self._make_request("search", {"query": title})

        if not search_results or "results" not in search_results:
            return []

        # Filter for TV shows
        tvshows = [
            r for r in search_results.get("results", [])
            if r.get("media_type") == "show"
        ]

        if not tvshows:
            return []

        # Get the rating key of the first matching TV show
        grandparent_rating_key = tvshows[0].get("rating_key")

        if not grandparent_rating_key:
            return []

        # Get history for this TV show
        history = await self.get_history(grandparent_rating_key=grandparent_rating_key)

        # Filter by season/episode if specified
        if season_number is not None:
            history = [h for h in history if h.get(
                "parent_media_index") == season_number]

        if episode_number is not None and season_number is not None:
            history = [h for h in history if h.get(
                "media_index") == episode_number]

        return history

    async def get_library_watch_time_stats(
            self, section_id: Optional[int] = None) -> Dict[str, Any]:
        """Get watch time statistics for a library section"""
        params = {}
        if section_id:
            params["section_id"] = section_id

        result = await self._make_request("get_library_watch_time_stats", params)
        return result

    async def get_user_watch_time_stats(
            self, user_id: Optional[int] = None) -> Dict[str, Any]:
        """Get watch time statistics for a user"""
        params = {}
        if user_id:
            params["user_id"] = user_id

        result = await self._make_request("get_user_watch_time_stats", params)
        return result


async def get_tautulli_service(db) -> Optional[TautulliService]:
    """
    Get configured Tautulli service instance

    Args:
        db: Database session

    Returns:
        TautulliService instance if configured, None otherwise
    """
    from sqlalchemy import select
    from app.models import AppSettings

    # Get Tautulli host
    result_host = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_host")
    )
    host_setting = result_host.scalar_one_or_none()

    # Get Tautulli API key
    result_key = await db.execute(
        select(AppSettings).where(AppSettings.key == "tautulli_api_key")
    )
    key_setting = result_key.scalar_one_or_none()

    # Log found settings for debugging
    try:
        host_val = host_setting.value if host_setting else None
        key_val_present = bool(key_setting and key_setting.value)
        logger.info(
            f"Tautulli settings found - host: {host_val}, api_key_present: {key_val_present}")
    except Exception:
        logger.debug("Tautulli settings missing or unreadable from DB")

    if not host_setting or not key_setting:
        return None

    if not host_setting.value or not key_setting.value:
        return None

    return TautulliService(host_setting.value, key_setting.value)