import json
import os
import socket
import unittest
import urllib.error
from unittest import mock

import isbn_proxy as m

OK_DOC = {'TITLE': ' 어린 왕자 ', 'AUTHOR': '생텍쥐페리', 'PUBLISHER': '문학동네', 'PAGE': '352 p.', 'EA_ADD_CODE': '03860',
          'TITLE_URL': 'http://cover.example/a.jpg'}


def ev(isbn=None, method='GET'):
    return {'requestContext': {'http': {'method': method}},
            'queryStringParameters': ({'isbn': isbn} if isbn is not None else None)}


class FakeResp:
    def __init__(self, obj):
        self.b = json.dumps(obj).encode()

    def read(self):
        return self.b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@mock.patch.dict(os.environ, {'NL_CERT_KEY': 'SECRETKEY'})
class T(unittest.TestCase):
    def test_validation(self):
        for bad in [None, '', '123', '9780306406157x', '1234567890123', '978030640615', '97803064061577']:
            self.assertEqual(m.handler(ev(bad), None)['statusCode'], 400, bad)
        self.assertEqual(m.handler(ev('9780306406157', 'POST'), None)['statusCode'], 405)

    def test_success_mapping_and_headers(self):
        with mock.patch('urllib.request.urlopen', return_value=FakeResp({'docs': [OK_DOC]})) as u:
            r = m.handler(ev('9788937460777'), None)
            called = u.call_args[0][0]
            self.assertIn('isbn=9788937460777', called)
            self.assertIn('result_style=json', called)
            self.assertEqual(u.call_args[1]['timeout'], 5)
        self.assertEqual(r['statusCode'], 200)
        b = json.loads(r['body'])
        self.assertEqual(b, {'title': '어린 왕자', 'author': '생텍쥐페리', 'publisher': '문학동네', 'pages': 352,
                             'coverUrl': 'https://cover.example/a.jpg', 'addCode': '03860'})
        h = r['headers']
        self.assertEqual(h['Access-Control-Allow-Origin'], 'https://hoony-git.github.io')
        self.assertEqual(h['Cache-Control'], 'max-age=86400')
        self.assertEqual(h['Access-Control-Allow-Methods'], 'GET')

    def test_pages_parsing(self):
        for raw, want in [('352 p.', 352), ('xii, 120p', 120), ('', None), (None, None), ('쪽수없음', None), (352, None)]:
            self.assertEqual(m.parse_pages(raw), want, raw)

    def test_not_found_and_upstream_error(self):
        for payload in [{'docs': []}, {'TOTAL_COUNT': '0'}, {'docs': [{'AUTHOR': 'x'}]}, {'docs': ['x']}]:
            with mock.patch('urllib.request.urlopen', return_value=FakeResp(payload)):
                self.assertEqual(m.handler(ev('9788937460777'), None)['statusCode'], 404, payload)
        err = {'RESULT': 'ERROR', 'ERR_CODE': '010', 'ERR_MESSAGE': '인증키 정보가 없습니다.'}
        with mock.patch('urllib.request.urlopen', return_value=FakeResp(err)):
            r = m.handler(ev('9788937460777'), None)
        self.assertEqual(r['statusCode'], 502)
        self.assertEqual(json.loads(r['body'])['code'], '010')
        with mock.patch('urllib.request.urlopen', return_value=FakeResp([1, 2])):
            self.assertEqual(m.handler(ev('9788937460777'), None)['statusCode'], 502)

    def test_timeout_is_502_json_and_never_leaks_key(self):
        leak = urllib.error.URLError('https://www.nl.go.kr/seoji/SearchApi.do?cert_key=SECRETKEY failed')
        for exc in [socket.timeout('timed out'), TimeoutError(), urllib.error.URLError(socket.timeout('t')), leak]:
            with mock.patch('urllib.request.urlopen', side_effect=exc):
                r = m.handler(ev('9788937460777'), None)
            self.assertEqual(r['statusCode'], 502)
            self.assertNotIn('SECRETKEY', r['body'])
            json.loads(r['body'])
        with mock.patch('urllib.request.urlopen', side_effect=ValueError('bad json SECRETKEY')):
            r = m.handler(ev('9788937460777'), None)
        self.assertEqual(r['statusCode'], 502)
        self.assertNotIn('SECRETKEY', r['body'])

    def test_missing_key_is_500_without_calling_upstream(self):
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch('urllib.request.urlopen') as u:
            self.assertEqual(m.handler(ev('9788937460777'), None)['statusCode'], 500)
            u.assert_not_called()


if __name__ == '__main__':
    unittest.main()
