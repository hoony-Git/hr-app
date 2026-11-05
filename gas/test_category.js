// 책 분야 자동 선택 점검: 실제 서버에 접속하지 않고, Code.gs 의 kdc 와 index.html 의 분야 결정 함수를 그대로 꺼내 시험한다.
//   node gas/test_category.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

// --- Code.gs: EA_ADD_CODE -> kdc (test_isbn.js 와 같은 모의 환경) ---
function loadGas(doc) {
  const sb = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ SYNC_TOKEN: 'tok', NL_CERT_KEY: 'K' })[k] ?? null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ TOTAL_COUNT: '1', docs: [doc] }) }) },
    LockService: {}, DriveApp: {}, Utilities: {}, Logger: { log() {} },
    JSON, Date, Error, String, Object, Array, RegExp, parseInt, encodeURIComponent,
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sb);
  return JSON.parse(sb.doPost({ postData: { contents: JSON.stringify({ token: 'tok', action: 'isbn', isbn: '9791155516119' }) } }).text);
}
const gasKdc = code => loadGas({ TITLE: '변신', EA_ADD_CODE: code }).book.kdc;

// --- index.html: 함수 본문을 이름으로 꺼낸다 (중괄호 짝 맞추기) ---
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 없음');
  let d = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}' && --d === 0) return html.slice(i, k + 1); }
  throw new Error(name + ' 끝을 못 찾음');
}
const fe = {};
vm.createContext(fe);
vm.runInContext(['catFromKdc', 'kdcOfBook', 'catFromGoogle', 'applyAutoCat'].map(grab).join('\n'), fe);
const hintOf = kdc => { const c = fe.catFromKdc(kdc); return c && { cat: c, hint: '분야 자동 선택: ' + c + ' (KDC ' + kdc[0] + 'xx)' }; };

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('서버: EA_ADD_CODE 끝 3자리 = kdc', () => {
  assert.strictEqual(gasKdc('03860'), '860');
  assert.strictEqual(gasKdc('13910'), '910');
  assert.strictEqual(gasKdc('05150'), '150');
  assert.strictEqual(gasKdc('03420'), '420');
});
t('서버: 없거나 형식이 틀리면 kdc null', () => {
  [undefined, '', '   ', '860', '0386', '038601', 'abcde', '03 86'].forEach(v => assert.strictEqual(gasKdc(v), null, JSON.stringify(v)));
});
t('8xx -> 문학', () => assert.strictEqual(fe.catFromKdc('860'), '문학'));
t('9xx -> 역사', () => assert.strictEqual(fe.catFromKdc('910'), '역사'));
t('1xx -> 철학', () => assert.strictEqual(fe.catFromKdc('150'), '철학'));
t('4xx -> 과학', () => assert.strictEqual(fe.catFromKdc('420'), '과학'));
t('5xx -> 기타 (그 밖의 주류도 기타)', () => { ['500', '000', '200', '300', '600', '700'].forEach(k => assert.strictEqual(fe.catFromKdc(k), '기타', k)); });
t('코드 없음/이상 -> null (선택 안 건드림)', () => {
  [null, undefined, '', '86', '8600', 'abc', 860].forEach(v => assert.strictEqual(fe.catFromKdc(v), null, String(v)));
  assert.strictEqual(fe.kdcOfBook({ kdc: null, addCode: '03860' }), null);          // 서버가 모른다고 했으면 그대로
  assert.strictEqual(fe.kdcOfBook({ addCode: '03860' }), '860');                    // 옛 서버/옛 캐시는 addCode 로
  assert.strictEqual(fe.kdcOfBook({ addCode: '' }), null);
});
t('Google Books 분야: 확실한 것만 (Fiction -> 문학, Political Science 는 무시)', () => {
  assert.deepStrictEqual({ ...fe.catFromGoogle(['Fiction']) }, { cat: '문학', name: 'Fiction' });
  assert.strictEqual(fe.catFromGoogle(['History']).cat, '역사');
  assert.strictEqual(fe.catFromGoogle(['Philosophy']).cat, '철학');
  assert.strictEqual(fe.catFromGoogle(['Science']).cat, '과학');
  ['Political Science', 'Juvenile Fiction', 'Business & Economics'].forEach(c => assert.strictEqual(fe.catFromGoogle([c]), null, c));
  assert.strictEqual(fe.catFromGoogle(undefined), null);
});
t('조회 후 자동 선택 + 이유 문구', () => {
  const be = { id: null, cat: '기타', catManual: false, catHint: '' };
  assert.strictEqual(fe.applyAutoCat(be, { catAuto: hintOf('860') }), true);
  assert.strictEqual(be.cat, '문학'); assert.strictEqual(be.catHint, '분야 자동 선택: 문학 (KDC 8xx)');
});
t('직접 누른 칩은 덮어쓰지 않음', () => {
  const be = { id: null, cat: '철학', catManual: true, catHint: '' };
  assert.strictEqual(fe.applyAutoCat(be, { catAuto: hintOf('860') }), false);
  assert.strictEqual(be.cat, '철학'); assert.strictEqual(be.catHint, '');
  const be2 = { id: null, cat: '기타', catManual: true, catHint: '' };   // 사용자가 일부러 '기타'를 눌러도 그대로
  assert.strictEqual(fe.applyAutoCat(be2, { catAuto: hintOf('860') }), false); assert.strictEqual(be2.cat, '기타');
});
t('kdc 모름(catAuto 없음)이면 현재 선택 유지', () => {
  const be = { id: null, cat: '과학', catManual: false, catHint: '' };
  assert.strictEqual(fe.applyAutoCat(be, { catAuto: null }), false); assert.strictEqual(be.cat, '과학');
});
t('이미 있는 책(id 있음) 수정 중에는 분야를 바꾸지 않음', () => {
  const be = { id: 'b1', cat: '기타', catManual: false, catHint: '' };
  assert.strictEqual(fe.applyAutoCat(be, { catAuto: hintOf('860') }), false); assert.strictEqual(be.cat, '기타');
});

console.log('\n전부 통과 (' + n + '개)');
