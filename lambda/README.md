# ISBN 프록시 (Phase 6)

> **참고**: ISBN 조회는 AWS Lambda 대신 기존 구글 Apps Script 창구(`gas/`)로 하기로 해서 이 폴더는 현재 사용하지 않습니다. (코드·시험은 참고용으로 남겨 둠)

`isbn_proxy.py` 를 AWS Lambda(Python 3.12) 에 올리고 **Function URL** (인증 NONE) 을 켠다.

1. 환경변수 `NL_CERT_KEY` = 국립중앙도서관 인증키 (코드·저장소에 넣지 않는다)
2. Function URL 의 CORS 설정은 **끈다** — 코드가 `https://hoony-git.github.io` 만 허용하는 헤더를 직접 붙인다
3. 핸들러 이름 `isbn_proxy.handler`, 제한 시간 10초 이상 (상류 호출 제한은 코드가 5초)
4. 나온 URL 을 `index.html` 맨 위쪽의 `const ISBN_PROXY_URL = '';` 에 넣는다 (URL 자체는 비밀이 아님)

## 검증 안 된 부분

국립중앙도서관 응답의 실제 필드명(`docs[].TITLE / AUTHOR / PUBLISHER / PAGE / EA_ADD_CODE / TITLE_URL`)은
인증키가 없어 실제 호출로 확인하지 못했다 (키 없이 호출하면 `인증키 정보가 없습니다` 오류만 돌아온다).
배포 후 실제 ISBN 하나로 호출해서 필드명이 맞는지 확인할 것. 다르면 `map_doc()` 만 고치면 된다.

```
curl "https://<function-url>/?isbn=9788937460777"
```

## 테스트

```
cd lambda && python -m unittest -v test_isbn_proxy
```
