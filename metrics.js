// 공유 지표 계산 (hr-app 과 artifact/insights.html 이 같은 파일을 쓴다).
// 순수 함수만: 화면(DOM)·저장소(localStorage)에 손대지 않는다. 입력은 { 저장키: 이미 JSON.parse 한 값 } 객체.
// 숫자는 전부 여기서 계산한다. AI 는 이 결과만 받아서 해석한다.
// 표본 규칙: 평균·비교 지표는 { n, coverage, insufficient } 를 붙인다. insufficient = coverage < 0.7 또는 n < 3.
//            단순 개수·합계(책 권수, 이번 주 Zone 2 합계 등)는 사실 그 자체라 insufficient 를 항상 false 로 둔다 (n 은 붙임).
(function (root) {
  'use strict';
  const DAY = 86400000, MIN = 60000, KST = 9 * 3600000;
  const BOOK_CATS = ['문학', '역사', '철학', '과학', '기타'];
  const DEFAULT_TARGETS = { '문학': 300, '역사': 200, '철학': 100, '과학': 100, '기타': 100 };
  const GOAL_DEFAULTS = { youtube_max_min_per_day: 60, sleep_min_hours: 7 };
  const LOG_KEY = /^time_log_\d{4}_\d{2}$/;

  // ---------- 입력 정리 (밖에서 온 값은 모양을 믿지 않는다) ----------
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const num = v => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : null));
  const str = v => (typeof v === 'string' ? v : '');
  const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(str(s));
  const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const pct = (v, g) => (v != null && g > 0 ? Math.round(v / g * 1000) / 10 : null);
  function sample(n, coverage) { return { n, coverage: coverage == null ? null : Math.round(coverage * 1000) / 1000, insufficient: (coverage != null && coverage < 0.7) || n < 3 }; }

  // hr-app-sync.json 의 data 는 { 키: 문자열 } — 이걸 { 키: 값 } 으로. 못 읽는 키는 건너뛰고 이름을 돌려준다
  function parseStore(strMap) {
    const out = {}, bad = [];
    Object.keys(obj(strMap)).forEach(k => {
      const v = strMap[k];
      if (typeof v !== 'string') { out[k] = v; return; }
      try { out[k] = JSON.parse(v); } catch (e) { bad.push(k); }
    });
    return { store: out, bad };
  }

  // ---------- 날짜 ----------
  const kst = ms => new Date(ms + KST);   // getUTC* 로 한국 시간 읽기 (시간 탭과 같은 기준)
  const pad = n => String(n).padStart(2, '0');
  const kstDayStart = ms => Math.floor((ms + KST) / DAY) * DAY - KST;
  const kstDayKey = ms => { const d = kst(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const kstDow = ms => (kst(ms).getUTCDay() + 6) % 7;   // 0=월
  const kstFromDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - KST : NaN; };
  const localDayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  // ================= 독서 =================
  function bookNotes(logs, id) {   // [{day, page, note}] 메모가 있는 날만, 날짜순
    const L = obj(obj(logs)[id]);
    return Object.keys(L).filter(isDay).sort().map(k => ({ day: k, page: num(L[k] && L[k].page), note: str(L[k] && L[k].note).trim() })).filter(x => x.note);
  }
  function cleanBooks(store) {
    return arr(store.book_list).filter(b => b && typeof b === 'object' && typeof b.id === 'string').map(b => ({
      id: b.id, title: str(b.title) || '(제목 없음)', author: str(b.author), category: BOOK_CATS.includes(b.category) ? b.category : '기타',
      status: str(b.status), rating: num(b.rating) >= 1 && num(b.rating) <= 5 ? num(b.rating) : null, review: str(b.review).trim(),
      startedAt: isDay(b.startedAt) ? b.startedAt : null, finishedAt: isDay(b.finishedAt) ? b.finishedAt : null,
      isbn: str(b.isbn).replace(/[^0-9]/g, ''), kdc: /^\d{3}$/.test(str(b.kdc)) ? b.kdc : null,
    }));
  }
  const isDone = b => b.status === 'done';
  const isCandidate = b => !!b.isbn && b.category === '기타';   // ISBN 이 있는데 분야가 기타 = 다시 분류할 후보

  function reading(store, now) {
    const books = cleanBooks(store), logs = obj(store.book_logs), tg = Object.assign({}, DEFAULT_TARGETS);
    Object.keys(obj(store.book_targets)).forEach(c => { const v = num(store.book_targets[c]); if (BOOK_CATS.includes(c) && v != null && v >= 0) tg[c] = v; });
    const fields = BOOK_CATS.map(c => {
      const list = books.filter(b => b.category === c), done = list.filter(isDone).length;
      return { cat: c, count: list.length, completed: done, target: tg[c], pct: pct(done, tg[c]), candidates: list.filter(isCandidate).length };
    });
    const nd = new Date(now), monthly = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nd.getFullYear(), nd.getMonth() - i, 1), ym = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      monthly.push({ month: ym, completed: books.filter(b => isDone(b) && b.finishedAt && b.finishedAt.slice(0, 7) === ym).length });
    }
    const notesPerBook = books.map(b => ({ id: b.id, title: b.title, notes: bookNotes(logs, b.id).length, hasReview: !!b.review })).filter(x => x.notes || x.hasReview);
    const recent = books.filter(b => isDone(b) && b.finishedAt).sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1)).slice(0, 5)
      .map(b => ({ id: b.id, title: b.title, category: b.category, finishedAt: b.finishedAt, rating: b.rating }));
    const done = books.filter(isDone).length;
    return {
      total: books.length, completed: done, reading: books.filter(b => b.status === 'reading').length,
      candidates: books.filter(isCandidate).length, fields, monthly, notesPerBook, recent,
      n: books.length, coverage: null, insufficient: false,
    };
  }

  // 지도에 넘길 데이터 (책 + 메모 + 승인된 연결만)
  function mapData(store, now) {
    const books = cleanBooks(store), logs = obj(store.book_logs), ids = new Set(books.map(b => b.id));
    const links = arr(store.book_links).filter(l => l && l.approved === true && ids.has(l.a) && ids.has(l.b) && l.a !== l.b)
      .map(l => ({ a: l.a, b: l.b, reason: str(l.reason) }));
    const r = reading(store, now), cut = localDayKey(new Date(now - 30 * DAY));
    return {
      fields: r.fields,
      books: books.map(b => Object.assign({}, b, {
        notes: bookNotes(logs, b.id), candidate: isCandidate(b),
        recent: isDone(b) && !!b.finishedAt && b.finishedAt >= cut,
        linked: links.filter(l => l.a === b.id || l.b === b.id).map(l => ({ id: l.a === b.id ? l.b : l.a, reason: l.reason })),
      })),
      links,
    };
  }

  // 제목·저자·감상·메모 검색 (소문자 포함 여부)
  function searchBooks(store, q, limit) {
    const s = str(q).trim().toLowerCase(); if (!s) return [];
    const logs = obj(store.book_logs);
    return cleanBooks(store).map(b => {
      const notes = bookNotes(logs, b.id), hits = [];
      if ((b.title + ' ' + b.author).toLowerCase().includes(s)) hits.push('제목');
      if (b.review.toLowerCase().includes(s)) hits.push('감상');
      const nh = notes.filter(x => x.note.toLowerCase().includes(s));
      if (nh.length) hits.push('메모');
      return hits.length ? { id: b.id, title: b.title, author: b.author, category: b.category, status: b.status, rating: b.rating, finishedAt: b.finishedAt, review: b.review, notes: notes, matched: hits } : null;
    }).filter(Boolean).slice(0, limit || 50);
  }

  // ================= 운동 =================
  // 주 시작: weekStart 'sun' 이면 일요일, 그 외 월요일. 기기 현지 시간 기준 (심박 탭 startOfWeek 와 같은 방식)
  function localWeekStart(now, weekStart) {
    const ws = weekStart === 'sun' ? 0 : 1, d = new Date(now);
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() - ws + 7) % 7);
    return d.getTime();
  }
  function cleanSessions(store) {
    return arr(store.hr_sessions).map(s => ({ date: num(s && s.date), duration: num(s && s.duration), z2: num(s && Array.isArray(s.zoneSec) ? s.zoneSec[2] : null) }))
      .filter(s => s.date != null);   // 날짜 없는 기록은 버린다
  }
  function measureWindow(ms, now, days, morningOnly) {
    const from = now - days * DAY;
    const pick = ms.filter(m => m.date > from && m.date <= now && (!morningOnly || new Date(m.date).getHours() < 10));
    const stat = key => {
      const v = pick.filter(m => m[key] != null), dayset = new Set(v.map(m => localDayKey(new Date(m.date))));
      return Object.assign({ mean: r1(mean(v.map(m => m[key]))) }, sample(v.length, dayset.size / days));
    };
    return { rhr: stat('rhr'), hrv: stat('hrv') };
  }
  function compare(ms, now, morningOnly) {
    const w7 = measureWindow(ms, now, 7, morningOnly), w30 = measureWindow(ms, now, 30, morningOnly), out = {};
    ['rhr', 'hrv'].forEach(k => {
      const a = w7[k], b = w30[k];
      out[k] = { mean7: a.mean, n7: a.n, coverage7: a.coverage, mean30: b.mean, n30: b.n, coverage30: b.coverage,
        diff: a.mean != null && b.mean != null ? r1(a.mean - b.mean) : null, insufficient: a.insufficient || b.insufficient };
    });
    return out;
  }
  function exercise(store, now, weekStart) {
    const ss = cleanSessions(store), settings = obj(store.hr_settings);
    const ws = localWeekStart(now, weekStart != null ? weekStart : settings.weekStart);
    const week = ss.filter(s => s.date >= ws);
    const z2sec = week.reduce((a, s) => a + (s.z2 || 0), 0), goal = num(settings.goal) > 0 ? num(settings.goal) : 150;
    const prev4 = ss.filter(s => s.date >= ws - 28 * DAY && s.date < ws).length;
    const last = ss.reduce((m, s) => Math.max(m, s.date), -Infinity);
    const ms = arr(store.hr_measures).map(m => ({ date: num(m && m.date), rhr: num(m && m.rhr) > 0 ? num(m.rhr) : null, hrv: num(m && m.hrv) > 0 ? num(m.hrv) : null })).filter(m => m.date != null);
    return {
      weekStart: ws,
      zone2: { min: Math.round(z2sec / 60), goal, pct: pct(Math.round(z2sec / 60), goal), n: week.length, coverage: null, insufficient: false },
      sessions: { thisWeek: week.length, prev4Weeks: prev4, prev4WeeksAvg: r1(prev4 / 4), n: ss.length, coverage: null, insufficient: false },
      daysSinceLast: isFinite(last) ? Math.floor((now - last) / DAY) : null,
      measures: { all: compare(ms, now, false), morning: compare(ms, now, true), note: 'morning = 현지 시각 10시 전 측정만' },
    };
  }

  // ================= 시간 =================
  // 시간 탭(TL-CORE)과 같은 규칙: 겹치면 수동이 자동을 이기고, 같은 종류끼리는 나중에 시작한 쪽이 이긴다. 진행 중 기록은 now 까지.
  function timeEntries(store, now) {
    const all = [];
    Object.keys(store).filter(k => LOG_KEY.test(k)).forEach(k => arr(store[k]).forEach(e => {
      if (e && typeof e.catId === 'string' && num(e.start) != null && (e.end == null || (num(e.end) != null && num(e.end) > num(e.start))))
        all.push({ id: String(e.id), start: num(e.start), end: e.end == null ? null : num(e.end), catId: e.catId, source: e.source || 'manual' });
    }));
    arr(store.hr_sessions).forEach(s => {   // 심박 운동 = 자동 '운동' 기록 (저장되지 않고 매번 계산되는 것과 같게)
      const end = num(s && s.date), dur = num(s && s.duration);
      if (end != null && dur > 0 && dur < 12 * 3600) all.push({ id: 'auto-hr-' + end, start: end - dur * 1000, end, catId: 'exercise', source: 'auto-hr' });
    });
    const cur = obj(store.time_current);
    if (typeof cur.catId === 'string' && num(cur.start) != null) all.push({ id: '__cur', start: num(cur.start), end: null, catId: cur.catId, source: 'manual' });
    return all;
  }
  function resolve(entries, now) {
    const es = [];
    entries.forEach(e => { const t = e.end == null ? now : e.end; if (t > e.start) es.push({ e, s: e.start, t, pri: e.source === 'manual' ? 1 : 0 }); });
    const bs = [...new Set(es.flatMap(x => [x.s, x.t]))].sort((a, b) => a - b), out = [];
    for (let i = 0; i + 1 < bs.length; i++) {
      const a = bs[i], b = bs[i + 1];
      let best = null;
      for (const x of es) if (x.s <= a && x.t >= b && (!best || x.pri > best.pri || (x.pri === best.pri && x.s > best.s))) best = x;
      if (best) out.push({ start: a, end: b, catId: best.e.catId });
    }
    return out;
  }
  // [from,to) 를 하루(한국 시간)씩 잘라 { 날짜: { 분류: 분 } }
  function byDay(segs, from, to) {
    const days = {};
    segs.forEach(s => {
      let a = Math.max(s.start, from); const end = Math.min(s.end, to);
      while (a < end) {
        const b = Math.min(kstDayStart(a) + DAY, end), k = kstDayKey(a), d = days[k] || (days[k] = {});
        d[s.catId] = (d[s.catId] || 0) + (b - a) / MIN; a = b;
      }
    });
    return days;
  }
  const dayTotal = d => Object.keys(d).reduce((a, k) => a + d[k], 0);
  // 저장된 분류 목록이 없거나 깨졌으면 시간 탭처럼 기본 분류를 쓴다 (index.html TL_DEFAULT_CATS 와 같은 이름 — 테스트가 확인)
  const DEFAULT_CAT_NAMES = { sleep: '수면', work: '회사 업무', dev: '트레이딩·개발', read: '독서', exercise: '운동', study: '공부', move: '이동', chores: '식사·집안일', people: '사람·가족', rest: '휴식', phone: '폰·SNS', web: '웹서핑', youtube: '유튜브 시청', etc: '기타' };
  function catList(store) {
    const a = arr(store.time_categories), ok = a.length && a.every(c => c && typeof c.id === 'string' && typeof c.name === 'string');
    return ok ? a.map(c => ({ id: c.id, name: c.name })) : Object.keys(DEFAULT_CAT_NAMES).map(id => ({ id, name: DEFAULT_CAT_NAMES[id] }));
  }
  function timeuse(store, day, now) {
    const d0 = kstFromDay(day); if (!isFinite(d0)) return { error: 'bad_day' };
    const segs = resolve(timeEntries(store, now), now), cats = catList(store);
    const name = id => { const c = cats.find(x => x.id === id); return c ? c.name : id; };
    const todayEnd = Math.min(d0 + DAY, Math.max(now, d0)), todayMap = byDay(segs, d0, d0 + DAY)[day] || {};
    // 비교 기준: 그 날 앞 28일. 평균 = 기록이 있는 날 수로 나눔 (시간 탭 월간 보고의 하루 평균과 같은 방식)
    const hist = byDay(segs, d0 - 28 * DAY, d0), histDays = Object.keys(hist), histRec = histDays.reduce((a, k) => a + dayTotal(hist[k]), 0);
    const ids = [...new Set([...Object.keys(todayMap), ...histDays.flatMap(k => Object.keys(hist[k]))])];
    const base = sample(histDays.length, histRec / (28 * 1440));
    const categories = ids.map(id => {
      const tot = histDays.reduce((a, k) => a + (hist[k][id] || 0), 0), avg = histDays.length ? tot / histDays.length : null;
      return { id, name: name(id), todayMin: Math.round(todayMap[id] || 0), avg28Min: avg == null ? null : Math.round(avg), diffMin: avg == null ? null : Math.round((todayMap[id] || 0) - avg) };
    }).sort((a, b) => b.todayMin - a.todayMin || (b.avg28Min || 0) - (a.avg28Min || 0));
    // 수면: 앞 4주(그 날 제외), 평일(월~금) vs 주말(토·일). 자정에서 자른 하루 단위 (시간 탭과 같음)
    const sl = { wd: [], we: [] }, cnt = { wd: 0, we: 0 };
    for (let i = 1; i <= 28; i++) {
      const ds = d0 - i * DAY, k = kstDayKey(ds), g = kstDow(ds) >= 5 ? 'we' : 'wd';
      cnt[g]++;
      if (hist[k] && dayTotal(hist[k]) > 0) sl[g].push(hist[k].sleep || 0);
    }
    const sAvg = g => Object.assign({ hours: sl[g].length ? r1(mean(sl[g]) / 60) : null }, sample(sl[g].length, sl[g].length / cnt[g]));
    const weekday = sAvg('wd'), weekend = sAvg('we');
    // 기록률: 오늘(지금까지), 이번 주(월요일 시작, 지금까지)
    const todayRec = dayTotal(todayMap), todayElapsed = (todayEnd - d0) / MIN;
    // (시간 탭 covSoFar 와 같게: 기록은 구간 전체, 나누는 시간은 지금까지)
    const ws = d0 - kstDow(d0) * DAY, wEnd = Math.min(ws + 7 * DAY, Math.max(now, ws)), wk = byDay(segs, ws, ws + 7 * DAY);
    const weekRec = Object.keys(wk).reduce((a, k) => a + dayTotal(wk[k]), 0), weekElapsed = (wEnd - ws) / MIN;
    return {
      day, categories, baseline: base,
      sleep: { weekday, weekend, diffHours: weekday.hours != null && weekend.hours != null ? r1(weekend.hours - weekday.hours) : null },
      coverage: { today: todayElapsed > 0 ? Math.round(todayRec / todayElapsed * 1000) / 10 : null, week: weekElapsed > 0 ? Math.round(weekRec / weekElapsed * 1000) / 10 : null, unit: '%' },
    };
  }

  // ================= 목표 =================
  function goals(store, now, weekStart) {
    const g = obj(store.insight_goals), settings = obj(store.hr_settings);
    const pick = (k, d) => (num(g[k]) > 0 ? num(g[k]) : d);
    const yMax = pick('youtube_max_min_per_day', GOAL_DEFAULTS.youtube_max_min_per_day), sMin = pick('sleep_min_hours', GOAL_DEFAULTS.sleep_min_hours);
    const z2Goal = pick('zone2_weekly_min', num(settings.goal) > 0 ? num(settings.goal) : 150);
    // 유튜브·수면 = 어제까지 최근 7일 중 기록이 있는 날의 하루 평균 (오늘은 아직 안 끝나서 제외)
    const today0 = kstDayStart(now), segs = resolve(timeEntries(store, now), now), days = byDay(segs, today0 - 7 * DAY, today0);
    const rec = Object.keys(days).filter(k => dayTotal(days[k]) > 0), cov = sample(rec.length, rec.length / 7);
    const avgOf = id => (rec.length ? rec.reduce((a, k) => a + (days[k][id] || 0), 0) / rec.length : null);
    const yt = avgOf('youtube'), sl = avgOf('sleep'), z2 = exercise(store, now, weekStart).zone2.min;
    const st = (v, goal, kind) => (v == null ? null : kind === 'max' ? (v > goal ? 'over' : 'ok') : (v < goal ? 'under' : 'ok'));
    return {
      youtube: Object.assign({ value: yt == null ? null : Math.round(yt), goal: yMax, pct: pct(yt, yMax), status: st(yt, yMax, 'max'), unit: '분/일 (최근 7일 평균)' }, cov),
      sleep: Object.assign({ value: r1(sl == null ? null : sl / 60), goal: sMin, pct: pct(sl == null ? null : sl / 60, sMin), status: st(sl == null ? null : sl / 60, sMin, 'min'), unit: '시간/일 (최근 7일 평균)' }, cov),
      zone2: { value: z2, goal: z2Goal, pct: pct(z2, z2Goal), status: st(z2, z2Goal, 'min'), unit: '분 (이번 주 합계)', n: null, coverage: null, insufficient: false },
    };
  }

  const api = { parseStore, reading, mapData, searchBooks, exercise, timeuse, goals, localWeekStart, kstDayKey, BOOK_CATS, DEFAULT_TARGETS, GOAL_DEFAULTS, DEFAULT_CAT_NAMES, _resolve: resolve, _byDay: byDay, _timeEntries: timeEntries };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HRMetrics = api;
})(typeof window !== 'undefined' ? window : globalThis);
