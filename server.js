'use strict';
// 프로포즈 대작전: 외부 패키지 없이 Node.js만으로 동작하는 서버
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const TEACHER_PIN = String(process.env.TEACHER_PIN || '0000');
const PUB = path.join(__dirname, 'public');
const CATS = ['subject', 'object', 'predicate', 'complement', 'modifier', 'adverbial', 'interjection'];
const MAX_WORDS = 14;
const MAX_PART = 5;   // 참신성 5점 + 진심 5점 = 10점 만점
const SUBMIT_GAP_MS = Number(process.env.SUBMIT_GAP_MS || 800);

if (!process.env.TEACHER_PIN) {
  console.warn('[주의] TEACHER_PIN 환경변수가 없어서 교사 비밀번호가 0000 이에요. 배포할 때 꼭 바꿔 주세요.');
}

/* ---------- 상태 (서버를 다시 켜면 초기화돼요) ---------- */
let deck = loadDeck();
const students = new Map();   // clientId -> { group, streams:Set<res>, lastSubmit }
let nextGroup = 1;
let proposals = [];           // { id, from, to, text, at }
let propSeq = 0;
const teacherTokens = new Set();
const teacherStreams = new Set();

function loadDeck() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'deck.json'), 'utf8'));
  const out = {};
  CATS.forEach(function (k) {
    const d = raw[k] || { label: k, order: CATS.indexOf(k) + 1, cards: [] };
    out[k] = { label: String(d.label || k), order: CATS.indexOf(k) + 1, cards: cleanCards(d.cards) || [] };
  });
  return out;
}
function cleanCards(cards) {
  if (!Array.isArray(cards) || cards.length > 80) return null;
  const out = [];
  const seen = {};
  for (const c of cards) {
    if (!c || typeof c.text !== 'string') return null;
    const text = c.text.trim();
    if (!text || text.length > 30) return null;
    let id = typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : null;
    if (!id || seen[id]) id = 'c' + crypto.randomBytes(4).toString('hex');
    seen[id] = true;
    out.push({ id: id, text: text, on: c.on !== false });
  }
  return out;
}
function enabledDeck() {
  const out = {};
  CATS.forEach(function (k) {
    out[k] = deck[k].cards.filter(function (c) { return c.on; }).map(function (c) { return { id: c.id, text: c.text }; });
  });
  return out;
}
function enabledTexts() {
  const set = new Set();
  CATS.forEach(function (k) { deck[k].cards.forEach(function (c) { if (c.on) set.add(c.text); }); });
  return set;
}
function onlineGroups() {
  const list = [];
  students.forEach(function (s) { if (s.streams.size > 0) list.push(s.group); });
  return list.sort(function (a, b) { return a - b; });
}
// 골고루 나누기: 받은 프로포즈가 가장 적은 조를 먼저 고르고,
// 그다음 아직 덜 보낸 조(앞으로 남을 보낼 기회가 적은 조), 그다음 내가 덜 보낸 조 순서로 좁힌 뒤
// 남은 후보 중에서 무작위로 정해요.
function pickTarget(from) {
  const cands = onlineGroups().filter(function (g) { return g !== from; });
  if (!cands.length) return null;
  const got = {}, sent = {}, mine = {};
  proposals.forEach(function (p) {
    got[p.to] = (got[p.to] || 0) + 1;
    sent[p.from] = (sent[p.from] || 0) + 1;
    if (p.from === from) mine[p.to] = (mine[p.to] || 0) + 1;
  });
  let pool = cands;
  [got, sent, mine].forEach(function (m) {
    let min = Infinity;
    pool.forEach(function (g) { min = Math.min(min, m[g] || 0); });
    pool = pool.filter(function (g) { return (m[g] || 0) === min; });
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- 실시간 전송 (SSE) ---------- */
function send(res, obj) {
  try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { /* 연결이 끊김 */ }
}
function studentSnapshot(s) {
  return {
    type: 'state',
    group: s.group,
    others: onlineGroups().filter(function (g) { return g !== s.group; }).length,
    deck: enabledDeck(),
    inbox: proposals.filter(function (p) { return p.to === s.group; }).slice(-60).reverse(),
    outbox: proposals.filter(function (p) { return p.from === s.group; }).slice(-60).reverse()
  };
}
function teacherSnapshot() {
  const online = new Set(onlineGroups());
  // sent/received: 보낸·받은 개수, replied: 이 조가 답장한 개수,
  // accepted: 이 조가 보낸 프로포즈 중 수락된 개수, avg: 이 조가 보낸 프로포즈가 받은 평균 점수
  const st = {};
  function row(g) { return st[g] || (st[g] = { sent: 0, received: 0, replied: 0, accepted: 0, scored: 0, sum: 0 }); }
  proposals.forEach(function (p) {
    const from = row(p.from);
    const to = row(p.to);
    from.sent++;
    to.received++;
    if (p.status !== 'pending') {
      to.replied++;
      from.scored++;
      from.sum += p.score;
      if (p.status === 'accepted') from.accepted++;
    }
  });
  const members = [];
  students.forEach(function (s) {
    const r = row(s.group);
    members.push({
      group: s.group, online: online.has(s.group),
      sent: r.sent, received: r.received, replied: r.replied, accepted: r.accepted,
      avg: r.scored ? Math.round(r.sum / r.scored * 10) / 10 : null
    });
  });
  members.sort(function (a, b) { return a.group - b.group; });
  return { type: 'state', members: members, proposals: proposals.slice(-500).reverse(), deck: deck };
}
let timer = null;
function schedule() {
  if (timer) return;
  timer = setTimeout(function () {
    timer = null;
    students.forEach(function (s) {
      if (!s.streams.size) return;
      const snap = studentSnapshot(s);
      s.streams.forEach(function (res) { send(res, snap); });
    });
    if (teacherStreams.size) {
      const snap = teacherSnapshot();
      teacherStreams.forEach(function (res) { send(res, snap); });
    }
  }, 120);
}
setInterval(function () {
  students.forEach(function (s) { s.streams.forEach(function (res) { try { res.write(':\n\n'); } catch (e) { /* skip */ } }); });
  teacherStreams.forEach(function (res) { try { res.write(':\n\n'); } catch (e) { /* skip */ } });
}, 15000);

/* ---------- 도우미 ---------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > 30000) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function validId(id) { return typeof id === 'string' && /^[\w-]{8,64}$/.test(id); }
function teacherToken(req, url) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  return t && teacherTokens.has(t) ? t : null;
}
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');
}

const STATIC = {
  '/': ['student.html', 'text/html; charset=utf-8'],
  '/teacher': ['teacher.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/common.js': ['common.js', 'application/javascript; charset=utf-8'],
  '/student.js': ['student.js', 'application/javascript; charset=utf-8'],
  '/teacher.js': ['teacher.js', 'application/javascript; charset=utf-8']
};

/* ---------- 라우터 ---------- */
const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && STATIC[p]) {
      const f = STATIC[p];
      res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(path.join(PUB, f[0])));
      return;
    }
    if (req.method === 'GET' && p === '/healthz') { json(res, 200, { ok: true }); return; }

    /* 학생 */
    if (req.method === 'POST' && p === '/api/join') {
      const b = await readBody(req);
      if (!validId(b.clientId)) { json(res, 400, { error: 'bad-id' }); return; }
      let s = students.get(b.clientId);
      if (!s) {
        s = { group: nextGroup++, streams: new Set(), lastSubmit: 0 };
        students.set(b.clientId, s);
        schedule();
      }
      json(res, 200, { group: s.group });
      return;
    }
    if (req.method === 'GET' && p === '/api/stream') {
      const id = url.searchParams.get('clientId');
      const s = validId(id) ? students.get(id) : null;
      if (!s) { res.writeHead(410); res.end(); return; }
      sse(res);
      s.streams.add(res);
      send(res, studentSnapshot(s));
      schedule();
      req.on('close', function () { s.streams.delete(res); schedule(); });
      return;
    }
    if (req.method === 'POST' && p === '/api/submit') {
      const b = await readBody(req);
      const s = validId(b.clientId) ? students.get(b.clientId) : null;
      if (!s) { json(res, 410, { error: 'unknown-client' }); return; }
      const words = b.words;
      const allowed = enabledTexts();
      if (!Array.isArray(words) || words.length < 2 || words.length > MAX_WORDS ||
          !words.every(function (w) { return typeof w === 'string' && allowed.has(w); })) {
        json(res, 400, { error: 'bad-words' }); return;
      }
      const now = Date.now();
      if (now - s.lastSubmit < SUBMIT_GAP_MS) { json(res, 429, { error: 'too-fast' }); return; }
      const to = pickTarget(s.group);
      if (to == null) { json(res, 409, { error: 'no-target' }); return; }
      s.lastSubmit = now;
      proposals.push({
        id: ++propSeq, from: s.group, to: to, text: words.join(' '), at: now,
        status: 'pending', reason: '', novelty: null, sincerity: null, score: null, answeredAt: null
      });
      if (proposals.length > 5000) proposals = proposals.slice(-5000);
      schedule();
      json(res, 200, { to: to });
      return;
    }
    if (req.method === 'POST' && p === '/api/respond') {
      const b = await readBody(req);
      const s = validId(b.clientId) ? students.get(b.clientId) : null;
      if (!s) { json(res, 410, { error: 'unknown-client' }); return; }
      const prop = proposals.find(function (x) { return x.id === b.id; });
      if (!prop || prop.to !== s.group) { json(res, 404, { error: 'not-found' }); return; }
      if (prop.status !== 'pending') { json(res, 409, { error: 'already-answered' }); return; }
      const decision = b.decision === 'accept' ? 'accepted' : b.decision === 'reject' ? 'rejected' : null;
      const okPart = function (n) { return Number.isInteger(n) && n >= 0 && n <= MAX_PART; };
      if (!decision || !okPart(b.novelty) || !okPart(b.sincerity)) { json(res, 400, { error: 'bad-answer' }); return; }
      prop.status = decision;
      prop.reason = typeof b.reason === 'string' ? b.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      prop.novelty = b.novelty;
      prop.sincerity = b.sincerity;
      prop.score = b.novelty + b.sincerity;
      prop.answeredAt = Date.now();
      schedule();
      json(res, 200, { ok: true, score: prop.score });
      return;
    }

    /* 교사 */
    if (req.method === 'POST' && p === '/api/teacher/login') {
      const b = await readBody(req);
      if (typeof b.pin === 'string' && safeEqual(b.pin, TEACHER_PIN)) {
        const t = crypto.randomBytes(24).toString('hex');
        teacherTokens.add(t);
        json(res, 200, { token: t });
      } else {
        setTimeout(function () { json(res, 401, { error: 'bad-pin' }); }, 600);
      }
      return;
    }
    if (p.startsWith('/api/teacher/')) {
      const tok = teacherToken(req, url);
      if (!tok) { res.writeHead(401); res.end(); return; }

      if (req.method === 'GET' && p === '/api/teacher/stream') {
        sse(res);
        teacherStreams.add(res);
        send(res, teacherSnapshot());
        req.on('close', function () { teacherStreams.delete(res); });
        return;
      }
      if (req.method === 'GET' && p === '/api/teacher/deck.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="deck.json"' });
        res.end(JSON.stringify(deck, null, 2));
        return;
      }
      if (req.method === 'POST' && p === '/api/teacher/deck') {
        const b = await readBody(req);
        const cards = cleanCards(b.cards);
        if (CATS.indexOf(b.key) < 0 || !cards) { json(res, 400, { error: 'bad-deck' }); return; }
        deck[b.key].cards = cards;
        schedule();
        json(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && p === '/api/teacher/wipe') {
        const b = await readBody(req);
        proposals = [];
        if (b.kind === 'all') {
          students.forEach(function (s) {
            s.streams.forEach(function (r) { send(r, { type: 'reset' }); try { r.end(); } catch (e) { /* skip */ } });
          });
          students.clear();
          nextGroup = 1;
        }
        schedule();
        json(res, 200, { ok: true });
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('없는 주소예요.');
  } catch (e) {
    try { json(res, 400, { error: 'bad-request' }); } catch (e2) { /* skip */ }
  }
});

server.keepAliveTimeout = 65000;
server.listen(PORT, function () {
  console.log('프로포즈 대작전 서버가 켜졌어요: 포트 ' + PORT);
  console.log('학생 화면: /   교사 화면: /teacher');
});
