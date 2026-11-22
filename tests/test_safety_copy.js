// 안전 사본(storeSafetyCopy) 공간 검사 테스트. 실행: node tests/test_safety_copy.js
// index.html 의 storeSafetyCopy·storageBytes 를 그대로 꺼내 가짜 localStorage 로 시험
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const grab = name => { const m = html.match(new RegExp('^function ' + name + '\\([^\\n]*(?:\\n(?!function |\\/\\/ |const |let )[^\\n]*)*', 'm')); if (!m) { console.error(name + ' 를 찾지 못했습니다'); process.exit(2); } return m[0]; };
const src = grab('storageBytes') + '\n' + grab('storeSafetyCopy');

function make() {
  const store = new Map(), downloads = [];
  const localStorage = {
    get length() { return store.size; },
    key: i => [...store.keys()][i] ?? null,
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const downloadText = (text, fn) => downloads.push(fn);
  const f = new Function('localStorage', 'downloadText', src + '\nreturn { storeSafetyCopy, storageBytes };')(localStorage, downloadText);
  return Object.assign(f, { localStorage, downloads });
}
const MB = 1048576, chars = bytes => 'x'.repeat(bytes / 2);   // 한 글자 = 2바이트로 셈

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('PASS  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); } }

t('기록 1.5MB + 지난번 사본 1.5MB: 새 사본은 옛 사본 자리를 덮으니 앱 안에 보관 (내려받지 않음)', () => {
  const A = make();
  A.localStorage.setItem('hr_sessions', chars(1.5 * MB));
  A.localStorage.setItem('backup_before_pull', chars(1.5 * MB));
  assert.strictEqual(A.storeSafetyCopy('backup_before_pull', chars(1.5 * MB), 'f.json'), 'stored');
  assert.strictEqual(A.downloads.length, 0);
});
t('두 번째, 세 번째 접속도 계속 앱 안에 보관', () => {
  const A = make();
  A.localStorage.setItem('hr_sessions', chars(1.5 * MB));
  for (let i = 0; i < 3; i++) assert.strictEqual(A.storeSafetyCopy('backup_before_pull', chars(1.5 * MB), 'f.json'), 'stored');
  assert.strictEqual(A.downloads.length, 0);
});
t('정말 공간이 없으면(기록 2MB + 새 사본 2MB > 3.5MB) 여전히 파일로 내려받음', () => {
  const A = make();
  A.localStorage.setItem('hr_sessions', chars(2 * MB));
  assert.strictEqual(A.storeSafetyCopy('backup_before_pull', chars(2 * MB), 'f.json'), 'downloaded');
  assert.deepStrictEqual(A.downloads, ['f.json']);
});
t('다른 키의 사본은 빼 주지 않음 (충돌 사본이 pull 사본 공간을 공짜로 쓰지 않게)', () => {
  const A = make();
  A.localStorage.setItem('hr_sessions', chars(1.5 * MB));
  A.localStorage.setItem('backup_before_pull', chars(1.5 * MB));
  assert.strictEqual(A.storeSafetyCopy('backup_conflict_1', chars(1.5 * MB), 'c.json'), 'downloaded');
});
t('작은 기록은 그대로 앱 안에 보관', () => {
  const A = make();
  A.localStorage.setItem('habit_logs', chars(0.1 * MB));
  assert.strictEqual(A.storeSafetyCopy('backup_before_pull', chars(0.1 * MB), 'f.json'), 'stored');
  assert.strictEqual(A.localStorage.getItem('backup_before_pull').length, chars(0.1 * MB).length);
});

console.log('\n결과: 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
