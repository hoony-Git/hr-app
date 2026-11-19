// artifact/insights.html 만들기: insights.src.html 에 앱과 같은 metrics.js·book-map.js 를 그대로 끼워 넣는다.
// claude.ai 가 페이지를 문서 틀로 감싸므로, 결과에서는 <!doctype>·<html>·<head>·<body> 와 닫는 태그를 뺀다.
// (원본 insights.src.html 은 브라우저로 바로 열어 볼 수 있게 온전한 문서로 둔다)
// 실행: node tools/build_insights.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('artifact/insights.src.html');
const SHELL = [/<!doctype html>\s*/i, /<html\b[^>]*>\s*/i, /<head>\s*/i, /<\/head>\s*/i, /<body>\s*/i, /<\/body>\s*/i, /<\/html>\s*/i];
for (const re of SHELL) {
  if (!re.test(html)) { console.error('원본에서 ' + re + ' 를 찾지 못했습니다'); process.exit(1); }
  html = html.replace(re, '');
}
for (const [mark, file] of [['/*@@METRICS@@*/', 'metrics.js'], ['/*@@BOOKMAP@@*/', 'book-map.js']]) {
  if (html.split(mark).length !== 2) { console.error('표시 ' + mark + ' 가 정확히 한 번 있어야 합니다'); process.exit(1); }
  const src = read(file);
  if (/<\/script/i.test(src)) { console.error(file + ' 안에 </script 가 있어 끼워 넣을 수 없습니다'); process.exit(1); }
  html = html.split(mark).join(src);   // replace() 는 $ 를 특수 문자로 읽으므로 쓰지 않는다
}
if (/<!doctype|<\/?(html|head|body)\b/i.test(html)) { console.error('문서 틀 태그가 남아 있습니다'); process.exit(1); }
fs.writeFileSync(path.join(root, 'artifact/insights.html'), html);
console.log('artifact/insights.html 만듦 (' + Buffer.byteLength(html) + '바이트)');
