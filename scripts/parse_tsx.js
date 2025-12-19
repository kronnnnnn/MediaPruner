const fs = require('fs');
const parser = require('@babel/parser');
const code = fs.readFileSync('frontend/src/pages/Queues.tsx','utf8');
try {
  parser.parse(code, {sourceType: 'module', plugins: ['typescript','jsx']});
  console.log('parsed ok');
} catch (e) {
  console.error('parse error:', e.message);
  console.error(e.loc);
}
