# M4 백로그 (M2 중에 쌓인 것 · 지금은 하지 않음)

1. `switchTab`이 숨긴 통계·내정보 버튼 없이도 돌게 고친 뒤, 아래 탭의 숨긴 버튼 2개(`data-tab="stats"`, `data-tab="me"`)를 지운다. 지울 때 NAV_MAPPING과 UI_HANDOFF §8의 data-* 목록도 고친다.
2. 최신 `UI_HANDOFF.md`를 커밋한다 (지금은 1단계 반영본이 커밋 안 된 채로 있음. M1·M2 구조 변경도 반영).
3. 글꼴·아이콘 CDN 주소가 버전 고정인지 확인한다.
   - Tabler: `@tabler/icons-webfont@3.19.0` (고정됨)
   - IBM Plex Sans KR: Google Fonts `css2?family=IBM+Plex+Sans+KR:wght@400;500&display=swap` — Google Fonts 주소에는 버전이 없다. 고정하려면 글꼴 파일을 저장소에 두거나 버전 붙은 npm 패키지(예: `@fontsource/ibm-plex-sans-kr@<버전>`)로 바꿔야 함 → 결정 필요.

## M2에서 넘어온 모양 정리 (기능 아님)
- 심박 달력 칸의 이모지(💪🔥💤), 시간 월간 보고의 분류 이모지, 측정 안내의 `rr-status` 상자 모양
- 운동 그래프 카드 아래 빈 공간 (그래프 높이 180px 고정)
- `#ladder`(옛 Z1~Z5 사다리)는 존 게이지로 대신해 숨김. 요소·코드는 남아 있음 → M4에서 지울지 결정
- 안 쓰게 된 옛 CSS(`.tl-cur*`, `.tl-btns`, `.tl-cb`, `.tl-grid`, `.tl-gh`, `.lz`, `.weekly-head` 등) 정리
