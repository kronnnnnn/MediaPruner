import sqlite3
from pathlib import Path

db = Path(__file__).parent.parent / 'backend' / 'data' / 'mediapruner.db'
print('DB:', db)
if not db.exists():
    print('Database file not found')
    raise SystemExit(1)

con = sqlite3.connect(db, timeout=5)
cur = con.cursor()

try:
    cur.execute('SELECT id, type, status, created_at, started_at, finished_at, total_items, completed_items FROM queue_tasks ORDER BY created_at DESC')
    rows = cur.fetchall()
    print(f'Found {len(rows)} tasks')
    for r in rows[:20]:
        print(r)

    cur.execute('SELECT task_id, COUNT(*) FROM queue_items GROUP BY task_id')
    counts = cur.fetchall()
    print('Item counts per task:', counts)

except Exception as e:
    print('Query failed', e)
finally:
    con.close()
