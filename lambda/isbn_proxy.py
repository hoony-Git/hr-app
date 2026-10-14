"""ISBN 조회 프록시 (AWS Lambda Function URL, Python 3.12).

국립중앙도서관 cert_key 를 공개 저장소(index.html)에 두지 않으려고 중간에 둔다.
- 환경변수 NL_CERT_KEY: 국립중앙도서관 ISBN 서지정보 API 인증키 (코드에 넣지 말 것)
- GET /?isbn=9788937460777 -> {title, author, publisher, pages, coverUrl, addCode}
- CORS 는 이 코드가 직접 붙인다 (Function URL 설정의 CORS 는 꺼 둘 것 — 둘 다 켜면 헤더가 중복된다)
"""
import json
import os
import re
import socket
import urllib.error
import urllib.parse
import urllib.request

ALLOWED_ORIGIN = 'https://hoony-git.github.io'
UPSTREAM = 'https://www.nl.go.kr/seoji/SearchApi.do'
TIMEOUT_SEC = 5


def _resp(status, body):
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET',
        'Vary': 'Origin',
    }
    if status == 200:
        headers['Cache-Control'] = 'max-age=86400'
    return {'statusCode': status, 'headers': headers, 'body': json.dumps(body, ensure_ascii=False)}


def _clean(v, limit=200):
    return v.strip()[:limit] if isinstance(v, str) else ''


def parse_pages(raw):
    """'352 p.' 같은 문자열에서 첫 정수만 뽑는다. 못 뽑으면 None."""
    m = re.search(r'\d+', raw) if isinstance(raw, str) else None
    return int(m.group()) if m else None


def map_doc(d):
    cover = _clean(d.get('TITLE_URL'), 500)
    if cover.startswith('http://'):          # 앱이 https 페이지라 http 표지는 막힌다
        cover = 'https://' + cover[len('http://'):]
    return {
        'title': _clean(d.get('TITLE')),
        'author': _clean(d.get('AUTHOR')),
        'publisher': _clean(d.get('PUBLISHER')),
        'pages': parse_pages(d.get('PAGE')),
        'coverUrl': cover,
        'addCode': _clean(d.get('EA_ADD_CODE'), 10),
    }


def handler(event, context):
    method = ((event.get('requestContext') or {}).get('http') or {}).get('method', 'GET')
    if method != 'GET':
        return _resp(405, {'error': 'method not allowed'})
    isbn = ((event.get('queryStringParameters') or {}).get('isbn') or '').strip()
    if not re.fullmatch(r'97[89]\d{10}', isbn):
        return _resp(400, {'error': 'isbn must be 13 digits starting with 978 or 979'})
    key = os.environ.get('NL_CERT_KEY')
    if not key:
        return _resp(500, {'error': 'server not configured'})
    url = UPSTREAM + '?' + urllib.parse.urlencode(
        {'cert_key': key, 'result_style': 'json', 'page_no': 1, 'page_size': 1, 'isbn': isbn})
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SEC) as r:
            data = json.loads(r.read().decode('utf-8'))
    except (socket.timeout, TimeoutError):
        return _resp(502, {'error': 'upstream timeout'})
    except urllib.error.URLError as e:
        # 오류 문자열에 인증키가 담긴 URL 이 들어갈 수 있어 응답에는 넣지 않는다
        timed_out = isinstance(e.reason, (socket.timeout, TimeoutError))
        return _resp(502, {'error': 'upstream timeout' if timed_out else 'upstream unreachable'})
    except (ValueError, UnicodeDecodeError):
        return _resp(502, {'error': 'upstream returned invalid data'})
    if not isinstance(data, dict) or data.get('RESULT') == 'ERROR':
        code = str(data.get('ERR_CODE', '')) if isinstance(data, dict) else ''
        return _resp(502, {'error': 'upstream error', 'code': code})
    docs = data.get('docs')
    if not isinstance(docs, list) or not docs or not isinstance(docs[0], dict):
        return _resp(404, {'error': 'not found'})
    out = map_doc(docs[0])
    if not out['title']:
        return _resp(404, {'error': 'not found'})
    return _resp(200, out)
