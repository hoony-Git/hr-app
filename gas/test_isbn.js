// ISBN 조회(Code.gs 의 doIsbn_) 점검: 실제 구글·국립중앙도서관에 접속하지 않고 Apps Script 부품만 흉내 낸다.
//   node gas/test_isbn.js
// 응답 항목 이름은 실제 응답(2026-10-26)으로 확인했다. 아래 시험 값 중 '실제 값'이라고 적은 것은 그때 받은 응답에서 가져왔다.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const SECRET = 'SECRETKEY123';
function load({ props, nl }) {
  const calls = [], cacheMap = {};
  const sb = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) },
    CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; } }) },
    UrlFetchApp: { fetch: (url, opt) => { calls.push(url); return nl(url, opt); } },
    LockService: {}, DriveApp: {}, Utilities: {}, Logger: { log() {} },
    JSON, Date, Error, String, Object, Array, RegExp, parseInt, encodeURIComponent,
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sb, { filename: 'Code.gs' });
  const post = body => JSON.parse(sb.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { post, calls, sb };
}
const ok = body => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(body) });
const DOC = { TITLE: ' 어린 왕자 ', AUTHOR: '생텍쥐페리', PUBLISHER: '문학동네', PAGE: '352 p.', EA_ADD_CODE: '03860', TITLE_URL: 'http://cover.example/a.jpg' };
const base = { SYNC_TOKEN: 'tok', NL_CERT_KEY: SECRET };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  -', name); };

t('토큰이 없거나 틀리면 거부 (외부 호출 없음)', () => {
  const { post, calls } = load({ props: base, nl: () => ok({ docs: [DOC] }) });
  assert.strictEqual(post({ action: 'isbn', isbn: '9788937460777' }).error, 'unauthorized');
  assert.strictEqual(post({ token: 'x', action: 'isbn', isbn: '9788937460777' }).error, 'unauthorized');
  assert.strictEqual(calls.length, 0);
});
t('ISBN 형식 검사', () => {
  const { post, calls } = load({ props: base, nl: () => ok({ docs: [DOC] }) });
  [undefined, '', '123', '9780306406157x', '1234567890123', '97803064061577', 12345].forEach(v =>
    assert.strictEqual(post({ token: 'tok', action: 'isbn', isbn: v }).error, 'bad_isbn', String(v)));
  assert.strictEqual(calls.length, 0);
});
t('인증키 속성이 없으면 not_configured (외부 호출 없음)', () => {
  const { post, calls } = load({ props: { SYNC_TOKEN: 'tok' }, nl: () => ok({}) });
  assert.strictEqual(post({ token: 'tok', action: 'isbn', isbn: '9788937461798' }).error, 'not_configured');
  assert.strictEqual(calls.length, 0);
});
t('성공: 항목 변환 + https 표지 + 요청 주소 구성', () => {
  const { post, calls } = load({ props: base, nl: () => ok({ docs: [DOC] }) });
  const r = post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.deepStrictEqual(r, { ok: true, book: { title: '어린 왕자', author: '생텍쥐페리', publisher: '문학동네', pages: 352, coverUrl: 'https://cover.example/a.jpg', addCode: '03860' } });
  assert.ok(calls[0].includes('isbn=9788937461798') && calls[0].includes('result_style=json') && calls[0].includes('cert_key=' + SECRET));
  assert.ok(!JSON.stringify(r).includes(SECRET));
});
t('같은 ISBN 은 캐시에서 (외부 호출 1번)', () => {
  const { post, calls } = load({ props: base, nl: () => ok({ docs: [DOC] }) });
  post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  const r2 = post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.strictEqual(r2.ok, true); assert.strictEqual(calls.length, 1);
});
t('없는 책은 not_found, 캐시하지 않음', () => {
  for (const payload of [{ docs: [] }, { TOTAL_COUNT: '0' }, { docs: [{ AUTHOR: 'x' }] }, { docs: ['x'] }]) {
    const { post, calls } = load({ props: base, nl: () => ok(payload) });
    assert.strictEqual(post({ token: 'tok', action: 'isbn', isbn: '9788937461798' }).error, 'not_found', JSON.stringify(payload));
    post({ token: 'tok', action: 'isbn', isbn: '9788937461798' }); assert.strictEqual(calls.length, 2);
  }
});
t('상류 오류: 응답 오류코드 / HTTP 오류 / 예외 — 인증키가 응답에 새지 않음', () => {
  let r = load({ props: base, nl: () => ok({ RESULT: 'ERROR', ERR_CODE: '010', ERR_MESSAGE: '인증키 정보가 없습니다.' }) }).post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.deepStrictEqual(r, { ok: false, error: 'upstream_error', code: '010' });
  r = load({ props: base, nl: () => ({ getResponseCode: () => 503, getContentText: () => 'x' }) }).post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.deepStrictEqual(r, { ok: false, error: 'upstream_error', code: 'http_503' });
  for (const thrower of [() => { throw new Error('failed https://www.nl.go.kr/?cert_key=' + SECRET); }, () => ({ getResponseCode: () => 200, getContentText: () => 'not json ' + SECRET })]) {
    r = load({ props: base, nl: thrower }).post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
    assert.strictEqual(r.error, 'upstream_error'); assert.ok(!JSON.stringify(r).includes(SECRET));
    assert.ok(r.detail && r.detail.includes('***'), '이유는 보이되 키는 *** 로 가려짐: ' + r.detail);   // 인코딩된 키도 가려지는지는 아래 별도 시험
  }
  // 특수문자가 든 키는 주소에서 인코딩된 모양(%2B 등)으로 오류 문장에 섞일 수 있다 — 원문·인코딩형 모두 가려져야 한다
  const WEIRD = 'ab+/=cd';
  r = load({ props: { SYNC_TOKEN: 'tok', NL_CERT_KEY: WEIRD }, nl: () => { throw new Error('DNS error: https://x/?cert_key=' + encodeURIComponent(WEIRD) + ' / raw ' + WEIRD); } })
    .post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  const js = JSON.stringify(r);
  assert.ok(!js.includes(encodeURIComponent(WEIRD)) && !js.includes(WEIRD), js);
  assert.ok(r.detail.includes('***'), r.detail);
  r = load({ props: base, nl: () => ok([1, 2]) }).post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.strictEqual(r.error, 'upstream_error');
});
t('인증키 앞뒤 공백·줄바꿈은 제거해서 요청', () => {
  const { post, calls } = load({ props: { SYNC_TOKEN: 'tok', NL_CERT_KEY: '  ' + SECRET + '\n' }, nl: () => ok({ docs: [DOC] }) });
  assert.strictEqual(post({ token: 'tok', action: 'isbn', isbn: '9788937461798' }).ok, true);
  assert.ok(calls[0].includes('cert_key=' + SECRET + '&'), calls[0]);
});
t('원인 구분: 오류 이유가 "fetch:" / "json:" 으로 시작', () => {
  let r = load({ props: base, nl: () => { throw new Error('권한 없음'); } }).post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.ok(r.detail.startsWith('fetch: 권한 없음'), r.detail);
  r = load({ props: base, nl: () => ({ getResponseCode: () => 200, getContentText: () => '<html>오류</html>' }) }).post({ token: 'tok', action: 'isbn', isbn: '9788937461798' });
  assert.ok(r.detail.startsWith('json: <html>'), r.detail);
});
t('저자·출판사 표기 다듬기 (실제 응답 값)', () => {
  const { sb } = load({ props: base, nl: () => ok({}) });
  [['프랑수아즈 사강 [지음] ;김남주 옮김', '프랑수아즈 사강'], ['제임스 클리어 지음 ;이한이 옮김', '제임스 클리어'], ['조지 오웰', '조지 오웰'],
   ['앙투안 드 생텍쥐페리', '앙투안 드 생텍쥐페리'], ['유발 하라리', '유발 하라리'], ['', ''], [null, ''], ['홍길동 지음 [글]', '홍길동']]
    .forEach(([raw, want]) => assert.strictEqual(sb.cleanAuthor_(raw), want, String(raw)));
  [['(주)민음사', '민음사'], ['민음사', '민음사'], ['열린책들', '열린책들'], ['문학동네(주)', '문학동네'], [null, '']]
    .forEach(([raw, want]) => assert.strictEqual(sb.cleanPublisher_(raw), want, String(raw)));
});
t('쪽수 해석', () => {
  const { sb } = load({ props: base, nl: () => ok({}) });
  [['352 p.', 352], ['약 640쪽 내외', 640], ['359 p.', 359], ['448', 448], ['xii, 120p', 120], ['', null], [null, null], ['쪽수없음', null], [352, null]].forEach(([raw, want]) => assert.strictEqual(sb.parsePages_(raw), want, String(raw)));
});
console.log('\n전부 통과 (' + n + '개)');
