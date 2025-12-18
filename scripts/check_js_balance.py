import sys
from pathlib import Path
p = Path('frontend/src/pages/Movies.tsx')
s = p.read_text(encoding='utf-8')
stack = []
pairs = {'}':'{', ']':'[', ')':'('}
for i, ch in enumerate(s, 1):
    if ch in '{[(': stack.append((ch, i))
    elif ch in '}])':
        if not stack:
            print(f'Unmatched closer {ch} at pos {i}')
            sys.exit(1)
        top, pos = stack.pop()
        if top != pairs[ch]:
            print(f'Mismatched {top} from {pos} with {ch} at {i}')
            sys.exit(1)
if stack:
    for ch, pos in stack:
        print(f'Unclosed {ch} from {pos}')
    sys.exit(1)
print('All braces matched')