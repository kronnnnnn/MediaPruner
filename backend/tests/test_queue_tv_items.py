import pytest
import pytest_asyncio
from sqlalchemy import insert

from app.services.queue import create_task, get_task, list_tasks
from app.models import TVShow, Episode
import app.database as database

pytestmark = pytest.mark.asyncio


async def test_tv_tasks_include_show_and_episode_info(temp_db):
    # Create a TV show and episode
    async with database.async_session() as session:
        from app.models import LibraryPath, MediaType
        lp = LibraryPath(path='/tmp/tv', name='test', media_type=MediaType.TV)
        session.add(lp)
        await session.flush()
        tv = TVShow(library_path_id=lp.id, title='Test Show', folder_path='/tmp/tv/testshow', folder_name='testshow')
        session.add(tv)
        await session.flush()
        ep = Episode(tvshow_id=tv.id, season_number=1, episode_number=1, title='Pilot', file_path='/tmp/tv/testshow/s01e01.mkv')
        session.add(ep)
        await session.commit()

    # Create an analyze task for the episode with meta show_id
    task = await create_task('analyze', items=[{"episode_id": ep.id}], meta={"show_id": tv.id})

    # Get task details
    data = await get_task(task.id)
    assert data is not None
    assert 'items' in data
    items = data['items']
    assert len(items) == 1
    it = items[0]
    # episode_label should be present and include season/episode
    assert it.get('episode_label') is not None
    assert 'S1E1' in it.get('episode_label') or 'Pilot' in it.get('episode_label')
    # show_title should be present
    assert it.get('show_title') == 'Test Show'

    # Also check list_tasks includes a meta_preview with show_title
    tasks = await list_tasks()
    found = False
    for t in tasks:
        if t['id'] == task.id:
            found = True
            assert t.get('meta_preview') and t['meta_preview'].get('show_title') == 'Test Show'
            break
    assert found
