// 개발용 모의 서버: 실제 gas/Code.gs 를 그대로 불러와 Apps Script 의 Drive/Lock/Properties 만 메모리로 흉내 낸다.
// 실제 구글 계정에 접속하지 않는다. 사용법:
//   SYNC_TOKEN=아무문자열 node gas/mock_server.js [포트=8787]
// 그 뒤 앱 설정의 동기화 주소에 http://localhost:8787/exec 를 넣으면 된다.
// 점검용 보조 주소(운영 서버에는 없음): GET /__state (저장 내용 보기), GET /__backups (사본 개수), GET /__log (요청 기록), GET /__offline (끊기/복구 토글), GET /__dropresp (처리는 하고 응답만 끊기 토글), GET /__reset
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');

const TOKEN = process.env.SYNC_TOKEN;
if (!TOKEN) { console.error('SYNC_TOKEN 환경변수가 필요합니다'); process.exit(2); }
const PORT = Number(process.argv[2]) || 8787;

// ---- 메모리 Drive ----
let files = [];       // {name, content, trashed, folder}
let folders = [];     // {name}
let tick = 0;
let nlCalls = 0; const cacheMap = {};   // 모의 외부 호출 횟수 / 모의 캐시
function resetDrive() { files = []; folders = []; }
function mkFile(f) {
  return {
    getName: () => f.name, setTrashed: v => { f.trashed = v; }, setContent: c => { f.content = c; },
    getBlob: () => ({ getDataAsString: () => f.content }),
  };
}
function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
const DriveApp = {
  getFilesByName: n => iter(files.filter(f => f.name === n && !f.trashed && !f.folder).map(mkFile)),
  createFile: (name, content) => { files.push({ name, content, trashed: false, folder: null }); },
  getFoldersByName: n => iter(folders.filter(f => f.name === n).map(mkFolder)),
  createFolder: n => { const f = { name: n }; folders.push(f); return mkFolder(f); },
};
function mkFolder(fd) {
  return {
    createFile: (name, content) => { files.push({ name, content, trashed: false, folder: fd.name }); },
    getFiles: () => iter(files.filter(f => f.folder === fd.name && !f.trashed).map(mkFile)),
  };
}
const sandbox = {
  DriveApp,
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'SYNC_TOKEN' ? TOKEN : k === 'NL_CERT_KEY' ? (process.env.NL_CERT_KEY || 'MOCKKEY') : null) }) },
  // ISBN 조회용 모의: 실제 외부 서버에 나가지 않고 항상 같은 책 정보를 준다 (9780306406157 은 '없음')
  UrlFetchApp: { fetch: url => { nlCalls++; const none = /isbn=9780306406157/.test(url); const body = none ? { TOTAL_COUNT: '0', docs: [] } : { TOTAL_COUNT: '1', docs: [{ TITLE: ' 어린 왕자 ', AUTHOR: '생텍쥐페리', PUBLISHER: '문학동네', PAGE: '352 p.', EA_ADD_CODE: '03860', TITLE_URL: 'http://cover.example/a.jpg' }] };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) }; } },
  CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; } }) },
  encodeURIComponent, parseInt, RegExp, Array, Logger: { log() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Utilities: { formatDate: () => { tick++; const p = n => String(n).padStart(2, '0'); return `20260101-0000${p(Math.floor(tick / 1000) % 100)}-${String(tick % 1000).padStart(3, '0')}`; } },
  JSON, Date, Error, String, Object, Array,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });

// 브라우저 테스트용: 서버를 일부러 느리게/죽게 만드는 스위치
let offline = false;
let dropResp = false;   // true 면 요청은 처리하되 응답을 끊어 버림 (응답 유실 상황 흉내)
let log = [];   // 받은 요청 요약 (토큰·값은 제외, 키 이름만)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url === '/__state') {
    const s = files.find(f => f.name === 'hr-app-sync.json' && !f.folder && !f.trashed);
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }); return res.end(s ? s.content : '{"rev":0,"data":{}}');
  }
  if (url === '/__backups') {
    const n = files.filter(f => f.folder === 'hr-app-backups' && !f.trashed).length;
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ count: n }));
  }
  if (url === '/__dropresp') { dropResp = !dropResp; res.writeHead(200, CORS); return res.end(String(dropResp)); }
  if (url === '/__offline') { offline = !offline; res.writeHead(200, CORS); return res.end(String(offline)); }
  if (url === '/__log') { res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' }); return res.end(JSON.stringify(log)); }
  if (url === '/__nlcalls') { res.writeHead(200, CORS); return res.end(String(nlCalls)); }
  if (url === '/__reset') { resetDrive(); log = []; nlCalls = 0; Object.keys(cacheMap).forEach(k => delete cacheMap[k]); res.writeHead(200, CORS); return res.end('reset'); }
  if (url !== '/exec') { res.writeHead(404, CORS); return res.end(); }
  if (offline) { return req.socket.destroy(); }
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    // Apps Script 는 요청 헤더 종류와 상관없이 본문을 postData.contents 로 준다
    try { const j = JSON.parse(body); log.push({ action: j.action, baseRev: j.baseRev, sinceRev: j.sinceRev, device: j.device, changeKeys: j.changes ? Object.keys(j.changes) : undefined, fullKeys: j.data ? Object.keys(j.data) : undefined }); } catch (_) {}
    const e = req.method === 'POST' ? { postData: { contents: body } } : null;
    const out = req.method === 'POST' ? sandbox.doPost(e) : sandbox.doGet();
    if (dropResp) return req.socket.destroy();
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(out.text);
  });
}).listen(PORT, () => console.log('mock apps script on http://localhost:' + PORT + '/exec'));
