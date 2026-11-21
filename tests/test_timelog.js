// 시간 기록 계산 부분 단위 테스트. 실행: node tests/test_timelog.js  (index.html 의 TL-CORE 구간을 그대로 꺼내서 시험)
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* TL-CORE-BEGIN \*\/([\s\S]*?)\/\* TL-CORE-END \*\//);
if (!m) { console.error('TL-CORE 구간을 찾지 못했습니다'); process.exit(2); }
const names = ['TL_DAY','TL_MIN','TL_DEFAULT_CATS','tlParts','tlDayStart','tlDayKey','tlMonthKey','tlMonthStart','tlWeekStart','tlFromKst','tlResolve','tlClip','tlSplitDays','tlStats','tlRank','tlGrid','tlRibbon','tlSummary','TL_WORK','tlMonthReport','tlPlanInsert','tlCsv','tlCatInfo','tlMergeAdj','tlImpBar','tlWasteTop','tlPrevSamePoint'];
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
  const rep = T.tlMonthReport([e], 2026, 11, cats, K(2026, 12, 5));   // 끝난 달: 지난달 전체와 비교
  near(rep.cur.byCat.work, 120); near(rep.prev.byCat.work, 120);
  assert.strictEqual(T.tlMonthReport([e], 2026, 11, cats, NOW).prev.byCat.work, undefined, '안 끝난 달(11/20 12시): 지난달은 10/20 12시까지만 → 10/31 기록은 비교에 안 들어감');
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
t('하루 격자 = 분류별 합계의 그날 합 (한국 자정·달 경계·진행 중 기록, 15분 단위)', () => {
  // 주 2026-10-26(월)~11-01(일): 10/31 22:00~11/01 02:00 (달·자정 넘김), 10/28 00:00~00:45 (UTC 로는 전날), 평일 회사 업무 8h, 11/01 진행 중 1h
  const now = K(2026, 11, 1, 10, 0), ws = T.tlWeekStart(now);
  assert.strictEqual(T.tlDayKey(ws), '2026-10-26');
  const es = [E('m', K(2026, 10, 31, 22), K(2026, 11, 1, 2), 'sleep'), E('n', K(2026, 10, 28, 0), K(2026, 10, 28, 0, 45), 'rest'), E('cur', K(2026, 11, 1, 9), null, 'study')];
  for (let d = 26; d <= 30; d++) es.push(E('w' + d, K(2026, 10, d, 9), K(2026, 10, d, 17), 'work'));
  const segs = T.tlResolve(es, now), g = T.tlGrid(segs, ws), st = T.tlStats(segs, ws, ws + 7 * T.TL_DAY, cats, now);
  const want = [480, 480, 525, 480, 480, 120, 180];
  for (let d = 0; d < 7; d++) {
    const k = T.tlDayKey(ws + d * T.TL_DAY), gm = g[d].reduce((a, c) => a + (c ? c.min : 0), 0), sm = st.days[k] ? st.days[k].rec : 0;
    near(gm, sm, k + ' 격자 vs 합계'); near(sm, want[d], k + ' 기대값');
  }
  near(Object.values(st.byCat).reduce((a, b) => a + b, 0), want.reduce((a, b) => a + b, 0), '분류별 합계 = 날 합의 합');
  near(st.byCat.work, 40 * 60, '회사 업무 40h');
});
t('주간 띠의 칸 = 하루 격자의 칸 (자정·달 경계·자동·15분 한 칸·진행 중)', () => {
  // 주 2026-10-26(월)~11-01(일)
  const now = K(2026, 11, 1, 10, 0), ws = T.tlWeekStart(now);
  const es = [
    E('m', K(2026, 10, 31, 22), K(2026, 11, 1, 2), 'sleep'),               // 달·자정 넘김
    E('one', K(2026, 10, 27, 13, 15), K(2026, 10, 27, 13, 30), 'study'),   // 15분 한 칸
    E('w', K(2026, 10, 27, 9), K(2026, 10, 27, 12), 'work'),
    E('a', K(2026, 10, 28, 18), K(2026, 10, 28, 19), 'exercise', 'auto-hr'),   // 자동
    E('b', K(2026, 10, 28, 19), K(2026, 10, 28, 19, 30), 'exercise'),          // 자동 바로 뒤 같은 분류 수동 → 다른 묶음
    E('cur', K(2026, 11, 1, 9), null, 'study'),                                 // 진행 중 → 지금까지
  ];
  const g = T.tlGrid(T.tlResolve(es, now), ws);
  for (let d = 0; d < 7; d++) {
    const runs = T.tlRibbon(g[d]), cells = new Array(96).fill(null);
    runs.forEach(r => { for (let i = r.c0; i <= r.c1; i++) { assert(cells[i] === null, '겹침 ' + d + ':' + i); cells[i] = r.catId + (r.auto ? '*' : ''); } });
    assert.deepStrictEqual(cells, g[d].map(c => c ? c.catId + (c.source !== 'manual' ? '*' : '') : null), '날 ' + d);
  }
  const tue = T.tlRibbon(g[1]);
  assert(tue.some(r => r.catId === 'study' && r.c0 === 53 && r.c1 === 53), '15분 한 칸이 묶음으로 남음');
  const wed = T.tlRibbon(g[2]);
  assert.deepStrictEqual(wed.map(r => [r.c0, r.c1, r.auto]), [[72, 75, true], [76, 77, false]], '자동/수동 따로');
  const sun = T.tlRibbon(g[6]);
  assert.deepStrictEqual(sun.map(r => [r.catId, r.c0, r.c1]), [['sleep', 0, 7], ['study', 36, 39]], '자정 넘김 + 진행 중은 지금(10:00)까지');
  assert.deepStrictEqual(T.tlRibbon(g[5]).map(r => [r.catId, r.c0, r.c1]), [['sleep', 88, 95]], '10/31 22~24시');
});
// ---- 한 줄 요약: 전체 / 회사 업무 빼고 (월간·주간). 기대값은 분 단위로 직접 칠해서 따로 계산한다 ----
const SUMNOW = K(2026, 11, 20, 12, 0);
const SUMES = [
  E('b1', K(2026, 10, 31, 22), K(2026, 11, 1, 1), 'dev'),                   // 달 경계
  E('s1', K(2026, 11, 2, 9), K(2026, 11, 2, 18), 'work'),
  E('s2', K(2026, 11, 2, 18), K(2026, 11, 2, 19, 30), 'study'),
  E('s3', K(2026, 11, 2, 23), K(2026, 11, 3, 7), 'sleep'),                  // 자정 넘김
  E('s4', K(2026, 11, 3, 9), K(2026, 11, 3, 12), 'work'),
  E('s5', K(2026, 11, 3, 12), K(2026, 11, 3, 12, 40), 'rest'),
  E('s6', K(2026, 11, 3, 13), K(2026, 11, 3, 17), 'work'),
  E('s7', K(2026, 11, 3, 20), K(2026, 11, 3, 21), 'youtube'),
  E('a1', K(2026, 11, 4, 6), K(2026, 11, 4, 7), 'exercise', 'auto-hr'),      // 자동 + 겹치는 수동
  E('s8', K(2026, 11, 4, 6, 30), K(2026, 11, 4, 7, 30), 'exercise'),
  E('s9', K(2026, 11, 5, 10), K(2026, 11, 5, 11), 'read'),
  E('cur', K(2026, 11, 20, 11), null, 'study'),                             // 진행 중
];
function handSum(es, from, to, now, cs, noWork) {
  const imp = id => (cs.find(c => c.id === id) || {}).importance;
  const end = Math.min(to, now), mins = [];
  for (let t = from; t < end; t += 60000) {
    let best = null;
    es.forEach(e => { const ee = e.end == null ? now : e.end; if (e.start <= t && t < ee) { const pri = e.source === 'manual' ? 1 : 0; if (!best || pri > best.pri || (pri === best.pri && e.start > best.e.start)) best = { e, pri }; } });
    mins.push(best ? best.e.catId : null);
  }
  const OUT = ['work', 'sleep'], keep = c => c && !(noWork && OUT.includes(c));   // 둘째 줄 = 업무·수면 빼고
  const rec = mins.filter(keep).length, work = noWork ? mins.filter(c => OUT.includes(c)).length : 0;
  const base = mins.filter(c => keep(c) && c !== 'sleep'), impPct = base.length ? base.filter(c => imp(c) === '중요').length / base.length : null;
  let focus = 0, focusMin = 0;
  for (let i = 0; i < mins.length;) { let j = i; while (j < mins.length && mins[j] === mins[i]) j++; const c = mins[i]; if (keep(c) && c !== 'sleep' && imp(c) === '중요' && j - i >= 60) { focus++; focusMin += j - i; } i = j; }
  const period = (to - from) / 60000 - work, el = (end - from) / 60000 - work;
  return { rec, cov: rec / period, covSoFar: now < to && el > 0 ? rec / el : null, impPct, focus, focusMin, impMin: base.filter(c => imp(c) === '중요').length, total: period };
}
const pick = st => ({ rec: st.rec, cov: st.cov, covSoFar: st.covSoFar, impPct: st.impPct, focus: st.focus });
function sameSum(got, want, msg) { ['rec', 'cov', 'impPct', 'focus'].forEach(k => near(got[k], want[k], msg + ' ' + k)); if (want.covSoFar == null) assert.strictEqual(got.covSoFar, null, msg + ' covSoFar'); else near(got.covSoFar, want.covSoFar, msg + ' covSoFar'); }
const segsSum = T.tlResolve(SUMES, SUMNOW);

t('월간 요약: 전체 − (업무+수면) = 업무·수면 빼고 (지표들, 따로 계산한 값과 같음)', () => {
  const from = T.tlMonthStart(2026, 11), to = T.tlMonthStart(2026, 12), rep = T.tlMonthReport(SUMES, 2026, 11, cats, SUMNOW);
  sameSum(pick(rep.cur), handSum(SUMES, from, to, SUMNOW, cats, false), '전체');
  sameSum(pick(rep.nowork), handSum(SUMES, from, to, SUMNOW, cats, true), '업무·수면 빼고');
  near(rep.cur.rec - rep.nowork.rec, 16 * 60 + 8 * 60, '빠진 시간 = 업무 16시간 + 수면 8시간');
  near(rep.nowork.exMin, 24 * 60);
  near(rep.impPct, rep.cur.impPct);
  assert(rep.cur.covSoFar != null && rep.nowork.covSoFar != null, '안 끝난 달: 지금까지 기록률 둘 다');
});
t('월간 요약: 회사 업무 이름을 바꿔도 결과 같음 (id 로 찾음)', () => {
  const renamed = cats.map(c => c.id === 'work' ? Object.assign({}, c, { name: '본업(바꾼 이름)', order: 99 }) : c);
  const a = T.tlMonthReport(SUMES, 2026, 11, cats, SUMNOW), b = T.tlMonthReport(SUMES, 2026, 11, renamed, SUMNOW);
  assert.deepStrictEqual(pick(b.nowork), pick(a.nowork)); assert.deepStrictEqual(pick(b.cur), pick(a.cur));
});
t('월간 요약: 업무 기록이 없는 달 → 두 줄 값이 같음', () => {
  const rep = T.tlMonthReport(SUMES, 2026, 10, cats, SUMNOW);   // 10월: dev 2시간뿐
  assert(rep.cur.rec > 0); assert.deepStrictEqual(pick(rep.nowork), pick(rep.cur)); near(rep.nowork.exMin, 0);
});
t('주간 요약: 이 주 지표 = 같은 7일에 월간 계산(tlStats·tlSummary)을 적용한 값 = 따로 계산한 값', () => {
  const ws = T.tlWeekStart(K(2026, 11, 4, 12)), we = ws + 7 * T.TL_DAY, sm = T.tlSummary(segsSum, ws, we, cats, SUMNOW);
  assert.strictEqual(T.tlDayKey(ws), '2026-11-02');
  assert.deepStrictEqual(pick(sm.all), pick(T.tlStats(segsSum, ws, we, cats, SUMNOW)));
  assert.deepStrictEqual(pick(sm.nowork), pick(T.tlStats(segsSum, ws, we, cats, SUMNOW, ['work', 'sleep'])));
  sameSum(pick(sm.all), handSum(SUMES, ws, we, SUMNOW, cats, false), '주 전체');
  sameSum(pick(sm.nowork), handSum(SUMES, ws, we, SUMNOW, cats, true), '주 업무 빼고');
  near(sm.all.cov, sm.all.rec / (7 * 1440)); near(sm.nowork.cov, sm.nowork.rec / (7 * 1440 - 24 * 60));
  assert.strictEqual(sm.all.covSoFar, null, '끝난 주는 지금까지 값 없음');
});
t('주간 요약: 주를 옮기면 다시 계산 (지난주 · 업무 없는 주 · 진행 중인 주)', () => {
  const ws = T.tlWeekStart(K(2026, 11, 4, 12));
  const prev = T.tlSummary(segsSum, ws - 7 * T.TL_DAY, ws, cats, SUMNOW);   // 10/26~11/1: dev 3시간(달 경계)
  sameSum(pick(prev.all), handSum(SUMES, ws - 7 * T.TL_DAY, ws, SUMNOW, cats, false), '지난주');
  near(prev.all.rec, 180); assert.deepStrictEqual(pick(prev.nowork), pick(prev.all), '업무 없는 주 → 같음');
  const cw = T.tlWeekStart(SUMNOW), cur = T.tlSummary(segsSum, cw, cw + 7 * T.TL_DAY, cats, SUMNOW);   // 11/16~22: 진행 중 공부 1시간
  near(cur.all.rec, 60); assert(cur.all.covSoFar != null && cur.nowork.covSoFar != null, '진행 중인 주: 지금까지 값');
  sameSum(pick(cur.nowork), handSum(SUMES, cw, cw + 7 * T.TL_DAY, SUMNOW, cats, true), '이번 주 업무 빼고');
});
// ---- 낭비 비율: 분류의 importance === '낭비' 인 시간 / 기록한 시간 (업무 빼고 줄은 업무 뺀 기록 기준) ----
function handWaste(es, from, to, now, cs, noWork) {   // 분 단위로 직접 칠해 계산 (앱 함수 안 씀)
  const imp = id => (cs.find(c => c.id === id) || {}).importance, end = Math.min(to, now);
  let rec = 0, waste = 0;
  for (let t = from; t < end; t += 60000) {
    let best = null;
    es.forEach(e => { const ee = e.end == null ? now : e.end; if (e.start <= t && t < ee) { const pri = e.source === 'manual' ? 1 : 0; if (!best || pri > best.pri || (pri === best.pri && e.start > best.e.start)) best = { e, pri }; } });
    const c = best && best.e.catId; if (!c || (noWork && (c === 'work' || c === 'sleep'))) continue;
    rec++; if (imp(c) === '낭비') waste++;
  }
  return { wasteMin: waste, wastePct: rec ? waste / rec : null };
}
t('낭비 비율: 월·주 × 전체·업무·수면 빼고 = 따로 계산한 값', () => {
  const rep = T.tlMonthReport(SUMES, 2026, 11, cats, SUMNOW), from = T.tlMonthStart(2026, 11), to = T.tlMonthStart(2026, 12);
  [[rep.cur, false], [rep.nowork, true]].forEach(([st, nw]) => { const h = handWaste(SUMES, from, to, SUMNOW, cats, nw); near(st.wasteMin, h.wasteMin, '월 ' + nw); near(st.wastePct, h.wastePct, '월 % ' + nw); });
  near(rep.cur.wasteMin, 60, '유튜브 1시간'); near(rep.cur.wastePct, 60 / rep.cur.rec); near(rep.nowork.wastePct, 60 / (rep.cur.rec - 24 * 60), '업무·수면 뺀 기록 기준');
  const ws = T.tlWeekStart(K(2026, 11, 4, 12)), sm = T.tlSummary(segsSum, ws, ws + 7 * T.TL_DAY, cats, SUMNOW);
  [[sm.all, false], [sm.nowork, true]].forEach(([st, nw]) => { const h = handWaste(SUMES, ws, ws + 7 * T.TL_DAY, SUMNOW, cats, nw); near(st.wasteMin, h.wasteMin); near(st.wastePct, h.wastePct, '주 % ' + nw); });
});
t('낭비 비율: 낭비 분류 이름을 바꿔도 같음 (id 로 찾음)', () => {
  const renamed = cats.map(c => c.id === 'youtube' ? Object.assign({}, c, { name: '영상(바꾼 이름)' }) : c);
  const a = T.tlMonthReport(SUMES, 2026, 11, cats, SUMNOW), b = T.tlMonthReport(SUMES, 2026, 11, renamed, SUMNOW);
  assert.strictEqual(b.cur.wastePct, a.cur.wastePct); assert.strictEqual(b.nowork.wastePct, a.nowork.wastePct);
});
t('낭비 비율: 분류의 낭비 표시를 바꾸면 지난 기간 값도 바뀜 (분류 속성이라 기록에 저장되지 않음)', () => {
  const off = cats.map(c => c.id === 'youtube' ? Object.assign({}, c, { importance: '보통' }) : c);
  const on = cats.map(c => c.id === 'rest' ? Object.assign({}, c, { importance: '낭비' }) : c);
  const base = T.tlMonthReport(SUMES, 2026, 11, cats, SUMNOW).cur;
  near(T.tlMonthReport(SUMES, 2026, 11, off, SUMNOW).cur.wasteMin, 0, '유튜브 낭비 해제 → 0');
  near(T.tlMonthReport(SUMES, 2026, 11, on, SUMNOW).cur.wasteMin, base.wasteMin + 40, '휴식을 낭비로 → +40분');
});
t('낭비 비율: 낭비 시간이 없는 기간 → 0% (기록이 없으면 —)', () => {
  const oct = T.tlMonthReport(SUMES, 2026, 10, cats, SUMNOW);   // 10월: dev 뿐
  assert(oct.cur.rec > 0); assert.strictEqual(oct.cur.wastePct, 0); assert.strictEqual(oct.nowork.wastePct, 0);
  const empty = T.tlSummary(segsSum, T.tlWeekStart(K(2026, 11, 11, 12)), T.tlWeekStart(K(2026, 11, 11, 12)) + 7 * T.TL_DAY, cats, SUMNOW);
  assert.strictEqual(empty.all.rec, 0); assert.strictEqual(empty.all.wastePct, null, '기록 없는 주');
});
t('업무·수면 빼고: 수면 분류 이름을 바꿔도 같음 (id 로 찾음)', () => {
  const renamed = cats.map(c => c.id === 'sleep' ? Object.assign({}, c, { name: '잠(바꾼 이름)', order: 50 }) : c);
  const a = T.tlMonthReport(SUMES, 2026, 11, cats, SUMNOW), b = T.tlMonthReport(SUMES, 2026, 11, renamed, SUMNOW);
  assert.deepStrictEqual(pick(b.nowork), pick(a.nowork)); assert.strictEqual(b.nowork.wastePct, a.nowork.wastePct);
});
t('업무·수면 빼고: 수면 기록이 없는 기간 = 업무만 뺀 값', () => {
  const noSleep = SUMES.filter(e => e.catId !== 'sleep'), segs = T.tlResolve(noSleep, SUMNOW);
  const from = T.tlMonthStart(2026, 11), to = T.tlMonthStart(2026, 12), ws = T.tlWeekStart(K(2026, 11, 4, 12));
  [[from, to], [ws, ws + 7 * T.TL_DAY]].forEach(([f, t2]) => {
    const sm = T.tlSummary(segs, f, t2, cats, SUMNOW), w = T.tlStats(segs, f, t2, cats, SUMNOW, ['work']);
    assert.deepStrictEqual(pick(sm.nowork), pick(w)); assert.strictEqual(sm.nowork.wastePct, w.wastePct); near(sm.nowork.exMin, 16 * 60);
  });
});
t('한 줄 요약 짝 값: 표시한 분자 ÷ 분모 = 표시한 %, 분자·분모 = 따로 계산한 값 (월·주 × 두 줄)', () => {
  const h1 = m => +(m / 60).toFixed(1), pct = x => Math.round(x * 100);   // 화면과 같은 반올림 (tlH1·tlPct)
  const ws = T.tlWeekStart(K(2026, 11, 4, 12));
  const periods = [['월', T.tlMonthStart(2026, 11), T.tlMonthStart(2026, 12)], ['주', ws, ws + 7 * T.TL_DAY]];
  periods.forEach(([nm, from, to]) => {
    const sm = T.tlSummary(segsSum, from, to, cats, SUMNOW);
    [['전체', sm.all, false], ['업무·수면 빼고', sm.nowork, true]].forEach(([row, st, nw]) => {
      const m = nm + ' ' + row, hd = handSum(SUMES, from, to, SUMNOW, cats, nw);
      assert.strictEqual(pct(h1(st.rec) / h1(st.total)), pct(st.cov), m + ' 기록률: ' + h1(st.rec) + ' / ' + h1(st.total));
      near(st.total, hd.total, m + ' 기록률 분모'); near(st.rec, hd.rec, m + ' 기록률 분자');
      assert.strictEqual(pct(st.impMin / st.impBase), pct(st.impPct), m + ' 중요'); near(st.impMin, hd.impMin, m + ' 중요 시간');
      near(st.focusMin, hd.focusMin, m + ' 집중 블록 시간'); assert.strictEqual(st.focus, hd.focus);
      assert.strictEqual(pct(st.wasteMin / st.rec), pct(st.wastePct), m + ' 낭비');
    });
  });
});

// ---- 한 줄 요약 v2: 중요/보통/낭비 막대 · 낭비 1위 · 같은 시점 비교. 기대값은 분 단위로 직접 칠해 따로 계산 ----
function paint(es, from, to, now) {   // [from, min(to, now)) 의 분마다 분류 id (수동이 자동을 이김, 같으면 늦게 시작한 쪽)
  const mins = [];
  for (let t = from; t < Math.min(to, now); t += 60000) {
    let best = null;
    es.forEach(e => { const ee = e.end == null ? now : e.end; if (e.start <= t && t < ee) { const pri = e.source === 'manual' ? 1 : 0; if (!best || pri > best.pri || (pri === best.pri && e.start > best.e.start)) best = { e, pri }; } });
    mins.push(best ? best.e.catId : null);
  }
  return mins;
}
function handMix(es, from, to, now, cs, noWS) {   // 따로 계산: 기록·중요·보통·낭비 분, 낭비 분류별 분
  const imp = id => (cs.find(c => c.id === id) || {}).importance;
  const kept = paint(es, from, to, now).filter(c => c && !(noWS && (c === 'work' || c === 'sleep')));
  const good = kept.filter(c => c !== 'sleep' && imp(c) === '중요').length, bad = kept.filter(c => imp(c) === '낭비').length, wasteBy = {};
  kept.forEach(c => { if (imp(c) === '낭비') wasteBy[c] = (wasteBy[c] || 0) + 1; });
  return { rec: kept.length, good, mid: kept.length - good - bad, bad, wasteBy };
}
// 이번 주 = 11/16(월)~, 지난주 = 11/9(월)~. 지금 = 11/18(수) 15:00
const CMPNOW = K(2026, 11, 18, 15, 0);
const CMPES = [
  E('p1', K(2026, 11, 9, 9), K(2026, 11, 9, 12), 'work'),
  E('p2', K(2026, 11, 9, 20), K(2026, 11, 9, 21), 'youtube'),
  E('p3', K(2026, 11, 10, 19), K(2026, 11, 10, 20, 30), 'read'),
  E('p4', K(2026, 11, 10, 23), K(2026, 11, 11, 6), 'sleep'),
  E('p5', K(2026, 11, 11, 14), K(2026, 11, 11, 16), 'phone'),               // 수 15:00 에 걸침 → 같은 시점 비교엔 60분만
  E('p6', K(2026, 11, 12, 10), K(2026, 11, 12, 13), 'phone'),               // 수 15:00 뒤 → 같은 시점 비교엔 안 들어감
  E('p7', K(2026, 11, 14, 10), K(2026, 11, 14, 12), 'study'),
  E('c1', K(2026, 11, 16, 10), K(2026, 11, 16, 11), 'read'),
  E('c2', K(2026, 11, 16, 13), K(2026, 11, 16, 17), 'work'),
  E('c3', K(2026, 11, 17, 20), K(2026, 11, 17, 22), 'youtube'),
  E('c4', K(2026, 11, 17, 22), K(2026, 11, 17, 22, 30), 'rest'),
  E('c5', K(2026, 11, 18, 12), K(2026, 11, 18, 12, 50), 'phone'),
  E('c6', K(2026, 11, 18, 14), null, 'web'),                                // 진행 중
];
t('막대(중요·보통·낭비): 세 칸 합 = 100%, 각 칸 = 따로 계산한 값 (월·주 × 두 줄)', () => {
  const ws = T.tlWeekStart(K(2026, 11, 4, 12)), ws2 = T.tlWeekStart(CMPNOW);
  [['월', SUMES, SUMNOW, T.tlMonthStart(2026, 11), T.tlMonthStart(2026, 12)], ['주', SUMES, SUMNOW, ws, ws + 7 * T.TL_DAY], ['이번 주(진행 중)', CMPES, CMPNOW, ws2, ws2 + 7 * T.TL_DAY], ['11월(진행 중)', CMPES, CMPNOW, T.tlMonthStart(2026, 11), T.tlMonthStart(2026, 12)]].forEach(([nm, es, now, from, to]) => {
    const sm = T.tlSummary(T.tlResolve(es, now), from, to, cats, now);
    [['전체', sm.all, false], ['업무·수면 빼고', sm.nowork, true]].forEach(([row, st, nw]) => {
      const m = nm + ' ' + row, bar = T.tlImpBar(st), hd = handMix(es, from, to, now, cats, nw);
      assert.deepStrictEqual(bar.map(p => p.k), ['중요', '보통', '낭비'], m + ' 순서');
      near(bar.reduce((a, p) => a + p.pct, 0), 1, m + ' 합 100%'); near(bar.reduce((a, p) => a + p.min, 0), st.rec, m + ' 분 합 = 기록한 시간');
      near(bar[0].min, hd.good, m + ' 중요 분'); near(bar[1].min, hd.mid, m + ' 보통 분'); near(bar[2].min, hd.bad, m + ' 낭비 분');
      near(bar[0].pct, hd.good / hd.rec, m + ' 중요 %'); near(bar[1].pct, hd.mid / hd.rec, m + ' 보통 %'); near(bar[2].pct, hd.bad / hd.rec, m + ' 낭비 %');
    });
  });
  const empty = T.tlImpBar(T.tlStats([], K(2026, 1, 1), K(2026, 1, 8), cats, NOW)); assert.deepStrictEqual(empty.map(p => p.pct), [0, 0, 0], '기록 없는 기간 → 0 (나누기 0 없음)');
});
t('낭비 1위: 원래 기록에서 직접 센 가장 긴 낭비 분류 (낭비가 없으면 null)', () => {
  const ws = T.tlWeekStart(CMPNOW), from = ws - 7 * T.TL_DAY, to = ws + 7 * T.TL_DAY;   // 지난주 + 이번 주
  const sm = T.tlSummary(T.tlResolve(CMPES, CMPNOW), from, to, cats, CMPNOW);
  [[sm.all, false], [sm.nowork, true]].forEach(([st, nw]) => {
    const by = handMix(CMPES, from, to, CMPNOW, cats, nw).wasteBy, want = Object.keys(by).sort((a, b) => by[b] - by[a])[0], top = T.tlWasteTop(st, cats);
    assert.strictEqual(top.id, want); assert.strictEqual(want, 'phone', '폰 120+180+50=350분 > 유튜브 180분 > 웹서핑 60분'); near(top.min, by[want]); near(top.min, 350);
  });
  const oct = T.tlMonthReport(SUMES, 2026, 10, cats, SUMNOW).cur;   // 10월: dev 뿐
  assert.strictEqual(T.tlWasteTop(oct, cats), null);
});
t('같은 시점 비교(주): 수요일 15:00 → 지난주 월 00:00~수 15:00 과 비교 (따로 계산한 값과 같음)', () => {
  const ws = T.tlWeekStart(CMPNOW), we = ws + 7 * T.TL_DAY, pws = ws - 7 * T.TL_DAY, pp = T.tlPrevSamePoint(ws, we, pws, CMPNOW);
  assert.strictEqual(pp.from, K(2026, 11, 9, 0, 0)); assert.strictEqual(pp.to, K(2026, 11, 11, 15, 0)); assert.strictEqual(pp.partial, true);
  const segs = T.tlResolve(CMPES, CMPNOW), psm = T.tlSummary(segs, pp.from, pp.to, cats, CMPNOW), sm = T.tlSummary(segs, ws, we, cats, CMPNOW);
  [[psm.all, false], [psm.nowork, true]].forEach(([st, nw]) => {
    const hd = handMix(CMPES, K(2026, 11, 9), K(2026, 11, 11, 15), CMPNOW, cats, nw);
    near(st.rec, hd.rec, '기록'); near(st.wasteMin, hd.bad, '낭비'); near(st.impMin, hd.good, '중요');
  });
  near(psm.nowork.rec, 60 + 90 + 60, '유튜브 60 + 독서 90 + 폰(15:00 까지) 60'); near(psm.all.byCat.phone, 60, '15:00 에 걸친 기록은 그 앞만');
  // 화면의 비교 값: 기록 차이, 낭비 %p 차이
  const cur = handMix(CMPES, ws, we, CMPNOW, cats, true), prev = handMix(CMPES, K(2026, 11, 9), K(2026, 11, 11, 15), CMPNOW, cats, true);
  near(sm.nowork.rec - psm.nowork.rec, cur.rec - prev.rec); near(sm.nowork.wastePct - psm.nowork.wastePct, cur.bad / cur.rec - prev.bad / prev.rec);
  // 분류별 '지난주 대비'도 같은 구간
  near((sm.all.byCat.phone || 0) - (psm.all.byCat.phone || 0), 50 - 60);
});
t('같은 시점 비교(월): 같은 날짜·시각까지, 지난달 길이를 넘지 않음 (31일 → 30일짜리 달)', () => {
  const a = T.tlPrevSamePoint(T.tlMonthStart(2026, 12), T.tlMonthStart(2027, 1), T.tlMonthStart(2026, 11), K(2026, 12, 10, 12, 0));
  assert.strictEqual(a.to, K(2026, 11, 10, 12, 0)); assert.strictEqual(a.partial, true);
  const b = T.tlPrevSamePoint(T.tlMonthStart(2026, 12), T.tlMonthStart(2027, 1), T.tlMonthStart(2026, 11), K(2026, 12, 31, 15, 0));
  assert.strictEqual(b.to, T.tlMonthStart(2026, 12), '12/31 15:00 → 11월은 30일까지뿐이라 11월 전체'); assert.strictEqual(b.partial, true);
  const c = T.tlPrevSamePoint(T.tlMonthStart(2026, 3), T.tlMonthStart(2026, 4), T.tlMonthStart(2026, 2), K(2026, 3, 30, 9, 0));
  assert.strictEqual(c.to, T.tlMonthStart(2026, 3), '3/30 → 2월(28일) 전체');
  // 월간 보고가 실제로 그 구간을 쓴다: 12/31 15:00 에 본 12월 → 11월 전체 / 12/10 12:00 에 본 12월 → 11/10 12:00 까지
  const es = [E('n1', K(2026, 11, 5, 9), K(2026, 11, 5, 11), 'read'), E('n2', K(2026, 11, 10, 11), K(2026, 11, 10, 13), 'youtube'), E('n3', K(2026, 11, 30, 20), K(2026, 11, 30, 23), 'phone'), E('d1', K(2026, 12, 3, 9), K(2026, 12, 3, 10), 'read')];
  const late = T.tlMonthReport(es, 2026, 12, cats, K(2026, 12, 31, 15, 0)), early = T.tlMonthReport(es, 2026, 12, cats, K(2026, 12, 10, 12, 0));
  near(late.prev.rec, handMix(es, K(2026, 11, 1), K(2026, 12, 1), K(2026, 12, 31, 15), cats, false).rec); near(late.prev.rec, 120 + 120 + 180);
  near(early.prev.rec, handMix(es, K(2026, 11, 1), K(2026, 11, 10, 12), K(2026, 12, 10, 12), cats, false).rec); near(early.prev.rec, 120 + 60, '11/10 12:00 에 걸친 유튜브는 60분만');
  near(early.prevNowork.wasteMin, 60); assert.strictEqual(early.prevPartial, true);
  near(early.rank.find(r => r.id === 'youtube').delta, -60, '분류별 지난달 대비도 같은 구간');
});
t('끝난 기간 비교: 전체 대 전체 (주·월)', () => {
  const ws = T.tlWeekStart(CMPNOW) - 7 * T.TL_DAY, pws = ws - 7 * T.TL_DAY;   // 지난주를 이번 주 수요일에 봄 → 끝난 주
  const pp = T.tlPrevSamePoint(ws, ws + 7 * T.TL_DAY, pws, CMPNOW);
  assert.deepStrictEqual(pp, { from: pws, to: ws, partial: false });
  const w2 = T.tlWeekStart(CMPNOW), q = T.tlPrevSamePoint(w2, w2 + 7 * T.TL_DAY, w2 - 7 * T.TL_DAY, w2 + 7 * T.TL_DAY);   // 이번 주가 막 끝난 순간
  assert.deepStrictEqual(q, { from: w2 - 7 * T.TL_DAY, to: w2, partial: false });
  near(T.tlSummary(T.tlResolve(CMPES, w2 + 7 * T.TL_DAY), q.from, q.to, cats, w2 + 7 * T.TL_DAY).all.byCat.phone, 120 + 180, '끝난 주 비교엔 지난주 폰 기록 전부');
  const rep = T.tlMonthReport(SUMES, 2026, 11, cats, K(2026, 12, 3));   // 끝난 11월 → 10월 전체
  assert.strictEqual(rep.prevPartial, false); near(rep.prev.rec, 120, '10/31 22:00~24:00 dev');
});
t('기존 지표 값은 그대로: 막대의 중요·낭비 시간 = 기존 값, 업무·수면 뺀 줄은 %도 같음 / 전체 줄 중요 %만 분모가 바뀜(수면 포함)', () => {
  const from = T.tlMonthStart(2026, 11), to = T.tlMonthStart(2026, 12), sm = T.tlSummary(segsSum, from, to, cats, SUMNOW);
  [sm.all, sm.nowork].forEach(st => { const bar = T.tlImpBar(st); near(bar[0].min, st.impMin); near(bar[2].min, st.wasteMin); near(bar[2].pct, st.wastePct, '낭비 % 는 두 줄 모두 기존과 같음'); });
  near(T.tlImpBar(sm.nowork)[0].pct, sm.nowork.impPct, '업무·수면 빼고: 중요 % 기존과 같음 (분모가 원래 같음)');
  const hd = handSum(SUMES, from, to, SUMNOW, cats, false), hn = handSum(SUMES, from, to, SUMNOW, cats, true);
  sameSum(pick(sm.all), hd, '전체'); sameSum(pick(sm.nowork), hn, '업무·수면 빼고');   // 기존 지표(기록·기록률·중요 비율·집중 블록)는 따로 계산한 값 그대로
  near(T.tlImpBar(sm.all)[0].pct, sm.all.impMin / sm.all.rec); assert(T.tlImpBar(sm.all)[0].pct < sm.all.impPct, '전체 줄: 막대의 중요 % (기록한 시간 기준) < 기존 중요 비율 (수면 제외 기준)');
  near(sm.all.impBase, sm.all.rec - sm.all.sleepMin, '두 분모의 차이 = 수면 시간');
});
console.log('\n결과: 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
