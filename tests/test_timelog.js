// 시간 기록 계산 부분 단위 테스트. 실행: node tests/test_timelog.js  (index.html 의 TL-CORE 구간을 그대로 꺼내서 시험)
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* TL-CORE-BEGIN \*\/([\s\S]*?)\/\* TL-CORE-END \*\//);
if (!m) { console.error('TL-CORE 구간을 찾지 못했습니다'); process.exit(2); }
const names = ['TL_DAY','TL_MIN','TL_DEFAULT_CATS','tlParts','tlDayStart','tlDayKey','tlMonthKey','tlMonthStart','tlWeekStart','tlFromKst','tlResolve','tlClip','tlSplitDays','tlStats','tlRank','tlGrid','tlMonthReport','tlPlanInsert','tlCsv','tlCatInfo','tlMergeAdj'];
const T = new Function(m[1] + '\nreturn {' + names.join(',') + '};')();
const cats = T.TL_DEFAULT_CATS.map((c, i) => Object.assign({ order: i, archived: false }, c));
const K = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;   // 한국 시간 -> epoch
const E = (id, s, e, catId, source = 'manual', note = '') => ({ id, start: s, end: e, catId, source, note });
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('PASS  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + (e.message || e).split('\n').join('\n      ')); } }
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, (msg || '') + ' 기대 ' + b + ' 실제 ' + a);
const NOW = K(2026, 11, 20, 12, 0);

t('한국 시간 고정: 요일·날짜 경계 (프로세스 TZ=' + (process.env.TZ || '기본') + ')', () => {
  assert.strictEqual(T.tlDayKey(K(2026, 11, 11, 0, 0)), '2026-11-11');
  assert.strictEqual(T.tlDayKey(K(2026, 11, 10, 23, 59)), '2026-11-10');
  assert.strictEqual(T.tlParts(K(2026, 11, 9, 5)).dow, 0, '2026-11-09 는 월요일');
  assert.strictEqual(T.tlParts(K(2026, 11, 15, 5)).dow, 6, '일요일');
  assert.strictEqual(T.tlDayKey(T.tlWeekStart(K(2026, 11, 15, 23))), '2026-11-09', '일요일의 주 시작은 월요일');
  assert.strictEqual(T.tlFromKst('2026-11-11', '07:30'), K(2026, 11, 11, 7, 30));
  assert(isNaN(T.tlFromKst('2026-11-11', '25:00')));
});
t('자정 넘김: 23:00~01:00 이 두 날로 나뉨', () => {
  const segs = T.tlResolve([E('a', K(2026, 11, 10, 23), K(2026, 11, 11, 1), 'sleep')], NOW);
  const parts = T.tlSplitDays(segs);
  assert.strictEqual(parts.length, 2);
  assert.deepStrictEqual(parts.map(p => p.day), ['2026-11-10', '2026-11-11']);
  const st = T.tlStats(segs, K(2026, 11, 10), K(2026, 11, 12), cats, NOW);
  near(st.days['2026-11-10'].rec, 60); near(st.days['2026-11-11'].rec, 60); near(st.rec, 120);
});
t('달 넘김: 10/31 22:00~11/1 02:00 은 10월 키에 저장되고 집계는 양쪽 달로 나뉨', () => {
  const e = E('a', K(2026, 10, 31, 22), K(2026, 11, 1, 2), 'work');
  assert.strictEqual(T.tlMonthKey(e.start), 'time_log_2026_10');
  const segs = T.tlResolve([e], NOW);
  near(T.tlStats(segs, T.tlMonthStart(2026, 10), T.tlMonthStart(2026, 11), cats, NOW).rec, 120);
  near(T.tlStats(segs, T.tlMonthStart(2026, 11), T.tlMonthStart(2026, 12), cats, NOW).rec, 120);
  const rep = T.tlMonthReport([e], 2026, 11, cats, NOW);
  near(rep.cur.byCat.work, 120); near(rep.prev.byCat.work, 120);
});
t('겹침 정리(저장 계획): 삭제 / 앞부분 줄임 / 뒷부분 줄임 / 둘로 나눔', () => {
  const ex = [E('del', K(2026, 11, 10, 9), K(2026, 11, 10, 10), 'rest'), E('head', K(2026, 11, 10, 8), K(2026, 11, 10, 10, 30), 'work'),
    E('tail', K(2026, 11, 10, 11, 30), K(2026, 11, 10, 13), 'work'), E('big', K(2026, 11, 10, 14), K(2026, 11, 10, 18), 'dev'), E('far', K(2026, 11, 10, 20), K(2026, 11, 10, 21), 'rest')];
  let n = 0; const gen = () => 'new' + (++n);
  // 새 기록 10:00~12:00 : del(9~10) 은 안 겹침. head 는 10시까지로 줄고, tail 은 12시부터로 줄어야 함
  let p = T.tlPlanInsert(ex, E('n1', K(2026, 11, 10, 10), K(2026, 11, 10, 12), 'study'), null, NOW, cats, gen);
  assert.deepStrictEqual(p.remove, []);
  assert.strictEqual(p.upsert.find(x => x.id === 'head').end, K(2026, 11, 10, 10));
  assert.strictEqual(p.upsert.find(x => x.id === 'tail').start, K(2026, 11, 10, 12));
  assert.strictEqual(p.notes.length, 2);
  // 9:00~10:00 을 통째로 덮는 기록 -> del 삭제
  p = T.tlPlanInsert(ex, E('n2', K(2026, 11, 10, 8, 50), K(2026, 11, 10, 10, 10), 'study'), null, NOW, cats, gen);
  assert(p.remove.includes('del'));
  // 큰 기록 한가운데 15~16 -> 둘로
  p = T.tlPlanInsert(ex, E('n3', K(2026, 11, 10, 15), K(2026, 11, 10, 16), 'rest'), null, NOW, cats, gen);
  assert.strictEqual(p.upsert.length, 2);
  const a = p.upsert.find(x => x.id === 'big'), b = p.upsert.find(x => x.id !== 'big');
  assert.strictEqual(a.end, K(2026, 11, 10, 15)); assert.strictEqual(b.start, K(2026, 11, 10, 16)); assert.strictEqual(b.end, K(2026, 11, 10, 18)); assert.strictEqual(b.catId, 'dev');
  // 겹치지 않으면 변화 없음
  p = T.tlPlanInsert(ex, E('n4', K(2026, 11, 10, 6), K(2026, 11, 10, 7), 'rest'), null, NOW, cats, gen);
  assert(!p.remove.length && !p.upsert.length && !p.notes.length);
  // 수정(같은 id)은 자기 자신과 겹치지 않음
  p = T.tlPlanInsert(ex, E('head', K(2026, 11, 10, 8), K(2026, 11, 10, 11), 'work'), null, NOW, cats, gen);
  assert(!p.upsert.find(x => x.id === 'head'));
});
t('겹침 정리: 진행 중 기록과 겹치면 진행 중 시작이 늦춰지고 앞부분은 따로 저장', () => {
  const now = K(2026, 11, 10, 15), cur = { catId: 'work', start: K(2026, 11, 10, 9), note: 'x' };
  let p = T.tlPlanInsert([], E('n', K(2026, 11, 10, 10), K(2026, 11, 10, 11), 'rest'), cur, now, cats, () => 'g');
  assert(p.curChanged); assert.strictEqual(p.cur.start, K(2026, 11, 10, 11));
  assert.strictEqual(p.upsert.length, 1); assert.strictEqual(p.upsert[0].start, K(2026, 11, 10, 9)); assert.strictEqual(p.upsert[0].end, K(2026, 11, 10, 10)); assert.strictEqual(p.upsert[0].note, 'x');
  p = T.tlPlanInsert([], E('n', K(2026, 11, 10, 8), K(2026, 11, 10, 10), 'rest'), cur, now, cats, () => 'g');
  assert.strictEqual(p.cur.start, K(2026, 11, 10, 10)); assert.strictEqual(p.upsert.length, 0);
  p = T.tlPlanInsert([], E('n', K(2026, 11, 10, 6), K(2026, 11, 10, 8), 'rest'), cur, now, cats, () => 'g');
  assert(!p.curChanged);
});
t('진행 중 기록: 보고 시점(now)까지 센다', () => {
  const now = K(2026, 11, 10, 11, 30);
  const segs = T.tlResolve([E('r', K(2026, 11, 10, 10), null, 'work')], now);
  near(T.tlStats(segs, K(2026, 11, 10), K(2026, 11, 11), cats, now).rec, 90);
  const later = T.tlResolve([E('r', K(2026, 11, 10, 10), null, 'work')], K(2026, 11, 10, 12));
  near(T.tlStats(later, K(2026, 11, 10), K(2026, 11, 11), cats, K(2026, 11, 10, 12)).rec, 120);
});
t('빈 시간(gap): 기록 안 한 시간은 세지 않고 기록률에 반영', () => {
  const ws = K(2026, 11, 9), segs = T.tlResolve([E('a', K(2026, 11, 9, 9), K(2026, 11, 9, 12), 'work'), E('b', K(2026, 11, 9, 14), K(2026, 11, 9, 16), 'work')], NOW);
  const st = T.tlStats(segs, ws, ws + 7 * 86400000, cats, NOW);
  near(st.rec, 300); near(st.total, 10080, '일주일=168시간'); near(st.cov, 300 / 10080);
  assert.strictEqual(st.focus, 2, '3시간 블록과 2시간 블록, 둘 다 60분 이상');
});
t('아직 안 끝난 구간: 지금까지 기준 기록률(covSoFar)을 따로 계산', () => {
  const ws = K(2026, 11, 9), now = K(2026, 11, 10, 0);   // 월요일 하루가 끝난 시점
  const segs = T.tlResolve([E('a', K(2026, 11, 9, 0), K(2026, 11, 9, 12), 'work')], now);
  const st = T.tlStats(segs, ws, ws + 7 * 86400000, cats, now);
  near(st.cov, 720 / 10080); near(st.covSoFar, 0.5);
  assert.strictEqual(T.tlStats(segs, ws, ws + 86400000, cats, now).covSoFar, null, '이미 끝난 구간은 null');
});
t('집중 블록: 60분 이상 + 중요 분류 + 수면 제외, 맞닿은 같은 분류는 하나', () => {
  const ws = K(2026, 11, 9), segs = T.tlResolve([
    E('a', K(2026, 11, 9, 9), K(2026, 11, 9, 9, 40), 'work'), E('b', K(2026, 11, 9, 9, 40), K(2026, 11, 9, 10, 20), 'work'),   // 합쳐서 80분 -> 1개
    E('c', K(2026, 11, 9, 11), K(2026, 11, 9, 11, 59), 'work'),    // 59분 -> 제외
    E('d', K(2026, 11, 9, 13), K(2026, 11, 9, 14), 'dev'),          // 정확히 60분 -> 포함
    E('e', K(2026, 11, 9, 15), K(2026, 11, 9, 17), 'rest'),         // 보통 -> 제외
    E('f', K(2026, 11, 9, 22), K(2026, 11, 10, 6), 'sleep'),        // 수면 -> 제외
  ], NOW);
  assert.strictEqual(T.tlStats(segs, ws, ws + 7 * 86400000, cats, NOW).focus, 2);
});
t('하루 전환 횟수: 기록이 있는 날의 평균', () => {
  const ws = K(2026, 11, 9), segs = T.tlResolve([
    E('a', K(2026, 11, 9, 9), K(2026, 11, 9, 10), 'work'), E('b', K(2026, 11, 9, 10), K(2026, 11, 9, 11), 'rest'), E('c', K(2026, 11, 9, 11), K(2026, 11, 9, 12), 'work'),   // 월: 3
    E('d', K(2026, 11, 10, 9), K(2026, 11, 10, 12), 'work'),   // 화: 1
  ], NOW);
  const st = T.tlStats(segs, ws, ws + 7 * 86400000, cats, NOW);
  assert.strictEqual(st.recDays, 2); near(st.switchAvg, 2);
});
t('보관(삭제)된 분류: 기록은 그대로 집계, 중요도 유지 / 아예 없는 분류는 보통', () => {
  const arch = cats.map(c => c.id === 'work' ? Object.assign({}, c, { archived: true }) : c);
  const segs = T.tlResolve([E('a', K(2026, 11, 9, 9), K(2026, 11, 9, 11), 'work'), E('b', K(2026, 11, 9, 12), K(2026, 11, 9, 13), 'ghost')], NOW);
  const st = T.tlStats(segs, K(2026, 11, 9), K(2026, 11, 10), arch, NOW);
  near(st.byCat.work, 120); near(st.byCat.ghost, 60);
  near(st.imp['중요'], 120, '보관해도 중요도 유지'); near(st.imp['보통'], 60, '없는 분류는 보통');
  assert.strictEqual(T.tlCatInfo(arch, 'ghost').missing, true);
});
t('자동 vs 수동: 겹치면 수동이 이기고, 안 겹친 자동은 남음', () => {
  const auto = E('auto1', K(2026, 11, 9, 7), K(2026, 11, 9, 8), 'exercise', 'auto-hr');
  const man = E('man1', K(2026, 11, 9, 7, 20), K(2026, 11, 9, 7, 40), 'rest', 'manual');
  const segs = T.tlResolve([auto, man], NOW);
  const byId = {}; segs.forEach(s => { byId[s.id] = (byId[s.id] || 0) + (s.end - s.start) / 60000; });
  near(byId.man1, 20); near(byId.auto1, 40);
  assert.strictEqual(segs.length, 3, '자동 앞조각 + 수동 + 자동 뒷조각');
  // 자동이 더 늦게 시작해도 수동이 이긴다 (우선순위가 시작 시각보다 앞)
  const segs2 = T.tlResolve([E('auto2', K(2026, 11, 9, 9), K(2026, 11, 9, 10), 'exercise', 'auto-hr'), E('man2', K(2026, 11, 9, 8), K(2026, 11, 9, 11), 'rest')], NOW);
  assert.strictEqual(segs2.length, 1); assert.strictEqual(segs2[0].id, 'man2');
});
t('중요 비율: 수면을 분모에서 뺀다', () => {
  const segs = T.tlResolve([E('s', K(2026, 11, 9, 0), K(2026, 11, 9, 8), 'sleep'), E('w', K(2026, 11, 9, 9), K(2026, 11, 9, 12), 'work'), E('r', K(2026, 11, 9, 12), K(2026, 11, 9, 13), 'rest'), E('p', K(2026, 11, 9, 13), K(2026, 11, 9, 14), 'phone')], NOW);
  const st = T.tlStats(segs, K(2026, 11, 9), K(2026, 11, 10), cats, NOW);
  near(st.impBase, 300); near(st.imp['중요'] / st.impBase, 0.6); near(st.sleepMin, 480); near(st.rec, 780);
  near(T.tlRank(st.byCat, cats, st.rec)[0].pct, 480 / 780);
});
t('이전 달 비교: 이전 달 자료가 없으면 delta 가 null', () => {
  const rep = T.tlMonthReport([E('a', K(2026, 11, 2, 9), K(2026, 11, 2, 12), 'work')], 2026, 11, cats, NOW);
  assert.strictEqual(rep.hasPrev, false); assert.strictEqual(rep.rank[0].delta, null);
  const rep2 = T.tlMonthReport([E('p', K(2026, 10, 2, 9), K(2026, 10, 2, 10), 'work'), E('a', K(2026, 11, 2, 9), K(2026, 11, 2, 12), 'work'), E('x', K(2026, 10, 3, 9), K(2026, 10, 3, 11), 'rest')], 2026, 11, cats, NOW);
  assert.strictEqual(rep2.hasPrev, true);
  near(rep2.rank.find(r => r.id === 'work').delta, 120); near(rep2.rank.find(r => r.id === 'rest').delta, -120, '지난달에만 있던 분류도 줄어든 만큼 나옴');
});
t('월간 보고: 주별 중요도·요일 평균·리듬·상위/하위 날', () => {
  const es = [E('a', K(2026, 11, 2, 9), K(2026, 11, 2, 12), 'work'), E('b', K(2026, 11, 9, 9), K(2026, 11, 9, 11), 'work'), E('c', K(2026, 11, 3, 22), K(2026, 11, 4, 6), 'sleep'), E('d', K(2026, 11, 4, 9), K(2026, 11, 4, 10), 'phone')];
  const rep = T.tlMonthReport(es, 2026, 11, cats, NOW);
  assert.strictEqual(rep.weeks.length, 6, '11월은 1일이 일요일·30일이 월요일이라 걸치는 주가 6개');
  near(rep.weeks[1].imp['중요'], 180, '11/2 주');
  const w = rep.weekday.find(x => x.id === 'work'); near(w.avg[0], 2.5, '월요일 평균 = (3h+2h)/2일');
  assert.strictEqual(rep.rhythmCat[9], 'work'); assert.strictEqual(rep.rhythmCat[23], 'sleep'); assert.strictEqual(rep.rhythmCat[3], 'sleep'); assert.strictEqual(rep.rhythmCat[15], null);
  assert.strictEqual(rep.topDays[0].day, '2026-11-02');
  assert(rep.lowCov.length === 3 && rep.lowCov.every(x => x.cov >= 0));
  near(rep.avgPhoneH, 1 / 4, '기록한 날 4일(2,3,4,9) 중 폰 1시간');
  near(rep.avgSleepH, 8 / 4);
});
t('주간 격자: 15분 칸 색 = 가장 많이 채운 분류, 8분 미만은 빈 칸, 자동 표시', () => {
  const ws = K(2026, 11, 9);
  const segs = T.tlResolve([E('a', K(2026, 11, 9, 9, 0), K(2026, 11, 9, 9, 10), 'work'), E('b', K(2026, 11, 9, 9, 10), K(2026, 11, 9, 9, 15), 'rest'),
    E('c', K(2026, 11, 9, 9, 15), K(2026, 11, 9, 9, 22), 'rest'), E('x', K(2026, 11, 9, 10, 0), K(2026, 11, 9, 10, 30), 'exercise', 'auto-hr')], NOW);
  const g = T.tlGrid(segs, ws);
  assert.strictEqual(g[0][36].catId, 'work', '9:00 칸 = 업무 10분 vs 휴식 5분');
  assert.strictEqual(g[0][37], null, '9:15 칸은 휴식 7분 → 빈 칸');
  assert.strictEqual(g[0][40].source, 'auto-hr'); assert.strictEqual(g[0][41].catId, 'exercise');
  assert.strictEqual(g[1][36], null);
  const sat = T.tlGrid(T.tlResolve([E('n', K(2026, 11, 14, 23), K(2026, 11, 15, 1), 'sleep')], NOW), ws);
  assert.strictEqual(sat[5][95].catId, 'sleep'); assert.strictEqual(sat[6][0].catId, 'sleep'); assert.strictEqual(sat[6][4], null);
});
t('CSV: 자정에서 나뉨, 열 순서, 쉼표·따옴표·수식 문자 처리', () => {
  const segs = T.tlResolve([E('a', K(2026, 11, 10, 23), K(2026, 11, 11, 1), 'sleep', 'manual', '=SUM(A1),"안녕"'), E('b', K(2026, 11, 11, 9), K(2026, 11, 11, 9, 30), 'exercise', 'auto-hr')], NOW);
  const lines = T.tlCsv(segs, K(2026, 11, 1), K(2026, 12, 1), cats).split('\r\n');
  assert.strictEqual(lines[0], '날짜,시작,종료,분,분류,중요도,출처,메모');
  assert.strictEqual(lines.length, 4);
  assert.strictEqual(lines[1].startsWith('2026-11-10,23:00,24:00,60,수면,보통,수동,'), true);
  assert.strictEqual(lines[2].startsWith('2026-11-11,00:00,01:00,60,수면,보통,수동,'), true);
  assert(lines[1].endsWith('"\'=SUM(A1),""안녕"""'), lines[1]);
  assert.strictEqual(lines[3], '2026-11-11,09:00,09:30,30,운동,중요,자동(심박 운동),');
});
t('기본 분류에 웹서핑·유튜브 시청 포함, id 중복 없음', () => {
  const nm = T.TL_DEFAULT_CATS.map(c => c.name);
  assert(nm.includes('웹서핑') && nm.includes('유튜브 시청'));
  assert.strictEqual(new Set(T.TL_DEFAULT_CATS.map(c => c.id)).size, T.TL_DEFAULT_CATS.length);
  assert.strictEqual(nm.length, 14);
});
console.log('\n결과: 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
