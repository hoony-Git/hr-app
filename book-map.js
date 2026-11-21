// 독서 지도 그리기 — Night Dial "성단" (hr-app 과 artifact/insights.html 이 같은 파일을 쓴다). 데이터는 밖에서 받는다 (HRMetrics.mapData 결과).
// 저장소에 손대지 않는다.
// 분야 = 구형 성단 (피보나치 구면 분포: 75% 껍질, 25% 안쪽). 빛 알갱이 1개 = 그 분야에서 읽은 10쪽 (book_logs 기준).
//   전체가 1,200개를 넘으면 1,200개를 분야별 읽은 쪽에 비례해 나눈다 (읽은 게 있는 분야는 최소 40개 → 작은 분야도 성단으로 보임).
//   처음 보일 때 60프레임을 재서 평균 22ms 를 넘으면 알갱이를 한 번 절반으로 줄인다 (그 판단은 이 페이지 동안 메모리에만 둔다).
// 책 = 성단 안 큰 별 (꽉 찬 원 + 흰 테두리 = 다 읽음, 흰 원 + 깜빡이는 고리 = 읽는 중, 테두리만 = 중단·읽을 책).
// 가운데 핵 ✦ = 내 서재, 핵 → 분야 허브 곡선, book_links = 책 사이 선. 배경 = 별 + 대각선 은하수 띠 + 성운 빛 3개, 시차 이동.
// 배치는 고정 난수 (분야 이름에서 씨앗) → 열 때마다 같은 모양. 분야 1~12개를 겹치지 않게 놓는다.
// 터치: 두 손가락 확대, 한 손가락 이동, 탭 = 성단 확대 / 책 선택 / 빈 곳 = 전체. PC: 휠 확대, 끌어서 이동, 클릭.
// 화면에 안 보이면(다른 탭, 페이지 숨김) 멈춘다. prefers-reduced-motion 이면 움직이지 않고 필요할 때만 한 번 그린다. DPR 최대 2.
(function (root) {
  'use strict';
  const CATS = ['문학', '역사', '철학', '과학', '기타'];
  const CAT_COLOR = { '문학': '#FF8C69', '역사': '#C08BFF', '철학': '#4FD1C5', '과학': '#7C9CFF', '기타': '#FFC857' };
  const EXTRA = ['#5EE3A1', '#FF6B6B', '#FF9F5A', '#E8A0FF', '#9AD0FF', '#F6E27F', '#7FE0C8', '#FFB3C7', '#B8C0FF', '#D6A77A', '#8FE36F', '#A0AEC0'];
  const TILT = 0.32, TC = Math.cos(TILT), TS = Math.sin(TILT);
  const PAGES_PER = 10, CAP = 1200, MIN_G = 40, SLOW_MS = 22, PROBE = 60;
  let QUALITY = null;   // null = 아직 안 잼, 1 = 그대로, 0.5 = 절반 (같은 페이지 안에서 다시 만들 때도 이어 씀. 저장소에 쓰지 않음)
  const FONT = '"IBM Plex Sans KR", system-ui, sans-serif';

  // 고정 난수 (씨앗 → 같은 수열)
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function fib(i, n) { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), t = i * 2.39996; return [Math.cos(t) * r, y, Math.sin(t) * r]; }
  function rgbOf(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0x9AA0C3; return (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255); }
  function sprite(rgb) {
    if (typeof document === 'undefined') return null;
    const o = document.createElement('canvas'); o.width = o.height = 32;
    const g = o.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(' + rgb + ',1)'); r.addColorStop(0.22, 'rgba(' + rgb + ',.55)'); r.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32); return o;
  }

  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const starN = Math.max(0, Math.min(600, opts.stars != null ? opts.stars : 380));
    const S = { data: null, G: [], nodes: [], byId: {}, links: [], w: 0, h: 0, dpr: 1, z0: 1, ext: 300,
      cam: { x: 0, y: 0, z: 1 }, tg: { x: 0, y: 0, z: 1 }, sel: null, gsel: -1, running: false, raf: 0, frames: 0, last: 0, t0: 0,
      ptr: new Map(), drag: null, pinch: null, fitted: false };
    const white = sprite('232,234,246'), coreS = sprite('255,214,150');
    // 배경 별 (화면 비율 좌표 0~1). 55% 는 대각선 은하수 띠
    const R0 = rng(5), stars = [];
    for (let i = 0; i < starN; i++) {
      const band = R0() < 0.55, bx = R0() * 1.4 - 0.2;
      stars.push({ x: bx, y: band ? bx * 0.62 + 0.12 + (R0() - 0.5) * 0.24 : R0() * 1.3 - 0.15, r: R0() * 0.9 + 0.2, p: 0.08 + R0() * 0.3, t: R0() * 6.28, b: band });
    }
    const NEB = [[0.16, 0.76, 0.68, '70,50,140', 0.16], [0.79, 0.26, 0.58, '30,80,140', 0.12], [0.53, 0.56, 0.79, '120,60,110', 0.07]];

    // ---------- 배치 ----------
    function genreList(d) {
      const set = [];
      (d.fields || []).forEach(f => { if (f && f.cat && !set.includes(f.cat) && (f.count || 0) > 0) set.push(f.cat); });
      (d.books || []).forEach(b => { const c = b.category || '기타'; if (!set.includes(c)) set.push(c); });
      return set.sort((a, b) => { const ia = CATS.indexOf(a), ib = CATS.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1); });
    }
    function layout() {
      S.G = []; S.nodes = []; S.byId = {}; S.links = [];
      const d = S.data; if (!d) return;
      const cats = genreList(d);
      cats.forEach((cat, k) => {
        const books = (d.books || []).filter(b => (b.category || '기타') === cat)
          .sort((a, b) => (a.id < b.id ? -1 : 1));   // id 순 → 배치 고정
        const pages = books.reduce((a, b) => a + (Number(b.pages) > 0 ? Number(b.pages) : 0), 0);
        const n = 0, ppp = PAGES_PER;   // 개수는 아래 budget() 에서 정한다
        const color = (opts.catColors && opts.catColors[cat]) || CAT_COLOR[cat] || EXTRA[k % EXTRA.length];
        const rgb = rgbOf(color), R = rng(hash(cat));
        const g = { cat, k, color, rgb, sp: sprite(rgb), pages, ppp, n, books, f: (d.fields || []).find(x => x.cat === cat) || null,
          a: R() * 6.28, v: (0.05 + R() * 0.05) * (k % 2 ? 1 : -1), x: 0, y: 0,
          R: 30 };
        g.R0 = R;   // 알갱이 자리를 만들 난수 (분야 이름에서 씨앗 → 늘 같음)
        books.forEach((b, i) => { const u = fib(i * 7 + 3, books.length * 7 + 6), nd = { b, g: k, u: [u[0] * 0.6, u[1] * 0.6, u[2] * 0.6], sx: 0, sy: 0, d: 0.5, tw: R() * 6.28 }; S.nodes.push(nd); S.byId[b.id] = nd; });
        S.G.push(g);
      });
      budget(); place();
      S.links = (d.links || []).filter(l => S.byId[l.a] && S.byId[l.b]);
    }
    function budget() {
      const G = S.G, raw = G.map(g => Math.round(g.pages / PAGES_PER)), sum = raw.reduce((a, b) => a + b, 0);
      let ns = raw;
      if (sum > CAP) {
        const tp = G.reduce((a, g) => a + g.pages, 0) || 1;
        ns = G.map(g => g.pages > 0 ? Math.max(MIN_G, Math.floor(CAP * g.pages / tp)) : 0);
        let over = ns.reduce((a, b) => a + b, 0) - CAP;   // 최소 40 때문에 넘친 만큼 큰 분야에서 뺀다
        while (over > 0) { const k = ns.indexOf(Math.max(...ns)); if (ns[k] <= MIN_G) break; const d = Math.min(over, ns[k] - MIN_G); ns[k] -= d; over -= d; }
      }
      G.forEach((g, k) => {
        let n = ns[k];
        g.R = Math.max(30, Math.min(70, 26 + 34 * Math.sqrt(Math.min(1, raw[k] / 600)) + Math.min(14, g.books.length * 0.9)));   // 크기는 읽은 쪽 기준 (상한과 무관)
        g.ppp = n ? g.pages / n : PAGES_PER;
        g.full = n;
        g.pts = new Float32Array(n * 4); const R = g.R0;
        for (let i = 0; i < n; i++) { const u = fib(i, n), q = R() < 0.75 ? 0.82 + R() * 0.18 : Math.cbrt(R()) * 0.8; g.pts[i * 4] = u[0] * q; g.pts[i * 4 + 1] = u[1] * q; g.pts[i * 4 + 2] = u[2] * q; g.pts[i * 4 + 3] = 0.6 + R() * 1.2; }
        g.n = QUALITY === 0.5 ? Math.ceil(n / 2) : n;
        if (QUALITY === 0.5) halve(g);
      });
    }
    // 고르게 절반: 고르게 건너뛰며 고른다 (피보나치 순서라 앞쪽 절반만 쓰면 위쪽 반구만 남는다)
    // 절반으로 줄인 뒤에 분야당 최소 40 을 다시 지킨다 (원래 40 보다 적던 분야는 그대로)
    function halve(g) { const P = g.pts, f = g.full, m = Math.min(f, Math.max(MIN_G, Math.ceil(f / 2))), out = new Float32Array(m * 4); for (let i = 0; i < m; i++) { const j = Math.floor(i * f / m); out.set(P.subarray(j * 4, j * 4 + 4), i * 4); } g.pts = out; g.n = m; }
    // 분야 1~12개: 6개까지는 한 바퀴, 그 이상은 안쪽 5개 + 바깥 나머지. 그다음 겹침을 밀어내 푼다 (고정된 계산이라 매번 같다)
    function place() {
      const G = S.G, k = G.length; if (!k) { S.ext = 200; return; }
      const ring = (list, r, off) => list.forEach((g, i) => { const a = -Math.PI / 2 + off + i * 2 * Math.PI / list.length; g.x = Math.cos(a) * r; g.y = Math.sin(a) * r; });
      const need = list => Math.max(130, list.reduce((s, g) => s + 2 * g.R + 26, 0) / (2 * Math.PI));
      if (k === 1) { G[0].x = 0; G[0].y = -(G[0].R + 70); }
      else if (k <= 6) ring(G, need(G), 0);
      else { const inner = G.slice(0, 5), outer = G.slice(5), r1 = need(inner); ring(inner, r1, 0); ring(outer, Math.max(need(outer), r1 + 120), Math.PI / outer.length); }
      for (let it = 0; it < 240; it++) {
        let moved = false;
        for (let i = 0; i < k; i++) {
          const a = G[i], dc = Math.hypot(a.x, a.y) || 1, minC = a.R + 64;
          if (dc < minC) { a.x *= minC / dc; a.y *= minC / dc; moved = true; }
          for (let j = i + 1; j < k; j++) {
            const b = G[j], dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy) || 0.01, min = a.R + b.R + 22;
            if (dd < min) { const p = (min - dd) / 2, ux = dx / dd, uy = dy / dd; a.x -= ux * p; a.y -= uy * p; b.x += ux * p; b.y += uy * p; moved = true; }
          }
        }
        if (!moved) break;
      }
      S.ext = G.reduce((m, g) => Math.max(m, Math.abs(g.x) + g.R + 40, Math.abs(g.y) + g.R + 50), 150);
    }
    function fitZ() { return S.w ? Math.min(S.w, S.h) / 2 / S.ext * 0.96 : 1; }
    function fit() { if (!S.w) return; S.z0 = fitZ(); S.tg = { x: 0, y: 0, z: S.z0 }; S.cam = { x: 0, y: 0, z: S.z0 }; S.fitted = true; }

    // ---------- 좌표 ----------
    const toScreen = (x, y) => [(x - S.cam.x) * S.cam.z + S.w / 2, (y - S.cam.y) * S.cam.z + S.h / 2];
    const toWorld = (sx, sy) => [(sx - S.w / 2) / S.cam.z + S.cam.x, (sy - S.h / 2) / S.cam.z + S.cam.y];
    function zoomAt(sx, sy, k) {
      const nz = Math.max(S.z0 * 0.4, Math.min(S.z0 * 12, S.cam.z * k)), [wx, wy] = toWorld(sx, sy);
      S.cam.z = nz; S.cam.x = wx - (sx - S.w / 2) / nz; S.cam.y = wy - (sy - S.h / 2) / nz; S.tg = Object.assign({}, S.cam); kick();
    }
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, root.devicePixelRatio || 1);
      if (w === S.w && h === S.h && dpr === S.dpr) return;
      S.w = w; S.h = h; S.dpr = dpr; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (!S.fitted) fit(); else S.z0 = fitZ();
    }
    function proj(g, ux, uy, uz, cs, sn) {   // 자전(y축) + 살짝 기울임 → [세계 x, 세계 y, 깊이 0~1]
      const x1 = ux * cs + uz * sn, z1 = -ux * sn + uz * cs, y2 = uy * TC - z1 * TS, z2 = uy * TS + z1 * TC;
      return [g.x + x1 * g.R, g.y + y2 * g.R, (z2 + 1) / 2];
    }

    // ---------- 그리기 ----------
    function draw(now) {
      const c = ctx, W = S.w, H = S.h, t = (now - S.t0) / 1000, dt = Math.min(0.05, S.last ? (now - S.last) / 1000 : 0.016); S.last = now;
      const ease = RM ? 1 : 0.12;
      S.cam.x += (S.tg.x - S.cam.x) * ease; S.cam.y += (S.tg.y - S.cam.y) * ease; S.cam.z += (S.tg.z - S.cam.z) * ease;
      const zf = S.cam.z / (S.z0 || 1), sel = S.gsel, sb = S.sel ? S.byId[S.sel] : null;
      c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.fillStyle = opts.bg || '#03040B'; c.fillRect(0, 0, W, H);
      const ox = S.cam.x * S.cam.z, oy = S.cam.y * S.cam.z;   // 시차 기준 (화면 픽셀)
      c.globalCompositeOperation = 'lighter';
      const nb = nebula(W, H); if (nb) { const m = 0.25, px = -W * m - ox * 0.15, py = -H * m - oy * 0.15; c.drawImage(nb, px, py, W * (1 + 2 * m), H * (1 + 2 * m)); }
      if (white) stars.forEach(s => {
        const a = RM ? 0.6 : 0.35 + 0.45 * Math.sin(t * 1.3 + s.t), px = s.x * W - ox * s.p, py = s.y * H - oy * s.p;
        if (px < -4 || py < -4 || px > W + 4 || py > H + 4) return;
        c.globalAlpha = a * (s.b ? 0.55 : 0.8); const z = s.r * 3 * (1 + (zf - 1) * s.p * 0.5); c.drawImage(white, px - z, py - z, z * 2, z * 2);
      });
      c.globalAlpha = 1;
      const cs0 = toScreen(0, 0);
      // 핵 → 분야 허브 곡선
      c.globalCompositeOperation = 'source-over'; c.lineWidth = 1;
      S.G.forEach((g, k) => { const h = toScreen(g.x, g.y); c.strokeStyle = 'rgba(' + g.rgb + ',' + (sel < 0 ? 0.22 : sel === k ? 0.45 : 0.06) + ')'; c.beginPath(); c.moveTo(cs0[0], cs0[1]); c.quadraticCurveTo((cs0[0] + h[0]) / 2 + (h[1] - cs0[1]) * 0.15, (cs0[1] + h[1]) / 2 - (h[0] - cs0[0]) * 0.15, h[0], h[1]); c.stroke(); });
      // 성단 (빛 알갱이)
      c.globalCompositeOperation = 'lighter';
      const sq = Math.sqrt(zf);
      S.G.forEach((g, k) => {
        if (!RM) g.a += g.v * dt * (sel === k ? 0.4 : 1);
        const dim = sel < 0 || sel === k ? 1 : 0.22, hz = toScreen(g.x, g.y), hr = g.R * S.cam.z * 1.5;
        if (hz[0] + hr < 0 || hz[1] + hr < 0 || hz[0] - hr > W || hz[1] - hr > H) { g.off = true; } else g.off = false;
        const cs = Math.cos(g.a), sn = Math.sin(g.a);
        if (!g.off) {
          const gr = c.createRadialGradient(hz[0], hz[1], 0, hz[0], hz[1], hr); gr.addColorStop(0, 'rgba(' + g.rgb + ',' + 0.16 * dim + ')'); gr.addColorStop(1, 'rgba(' + g.rgb + ',0)');
          c.fillStyle = gr; c.beginPath(); c.arc(hz[0], hz[1], hr, 0, 6.2832); c.fill();
          if (g.sp) {
            const P = g.pts, Z = S.cam.z, cx = S.cam.x, cy = S.cam.y, hw = W / 2, hh = H / 2;
            // 안쪽 반복은 배열을 만들지 않고 바로 계산 (proj 와 같은 식)
            const gx = (g.x - cx) * Z + hw, gy = (g.y - cy) * Z + hh, RZ = g.R * Z;
            for (let i = 0; i < g.n; i++) {
              const j = i * 4, ux = P[j], uy = P[j + 1], uz = P[j + 2], x1 = ux * cs + uz * sn, z1 = -ux * sn + uz * cs;
              const sx = gx + x1 * RZ, sy = gy + (uy * TC - z1 * TS) * RZ, dep = (uy * TS + z1 * TC + 1) / 2;
              const z = (1.6 + P[j + 3] * 1.6) * (0.55 + dep * 0.7) * sq;
              if (sx < -z || sy < -z || sx > W + z || sy > H + z) continue;
              c.globalAlpha = (0.18 + dep * 0.6) * dim; c.drawImage(g.sp, sx - z, sy - z, z * 2, z * 2);
            }
          }
        }
        c.globalAlpha = 1;
        g.books.forEach(b => { const nd = S.byId[b.id], q = proj(g, nd.u[0], nd.u[1], nd.u[2], cs, sn), s2 = toScreen(q[0], q[1]); nd.sx = s2[0]; nd.sy = s2[1]; nd.d = q[2]; });
      });
      // 책 사이 연결
      c.globalCompositeOperation = 'source-over';
      S.links.forEach(l => {
        const A = S.byId[l.a], B = S.byId[l.b], on = sb && (sb === A || sb === B), near = sel >= 0 && (A.g === sel || B.g === sel);
        c.strokeStyle = 'rgba(232,234,246,' + (on ? 0.8 : near ? 0.3 : sel < 0 && !sb ? 0.16 : 0.05) + ')'; c.lineWidth = on ? 1.4 : 0.8;
        c.beginPath(); c.moveTo(A.sx, A.sy); c.lineTo(B.sx, B.sy); c.stroke();
      });
      if (sb) { const hg = S.G[sb.g], hh = toScreen(hg.x, hg.y); c.strokeStyle = 'rgba(' + hg.rgb + ',.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(hh[0], hh[1]); c.lineTo(sb.sx, sb.sy); c.stroke(); }
      // 핵 ✦ 내 서재
      c.globalCompositeOperation = 'lighter'; const cz = (26 + (RM ? 0 : Math.sin(t * 2) * 3)) * Math.min(1.6, sq);
      if (coreS) c.drawImage(coreS, cs0[0] - cz, cs0[1] - cz, cz * 2, cz * 2);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#FFE3B8'; c.beginPath(); c.arc(cs0[0], cs0[1], 9, 0, 6.2832); c.fill();
      c.strokeStyle = 'rgba(255,227,184,.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cs0[0], cs0[1], 14, 0, 6.2832); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3A2400'; c.font = '500 11px ' + FONT; c.fillText('✦', cs0[0], cs0[1] + 0.5);
      c.fillStyle = 'rgba(232,234,246,.8)'; c.fillText('내 서재', cs0[0], cs0[1] + 26);
      // 책 (깊이순)
      const nodes = S.nodes.slice().sort((a, b) => a.d - b.d), placed = [];
      nodes.forEach(nd => {
        const g = S.G[nd.g], b = nd.b, dim = sel < 0 || sel === nd.g ? 1 : 0.25, r = (3.2 + nd.d * 2.2) * Math.min(Math.max(zf, 0.7), 1.8) * 0.9;
        if (nd.sx < -20 || nd.sy < -20 || nd.sx > W + 20 || nd.sy > H + 20) return;
        c.globalAlpha = dim * (0.55 + nd.d * 0.45);
        if (b.status === 'done') { c.fillStyle = 'rgb(' + g.rgb + ')'; c.beginPath(); c.arc(nd.sx, nd.sy, r, 0, 6.2832); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.3; c.stroke(); }
        else if (b.status === 'reading') { const pu = RM ? 0.5 : (Math.sin(t * 3 + nd.tw) + 1) / 2; c.fillStyle = '#fff'; c.beginPath(); c.arc(nd.sx, nd.sy, r, 0, 6.2832); c.fill(); c.strokeStyle = 'rgba(' + g.rgb + ',' + (1 - pu * 0.7) + ')'; c.lineWidth = 1.5; c.beginPath(); c.arc(nd.sx, nd.sy, r + 3 + pu * 5, 0, 6.2832); c.stroke(); }
        else { c.strokeStyle = 'rgba(' + g.rgb + ',.8)'; c.lineWidth = 1; c.beginPath(); c.arc(nd.sx, nd.sy, r * 0.8, 0, 6.2832); c.stroke(); }
        if (b.recent && !RM) { const k2 = 0.5 + 0.5 * Math.sin(t * 4 + nd.tw), L = r + 3 + 3 * k2; c.strokeStyle = 'rgba(255,227,184,' + (0.3 + 0.5 * k2) + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(nd.sx - L, nd.sy); c.lineTo(nd.sx + L, nd.sy); c.moveTo(nd.sx, nd.sy - L); c.lineTo(nd.sx, nd.sy + L); c.stroke(); }
        if (b.candidate) { c.fillStyle = '#FF9F5A'; c.beginPath(); c.arc(nd.sx + r, nd.sy - r, 2, 0, 6.2832); c.fill(); }
        if (S.sel === b.id) { c.globalAlpha = 1; c.strokeStyle = '#E8EAF6'; c.lineWidth = 1.5; c.beginPath(); c.arc(nd.sx, nd.sy, r + 7, 0, 6.2832); c.stroke(); }
        if ((sel === nd.g && nd.d > 0.35) || S.sel === b.id) label(b.title.length > 16 ? b.title.slice(0, 15) + '…' : b.title, nd.sx + r + 6, nd.sy, (S.sel === b.id ? '500 ' : '400 ') + '11px ' + FONT, '#E8EAF6', dim, placed, S.sel === b.id);
      });
      c.globalAlpha = 1;
      // 분야 허브 + 이름
      S.G.forEach((g, k) => {
        const h = toScreen(g.x, g.y), dim = sel < 0 || sel === k ? 1 : 0.3;
        c.globalAlpha = dim; c.fillStyle = 'rgb(' + g.rgb + ')'; c.strokeStyle = opts.bg || '#03040B'; c.lineWidth = 2;
        c.beginPath(); c.arc(h[0], h[1], 7 * Math.min(Math.max(zf, 0.8), 1.5), 0, 6.2832); c.fill(); c.stroke();
        if (sel < 0) label(g.cat, h[0] + 12, h[1], '500 12px ' + FONT, '#E8EAF6', 1, placed, true);
      });
      c.globalAlpha = 1;
    }
    // 글자는 겹치면 건너뛴다 (must = 겹쳐도 그림: 분야 이름·선택한 책)
    function label(txt, x, y, font, color, alpha, placed, must) {
      const c = ctx; c.font = font; const w = c.measureText(txt).width;
      if (x + w > S.w - 4) x = Math.max(4, S.w - 4 - w);   // 오른쪽 끝에서 잘리지 않게
      const r = [x - 2, y - 8, w + 4, 16];
      if (!must && placed.some(q => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) return;
      placed.push(r); c.globalAlpha = alpha; c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, x, y); c.globalAlpha = 1;
    }

    // ---------- 반복 (보일 때만. 움직임 줄이기 설정이면 필요할 때 한 장만) ----------
    function visible() { return !(typeof document !== 'undefined' && document.hidden) && canvas.isConnected && canvas.offsetParent !== null && canvas.clientWidth > 0; }
    function frame(now) {
      S.raf = 0;
      if (!S.running) return;
      if (!visible()) { S.running = false; return; }   // 숨겨지면 스스로 멈춤. 다시 보일 때 start() 로 깨운다
      if (!S.t0) S.t0 = now;
      resize(); const t1 = performance.now(); draw(now); probe(now, performance.now() - t1); S.frames++;
      if (RM) { S.running = false; return; }
      S.raf = requestAnimationFrame(frame);
    }
    // 처음 보일 때 60프레임: 프레임 간격(실제 걸린 시간)을 재서 평균 22ms 넘으면 한 번 절반
    let pr = null;
    function probe(now, drawMs) {
      if (QUALITY !== null || RM) return;
      if (!pr) { pr = { last: now, sum: 0, k: 0 }; return; }
      const dt = now - pr.last; pr.last = now; pr.sum += Math.max(dt, drawMs); pr.k++;
      if (pr.k < PROBE) return;
      const avg = pr.sum / pr.k; QUALITY = avg > SLOW_MS ? 0.5 : 1; S.probeAvg = Math.round(avg * 10) / 10;
      if (QUALITY === 0.5) S.G.forEach(halve);
    }
    function start() { if (S.running || !visible()) return; S.running = true; S.raf = requestAnimationFrame(frame); }
    function stop() { if (pr) pr = null; S.running = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }
    function kick() { if (!S.running) start(); }
    const onVis = () => { if (document.hidden) stop(); else start(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

    // 성운 3개는 크기가 바뀔 때만 한 번 그려 두고 매 프레임 옮겨 붙인다 (시차 이동). 낮은 해상도로 충분 (흐린 빛)
    let NB = null, NBk = '';
    function nebula(W, H) {
      if (typeof document === 'undefined') return null;
      const k = W + 'x' + H; if (NB && NBk === k) return NB;
      const m = 0.25, w = Math.round(W * (1 + 2 * m) / 2), h = Math.round(H * (1 + 2 * m) / 2), o = document.createElement('canvas'); o.width = w; o.height = h;
      const g = o.getContext('2d'); g.globalCompositeOperation = 'lighter';
      NEB.forEach(n => { const px = (n[0] + m) / (1 + 2 * m) * w, py = (n[1] + m) / (1 + 2 * m) * h, rr = n[2] * Math.max(w, h) / (1 + 2 * m) * 0.5, gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(' + n[3] + ',' + n[4] + ')'); gr.addColorStop(1, 'rgba(' + n[3] + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      NB = o; NBk = k; return NB;
    }

    // ---------- 고르기 ----------
    function focusGenre(k) {
      const g = S.G[k]; S.gsel = k; S.sel = null;
      const z = S.z0 * 2.3;   // 참조와 같은 확대 배율
      S.tg = { x: g.x, y: g.y + S.h * 0.12 / z, z };   // 아래 시트에 가리지 않게 조금 위로
      kick();
      if (opts.onSelect) opts.onSelect(null);
      if (opts.onGenre) opts.onGenre(genreInfo(k));
    }
    function genreInfo(k) {
      const g = S.G[k]; if (!g) return null;
      return { cat: g.cat, color: g.color, pages: g.pages, particles: g.n, books: g.books.length,
        done: g.books.filter(b => b.status === 'done').length, reading: g.books.filter(b => b.status === 'reading').length, field: g.f };
    }
    function reset() { S.gsel = -1; S.sel = null; S.tg = { x: 0, y: 0, z: S.z0 }; kick(); if (opts.onGenre) opts.onGenre(null); if (opts.onSelect) opts.onSelect(null); }
    function select(id, center) {
      const nd = id ? S.byId[id] : null;
      if (!nd) { S.sel = null; kick(); if (opts.onSelect) opts.onSelect(null); return; }
      S.sel = id; S.gsel = nd.g;
      if (center) { const g = S.G[nd.g], z = Math.max(S.cam.z, S.z0 * 2.3); S.tg = { x: g.x, y: g.y + S.h * 0.18 / z, z }; }
      kick();
      if (opts.onSelect) opts.onSelect(nd.b);
    }

    // ---------- 입력 ----------
    function tap(sx, sy) {
      const zf = S.cam.z / (S.z0 || 1);
      if (S.gsel >= 0 || zf > 1.6) {   // 성단을 열었거나 충분히 확대했으면 책을 먼저 찾는다
        let best = null, bd = 18 * 18;
        S.nodes.forEach(nd => { if (S.gsel >= 0 && nd.g !== S.gsel) return; const dd = (nd.sx - sx) ** 2 + (nd.sy - sy) ** 2; if (dd < bd) { bd = dd; best = nd; } });
        if (best) { select(best.b.id, false); return; }
      }
      const [wx, wy] = toWorld(sx, sy); let hit = -1, hd = Infinity;
      S.G.forEach((g, k) => { const d = Math.hypot(wx - g.x, wy - g.y); if (d < g.R * 1.15 && d < hd) { hd = d; hit = k; } });
      if (hit >= 0 && hit !== S.gsel) focusGenre(hit); else reset();
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      S.ptr.set(e.pointerId, pos(e));
      if (S.ptr.size === 1) { const [x, y] = pos(e); S.drag = { x, y, cx: S.cam.x, cy: S.cam.y, moved: false }; }
      if (S.ptr.size === 2) { const [a, b] = [...S.ptr.values()]; S.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: S.cam.z }; if (S.drag) S.drag.moved = true; }
      kick();
    });
    canvas.addEventListener('pointermove', e => {
      if (!S.ptr.has(e.pointerId)) return;
      S.ptr.set(e.pointerId, pos(e));
      if (S.ptr.size === 2 && S.pinch) {
        const [a, b] = [...S.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (S.pinch.d > 0) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (S.pinch.z * d / S.pinch.d) / S.cam.z);
      } else if (S.ptr.size === 1 && S.drag) {
        const [x, y] = pos(e), dx = x - S.drag.x, dy = y - S.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) S.drag.moved = true;
        if (S.drag.moved) { S.cam.x = S.drag.cx - dx / S.cam.z; S.cam.y = S.drag.cy - dy / S.cam.z; S.tg = Object.assign({}, S.cam); kick(); }
      }
    });
    const up = e => {
      if (!S.ptr.has(e.pointerId)) return;
      const isTap = S.ptr.size === 1 && S.drag && !S.drag.moved && e.type === 'pointerup';
      S.ptr.delete(e.pointerId);
      if (S.ptr.size < 2) S.pinch = null;
      if (S.ptr.size === 1) { const [x, y] = [...S.ptr.values()][0]; S.drag = { x, y, cx: S.cam.x, cy: S.cam.y, moved: true }; }
      if (isTap) { const [x, y] = pos(e); tap(x, y); }
      if (!S.ptr.size) S.drag = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

    return {
      setData(d) { S.data = d; layout(); if (S.sel && !S.byId[S.sel]) S.sel = null; if (S.gsel >= S.G.length) S.gsel = -1; S.fitted = false; resize(); fit(); kick(); },
      start, stop, select, fit() { fit(); kick(); }, reset,
      genre(cat) { const k = S.G.findIndex(g => g.cat === cat); if (k >= 0) focusGenre(k); },
      get stats() { return { quality: QUALITY, probeAvgMs: S.probeAvg || null, frames: S.frames, running: S.running, stars: stars.length, books: S.nodes.length, genres: S.G.length, particles: S.G.reduce((a, g) => a + g.n, 0), zoom: S.cam.z / (S.z0 || 1), genre: S.gsel, reducedMotion: RM }; },
      where(cat) { const g = S.G.find(x => x.cat === cat); return g ? toScreen(g.x, g.y) : null; },   // 화면 좌표 (점검·접근성용)
      whereBook(id) { const nd = S.byId[id]; return nd ? [nd.sx, nd.sy] : null; },
      get layout() { return S.G.map(g => ({ cat: g.cat, x: g.x, y: g.y, R: g.R, n: g.n, ppp: g.ppp })); },
      destroy() { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); },
    };
  }

  const api = { create, CATS, CAT_COLOR, PAGES_PER, CAP };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.BookMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
