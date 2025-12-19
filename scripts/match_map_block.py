from pathlib import Path
s=Path(r'c:/apps/MediaPruner/frontend/src/pages/Queues.tsx').read_text()
start = s.find('groupItemsByStatus(displayItems).map')
print('start', start)
if start==-1:
    raise SystemExit('not found')
# find first '{' after start that opens the arrow function body
i = s.find('{', start)
print('first { at', i, 'snippet:', s[i-40:i+40])
# now find matching closing '}' for this '{'
level=0
for j,ch in enumerate(s[i:], start=i):
    if ch=='{': level+=1
    elif ch=='}':
        level-=1
        if level==0:
            print('matching } at', j)
            print('snippet end:', s[j-40:j+40])
            print('between start and j length', j-i)
            print(s[i:j+1])
            break
else:
    print('no match')
