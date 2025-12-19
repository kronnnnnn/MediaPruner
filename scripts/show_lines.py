from pathlib import Path
s=Path('c:/apps/MediaPruner/frontend/src/pages/Queues.tsx').read_text()
lines=s.splitlines()
for i in range(180,209):
    print(f"{i+1:4}: {lines[i]}")
