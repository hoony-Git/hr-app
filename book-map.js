// 독서 지도 그리기 (hr-app 과 artifact/insights.html 이 같은 파일을 쓴다). 데이터는 밖에서 받는다 (HRMetrics.mapData 결과).
// 저장소에 손대지 않는다. 행성 5개 = 분야, 크기 = 완독 권수, 바깥 고리 = 평생 목표 진행률.
// 점 = 책 (밝기 = 별점, 반짝임 = 최근 30일 완독, 주황 점 = 다시 분류할 후보), 마름모 = 감상·메모, 선 = 승인된 연결.
// 터치: 두 손가락 확대, 한 손가락 이동, 탭 = 선택. PC: 휠 확대, 끌어서 이동, 클릭 = 선택.
// 화면에 안 보이면(다른 탭, 페이지 숨김) 애니메이션을 멈춘다.
(function (root) {
  'use strict';
  const CATS = ['문학', '역사', '철학', '과학', '기타'];
  const CAT_COLOR = { '문학': '#f87171', '역사': '#a78bfa', '철학': '#2dd4bf', '과학': '#a3e635', '기타': '#facc15' };
  const ORBIT = 230, BOOK_R = 4;

  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const starN = Math.min(coarse ? 150 : 300, opts.stars != null ? opts.stars : (coarse ? 120 : 260));
    const stars = Array.from({ length: starN }, (_, i) => ({ x: rand(i * 3 + 1), y: rand(i * 3 + 2), r: 0.4 + rand(i * 3 + 3) * 1.1, p: rand(i * 7) * 6.28 }));
    const S = { data: null, planets: [], dots: [], byId: {}, z: 1, px: 0, py: 0, w: 0, h: 0, dpr: 1, sel: null, running: false, raf: 0, frames: 0, fitted: false, ptr: new Map(), drag: null, pinch: null };

    function rand(n) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }   // 고정 난수 (그릴 때마다 같은 자리)

    // ---------- 배치 ----------
    function layout() {
      S.planets = []; S.dots = []; S.byId = {};
      if (!S.data) return;
      CATS.forEach((c, i) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / CATS.length, f = (S.data.fields || []).find(x => x.cat === c) || { completed: 0, count: 0, target: 0, pct: 0 };
        const r = 20 + 5 * Math.sqrt(f.completed || 0);
        const p = { cat: c, x: Math.cos(a) * ORBIT, y: Math.sin(a) * ORBIT, r, f, color: (opts.catColors && opts.catColors[c]) || CAT_COLOR[c] };
        S.planets.push(p);
        const books = (S.data.books || []).filter(b => b.category === c).sort((a, b) => ((a.finishedAt || a.startedAt || '') < (b.finishedAt || b.startedAt || '') ? -1 : 1));
        let ring = 0, inRing = 0, cap = 0, rad = 0;
        books.forEach((b, j) => {
          if (inRing >= cap) { rad = r + 16 + ring * 13; cap = Math.max(6, Math.floor(2 * Math.PI * rad / 13)); inRing = 0; ring++; }
          const ang = inRing / cap * 2 * Math.PI + ring * 0.37;
          const d = { b, x: p.x + Math.cos(ang) * rad, y: p.y + Math.sin(ang) * rad, p, notes: (b.review ? 1 : 0) + (b.notes ? b.notes.length : 0), tw: rand(j + i * 97) * 6.28 };
          S.dots.push(d); S.byId[b.id] = d; inRing++;
        });
      });
    }
    function extent() { let m = ORBIT; S.dots.forEach(d => { m = Math.max(m, Math.abs(d.x) + 10, Math.abs(d.y) + 10); }); S.planets.forEach(p => { m = Math.max(m, Math.abs(p.x) + p.r + 30, Math.abs(p.y) + p.r + 30); }); return m; }
    function fit() { if (!S.w) return; S.z = Math.min(S.w, S.h) / 2 / extent() * 0.95; S.px = 0; S.py = 0; S.fitted = true; }

    // ---------- 좌표 ----------
    const toScreen = (x, y) => [S.w / 2 + S.px + x * S.z, S.h / 2 + S.py + y * S.z];
    const toWorld = (sx, sy) => [(sx - S.w / 2 - S.px) / S.z, (sy - S.h / 2 - S.py) / S.z];
    function zoomAt(sx, sy, k) {
      const nz = Math.max(0.2, Math.min(12, S.z * k)), [wx, wy] = toWorld(sx, sy);
      S.z = nz; S.px = sx - S.w / 2 - wx * nz; S.py = sy - S.h / 2 - wy * nz; kick();
    }
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, root.devicePixelRatio || 1);
      if (w === S.w && h === S.h && dpr === S.dpr) return;
      S.w = w; S.h = h; S.dpr = dpr; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (!S.fitted) fit();
    }

    // ---------- 그리기 ----------
    function draw(t) {
      const c = ctx; c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      c.fillStyle = opts.bg || '#0b0f17'; c.fillRect(0, 0, S.w, S.h);
      stars.forEach(s => { c.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + s.p)); c.fillStyle = '#cbd5e1'; c.fillRect(((s.x * S.w + S.px * 0.08) % S.w + S.w) % S.w, ((s.y * S.h + S.py * 0.08) % S.h + S.h) % S.h, s.r, s.r); });
      c.globalAlpha = 1;
      if (!S.data) return;
      c.save(); c.translate(S.w / 2 + S.px, S.h / 2 + S.py); c.scale(S.z, S.z);
      const px = 1 / S.z;   // 화면 1픽셀의 세계 크기
      // 연결선
      (S.data.links || []).forEach(l => {
        const a = S.byId[l.a], b = S.byId[l.b]; if (!a || !b) return;
        const on = S.sel && (S.sel === l.a || S.sel === l.b);
        c.strokeStyle = on ? 'rgba(125,211,252,.9)' : 'rgba(125,211,252,.35)'; c.lineWidth = (on ? 2 : 1) * px;
        c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo((a.x + b.x) / 2 * 0.6, (a.y + b.y) / 2 * 0.6, b.x, b.y); c.stroke();
      });
      // 행성 + 목표 고리
      S.planets.forEach(p => {
        const g = c.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
        g.addColorStop(0, p.color); g.addColorStop(1, shade(p.color));
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fill();
        const rr = p.r + 7; c.lineWidth = 3 * Math.min(1, px * 1.5) + 1; c.strokeStyle = 'rgba(148,163,184,.25)';
        c.beginPath(); c.arc(p.x, p.y, rr, 0, 6.2832); c.stroke();
        const frac = Math.max(0, Math.min(1, (p.f.pct || 0) / 100));
        if (frac > 0) { c.strokeStyle = p.color; c.beginPath(); c.arc(p.x, p.y, rr, -Math.PI / 2, -Math.PI / 2 + frac * 6.2832); c.stroke(); }
      });
      // 책 점
      S.dots.forEach(d => {
        const b = d.b, done = b.status === 'done';
        if (done) {
          c.globalAlpha = b.rating ? 0.3 + 0.14 * b.rating : 0.45; c.fillStyle = '#f8fafc';
          c.beginPath(); c.arc(d.x, d.y, BOOK_R, 0, 6.2832); c.fill();
        } else {
          c.globalAlpha = b.status === 'reading' ? 0.95 : 0.35; c.strokeStyle = b.status === 'reading' ? d.p.color : '#64748b'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(d.x, d.y, BOOK_R - 0.5, 0, 6.2832); c.stroke();
        }
        c.globalAlpha = 1;
        if (b.recent) {   // 반짝임
          const k = 0.5 + 0.5 * Math.sin(t / 260 + d.tw), L = BOOK_R + 3 + 3 * k;
          c.strokeStyle = 'rgba(253,224,71,' + (0.35 + 0.6 * k) + ')'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(d.x - L, d.y); c.lineTo(d.x + L, d.y); c.moveTo(d.x, d.y - L); c.lineTo(d.x, d.y + L); c.stroke();
        }
        if (b.candidate) { c.fillStyle = '#fb923c'; c.beginPath(); c.arc(d.x + BOOK_R, d.y - BOOK_R, 1.8, 0, 6.2832); c.fill(); }
        for (let i = 0; i < Math.min(3, d.notes); i++) {   // 마름모 = 감상·메모 (최대 3개)
          const a = 0.6 + i * 0.7, mx = d.x + Math.cos(a) * (BOOK_R + 4), my = d.y + Math.sin(a) * (BOOK_R + 4), s = 1.6;
          c.fillStyle = '#7dd3fc'; c.beginPath(); c.moveTo(mx, my - s); c.lineTo(mx + s, my); c.lineTo(mx, my + s); c.lineTo(mx - s, my); c.closePath(); c.fill();
        }
        if (S.sel === b.id) { c.strokeStyle = '#38bdf8'; c.lineWidth = 2 * px; c.beginPath(); c.arc(d.x, d.y, BOOK_R + 6 + 2 * Math.sin(t / 200), 0, 6.2832); c.stroke(); }
      });
      c.restore();
      labels();
    }
    function shade(hex) { const n = parseInt(hex.slice(1), 16), f = v => Math.round(v * 0.35); return 'rgb(' + f(n >> 16 & 255) + ',' + f(n >> 8 & 255) + ',' + f(n & 255) + ')'; }
    // 글자는 화면 좌표로. 겹치면 건너뛴다 (먼저 놓인 것 우선: 행성 → 선택한 책 → 별점 높은 책)
    function labels() {
      const c = ctx, placed = [];
      const tryPut = (txt, sx, sy, font, color) => {
        c.font = font; const w = c.measureText(txt).width + 6, h = 15, r = [sx - w / 2, sy - h / 2, w, h];
        if (r[0] < 0 || r[1] < 0 || r[0] + w > S.w || r[1] + h > S.h) return;
        if (placed.some(q => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) return;
        placed.push(r); c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, sx, sy);
      };
      S.planets.forEach(p => {
        const [sx, sy] = toScreen(p.x, p.y), off = (p.r + 7) * S.z + 12;
        tryPut(p.cat, sx, sy - off - 8, '600 13px system-ui, sans-serif', '#e2e8f0');
        tryPut('완독 ' + (p.f.completed || 0) + '/' + (p.f.target || 0) + ' · ' + (p.f.pct || 0) + '%', sx, sy - off + 7, '11px system-ui, sans-serif', '#94a3b8');
      });
      if (S.z < 1.4 && !S.sel) return;
      const order = S.dots.slice().sort((a, b) => (b.b.id === S.sel) - (a.b.id === S.sel) || (b.b.rating || 0) - (a.b.rating || 0));
      order.forEach(d => {
        if (S.z < 1.4 && d.b.id !== S.sel) return;
        const [sx, sy] = toScreen(d.x, d.y), t = d.b.title.length > 14 ? d.b.title.slice(0, 13) + '…' : d.b.title;
        tryPut(t, sx, sy + BOOK_R * S.z + 10, '11px system-ui, sans-serif', d.b.id === S.sel ? '#7dd3fc' : '#cbd5e1');
      });
    }

    // ---------- 반복 (보일 때만) ----------
    function visible() { return !(typeof document !== 'undefined' && document.hidden) && canvas.isConnected && canvas.offsetParent !== null && canvas.clientWidth > 0; }
    function frame(t) {
      S.raf = 0;
      if (!S.running) return;
      if (!visible()) { S.running = false; return; }   // 숨겨지면 스스로 멈춤. 다시 보일 때 start() 로 깨운다
      resize(); draw(t); S.frames++;
      S.raf = requestAnimationFrame(frame);
    }
    function start() { if (S.running || !visible()) return; S.running = true; S.raf = requestAnimationFrame(frame); }
    function stop() { S.running = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }
    function kick() { if (!S.running) start(); }
    const onVis = () => { if (document.hidden) stop(); else start(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

    // ---------- 입력 ----------
    function hit(sx, sy) {
      let best = null, bd = 18 * 18;
      S.dots.forEach(d => { const [x, y] = toScreen(d.x, d.y), dd = (x - sx) ** 2 + (y - sy) ** 2; if (dd < bd) { bd = dd; best = d; } });
      return best;
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      S.ptr.set(e.pointerId, pos(e));
      if (S.ptr.size === 1) { const [x, y] = pos(e); S.drag = { x, y, px: S.px, py: S.py, moved: false }; }
      if (S.ptr.size === 2) { const [a, b] = [...S.ptr.values()]; S.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: S.z }; if (S.drag) S.drag.moved = true; }
      kick();
    });
    canvas.addEventListener('pointermove', e => {
      if (!S.ptr.has(e.pointerId)) return;
      S.ptr.set(e.pointerId, pos(e));
      if (S.ptr.size === 2 && S.pinch) {
        const [a, b] = [...S.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (S.pinch.d > 0) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (S.pinch.z * d / S.pinch.d) / S.z);
      } else if (S.ptr.size === 1 && S.drag) {
        const [x, y] = pos(e), dx = x - S.drag.x, dy = y - S.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) S.drag.moved = true;
        if (S.drag.moved) { S.px = S.drag.px + dx; S.py = S.drag.py + dy; kick(); }
      }
    });
    const up = e => {
      if (!S.ptr.has(e.pointerId)) return;
      const tap = S.ptr.size === 1 && S.drag && !S.drag.moved && e.type === 'pointerup';
      S.ptr.delete(e.pointerId);
      if (S.ptr.size < 2) S.pinch = null;
      if (S.ptr.size === 1) { const [x, y] = [...S.ptr.values()][0]; S.drag = { x, y, px: S.px, py: S.py, moved: true }; }
      if (tap) { const [x, y] = pos(e), d = hit(x, y); select(d ? d.b.id : null, false); }
      if (!S.ptr.size) S.drag = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

    function select(id, center) {
      S.sel = id && S.byId[id] ? id : null;
      if (S.sel && center) { const d = S.byId[S.sel]; S.z = Math.max(S.z, 2.2); S.px = -d.x * S.z; S.py = -d.y * S.z - S.h * 0.25; }   // 아래 시트에 가리지 않게 위쪽에
      kick();
      if (opts.onSelect) opts.onSelect(S.sel ? S.byId[S.sel].b : null);
    }

    return {
      setData(d) { S.data = d; layout(); if (S.sel && !S.byId[S.sel]) S.sel = null; S.fitted = false; resize(); fit(); kick(); },
      start, stop, select, fit() { fit(); kick(); },
      get stats() { return { frames: S.frames, running: S.running, stars: stars.length, books: S.dots.length }; },
      destroy() { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); },
    };
  }

  const api = { create, CATS, CAT_COLOR };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BookMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
