#!/usr/bin/env python3
"""Script to clear all queued/running tasks (marks tasks DELETED and their queued/running items CANCELED).
Usage: python scripts/clear_all_queued_tasks.py
"""
import asyncio
from pathlib import Path
import sys
import os

# Ensure backend package is importable
repo_root = Path(__file__).resolve().parents[1]
backend_dir = repo_root / 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Optionally set debug env so that debug-only endpoints would be allowed if used
os.environ.setdefault('MB_DEBUG', 'true')

async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--scope', choices=['current', 'history', 'all'], default='current')
    parser.add_argument('--older-than', type=int, default=None, help='Only clear tasks older than this many seconds')
    args = parser.parse_args()

    print(f"Connecting and clearing tasks (scope={args.scope})...")
    try:
        from app.services.queue import clear_queued_tasks
        res = await clear_queued_tasks(scope=args.scope, older_than_seconds=args.older_than)
        print('Result:', res)
    except Exception as e:
        print('Failed to clear queued tasks:', e)

if __name__ == '__main__':
    asyncio.run(main())
