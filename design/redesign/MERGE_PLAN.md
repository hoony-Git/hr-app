# main 합치기 계획 (ui-phase1-tokens + ui-phase2-night-dial)

**0. 먼저 폰에서 백업 (꼭)**
- 지금 쓰는 앱(GitHub Pages) › 내정보 › 데이터 › **내보내기**. 받은 `hr-backup_날짜.json` 을 PC나 드라이브에도 복사해 둔다.

**1. 합치기** (PC, `D:\Coding\hr-app`)
- `ui-phase2-night-dial` 은 `ui-phase1-tokens` 위에서 나왔으므로 이것 하나만 합치면 두 단계가 다 들어간다.
```
git checkout main
git pull
git merge --no-ff ui-phase2-night-dial -m "Night Dial 리디자인 (1단계 토큰 + M1~M4)"
node tests/test_metrics.js && node tests/test_timelog.js && node gas/test_category.js && node gas/test_isbn.js
git push origin main
```
- 테스트가 하나라도 실패하면 push 하지 말고 아래 3번으로 되돌린다.
**2. push 뒤 폰에서 바뀌는 것**
- 1~2분 뒤 GitHub Pages 가 새로 뜬다. 앱을 완전히 닫았다 열거나 새로고침한다.
- 기록은 그대로다 (저장 키·값 모양을 바꾸지 않았고, 내보내기 파일이 바이트 단위로 같음을 확인함).
- 바뀌는 것: 아래 탭 4개(통계 = 오늘 › 기록, 내정보 = 레벨 원), 다이얼 화면, 새 색·글꼴(처음 한 번 받느라 잠깐 기본 글꼴), 성단 지도, + 버튼 대신 "+ 습관"·"책 추가".

**3. 문제가 생기면 되돌리기 (명령 한 줄)**
```
git checkout main && git revert -m 1 --no-edit HEAD && git push origin main
```
- 합치기 커밋 바로 뒤에 다른 커밋을 하지 않았을 때 그대로 쓴다 (했다면 `HEAD` 자리에 합치기 커밋 번호).
- 기록은 영향 없다. 그래도 이상하면 0번의 백업을 내정보 › 데이터 › 가져오기 로 넣는다.

**4. 따로 할 것**
- `artifact/insights.html` 을 새 지도로 다시 빌드했다. claude.ai 에 올린 인사이트 페이지는 **따로 다시 게시**해야 바뀐다.
- 브랜치는 지우지 않는다.
