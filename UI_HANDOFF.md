# UI_HANDOFF — hr-app (Night Dial 리디자인 반영, 2026-11-21, 브랜치 `ui-phase2-night-dial`)

원본은 `index.html` 하나다(HTML·CSS·JS). 보조 파일은 `metrics.js`(숫자 계산), `book-map.js`(독서 지도), `fonts/`(글꼴)이다.
디자인 기준: `design/redesign/DESIGN_SPEC.md`, 옛 위치 → 새 위치: `design/redesign/NAV_MAPPING.md`.

## 0. 기본 사실
| 항목 | 값 |
|---|---|
| 파일 | `index.html` 약 416 KB · 5,736줄 / `metrics.js` 19 KB / `book-map.js` 27 KB / `fonts/` 2.8 MB (woff2 188조각) |
| 실행 | 정적 파일, 빌드 없음. GitHub Pages(`https://<user>.github.io/hr-app/`), 로컬은 아무 정적 서버. `artifact/insights.html` 은 `node tools/build_insights.js` 로 만든다 |
| 백엔드 | 기록은 브라우저 localStorage. 동기화(선택)는 Google Apps Script(`gas/Code.gs`), ISBN 프록시(선택, 꺼짐)는 `lambda/` |
| 바깥 요청 | Tabler 아이콘 글꼴 `cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0` 하나. 본문 글꼴은 저장소 안 `fonts/ibm-plex-sans-kr.css` (Google Fonts 요청 없음) |
| 그 밖 | 바닐라 JS, 직접 쓴 CSS, 그래프·지도는 `<canvas>`, 다이얼은 SVG. Web Bluetooth(심박계)·카메라(바코드)·Wake Lock 사용 → https 또는 localhost 에서만 동작 |

## 1. 화면 지도
아래 탭 4개(아이콘): **오늘(해) · 시간(시계) · 독서(책) · 심박(하트)**. 내정보는 레벨 원으로 들어간다.
1. **오늘** `#tab-today`: 날짜 줄 + ⋯ + 레벨 원 / 하위 탭 오늘·주간·월간·기록 (밑줄) / 다이얼(그날 15분 칸 96개 + 신호등 원) / 7일 점 / 남은 것(종류별 동작 버튼) / + 습관 / 끝낸 N개 / 기록 안 한 날 / 백업 알림
   - **기록** = 옛 통계 탭(`#tab-stats`, 오늘 안에 있음): 주간·초록불, 습관 상세·연속·달력, 추세, 요약, 월간 보고, 운동 누적
2. **시간** `#tab-time`: 지금(다이얼이 지금까지 차고 흰 점, 가운데 = 하는 일 + 경과, 분류 원 상위 5 + 전체, 정지·메모, 오늘 합계, 오늘 기록) / 주간(하루 띠 7줄(96칸, 0·6·12·18·24 축, 오른쪽 그날 합계) → 그날 하루 보기(큰 날짜 + 15분 격자 편집), 분류별 합계 + 지난주 대비, 가장 빈 날) / 월간(보고, CSV, 인쇄)
3. **독서** `#tab-books`: 오늘(목표 고리 + 책 진행 고리, 예상 완독일, +5/+10/+20·쪽 입력, 함께 읽는 중) / 주간 / 월간 / 서재(책 추가, 검색·필터) / 지도(성단, 책 찾기·책 추가, 분야·책 시트)
4. **심박** `#tab-hr`: 운동(연결 줄 + 경과, 270° 존 게이지, BPM, 이번 주 Zone 2 + 오늘 채운 분, 시작·일시정지·끝내기, 아래에 그래프·통계·달력·기록) / 측정(2분 남은 시간 다이얼, 안정시·HRV, 추세, 기록)
5. **내정보** `#tab-me`: 보라 고리 레벨 머리, 칭호, 오늘 XP·코인·이용권, 결산, 상점 / 설정 10구역(화면·습관·독서·목표 기준·레벨·보상·상점·심박·신체·동기화·데이터·정보)
- 시트·창(아래에서 올라옴, 위 모서리 26px): 습관 추가·수정 `#habitModal`, 시간 기록 편집 `#tlEditModal`, 분류 관리 `#tlCatModal`, 공용 선택 시트 `#sheetModal`, 결산 `#wrapModal`, 책 상세 `#bkdModal`, 책 추가·수정 `#bookModal`, 읽은 쪽 `#blModal`, 완독 `#finModal`, 빠른 기록 `#qlModal`, 지난 날 `#pastModal`, 동기화 충돌 `#syncConflictBox`(JS 가 만듦)
- 오버레이: 바코드 스캔 `#scanOverlay`, 알림 `#toast`

## 2. 레이아웃 골격 (정적 HTML)
```
body (max-width 560px)
  header > h1#headerTitle, div.hdr-r > button#lvBadge.lv-badge          (오늘 탭에서는 숨김)
  div#tab-today
    div.today-head > button#monthBtn, input#jumpDate, div.th-right > button#moreBtn, button#lvChip.lv-chip
    div#todaySeg.folder-tabs[role=tablist] > button[data-v=routine|week|month|stats]
    div#todayDial.td-dial ; div#weekStrip.week-strip
    div.today-body > div#todayFilterRow(남은 것 + #filterBtn), div#routineTable, div#weekCards, div#monthCards, div#todayLegend, div#habitMissing, div#backupBanner
    div#tab-stats (기록) > #statSeg, .stat-nav(#statPrev #statTitle #statNext), #statBody, #habitDetail, 달력 카드(#hStreakNum #habitCalPills #hCalPrev #hCalGrid #hCalNext #hCalMonthStat), #habitTrendCard(canvas#habitTrendChart), #sumSeg + #habitSummary, #statsExtra
  div#tab-time > div#timeSeg[data-p=rec|week|month], div#timeBody
  div#tab-books > div#bookSeg[data-b=today|week|month|shelf|map], div#bookBody
  div#tab-hr > div#hrSeg[data-h=workout|measure]
    div#tab-workout > .hr-line(#hrConnIcon #hrConnText #hrElapsed), .hr-gauge(#hrDial, .hr-center(#bpm #zoneLabel)), #pct, .hr-z2(#weeklyVal #weeklyGoal #weeklyProgress #hrTodayZ2),
                      #connectRow(#connectBtn #connectLabel), #workoutControls(#startBtn #pauseBtn #stopBtn), 그래프(canvas#chart #chartEmpty), 통계(#sTime #sAvg #sMax #sZ2 #sKcal), #ztime,
                      달력(#calPrev #calTitle #calNext #calGrid #calMonthStat), #weekBars #zoneRows, #history
    div#tab-measure > #hrvDial, #rrStatus, #mBpm #mHrv, #measureBtn, canvas#hrvChart #hrvChartEmpty, #measureHistory
  div#tab-me > div#lvBody, div#settingsList, input#importFile
  nav.tabbar[role=tablist] > button[data-tab=today|time|books|hr] (아이콘 + 화면 낭독용 글자)
  시트 11개, div#scanOverlay, div#toast
```

## 3. 기능 목록 (누르는 곳 → 함수)
| 화면 | 컴포넌트 | 동작 |
|---|---|---|
| 공통 | 아래 탭 4개 | `switchTab(name)` (`'stats'` → 오늘 › 기록, `'me'` → 내정보) |
| 공통 | 레벨 원 `#lvChip` `#lvBadge` | `openLevelScreen()` |
| 공통 | 하위 탭(밑줄) | `renderToday` / `tlSetPane` / `renderBooks` / `showHrPane` / `renderStatBody` |
| 공통 | `#toast` | `toast(msg, ms)` |
| 오늘 | `#monthBtn` + `#jumpDate` | 날짜 고르기 → `selectDate` |
| 오늘 | `#moreBtn` ⋯ | 설정, 보관된 습관(`showArchived`), 이 날 쉬는 날·아픈 날(`restSheet`), 시간대 필터 |
| 오늘 | 7일 점 | 탭 `selectDate`, 길게 `restSheet`, 밀기·‹ › `shiftWeek` |
| 오늘 | 남은 것 줄 | 동작 버튼 `todayAct` (체크·횟수 = `quickLog`, 시간 = `startHabitTimer`/`stopHabitTimer`, 수치 = `openQuick`), 이름 = `openHabitActions`, 길게 누르기 = `openHabitActions` |
| 오늘 | 습관 메뉴 | 빠른 기록 창, 지난 기록 `openPastModal`, 원터치 값 `setPreset`, 월간 기록 `openHabitMonth`, 수정 `openHabitModal`, 복사 `copyHabit`, 보관 `archiveHabit`, 끝내기 `endHabit`, 삭제 `deleteHabit` |
| 오늘 | + 습관 / `#filterBtn` | `openHabitModal()` / 시간대 필터 시트 |
| 오늘 | 끝낸 N개 / 기록 안 한 날 / 백업 줄 | 펼치기, `openPastModal`·`skipMissing`, `exportAllData`·`dismissBackup` |
| 오늘 › 기록 | 이동·알약·달력·추세·요약 | `statShift`, `selectHabitCal`, `hCalShift`, `openHabitDetail`, `renderHabitTrend`, `woShift`/`woTrendClick`, 칸 → `openPastModal` |
| 시간 › 지금 | 분류 원 / 정지 / 시작 시각 / 메모 / 기록 줄 / 분류 관리 | `tlSwitch` / `tlStop` / `tlEditCurStart` / `#tlNote` / `tlOpenEditor` / `#tlCatModal` |
| 시간 › 주간 | 하루 띠 / 격자 칸 / 채우기 / 분류 합계 / ‹ › | `wday` / `tlCellTap` → `tlShowCellInfo`·`tlOpenEditor` / `fill`·`fillfrom` / `hlcat` 강조 / `wprev`·`wnext` |
| 시간 › 월간 | ‹ › / CSV / 인쇄 | `mprev`·`mnext` / `tlDownloadCsv` / `window.print` |
| 시간 | 편집 창·분류 창 | `tlEditorSave` `tlEditorDelete` / `tlCatAdd` `tlCatMove` `tlCatEdit` `tlCatDelete` |
| 독서 › 오늘 | +5/+10/+20 · 쪽 입력 · 제목 · 함께 읽는 중 · 책 추가 | `bookQuickAdd`(→`saveBookLog`) · `saveBookToday` · `bookActions` · `bookTodayPick` · `openAddBook` |
| 독서 | 주간·월간 칸 / ‹ › | `openBookLog` / `bookShift` |
| 독서 › 서재 | 책 추가 · 검색 · 기간·평점·정렬 · 분야 · 목표 · 책 | `openAddBook` · `shelfQ` · `setShelf` · `setBookFilter` · `editTarget` · `openBookDetail` |
| 독서 | 책 추가 시트 · 책 창 | ISBN 스캔 `startScan`/`stopScan`, ISBN 입력 `lookupIsbn`, 직접 입력 `openBookModal`, `#bkIsbnGo` `fillFromIsbn`, `#bkSave` |
| 독서 › 지도 | 캔버스 / 검색 / 위 버튼 / 시트 | 핀치·끌기·휠, 탭 = 성단 확대(`bookMapGenreSheet`)·책(`bookMapSheet`)·빈 곳(전체) / `#bmQ`→`bookMapSearch`→`select` / 책 찾기·책 추가 / 목표 바꾸기·자세히·쪽수 기록, `#bmInsights` |
| 심박 › 운동 | 연결·시작·일시정지·끝내기 / 달력 / 기록 / 설정 링크 | `connect`/`reconnect` · `startWorkout` · `pauseWorkout` · `stopWorkout` / `calShift` / `deleteSession` `exportCSV` `histMore` / `goSettings('hr')` |
| 심박 › 측정 | 측정 버튼 / 기록 | `toggleMeasure` (2분, 다이얼) / `deleteMeasure` |
| 내정보 | 레벨 머리 · 결산 · 상점 | `renderLevelScreen` · `openWrap`·`wrapShift` · `buyItem` `addShopItem` `delShopItem` |
| 내정보 › 설정 | 화면 / 습관 / 독서 / 목표 기준 | `setTheme` `setWeekStart` `setLight` / `archiveHabit` `delArchived` `addCat` `renameCat` `setCatColor` `delCat` 순서 끌기 `saveHabitOrder` / `setTarget` `setDailyPages` / `setInsightGoal` `setInsightsUrl` |
| 내정보 › 설정 | 레벨·보상 / 상점 기록 / 심박 / 동기화 / 데이터 | `setTitle` `addTitle` `delTitle` `editShopItem` `setXpCap` / `toggleUsed` `delPurchase` `setShopLogFilter` / `pickToggle` `saveHrSettings` / `syncSaveCfg` `syncTest` `syncManual` (충돌 → `syncShowConflict`) / `exportAllData` `#importFile`→`importAllData` |

## 4. 스타일 사실
- **색 (다크 기본)**: `--bg #161B33` `--bg-deep #03040B`(지도) `--surface #1F2645` `--surface2 #262D52` `--border #262D52` `--border-strong #3A4270` `--text #E8EAF6` `--muted #9AA0C3` `--faint #6F769C`(쉬는 탭 아이콘·다이얼 시각 숫자만)
- 신호등 `--tl-green #5EE3A1` `--tl-yellow #FFC857` `--tl-red #FF6B6B` (+ `--on-green/--on-yellow/--on-yellow-2/--on-red`), 존 `--z0..--z5`, 보라 `--violet #C08BFF`(레벨·독서), 다이얼 빈칸 `--empty-past/--empty-future`
- 글자용 변수(라이트에서 진하게): `--accent-text` `--tl-yellow-text` `--violet-text` `--tl-red-text` `--z4-text`
- **라이트**: `--bg #EEF0F8` `--surface #FFF` `--surface2 #E2E5F2` `--text #1A1F3D` `--muted #5A6080`. 독서 지도는 늘 어두움
- 크기 토큰: `--fs-2xs…--fs-xl`(10~18px), `--sp-1…--sp-8`(4~24px), 모서리 `--radius-sm 7 · md 9 · cell 10 · btn 14 · card 16 · sheet 26 · pill 999`
- 글꼴 IBM Plex Sans KR 400/500(굵기는 이 둘만), 숫자 `tabular-nums`. 아이콘 Tabler(`<i class="ti ti-…">`). 화면 글자에 이모지 없음 (사용자가 고른 습관·분류 아이콘, 기본 칭호·상점 품목 아이콘은 데이터라 그대로)
- 모양: 동작 = 알약 버튼, 줄 = 머리선(카드 아님), 그림자 없음, 시트 위 모서리 26px + 손잡이 막대, 시트마다 주 버튼 하나(흰 알약)
- 공용 **Dial**(SVG): `Dial.svg({cells, now, labels, nowFrac, center, zone, n, inner, stroke, r, label})` — 오늘·시간·심박(270° 존)·측정·독서 목표·레벨 고리가 같은 부품

## 5. 동작
- 네트워크: 동기화 `POST <Apps Script /exec>` `Content-Type: text/plain;charset=utf-8` 본문 `{token, action: get|put|isbn, …}` (45초 제한), ISBN 조회 Google Books(동기화 없을 때), 아이콘 글꼴
- 타이머: 운동 1초, 측정 1초(다이얼 갱신), 습관 시간 타이머, 시간 탭 진행 중 1초(+1분마다 다이얼), 바코드 인식, 동기화 예약
- 지도(`book-map.js`): 보일 때만 그림, 움직임 줄이기면 한 장만, DPR 최대 2. 알갱이 = 읽은 쪽/10, 합 1,200 상한(분야 비례, 최소 40), 처음 60프레임 평균 22ms 넘으면 한 번 절반(메모리에만 기억)
- 빈 상태·오류: 짧은 문구 + 다음에 할 일 (예: "아직 운동 기록이 없어요. 심박계를 연결하고 시작을 눌러요")

## 6. 백엔드 계약 (Google Apps Script)
- `POST https://script.google.com/macros/s/<DEPLOY_ID>/exec`. 주소·비밀키는 기기 로컬 키 `sync_url` `sync_token`(동기화 대상 아님)
- `get {sinceRev?, metaOnly?}` → `{ok, rev, updatedAt, device, bytes, data?}` / `put {baseRev, device, changes}` 또는 `{baseRev, device, data}` → `{ok, rev, updatedAt, bytes}` / `isbn {isbn}` → `{ok, book}`
- 오류: `unauthorized` `bad_request` `bad_action` `busy` `conflict`(서버 rev·data 함께) `bad_isbn` `not_configured` `upstream_error` `server_error` + 앱 쪽 `network` `bad_response`
- `data` 값은 localStorage 문자열(JSON) 그대로

## 7. 알려진 남은 점
- 인라인 스타일이 JS 템플릿에 여전히 많다(옛 화면 일부: 기록 탭 카드, 월간 보고 표)
- 옛 규칙 위에 Night Dial 규칙을 덧씌운 구조라 CSS 가 길다 (안 쓰는 규칙은 M4에서 지움)
- 글자 대비 4.5 미만 예외: 사용자가 고른 중간 밝기 습관 색 위 날짜 숫자(최대 4.2~4.3), 흐리게 한 앞으로 올 날·예정 없는 날, 수정 중 바꿀 수 없는 습관 유형
- LAN 의 http 주소에서는 Web Bluetooth·카메라가 막힌다 (https·localhost 만)

## 8. 바꾸면 안 되는 것
- **저장 키와 값 모양**: `schema_version` `hr_settings` `hr_sessions` `hr_measures` `habit_defs` `habit_logs` `habit_notes` `habit_skips` `xp_meta` `shop_items` `shop_purchases` `shop_tokens` `rest_days` `sick_days` `book_list` `book_logs` `book_targets` `book_links` `time_categories` `time_current` `time_log_YYYY_MM` `insight_goals` (+ 동기화 안 하는 `backup_pre_v2` `hr_active_session` `sync_url` `sync_token`)
- 정적 id(2절의 `#…`), `tab-<name>` 규칙(`today time books hr stats me`), `data-*` 값(`data-tab` `data-v` `data-p` `data-b` `data-h` `data-s` `data-t` `data-d` `data-i` `data-act` 등)
- 스크립트 순서 `metrics.js` → `book-map.js` → 본문 스크립트 (`HRMetrics` `BookMap` 전역)
- `/* TL-CORE-BEGIN */ … /* TL-CORE-END */` 표시 주석 (테스트가 잘라 씀)
- 동기화 요청 형식(text/plain POST, `syncCall`), `BACKUP_KEYS` `KEY_SHAPE`, 내보내기·가져오기 함수
- 리디자인에서 의도적으로 지운 것: `#fabAdd`(M3), 숨긴 `data-tab="stats"`·`data-tab="me"` 버튼, `#connStatus` `#dot` `#statusText` `#ladder` `#countdown`(M4)
