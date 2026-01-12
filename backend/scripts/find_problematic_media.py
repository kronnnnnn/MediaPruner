"""
Find movies that were analyzed but lack video resolution or look problematic,
run ffprobe/ffmpeg probes to gather diagnostics and optionally mark failures.

Usage:
  python scripts/find_problematic_media.py [--fix]

When run, the script will print movies that meet the heuristic:
- media_info_scanned is true, but video_resolution is null/empty OR
- media_info_scanned is true and media_info_failed is true

For each candidate it runs the ffprobe_probe() helper from
`app.services.mediainfo` to gather diagnostics and prints a summary.
"""

import asyncio
import argparse
import sys
from pathlib import Path
import json

# Ensure backend package root is on sys.path when run as a script
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

async def find_and_probe(fix: bool = False):
    from sqlalchemy import text
    from app.database import engine

    async with engine.begin() as conn:
        rows = await conn.execute(text("SELECT id, title, file_path, media_info_scanned, media_info_failed, video_resolution, video_width, video_height FROM movies"))
        movies = rows.fetchall()

    candidates = []
    for r in movies:
        mid, title, path, scanned, failed, res, w, h = r
        if not scanned:
            continue
        if failed:
            candidates.append((mid, title, path, 'failed'))
            continue
        if not res or not w or not h:
            candidates.append((mid, title, path, 'missing_resolution'))

    if not candidates:
        print('No problematic movies found')
        return 0

    print(f'Found {len(candidates)} candidate(s)')

    from app.services import mediainfo

    for mid, title, path, reason in candidates:
        print('\n---')
        print(f'id={mid} title="{title}" reason={reason} path={path}')
        try:
            probe = mediainfo.ffprobe_probe(path)
            # probe is a MediaInfoResult dataclass
            try:
                diag = probe.diagnostics
            except Exception:
                diag = {}
            summary = {
                'video_resolution': probe.video_resolution,
                'video_width': probe.video_width,
                'video_height': probe.video_height,
                'video_codec': probe.video_codec,
                'audio_codec': probe.audio_codec,
                'ffprobe_streams': diag.get('ffprobe_streams'),
                'ffmpeg_returncode': diag.get('ffmpeg_returncode'),
                'ffmpeg_stderr_tail': diag.get('ffmpeg_stderr_tail'),
            }
            print(json.dumps(summary, indent=2, default=str))

            # Mark as failed if asked to fix and there are clear problems:
            # - ffmpeg returned a non-zero code
            # - probe.error present
            # - no video stream detected (missing resolution)
            has_video = False
            streams = diag.get('ffprobe_streams') or []
            for s in streams:
                if s.get('codec_type') == 'video':
                    has_video = True
                    break

            if fix and (probe.error or diag.get('ffmpeg_returncode') or not has_video or reason == 'failed'):
                # Mark media_info_failed in DB for follow-up
                async with engine.begin() as conn:
                    from sqlalchemy import text
                    await conn.execute(
                        text("UPDATE movies SET media_info_failed = 1 WHERE id = :id"),
                        {'id': mid}
                    )
                print('Marked as media_info_failed in DB')
        except Exception as e:
            print('Probe error:', e)

    return 0

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fix', action='store_true', help='Mark problematic files as failed in the DB')
    args = parser.parse_args()
    asyncio.run(find_and_probe(fix=args.fix))
