import sqlite3
from pathlib import Path

db = Path(__file__).parent.parent / 'backend' / 'data' / 'mediapruner.db'
print('DB:', db)
con = sqlite3.connect(db)
cur = con.cursor()

cur.execute('SELECT status, COUNT(*) FROM queue_items GROUP BY status')
print('item statuses:', cur.fetchall())
cur.execute('SELECT status, COUNT(*) FROM queue_tasks GROUP BY status')
print('task statuses:', cur.fetchall())
cur.execute('SELECT status, COUNT(*) FROM queue_items GROUP BY status ORDER BY status')
for row in cur.fetchall():
    print(row)
con.close()
