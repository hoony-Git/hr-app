// artifact/insights.html 만들기: insights.src.html 에 앱과 같은 metrics.js·book-map.js 를 그대로 끼워 넣는다.
// 실행: node tools/build_insights.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('artifact/insights.src.html');
for (const [mark, file] of [['/*@@METRICS@@*/', 'metrics.js'], ['/*@@BOOKMAP@@*/', 'book-map.js']]) {
  if (html.split(mark).length !== 2) { console.error('표시 ' + mark + ' 가 정확히 한 번 있어야 합니다'); process.exit(1); }
  const src = read(file);
  if (/<\/script/i.test(src)) { console.error(file + ' 안에 </script 가 있어 끼워 넣을 수 없습니다'); process.exit(1); }
  html = html.split(mark).join(src);   // replace() 는 $ 를 특수 문자로 읽으므로 쓰지 않는다
}
fs.writeFileSync(path.join(root, 'artifact/insights.html'), html);
console.log('artifact/insights.html 만듦 (' + html.length + '자)');
