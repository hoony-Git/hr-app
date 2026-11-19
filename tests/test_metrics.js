// metrics.js 단위 테스트 + 앱 기존 계산과 같은 숫자가 나오는지 비교. 실행: node tests/test_metrics.js
// 데이터는 전부 이 파일 안에서 만든 가짜 값이다.
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require('../metrics.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('PASS  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + String(e.message || e).split('\n').join('\n      ')); } }
const K = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;   // 한국 시간 -> epoch
const DAY = 86400000;

// ---------- 앱 쪽 계산 꺼내기 ----------
const core = html.match(/\/\* TL-CORE-BEGIN \*\/([\s\S]*?)\/\* TL-CORE-END \*\//);
if (!core) { console.error('TL-CORE 구간을 찾지 못했습니다'); process.exit(2); }
const T = new Function(core[1] + '\nreturn { TL_DEFAULT_CATS, tlResolve, tlStats, tlDayStart, tlWeekStart };')();
function grab(re, label) { const m = html.match(re); if (!m) { console.error(label + ' 를 index.html 에서 찾지 못했습니다'); process.exit(2); } return m[0]; }
const z2src = [grab(/function wsDay\(\)[^\n]*/, 'wsDay'), grab(/function getSessions\(\)[^\n]*/, 'getSessions'),
  grab(/function startOfWeek\(\) \{[\s\S]*?\n\}/, 'startOfWeek'), grab(/function weeklyZone2Min\(\)\{[\s\S]*?\n\}/, 'weeklyZone2Min')].join('\n');
function appZone2(store) {
  const ls = { getItem: k => (k in store ? JSON.stringify(store[k]) : null) };
  return new Function('localStorage', 'settings', z2src + '\nreturn weeklyZone2Min();')(ls, store.hr_settings || {});
}
const appAuto = sessions => sessions.filter(s => s.duration > 0 && s.duration < 12 * 3600).map(s => ({ id: 'auto-hr-' + s.date, start: s.date - s.duration * 1000, end: s.date, catId: 'exercise', source: 'auto-hr', note: '' }));

// ---------- 가짜 데이터 ----------
const cats = T.TL_DEFAULT_CATS.map((c, i) => Object.assign({ order: i, archived: false }, c));
function fakeTime(day0, nDays) {   // 하루: 0~7 수면, 9~18 업무, 20~21 유튜브(주말은 3시간), 21:30~22 독서
  const o = {};
  for (let i = 0; i < nDays; i++) {
    const ds = day0 + i * DAY, dow = (new Date(ds + 9 * 3600000).getUTCDay() + 6) % 7, we = dow >= 5;
    const add = (h1, h2, catId) => { const s = ds + h1 * 3600000, e = ds + h2 * 3600000, d = new Date(s + 9 * 3600000);
      const k = 'time_log_' + d.getUTCFullYear() + '_' + String(d.getUTCMonth() + 1).padStart(2, '0'); (o[k] = o[k] || []).push({ id: 'e' + s + catId, start: s, end: e, catId, source: 'manual', note: '' }); };
    if (i % 9 === 4) continue;   // 가끔 기록 없는 날
    add(0, we ? 9 : 7, 'sleep'); add(9, 18, we ? 'rest' : 'work'); add(20, we ? 23 : 21, 'youtube'); add(21.5, 22, 'read');
  }
  return o;
}
const NOW = K(2026, 11, 20, 15, 0);   // 금요일 15시
const store = Object.assign(fakeTime(K(2026, 10, 15), 37), {
  time_categories: cats,
  time_current: { catId: 'dev', start: K(2026, 11, 20, 14, 0) },
  hr_settings: { age: 40, goal: 120, weekStart: 'mon' },
  hr_sessions: [
    { date: K(2026, 11, 20, 8, 40), duration: 2400, zoneSec: [0, 300, 1500, 300, 0, 0] },
    { date: K(2026, 11, 18, 20, 0), duration: 3000, zoneSec: [0, 200, 2000, 600, 0, 0] },
    { date: K(2026, 11, 10, 7, 0), duration: 1800, zoneSec: [0, 100, 1200, 0, 0, 0] },
    { date: K(2026, 11, 5, 7, 0), duration: 1800, zoneSec: [0, 100, 1200, 0, 0, 0] },
    { date: K(2026, 11, 20, 13, 30), duration: 1800, zoneSec: [0, 0, 900, 0, 0, 0] },   // 수동 기록(업무)과 겹치는 운동 -> 수동이 이김
  ],
  hr_measures: [],
  book_list: [
    { id: 'b1', isbn: '9780000000001', title: '가짜 소설', author: 'A', category: '문학', status: 'done', rating: 5, review: '좋았다', startedAt: '2026-10-01', finishedAt: '2026-11-10', startPage: 1, endPage: 100 },
    { id: 'b2', isbn: '9780000000002', title: '가짜 잡학', author: 'B', category: '기타', status: 'done', rating: 3, review: '', startedAt: '2026-01-01', finishedAt: '2026-02-03', startPage: 1, endPage: 100 },
    { id: 'b3', isbn: '', title: '수기 입력 책', author: 'C', category: '기타', status: 'reading', rating: null, review: '', startedAt: '2026-11-01', finishedAt: null, startPage: 1, endPage: 100 },
    { id: 'b4', isbn: '9780000000004', title: '가짜 역사', author: 'D', category: '역사', status: 'done', rating: 4, review: '로마', startedAt: '2026-03-01', finishedAt: '2026-04-20', startPage: 1, endPage: 100, kdc: '909' },
    { id: 'b5', title: '이상한 분야', category: '없는분야', status: 'stopped' },
  ],
  book_logs: { b1: { '2026-10-02': { page: 30, note: '첫인상' }, '2026-10-05': { page: 60, note: '' } }, b3: { '2026-11-02': { page: 20, note: '로마 이야기' } } },
  book_targets: { '문학': 50 },
  book_links: [{ a: 'b1', b: 'b4', reason: '같은 시대', approved: true }, { a: 'b1', b: 'b2', reason: '제안만', approved: false }, { a: 'b1', b: 'zz', approved: true }],
});
// 측정: 지난 30일 매일 07시 (rhr 55, hrv 50), 최근 7일 중 5일은 07시에 rhr 52·hrv 60, 그리고 저녁 측정 몇 개
for (let i = 0; i < 30; i++) {
  const d = new Date(NOW - i * DAY); d.setHours(7, 0, 0, 0);
  if (d.getTime() > NOW) continue;
  const recent = i < 5;
  store.hr_measures.push({ date: d.getTime(), rhr: recent ? 52 : 55, hrv: recent ? 60 : 50 });
  if (i % 3 === 0) { const e = new Date(d); e.setHours(21); if (e.getTime() <= NOW) store.hr_measures.push({ date: e.getTime(), rhr: 65, hrv: null }); }
}

// ================= 앱 계산과 비교 =================
const appSegs = T.tlResolve(Object.values(store).length && Object.keys(store).filter(k => /^time_log_/.test(k)).flatMap(k => store[k])
  .concat(appAuto(store.hr_sessions)).concat([{ id: '__cur', start: store.time_current.start, end: null, catId: 'dev', source: 'manual', note: '' }]), NOW);

t('시간: 오늘 분류별 분 = 시간 탭(TL-CORE tlStats)', () => {
  const d0 = T.tlDayStart(NOW), app = T.tlStats(appSegs, d0, d0 + DAY, cats, NOW).byCat, mine = M.timeuse(store, '2026-11-20', NOW);
  Object.keys(app).forEach(k => assert.strictEqual(mine.categories.find(c => c.id === k).todayMin, Math.round(app[k]), k));
  assert.strictEqual(mine.categories.filter(c => c.todayMin > 0).length, Object.keys(app).filter(k => Math.round(app[k]) > 0).length);
});
t('시간: 28일 하루 평균 = TL-CORE 합계 ÷ 기록 있는 날', () => {
  const d0 = T.tlDayStart(NOW), st = T.tlStats(appSegs, d0 - 28 * DAY, d0, cats, NOW), mine = M.timeuse(store, '2026-11-20', NOW);
  Object.keys(st.byCat).forEach(k => assert.strictEqual(mine.categories.find(c => c.id === k).avg28Min, Math.round(st.byCat[k] / st.recDays), k));
  assert.strictEqual(mine.baseline.n, st.recDays);
  assert(Math.abs(mine.baseline.coverage - st.cov) < 0.001, 'coverage ' + mine.baseline.coverage + ' vs ' + st.cov);
});
t('시간: 이번 주·오늘 기록률 = TL-CORE covSoFar', () => {
  const d0 = T.tlDayStart(NOW), ws = T.tlWeekStart(NOW), mine = M.timeuse(store, '2026-11-20', NOW);
  assert.strictEqual(mine.coverage.week, Math.round(T.tlStats(appSegs, ws, ws + 7 * DAY, cats, NOW).covSoFar * 1000) / 10);
  assert.strictEqual(mine.coverage.today, Math.round(T.tlStats(appSegs, d0, d0 + DAY, cats, NOW).covSoFar * 1000) / 10);
});
['mon', 'sun'].forEach(wsSet => t('운동: 이번 주 Zone 2 분 = 심박 탭 weeklyZone2Min (주 시작 ' + wsSet + ')', () => {
  const now = Date.now(), s = JSON.parse(JSON.stringify(store));
  s.hr_settings.weekStart = wsSet;
  s.hr_sessions = [0, 1, 2, 3, 5, 6, 8, 10, 13].map((d, i) => ({ date: now - d * DAY - 60000, duration: 1800, zoneSec: [0, 0, 600 + i * 97, 0, 0, 0] }));
  assert.strictEqual(M.exercise(s, now).zone2.min, appZone2(s));
  assert.strictEqual(M.exercise(s, now, wsSet).zone2.min, appZone2(s));
}));

// ================= 자체 규칙 =================
t('독서: 분야별 권수·완독·목표(덮어쓴 목표 반영)·후보', () => {
  const r = M.reading(store, NOW), f = c => r.fields.find(x => x.cat === c);
  assert.strictEqual(r.total, 5); assert.strictEqual(r.completed, 3);
  assert.deepStrictEqual([f('문학').count, f('문학').completed, f('문학').target, f('문학').pct], [1, 1, 50, 2]);
  assert.strictEqual(f('역사').target, 200);
  assert.strictEqual(f('기타').count, 3, '모르는 분야는 기타로');
  assert.strictEqual(r.candidates, 1, 'ISBN 있고 기타인 책만 (b2)');
  assert.strictEqual(r.monthly.length, 12); assert.strictEqual(r.monthly[11].month, '2026-11'); assert.strictEqual(r.monthly[11].completed, 1);
  assert.strictEqual(r.recent[0].id, 'b1');
  assert.deepStrictEqual(r.notesPerBook.find(x => x.id === 'b1'), { id: 'b1', title: '가짜 소설', notes: 1, hasReview: true });
});
t('독서 지도 데이터: 승인된 연결만, 없는 책 연결은 버림, 최근 30일 완독 표시, kdc 없는 책도 정상', () => {
  const d = M.mapData(store, NOW);
  assert.deepStrictEqual(d.links, [{ a: 'b1', b: 'b4', reason: '같은 시대' }]);
  const b1 = d.books.find(b => b.id === 'b1');
  assert.strictEqual(b1.recent, true); assert.strictEqual(b1.kdc, null); assert.strictEqual(b1.linked[0].id, 'b4');
  assert.strictEqual(d.books.find(b => b.id === 'b4').kdc, '909');
  assert.strictEqual(d.books.find(b => b.id === 'b2').candidate, true);
});
t('책 검색: 제목·감상·메모', () => {
  const ids = M.searchBooks(store, '로마').map(x => x.id).sort();
  assert.deepStrictEqual(ids, ['b3', 'b4']);
  assert.deepStrictEqual(M.searchBooks(store, '로마').find(x => x.id === 'b3').matched, ['메모']);
  assert.deepStrictEqual(M.searchBooks(store, '  '), []);
});
t('운동: 세션 수·쉰 날·안정시 심박/HRV 7일 vs 30일 (전체·아침)', () => {
  const e = M.exercise(store, NOW, 'mon');
  assert.strictEqual(e.sessions.thisWeek, 3);
  assert.strictEqual(e.sessions.prev4Weeks, 2);
  assert.strictEqual(e.daysSinceLast, 0);
  const mo = e.measures.morning;
  assert.strictEqual(mo.rhr.n7, 7); assert.strictEqual(mo.rhr.n30, 30);
  assert.strictEqual(mo.rhr.mean7, Math.round((5 * 52 + 2 * 55) / 7 * 10) / 10);
  assert(mo.rhr.diff < 0, '최근 7일 안정시 심박이 낮다');
  assert(e.measures.all.rhr.n7 > mo.rhr.n7, '저녁 측정이 전체에만 들어감');
  assert.strictEqual(mo.hrv.insufficient, false);
  assert.strictEqual(e.zone2.goal, 120);
});
t('운동: 측정이 2개뿐이면 insufficient', () => {
  const s = Object.assign({}, store, { hr_measures: [{ date: NOW - 3600000, rhr: 50, hrv: 40 }, { date: NOW - DAY, rhr: 51, hrv: 41 }] });
  const r = M.exercise(s, NOW).measures.all.rhr;
  assert.strictEqual(r.n7, 2); assert.strictEqual(r.insufficient, true);
});
t('시간: 수면 평일 vs 주말 (주말이 2시간 더)', () => {
  const s = M.timeuse(store, '2026-11-20', NOW).sleep;
  assert.strictEqual(s.weekday.hours, 7); assert.strictEqual(s.weekend.hours, 9); assert.strictEqual(s.diffHours, 2);
  assert(s.weekday.n >= 3);
});
t('시간: 분류 목록이 없으면 앱 기본 분류 이름 (TL_DEFAULT_CATS 와 같음)', () => {
  const app = {}; T.TL_DEFAULT_CATS.forEach(c => { app[c.id] = c.name; });
  assert.deepStrictEqual(M.DEFAULT_CAT_NAMES, app);
  const s = Object.assign({}, store); delete s.time_categories;
  assert.strictEqual(M.timeuse(s, '2026-11-20', NOW).categories.find(c => c.id === 'work').name, '회사 업무');
  assert.strictEqual(M.timeuse(store, '2026-11-20', NOW).categories.find(c => c.id === 'work').name, '회사 업무');
});
t('시간: 잘못된 날짜', () => assert.strictEqual(M.timeuse(store, '2026/11/20', NOW).error, 'bad_day'));
t('목표: 기본값 + insight_goals 덮어쓰기 + 상태', () => {
  const g = M.goals(store, NOW, 'mon');
  assert.strictEqual(g.youtube.goal, 60); assert.strictEqual(g.sleep.goal, 7); assert.strictEqual(g.zone2.goal, 120, 'hr_settings.goal');
  assert.strictEqual(g.zone2.value, M.exercise(store, NOW, 'mon').zone2.min);
  assert(['ok', 'over'].includes(g.youtube.status));
  const g2 = M.goals(Object.assign({}, store, { insight_goals: { youtube_max_min_per_day: 30, sleep_min_hours: 9, zone2_weekly_min: 10 } }), NOW, 'mon');
  assert.strictEqual(g2.youtube.status, 'over'); assert.strictEqual(g2.sleep.status, 'under'); assert.strictEqual(g2.zone2.status, 'ok');
  const g3 = M.goals({}, NOW, 'mon');
  assert.strictEqual(g3.zone2.goal, 150); assert.strictEqual(g3.youtube.value, null); assert.strictEqual(g3.youtube.insufficient, true);
});
t('빈 저장소·깨진 값에도 죽지 않음', () => {
  const bad = { book_list: 'x', book_logs: [], hr_sessions: [null, { date: 'abc' }], hr_measures: {}, time_log_2026_11: [null, { catId: 1 }], time_current: 5 };
  M.reading(bad, NOW); M.mapData(bad, NOW); M.exercise(bad, NOW); M.timeuse(bad, '2026-11-20', NOW); M.goals(bad, NOW); M.searchBooks(bad, 'a');
  assert.strictEqual(M.reading({}, NOW).total, 0);
});
t('parseStore: 동기화 파일의 문자열 값을 읽고 깨진 키는 이름만', () => {
  const r = M.parseStore({ book_list: '[{"id":"b1"}]', bad: '{x', n: 3 });
  assert.deepStrictEqual(r.store.book_list, [{ id: 'b1' }]); assert.deepStrictEqual(r.bad, ['bad']); assert.strictEqual(r.store.n, 3);
});

console.log('\n결과: 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
