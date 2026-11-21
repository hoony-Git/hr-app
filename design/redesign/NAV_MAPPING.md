# NAV_MAPPING — Night Dial M1 (옛 위치 → 새 위치)

기준: `UI_HANDOFF.md` §3 컴포넌트 목록 + 정적 골격(§2). DESIGN_SPEC §3·§5.
원칙: id·data-* 값·`tab-<name>` 이름은 바꾸지 않는다. 옮길 요소는 자리만 옮긴다. **어떤 기능도 닿을 수 없게 되면 안 된다.**
"M2/M3/M4" = 그 마일스톤에서 모양만 바뀐다(이번엔 위치 그대로, 새 토큰 색만 적용).

## 아래 탭
| 옛 위치 | 새 위치 | 비고 |
|---|---|---|
| 탭 `오늘` `[data-tab=today]` | 아래 탭 1 (해 아이콘 `ti-sun`) | 글자는 `aria-label` + 화면 낭독용 글자 |
| 탭 `시간` `[data-tab=time]` | 아래 탭 2 (`ti-clock`) | |
| 탭 `독서` `[data-tab=books]` | 아래 탭 3 (`ti-book`) | |
| 탭 `심박` `[data-tab=hr]` | 아래 탭 4 (`ti-heart`) | |
| 탭 `통계` `[data-tab=stats]` | **아래 탭에서 뺌.** M4에서 버튼 삭제 (`switchTab` 이 버튼 없이도 동작하게 고친 뒤) | 내용은 오늘 › 기록으로 |
| 탭 `내정보` `[data-tab=me]` | **아래 탭에서 뺌.** M4에서 버튼 삭제 | 오늘 날짜 줄 오른쪽의 레벨 원(`#lvChip`), 다른 탭 머리글의 레벨 원(`#lvBadge`, 새 요소) |

## 공통
| 옛 위치 | 새 위치 |
|---|---|
| `#fabAdd` + (오늘) → `openHabitModal()` | 오늘 "남은 것" 목록 끝 **"+ 습관" 줄**. 오늘 탭에서는 + 버튼 숨김 |
| `#fabAdd` + (독서) → `openAddBook()` | M3: 독서 › 오늘 · 서재 맨 위 · 지도 위 버튼 · 분야 시트의 "책 추가". `#fabAdd` 삭제 |
| 상태 점 `#dot` + `#statusText` (심박 머리글, `#connStatus`) | 심박 › 운동의 연결 줄 `#hrConnText` (M2). M4에서 `#connStatus`·`#dot`·`#statusText` 삭제, `setStatus()` 는 연결 줄에 씀 |
| `#toast` | 그대로 |
| 머리글 `header > #headerTitle` | 그대로 (오늘 탭에서는 숨김: 오늘은 자체 날짜 줄). 오른쪽에 레벨 원 `#lvBadge` 추가 |

## 오늘 탭
| 옛 위치 | 새 위치 |
|---|---|
| `#monthBtn` "2026년 11월 ▾" + `#jumpDate` | 날짜 줄 "토요일, 11월 21일"이 `#monthBtn`. 누르면 지금처럼 `#jumpDate` 날짜 고르기 |
| `#lvChip` "Lv.N" → `openLevelScreen()` | 날짜 줄 오른쪽 **레벨 원**(같은 id, 숫자만, 보라 테두리) → 내정보 전체 화면 |
| `#moreBtn` ⋯ → 설정 / 보관된 습관 | 날짜 줄 오른쪽(레벨 원 왼쪽) ⋯. 메뉴에 **"이 날 쉬는 날·아픈 날"**(길게 누르기 대신)과 **"시간대 필터"** 추가 |
| `#backupBanner` 큰 상자 | 같은 id, **조용한 한 줄** "마지막 백업 N일 전 · 지금 백업 · ✕" |
| `#weekStrip` 날짜 원 7개 (탭 = `selectDate`, 길게 = `restSheet`, 좌우 밀기 = 주 이동, ‹ › = `shiftWeek`) | 같은 id, **7일 점**(신호등 색, 쉬는 날 = 점선 고리, 선택한 날 = 바깥 테두리). 탭·길게 누르기·밀기·‹ › 그대로 |
| (없음) | **다이얼** `#todayDial` (새 요소): 바깥 = 그날 15분 칸 96개(시간 기록 색, 자동은 점선), 안쪽 원 = 그날 신호등 + "끝낸/전체" + "N개 더면 초록" |
| `#todaySeg` 루틴 / 주간 / 월간 (폴더 탭) | 같은 id, **밑줄 글자 탭** 오늘(`data-v=routine`) / 주간 / 월간 / **기록**(`data-v=stats`, 새 버튼) |
| `#todayFilterRow > #filterBtn` "하루 ▾" | 같은 id, "남은 것" 제목 줄 오른쪽 작은 글자 버튼. ⋯ 메뉴에도 있음 |
| `#habitMissing` 기록 빠진 날 칩 상자 | 같은 id, **조용한 한 줄** "기록 안 한 날 N개 ›". 누르면 펼쳐져 기존 칩(입력 `openPastModal` / ✕ `skipMissing`)이 그대로 보임 |
| `#routineTable` 루틴 표 (번호·상황·이름·결과칸) | 같은 id, **"남은 것" 줄 목록** + **"끝낸 N개 보기"** 펼치기. 아래 표 참고 |
| `#weekCards`, `#monthCards`, `#todayLegend` | 그대로 (주간·월간 탭). 새 토큰 색만 |

### 루틴 표 → 남은 것 목록 (기능 하나씩)
| 옛 동작 | 새 동작 |
|---|---|
| 결과칸 탭 → `quickLog(id)` (체크 = 켜고 끄기, 횟수 = +원터치값, 시간·수치 = `openQuick`) | 줄 오른쪽 **동작 버튼**: 체크 → "체크" / 횟수 → "+N단위" / 시간 → "▶ 시작"(`startHabitTimer`, 오늘만. 다른 날은 "기록" → `openQuick`) / 진행 중 → "■ 끝내기"(`stopHabitTimer`) / 수치 → "입력"(`openQuick`). 체크·횟수는 지금처럼 `quickLog` |
| 줄 길게 누르기 → `openHabitActions(id)` (월간 기록·수정·복사·보관·끝내기·삭제·지난 기록·원터치값) | 그대로 + **습관 이름을 누르면** 같은 메뉴(키보드로도 열 수 있게) |
| 끝낸 습관의 도장(`sealHtml`)·체크 메모 첫 단어 | "끝낸 N개 보기" 안의 줄에 도장·메모 그대로. 그 줄의 버튼도 `quickLog`(체크 해제 등) |
| 🔥 중요 표시, 상황 글자(`situation`) | 이름 앞 작은 불꽃 아이콘(`ti-flame`), 이름 뒤 흐린 글자 |
| 진행 중 타이머 ⏱️ | 동작 버튼이 "■ 끝내기"로 바뀌고 줄에 경과 시간 |
| 쉬는 날·아픈 날 막대(해제 버튼) | 그대로 (목록 위 조용한 한 줄) |
| 모두 달성 시 축하(토스트 + 꽃가루), 진동 | 그대로 |
| 빈 상태 "오른쪽 아래 + 버튼으로 추가하세요" | "아래 + 습관으로 추가하세요" + "+ 습관" 줄 |

## 통계 탭 → 오늘 › 기록 (`#tab-stats`를 `#tab-today` 안으로 옮김, id 그대로)
| 옛 위치 | 새 위치 |
|---|---|
| `#statSeg` 주간 / 초록불, `#statPrev` `#statTitle` `#statNext`, `#statBody` | 오늘 › 기록 안 같은 자리 |
| `#habitDetail` 습관 상세, 연속 기록 `#hStreakNum`, 습관 알약 `#habitCalPills`(`selectHabitCal`), 습관 달력 `#hCalPrev/#hCalGrid/#hCalNext`(`hCalShift`, 칸 → `openPastModal`) | 오늘 › 기록 안 같은 순서 |
| 추세 차트 `#habitTrendCard`(`renderHabitTrend`) | 오늘 › 기록 |
| 요약 `#sumSeg` 이번 주 / 이번 달, `#habitSummary` | 오늘 › 기록 |
| `#statsExtra` (운동 누적 그래프 `woShift`/`woTrendClick`, 월간 보고 `renderStatReport`) | 오늘 › 기록 |
| `openHabitMonth(id)` (길게 누르기 메뉴 "월간 기록" → `switchTab('stats')`) | `switchTab('stats')`는 **오늘 › 기록으로 보낸다**(같은 함수 이름, 같은 결과) |
| `goSettings` 등 `switchTab('stats')`를 부르는 모든 곳 | 위와 같음 |

## 내정보 탭 → 레벨 원 → 전체 화면 (`#tab-me` id 그대로)
| 옛 위치 | 새 위치 |
|---|---|
| `#lvBody` 레벨·XP·칭호·상점·쉬는 날 이용권 | 내정보 화면 위쪽 (M4에서 보라 고리 머리글) |
| `#settingsList` 설정 섹션 10개(`secHtml`, `goSettings(sec)`) | 그대로. `goSettings`는 지금처럼 `switchTab('me')` 후 섹션 열기 |
| `#importFile` 가져오기 | 그대로 |
| 들어가는 길 | 오늘 레벨 원 `#lvChip`, 다른 탭 머리글 레벨 원 `#lvBadge`, ⋯ 메뉴 "설정", 심박 "설정" 링크(`goSettings('hr')`) |
| 나가는 길 | 아래 탭 4개 중 아무거나 (내정보일 때는 아래 탭에 켜진 것이 없음) |

## 시간 · 독서 · 심박 탭 (M1에서는 위치 그대로)
| 옛 위치 | 새 위치 |
|---|---|
| 시간: 분류 칩 `tlSwitch`/`tlStop`, 주간 격자 `tlCellTap`, 편집 `tlOpenEditor`/`tlEditorSave`/`tlEditorDelete`, CSV `tlDownloadCsv`, 분류 관리 | 그대로 (M2) |
| 독서: 오늘 쪽수, 책 카드, ISBN 조회·스캔, 서재 필터, 지도, 인사이트 링크 | 그대로 (M3). `#fabAdd`도 독서에서는 남김 |
| 심박: `#connectBtn` `#startBtn` `#pauseBtn` `#stopBtn` 달력 기록 목록 `#measureBtn` | 그대로 (M2) |
| 모든 모달 11개 | 그대로 (M4). 새 토큰 색만 |

## 닿을 수 있는지 점검 (M1 끝에 자동 확인)
- 정적 id 전부, `data-*` 값 전부가 1단계(`ui-phase1-tokens`)와 같은 개수 이상 있다.
- `switchTab('today'|'time'|'books'|'hr'|'stats'|'me')` 6개 모두 오류 없이 열린다.
- 오늘 화면에서 키보드·탭만으로: 습관 추가, 빠른 기록(4종), 습관 메뉴, 지난 날 입력, 쉬는 날 지정, 시간대 필터, 날짜 고르기, 주 이동, 기록(통계) 보기, 내정보 열기, 백업이 된다.

## M4에서 지운 것 (코드 참조를 먼저 없앤 뒤)
| 요소 | 대신 |
|---|---|
| 아래 탭의 숨긴 `data-tab="stats"`·`data-tab="me"` 버튼 | 오늘 › 기록, 레벨 원 |
| `#connStatus` `#dot` `#statusText` | 심박 연결 줄 `#hrConnText` |
| `#ladder` (Z1~Z5 사다리), `updateLadder()` | 270° 존 게이지 `#hrDial` |
| `#countdown` (측정 남은 시간 글자) | 측정 다이얼 `#hrvDial` 가운데 |
