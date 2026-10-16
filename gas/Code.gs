/**
 * hr-app 동기화 저장소 (Apps Script 웹앱)
 * - 화면(UI)은 GitHub Pages 에 그대로 두고, 이 스크립트는 "기록 저장 창구" 역할만 한다.
 * - 요청: POST, Content-Type: text/plain, 본문은 JSON 문자열
 *     { token, action: "get"|"put", ... }
 *   get: { sinceRev?, metaOnly? }           -> { ok, rev, updatedAt, device, bytes, data? }
 *   put: { baseRev, device, changes }       -> 바뀐 키만 합침 (값 null = 키 삭제)
 *   put: { baseRev, device, data }          -> 전체 교체 (첫 동기화 / 이 기기 기록으로 덮어쓰기)
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
