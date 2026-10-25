/**
 * hr-app 동기화 저장소 (Apps Script 웹앱)
 * - 화면(UI)은 GitHub Pages 에 그대로 두고, 이 스크립트는 "기록 저장 창구" 역할만 한다.
 * - 요청: POST, Content-Type: text/plain, 본문은 JSON 문자열
 *     { token, action: "get"|"put", ... }
 *   get: { sinceRev?, metaOnly? }           -> { ok, rev, updatedAt, device, bytes, data? }
 *   put: { baseRev, device, changes }       -> 바뀐 키만 합침 (값 null = 키 삭제)
 *   put: { baseRev, device, data }          -> 전체 교체 (첫 동기화 / 이 기기 기록으로 덮어쓰기)
 *   isbn: { isbn }                          -> { ok, book: {title, author, publisher, pages, coverUrl, addCode} }  (국립중앙도서관 서지정보)
 * - 저장: 내 드라이브의 hr-app-sync.json  { rev, updatedAt, device, data }
 */

var FILE_NAME = 'hr-app-sync.json';
var BACKUP_FOLDER = 'hr-app-backups';
var KEEP_BACKUPS = 30;
var LOCK_WAIT_MS = 20000;

function doPost(e) {
  try {
    var req = parseBody_(e);
    if (!req) return out_({ ok: false, error: 'bad_request' });
    if (!tokenOk_(req.token)) return out_({ ok: false, error: 'unauthorized' });
    if (req.action === 'get') return out_(doGet_(req));
    if (req.action === 'put') return out_(doPut_(req));
    if (req.action === 'isbn') return out_(doIsbn_(req));
    return out_({ ok: false, error: 'bad_action' });
  } catch (err) {
    return out_({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

// 주소를 브라우저로 직접 열어본 경우 (데이터는 절대 주지 않음)
function doGet() {
  return out_({ ok: false, error: 'use_post' });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    var o = JSON.parse(e.postData.contents);
    return (o && typeof o === 'object') ? o : null;
  } catch (err) { return null; }
}

function tokenOk_(token) {
  var real = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!real || typeof token !== 'string' || token.length === 0) return false;
  if (token.length !== real.length) return false;
  var diff = 0;                                  // 길이가 같을 때 끝까지 비교 (타이밍 차이 최소화)
  for (var i = 0; i < real.length; i++) diff |= token.charCodeAt(i) ^ real.charCodeAt(i);
  return diff === 0;
}

// ---------- 저장 파일 ----------
function findFile_() {
  var it = DriveApp.getFilesByName(FILE_NAME);
  return it.hasNext() ? it.next() : null;
}

function readState_() {
  var f = findFile_();
  if (!f) return { rev: 0, updatedAt: null, device: null, data: {} };
  var text = f.getBlob().getDataAsString('UTF-8');
  var s = JSON.parse(text);
  if (!s || typeof s.rev !== 'number' || !s.data || typeof s.data !== 'object') throw new Error('저장 파일 형식 오류');
  return { rev: s.rev, updatedAt: s.updatedAt, device: s.device, data: s.data, _text: text };
}

function writeState_(state) {
  var text = JSON.stringify({ rev: state.rev, updatedAt: state.updatedAt, device: state.device, data: state.data });
  var f = findFile_();
  if (f) f.setContent(text); else DriveApp.createFile(FILE_NAME, text, 'application/json');
  return text.length;
}

// ---------- get ----------
function doGet_(req) {
  var s = readState_();
  var bytes = s._text ? s._text.length : 0;
  var res = { ok: true, rev: s.rev, updatedAt: s.updatedAt, device: s.device, bytes: bytes };
  var unchanged = (req.sinceRev !== undefined && req.sinceRev === s.rev);
  if (req.metaOnly || unchanged) { res.unchanged = !!unchanged; return res; }   // 안 바뀌었으면 본문을 안 보냄
  res.data = s.data;
  return res;
}

// ---------- put ----------
function doPut_(req) {
  if (typeof req.baseRev !== 'number') return { ok: false, error: 'bad_request' };
  var hasChanges = req.changes && typeof req.changes === 'object' && !Array.isArray(req.changes);
  var hasFull = req.data && typeof req.data === 'object' && !Array.isArray(req.data);
  if (hasChanges === hasFull) return { ok: false, error: 'bad_request' };   // 둘 중 정확히 하나

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) return { ok: false, error: 'busy' };
  try {
    var cur = readState_();
    if (req.baseRev !== cur.rev) {
      return { ok: false, error: 'conflict', rev: cur.rev, updatedAt: cur.updatedAt, device: cur.device, data: cur.data };
    }
    if (cur._text) backupSnapshot_(cur._text);          // 덮어쓰기 직전 상태를 먼저 보관

    var next = {};
    if (hasFull) {
      next = req.data;
    } else {
      for (var k in cur.data) next[k] = cur.data[k];
      for (var key in req.changes) {
        if (req.changes[key] === null) delete next[key]; else next[key] = req.changes[key];
      }
    }
    var state = {
      rev: cur.rev + 1,
      updatedAt: new Date().toISOString(),
      device: typeof req.device === 'string' ? req.device.slice(0, 40) : null,
      data: next
    };
    var bytes = writeState_(state);
    return { ok: true, rev: state.rev, updatedAt: state.updatedAt, bytes: bytes };
  } finally {
    lock.releaseLock();
  }
}

// ---------- 백업 ----------
function backupSnapshot_(text) {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var ts = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss-SSS');
  folder.createFile('hr-app-sync.' + ts + '.json', text, 'application/json');
  pruneBackups_(folder);
}

function pruneBackups_(folder) {
  var files = [], it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^hr-app-sync\.\d{8}-\d{6}-\d{3}\.json$/.test(f.getName())) files.push(f);
  }
  if (files.length <= KEEP_BACKUPS) return;
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });   // 이름(시각) 내림차순 = 최신 먼저
  for (var i = KEEP_BACKUPS; i < files.length; i++) files[i].setTrashed(true);
}

// ---------- ISBN 조회 (국립중앙도서관 서지정보 API) ----------
// 인증키는 스크립트 속성 NL_CERT_KEY 에만 둔다 (코드·응답·로그에 넣지 않는다). 위 비밀키 확인을 통과한 요청만 여기까지 온다.
var NL_ENDPOINT = 'https://www.nl.go.kr/seoji/SearchApi.do';
var ISBN_CACHE_SEC = 21600;   // 같은 ISBN 은 6시간 동안 캐시 (Apps Script 캐시 최대치)

function doIsbn_(req) {
  var isbn = typeof req.isbn === 'string' ? req.isbn.trim() : '';
  if (!/^97[89]\d{10}$/.test(isbn)) return { ok: false, error: 'bad_isbn' };
  var key = String(PropertiesService.getScriptProperties().getProperty('NL_CERT_KEY') || '').trim();   // 붙여넣을 때 섞인 앞뒤 공백·줄바꿈 제거
  if (!key) return { ok: false, error: 'not_configured' };
  var cache = CacheService.getScriptCache(), ck = 'isbn:' + isbn, hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var text, data;
  try {
    var url = NL_ENDPOINT + '?cert_key=' + encodeURIComponent(key) + '&result_style=json&page_no=1&page_size=1&isbn=' + isbn;
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'upstream_error', code: 'http_' + resp.getResponseCode() };
    text = resp.getContentText('UTF-8');
  } catch (err) {
    return { ok: false, error: 'upstream_error', detail: scrub_('fetch: ' + (err && err.message || err), key) };   // 이유는 알려 주되 인증키는 가린다
  }
  try { data = JSON.parse(text); }
  catch (err) { return { ok: false, error: 'upstream_error', detail: scrub_('json: ' + String(text).slice(0, 160), key) }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.RESULT === 'ERROR') {
    return { ok: false, error: 'upstream_error', code: String((data && data.ERR_CODE) || '') };
  }
  var docs = data.docs;
  if (!Array.isArray(docs) || !docs.length || !docs[0] || typeof docs[0] !== 'object') return { ok: false, error: 'not_found' };
  var book = mapDoc_(docs[0]);
  if (!book.title) return { ok: false, error: 'not_found' };
  var result = { ok: true, book: book };
  try { cache.put(ck, JSON.stringify(result), ISBN_CACHE_SEC); } catch (e) {}
  return result;
}

function scrub_(t, key) {   // 문장 속 인증키(원문·주소 인코딩형)를 *** 로 바꾼다
  var out = String(t);
  if (key) out = out.split(key).join('***').split(encodeURIComponent(key)).join('***');
  return out.slice(0, 200);
}
function clean_(v, limit) { return typeof v === 'string' ? v.trim().slice(0, limit || 200) : ''; }
function cleanAuthor_(raw) {   // '프랑수아즈 사강 [지음] ;김남주 옮김' -> '프랑수아즈 사강' (첫 항목만, 끝의 역할 표시 제거)
  var first = clean_(String(raw || '').split(';')[0], 200), prev;
  do { prev = first; first = first.replace(/\s*\[?(지음|지은이|글|저|저자|엮음|편)\]?\s*$/, ''); } while (first !== prev);
  return first.trim();
}
function cleanPublisher_(raw) { return clean_(raw, 100).replace(/^\(주\)\s*/, '').replace(/\s*\(주\)$/, '').trim(); }
function parsePages_(raw) {   // '352 p.' 같은 문자열에서 첫 정수만. 못 뽑으면 null
  var m = typeof raw === 'string' ? raw.match(/\d+/) : null;
  return m ? parseInt(m[0], 10) : null;
}
// 응답 항목 이름(TITLE/AUTHOR/PUBLISHER/PAGE/EA_ADD_CODE/TITLE_URL)은 실제 응답으로 확인함 (2026-10-26).
// 실제 값은 지저분하다: AUTHOR '프랑수아즈 사강 [지음] ;김남주 옮김', PUBLISHER '(주)민음사', PAGE ''·'약 640쪽 내외'·'359 p.', TITLE_URL 대부분 빈 값
function mapDoc_(d) {
  var cover = clean_(d.TITLE_URL, 500);
  if (cover.indexOf('http://') === 0) cover = 'https://' + cover.slice(7);   // 앱이 https 페이지라 http 표지는 막힌다
  return {
    title: clean_(d.TITLE), author: cleanAuthor_(d.AUTHOR), publisher: cleanPublisher_(d.PUBLISHER),
    pages: parsePages_(d.PAGE), coverUrl: cover, addCode: clean_(d.EA_ADD_CODE, 10)
  };
}

// ---------- 편집기에서 직접 실행하는 점검용 (웹앱으로는 호출되지 않음) ----------
// 처음 한 번 실행하면 "외부 서비스 연결" 권한 승인 창이 뜬다. 인증키는 로그에 남기지 않는다.
function testIsbn() {
  Logger.log(JSON.stringify(doIsbn_({ isbn: '9788937461798' })));
}
// 응답의 실제 항목 이름 확인용: 첫 항목의 이름과 값을 로그로 남긴다
function testIsbnRaw() {
  var key = String(PropertiesService.getScriptProperties().getProperty('NL_CERT_KEY') || '').trim();
  if (!key) { Logger.log('NL_CERT_KEY 스크립트 속성이 없어요'); return; }
  var url = NL_ENDPOINT + '?cert_key=' + encodeURIComponent(key) + '&result_style=json&page_no=1&page_size=1&isbn=9788937461798';
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    Logger.log('HTTP ' + resp.getResponseCode() + ' | ' + scrub_(resp.getContentText('UTF-8'), key).slice(0, 180));
    Logger.log(String(resp.getContentText('UTF-8')).split(key).join('***').slice(0, 2500));
  } catch (err) {
    Logger.log('요청 실패: ' + scrub_(err && err.message || err, key));
  }
}
