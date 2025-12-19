"""Utility to normalize legacy media_type values in the database.

Usage: python backend/scripts/normalize_media_type.py

This will uppercase any media_type values that are not already uppercase so they
match the SQLAlchemy Enum naming (e.g., 'tv' -> 'TV'). It prints a summary of
changes made.
"""
import asyncio
import sys
import os
from sqlalchemy import text

# Ensure the backend package is on sys.path when running as a script from repo root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import engine


async def normalize():
    async with engine.begin() as conn:
        # Count rows needing normalization
        res = await conn.execute(text("SELECT COUNT(*) FROM library_paths WHERE media_type IS NOT NULL AND media_type != UPPER(media_type)"))
        count = res.scalar() or 0
        print(f"Rows requiring normalization: {count}")
        if count == 0:
            print("Nothing to do.")
            return

        # Perform normalization
        await conn.execute(text("UPDATE library_paths SET media_type = UPPER(media_type) WHERE media_type IS NOT NULL AND media_type != UPPER(media_type)"))
        print("Normalization applied.")

        # Verify
        res2 = await conn.execute(text("SELECT COUNT(*) FROM library_paths WHERE media_type IS NOT NULL AND media_type != UPPER(media_type)"))
        remaining = res2.scalar() or 0
        print(f"Remaining rows requiring normalization: {remaining}")


if __name__ == '__main__':
    asyncio.run(normalize())
