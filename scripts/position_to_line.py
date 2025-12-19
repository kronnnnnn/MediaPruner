from pathlib import Path
s=Path(r'c:/apps/MediaPruner/frontend/src/pages/Queues.tsx').read_text()
pos=5148
line=s.count('\n',0,pos)+1
col=pos - (s.rfind('\n',0,pos)+1)
print('line',line,'col',col)
print('line text:')
print(s.splitlines()[line-1])
print('\ncontext:')
print(s[pos-60:pos+60])