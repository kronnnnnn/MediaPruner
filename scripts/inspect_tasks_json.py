import json
import requests
r = requests.get('http://127.0.0.1:8000/api/queues/tasks?limit=10')
print('status', r.status_code)
if r.ok:
    data = r.json()
    for t in data:
        print('TASK', t['id'], t['type'], t['status'])
        for it in t.get('items', [])[:5]:
            print(' ', it['index'], it['status'], 'movie_title=', it.get('movie_title'), 'result=', it.get('result'), 'result_summary=', it.get('result_summary'))
