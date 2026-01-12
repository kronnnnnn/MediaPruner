"""Run database migrations from command line."""
import asyncio
from app.database import migrate_db

if __name__ == "__main__":
    asyncio.run(migrate_db())
