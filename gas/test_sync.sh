#!/usr/bin/env bash
# 배포한 Apps Script 창구 점검. 주소·비밀키는 환경변수로만 받는다 (파일에 적지 않음).
#   SYNC_URL=https://script.google.com/macros/s/.../exec SYNC_TOKEN=... bash gas/test_sync.sh
# 주의: 실제 서버에 쓰기(put)를 한다. put 3번이 rev 를 올리고 hr-app-backups 사본이 생긴다.
#       실제 기록이 든 창구에는 가급적 피하고, 쓰더라도 점검용 키 __sync_selftest 는 마지막에 지운다.
# 필요: curl, node (JSON 읽기용)
set -u
: "${SYNC_URL:?SYNC_URL 환경변수가 필요합니다}"
: "${SYNC_TOKEN:?SYNC_TOKEN 환경변수가 필요합니다}"
command -v curl >/dev/null || { echo "curl 이 필요합니다"; exit 2; }
command -v node >/dev/null || { echo "node 가 필요합니다 (https://nodejs.org)"; exit 2; }

# echo "$json" | jget 'o.error'   -> JSON 에서 식 하나를 계산해 출력
jget() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);console.log(new Function("o","return "+process.argv[1])(o))}catch(e){console.log("<non-json>")}})' "$1"
}
call() { curl -sL -H 'Content-Type: text/plain' --data "$1" "$SYNC_URL"; }
fail=0
check() { # 이름 실제 기대
  if [ "$2" = "$3" ]; then echo "PASS  $1 ($2)"; else echo "FAIL  $1 (기대: $3, 실제: $2)"; fail=1; fi
}

r=$(call '{"token":"wrong-token","action":"get"}')
check "틀린 토큰 -> unauthorized" "$(echo "$r" | jget 'o.error')" "unauthorized"
check "틀린 토큰 -> data 없음" "$(echo "$r" | jget '"data" in o')" "false"

r=$(call "{\"token\":\"$SYNC_TOKEN\",\"action\":\"get\"}")
check "get -> ok" "$(echo "$r" | jget 'o.ok')" "true"
rev=$(echo "$r" | jget 'o.rev')
echo "      현재 rev=$rev, 저장 파일 크기=$(echo "$r" | jget 'o.bytes') bytes"

r=$(call "{\"token\":\"$SYNC_TOKEN\",\"action\":\"put\",\"baseRev\":$rev,\"device\":\"test_sync\",\"changes\":{\"__sync_selftest\":\"1\"}}")
check "put (맞는 baseRev) -> ok" "$(echo "$r" | jget 'o.ok')" "true"
newrev=$(echo "$r" | jget 'o.rev')
check "put -> rev+1" "$newrev" "$((rev+1))"

r=$(call "{\"token\":\"$SYNC_TOKEN\",\"action\":\"put\",\"baseRev\":$rev,\"device\":\"test_sync\",\"changes\":{\"__sync_selftest\":\"2\"}}")
check "put (낡은 baseRev) -> conflict" "$(echo "$r" | jget 'o.error')" "conflict"
check "conflict 시 rev 변동 없음" "$(echo "$r" | jget 'o.rev')" "$newrev"
check "conflict 시 값 덮어쓰지 않음" "$(echo "$r" | jget 'o.data.__sync_selftest')" "1"

r=$(call "{\"token\":\"$SYNC_TOKEN\",\"action\":\"put\",\"baseRev\":$newrev,\"device\":\"test_sync\",\"changes\":{\"__sync_selftest\":null}}")
check "점검용 키 삭제(null) -> ok" "$(echo "$r" | jget 'o.ok')" "true"
lastrev=$(echo "$r" | jget 'o.rev')

r=$(call "{\"token\":\"$SYNC_TOKEN\",\"action\":\"get\",\"sinceRev\":$lastrev}")
check "sinceRev 같으면 본문 생략" "$(echo "$r" | jget '"data" in o')" "false"
r=$(call "{\"token\":\"$SYNC_TOKEN\",\"action\":\"get\"}")
check "삭제한 키가 실제로 사라짐" "$(echo "$r" | jget '"__sync_selftest" in o.data')" "false"

if [ $fail -eq 0 ]; then echo "전부 통과"; else echo "실패 있음"; exit 1; fi
