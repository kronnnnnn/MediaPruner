import sqlite3
from pathlib import Path

p = Path(__file__).parent.parent / 'backend' / 'data' / 'mediapruner.db'
con = sqlite3.connect(p)
cur = con.cursor()
cur.execute("UPDATE queue_tasks SET status = LOWER(status) WHERE status IS NOT NULL AND status != LOWER(status)")
cur.execute("UPDATE queue_items SET status = LOWER(status) WHERE status IS NOT NULL AND status != LOWER(status)")
con.commit()
cur.execute("SELECT status, COUNT(*) FROM queue_tasks GROUP BY status")
print('task statuses:', cur.fetchall())
cur.execute("SELECT status, COUNT(*) FROM queue_items GROUP BY status")
print('item statuses:', cur.fetchall())
con.close()
