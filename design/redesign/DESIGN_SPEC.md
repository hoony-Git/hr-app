# hr-app Redesign Spec — "Night Dial"

Approved by the user on 2026-11-21. Visual references (open in a browser, they are the source of truth for look and feel):
- `ref_1_dial_today_time_hr.html` — 오늘 / 시간(지금) / 심박(운동)
- `ref_2_books_today_timeweek.html` — 독서(오늘) / 시간(주간)
- `ref_3_book_map_clusters.html` — 독서(지도), interactive

The user rejected two earlier directions as "plain, dated, too close to the current app, too dense". This direction is a full visual and navigation change. Do not drift back toward the current look (neutral gray #111214 + #22c55e, card-on-card, dense tables).

## 1. Concept
- One motif across the app: **the day as a 24-hour dial.** The same dial is the 오늘 hero (time-log ring + traffic-light core), the 시간 live view, the 심박 zone gauge (270° arc), and the 독서 page-goal ring.
- **Night sky** palette. The book map is a literal universe (star clusters).
- **Calm density:** each screen = one hero + at most 3 actionable rows. Completed/secondary content collapses ("끝낸 2개 보기").

## 2. Tokens (replace phase-1 color values; keep token names where they exist, add new ones)
| Role | Value |
|---|---|
| --bg (app) | #161B33 |
| --bg-deep (book map only) | #03040B |
| --surface | #1F2645 |
| --surface2 / track | #262D52 |
| --border | #262D52 (hairline rows), #3A4270 (outline buttons) |
| --text | #E8EAF6 |
| --muted | #9AA0C3 |
| --faint (nav idle, dial hour labels) | #6F769C |
| --empty-past / --empty-future (dial cells) | #2A3158 / #1F2645 |
| --tl-green / --tl-yellow / --tl-red | #5EE3A1 / #FFC857 / #FF6B6B |
| --on-yellow (text on yellow) | #3A2A00, secondary #5C4500 |
| --on-red | #3D0A0A |
| Zones Z0..Z5 | #6F769C #7C9CFF #5EE3A1 #FFC857 #FF9F5A #FF6B6B |
| Accent for level/books | #C08BFF (on it: #2A0F45) |
| Time category defaults | 업무 #7C9CFF, 공부 #C08BFF, 이동 #4FD1C5, 운동 #5EE3A1, 휴식 #FFC857 |

- Existing stored category/habit colors keep their stored values; only DEFAULTS change. Do not rewrite user data.
- Light theme: keep the setting working. Derive a light palette (bg #EEF0F8, surface #FFFFFF, text #1A1F3D, muted #5A6080, same hue family for signals with ≥4.5:1 text variants). The book map always stays dark.
- Font: **IBM Plex Sans KR** 400/500 only, **self-hosted in the repo** (`fonts/ibm-plex-sans-kr.css` + woff2 subsets from `@fontsource/ibm-plex-sans-kr@5.3.0`, SIL OFL 1.1; no Google Fonts requests — user decision 2026-11-21), `display=swap`, fallback to system sans. Numbers `tabular-nums`.
- Shapes: pill buttons (999px) for actions; 26–30px only for sheets/phone-level surfaces; rows are hairline-separated, not cards. No drop shadows. No emoji icons in chrome — use one icon set (Tabler outline webfont, pinned version, or inline SVG).

## 3. Navigation
- Bottom bar: **4 icon tabs** — 오늘(sun), 시간(clock), 독서(book), 심박(heart). Active = #E8EAF6, idle = #6F769C. Keep text labels for screen readers (aria-label) even if visually icon-only.
- 내정보 = level badge circle at the top-right of 오늘 (and accessible from other tabs' headers). Opens the existing 내정보 content (level/XP/shop/settings) as a full screen.
- 통계 tab is removed as a tab. Its contents move (do NOT drop any feature):
  - habit weekly/traffic-light stats, habit calendar, streak, trend chart, summaries, monthly report → a "기록" sub-view inside 오늘 (오늘 / 주간 / 월간 / 기록 style underline segment like the refs).
  - Produce a mapping table (old location → new location) for every component in UI_HANDOFF.md §3 before moving anything.
- Sub-navigation inside a tab = underline text segments (see refs), not pill toggles.
- The floating + button: remove; adding lives in each screen ("+ 습관" row at the end of the list, "책 추가" in 서재/지도 sheet).

## 4. Screens
**오늘** (ref_1): date line + level badge; dial (outer = 96 × 15-min cells colored by that day's time log, auto entries dashed, empty past vs future shades, hour labels 0/6/12/18; inner disc = day traffic-light color with "done/total" and "N개 더면 초록"-style hint computed by existing dayLight logic); 7-day dots (traffic-light colors, rest day = dashed ring, selected day outlined; tap = select date, long-press alternative = ⋯ in header); "남은 것" list with type-specific inline action (check → "체크", numeric → "+N단위", time → "▶ 시작"); "끝낸 N개 보기" expander; missing-day notice as one quiet row when present; backup banner as one quiet row.
**시간** (ref_1, ref_2): 지금 = dial filling to now with a white "now" dot, center = running category + elapsed; category circles (tap = switch, current = filled); today totals rows. 주간 = 7 mini dials + category totals with week-over-week delta + one insight line. Tapping a mini dial opens that day's editable 15-min grid (keep tlCellTap/editor behavior). 월간 = keep existing report content, restyled.
**심박** (ref_1): connection line + elapsed; 270° zone gauge with current-HR dot, current zone thick/bright; big BPM; weekly Zone 2 progress bar + "오늘 N분 채웠어요"; pill buttons 일시정지 (outline) / 끝내기 (red). 측정(HRV) sub-view restyled in same language; the remaining time of the measurement (the app's real value: **120 s = 2 min**, `MEASURE_DURATION`) is shown on the Dial ring. Live chart stays but restyled to the palette.
**독서** 오늘 (ref_2): goal ring (cells = daily page goal), inner ring = current book progress, title + "이 속도면 M월 D일에 다 읽어요" (projected from recent pace), quick +5/+10/+20 and 쪽 입력; "함께 읽는 중" rows. 서재 restyled as hairline rows.
**독서 지도** (ref_3): replace the rendering in `book-map.js` with the star-cluster renderer while keeping the public API (`BookMap.create()` etc.) and existing interactions: pinch/drag pan-zoom, search (#bmQ / bookMapSearch), tap → sheet (bookMapSheet). Rules:
- particles per genre = pages read in that genre (from book_logs) / 10, **capped at 600 per cluster** (scale pages-per-particle up when exceeded); deterministic seeded layout so the map doesn't reshuffle between opens.
- books = large nodes inside the cluster (status: done / reading / to-read styling per ref); core "내 서재" ✦ in the middle with curves to genre hubs; book_links drawn as lines.
- starfield + diagonal Milky Way band + 3 nebula glows, parallax.
- animation only while the map is visible (existing visibility pause), respects prefers-reduced-motion, DPR capped at 2.
**내정보**: same visual language: hairline settings rows, pill controls, level header with #C08BFF ring.
**Bottom sheets/modals**: surface #1F2645, radius 26px top, hairline rows, one primary pill per sheet.

## 5. Hard constraints (from UI_HANDOFF.md §8)
- Do not change localStorage keys or value shapes; export/import/sync must round-trip identically.
- Keep static element ids, data-* attributes, `tab-<name>` convention, script order, TL-CORE markers, sync request format. If an element must move, move it — don't rename it. If a tab container is no longer a bottom tab (stats, me), keep its id and render it inside the new location.
- All 64 existing tests must pass.
- Every function reachable before must be reachable after (feature-parity checklist from UI_HANDOFF.md §3).
- Accessibility floor from phase 1 stays (focus-visible, zoom allowed, aria-selected on tabs, contrast ≥4.5:1 for text).

## 6. Milestones (stop and report after each one marked STOP)
- **M1** tokens + font + navigation (4 tabs, level badge → 내정보, stats relocation mapping table) + shared `Dial` component (SVG) + 오늘 screen. **STOP.**
- **M2** 시간 (지금/주간/월간 + day grid editor) and 심박 (운동/측정). **STOP.**
- **M3** 독서 (오늘/서재) + book map rewrite. **STOP.**
- **M4** 내정보, all sheets/modals, light theme, empty/error states, cleanup of now-dead CSS. Final full verification.

## 7. Verification per milestone
- Tests before/after (counts must match).
- Screenshots 390×844 with seeded FAKE data, dark (+ light at M4), saved under `design/redesign/shots/M<n>/`, plus a side-by-side page `design/redesign/shots/M<n>/compare.html` showing ref vs implementation per screen.
- 0 console errors.
- Export JSON with seeded data before and after the milestone: byte-identical.
- M3: book map frame time with Chrome CPU throttle 4× at 1,800 particles — report average fps.
- Never read real user data. Commit per milestone on branch `ui-phase2-night-dial` (from `ui-phase1-tokens`). No push, no merge.
