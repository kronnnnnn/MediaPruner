import sqlite3
from pathlib import Path

db = Path(__file__).parent.parent / 'backend' / 'data' / 'mediapruner.db'
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute("SELECT id, type, status, created_at, started_at, finished_at, total_items, completed_items FROM queue_tasks WHERE LOWER(status)='queued'")
rows = cur.fetchall()
print('queued tasks (lowercase):')
for r in rows:
    print(r)
cur.execute("SELECT id, type, status, created_at FROM queue_tasks WHERE status='QUEUED' OR LOWER(status)='queued'")
print('all q tasks:')
for r in cur.fetchall():
    print(r)
con.close()