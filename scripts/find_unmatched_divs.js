const fs = require('fs');
const s = fs.readFileSync('frontend/src/components/MovieDetail.tsx', 'utf8');
const lines = s.split('\n');
let stack = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div(\s|>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  for (let j = 0; j < opens; j++) stack.push({ line: i + 1, text: line });
  for (let j = 0; j < closes; j++) {
    if (stack.length) stack.pop(); else console.log('Extra close at', i + 1);
  }
}
if (stack.length) {
  console.log('Unmatched opens count', stack.length);
  console.log('Last unmatched opens (top 20):');
  console.log(stack.slice(-20).map(x => x.line));
} else console.log('All divs matched');
