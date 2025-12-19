from pathlib import Path
s=Path(r'c:/apps/MediaPruner/frontend/src/pages/Queues.tsx').read_text()
print('len',len(s))
for ch in ['(',')','{','}','`','[',']']:
    print(ch, s.count(ch))
