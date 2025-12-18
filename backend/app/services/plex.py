"""
Plex API integration to resolve rating_key and fetch metadata
"""
import httpx
import logging
import xml.etree.ElementTree as ET
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class PlexService:
    def __init__(self, host: str, token: str):
        self.host = host.rstrip('/')
        self.token = token

    async def _make_request(self,
                            path: str,
                            params: Optional[Dict[str,
                                                  Any]] = None) -> Optional[ET.Element]:
        if params is None:
            params = {}
        headers = {
            'X-Plex-Token': self.token,
            'Accept': 'application/xml'
        }
        url = f"{self.host.rstrip('/')}{path}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url, params=params, headers=headers)
                r.raise_for_status()
                # Parse XML
                root = ET.fromstring(r.text)
                return root
        except httpx.HTTPError as e:
            logger.error(f"Plex HTTP error: {e}")
            return None
        except Exception as e:
            logger.error(f"Plex unexpected error: {e}")
            return None

    async def search(self, query: str) -> List[Dict[str, Any]]:
        """Search Plex and return a list of dicts with attributes"""
        root = await self._make_request('/search', {'query': query})
        if root is None:
            return []
        results: List[Dict[str, Any]] = []
        for elem in root:
            # Each child element (Video, Directory, etc.) contains attributes
            data = dict(elem.attrib)
            # include child elements text
            for child in elem:
                data[child.tag] = child.attrib if child.attrib else (
                    child.text or '')
            results.append(data)
        return results

    async def get_metadata(self, rating_key: int) -> Optional[Dict[str, Any]]:
        root = await self._make_request(f'/library/metadata/{rating_key}')
        if root is None:
            return None
        # root contains a Video element as first child
        elem = next(iter(root), None)
        if elem is None:
            return None
        return dict(elem.attrib)

    async def get_rating_key_by_imdb(self, imdb_id: str) -> Optional[int]:
        # Search by imdb_id string first
        results = await self.search(imdb_id)
        for r in results:
            # Many attributes may contain a 'ratingKey' or similar
            rk = r.get('ratingKey') or r.get(
                'rating_key') or r.get('ratingkey')
            if rk:
                try:
                    return int(rk)
                except Exception:
                    continue
            # If guid present within nested items
            # stringify all values
            text = ' '.join([str(v) for v in r.values() if v is not None])
            if imdb_id in text:
                if rk:
                    try:
                        return int(rk)
                    except Exception:
                        continue
        # Try searching by query without tt prefix
        if imdb_id.startswith('tt'):
            alt = imdb_id[2:]
            results = await self.search(alt)
            for r in results:
                rk = r.get('ratingKey') or r.get(
                    'rating_key') or r.get('ratingkey')
                if rk:
                    try:
                        return int(rk)
                    except Exception:
                        continue
        return None


async def get_plex_service(db) -> Optional[PlexService]:
    from sqlalchemy import select
    from app.models import AppSettings

    result_host = await db.execute(select(AppSettings).where(AppSettings.key == 'plex_host'))
    host_setting = result_host.scalar_one_or_none()

    result_token = await db.execute(select(AppSettings).where(AppSettings.key == 'plex_token'))
    token_setting = result_token.scalar_one_or_none()

    try:
        host_val = host_setting.value if host_setting else None
        token_present = bool(token_setting and token_setting.value)
        logger.info(
            f"Plex settings found - host: {host_val}, token_present: {token_present}")
    except Exception:
        logger.debug("Plex settings missing or unreadable from DB")

    if not host_setting or not token_setting:
        return None
    if not host_setting.value or not token_setting.value:
        return None

    return PlexService(host_setting.value, token_setting.value)
