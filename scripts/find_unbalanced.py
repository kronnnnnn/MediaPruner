from pathlib import Path
s=Path(r'c:/apps/MediaPruner/frontend/src/pages/Queues.tsx').read_text()
stack=[]
for i,ch in enumerate(s, start=1):
    if ch=='(': stack.append(i)
    elif ch==')':
        if stack: stack.pop()
        else: print('unmatched ) at', i)

print('unmatched opens count', len(stack))
if stack:
    pos=stack[-1]
    print('last unmatched ( at', pos)
    print('context:', s[max(0,pos-60):pos+60])
else:
    print('all parens matched')

