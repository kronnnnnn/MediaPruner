"""Move legacy DB from repository root ./data to backend/data (safe copy + backup).

Usage: python -m backend.scripts.move_db_file
"""
from pathlib import Path
import shutil

project_root = Path(__file__).resolve().parents[1]
legacy = project_root / 'data' / 'mediapruner.db'
dest_dir = project_root / 'backend' / 'data'
dest = dest_dir / 'mediapruner.db'

if not legacy.exists():
    print(f"No legacy DB found at {legacy}")
    raise SystemExit(1)

if dest.exists():
    print(f"Destination DB already exists at {dest}; aborting to avoid overwrite.")
    raise SystemExit(2)

dest_dir.mkdir(parents=True, exist_ok=True)
backup = legacy.with_suffix('.bak')
shutil.copy2(legacy, backup)
shutil.move(str(legacy), str(dest))
print(f"Moved {legacy} -> {dest}; backup at {backup}")
