(function () {
  'use strict';
  var C = window.C, h = C.h, CATS = C.CATS, post = C.post;
  var root = document.getElementById('app');
  var MAX_CARDS = 14;
  var MAX_PART = 5;     // 참신성 5점 + 진심 5점 = 10점 만점
  var LOCK_MS = 10000;  // 오답 뒤 문제를 못 푸는 시간 (화면의 막대 길이 계산용, 실제 잠금은 서버가 해요)

  var QUIPS = [
    '거미가 유일한 친구예요. 이름은 아직 없어요.',
    '혼자 놀기 1일차. 벌써 달인이 되어 가요.',
    '괜찮아요. 고백은 다시 하면 돼요. 문제만 풀면요!',
    '여기 와이파이는 잘 터져요. 친구는 안 터져요.',
    '그림자랑 가위바위보를 해 봤지만 계속 비겨요.'
  ];
  // 외톨이의 방 그림: 직접 그린 그림이에요. 깜빡이는 전구, 비구름, 천장에서 내려온 거미, 굴러가는 먼지 뭉치
  var SCENE_SVG =
    '<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="어두운 작은 방에서 의자에 혼자 앉아 풀이 죽은 동그란 캐릭터. 머리 위에서는 비구름이 비를 뿌리고, 천장에서 내려온 거미 한 마리가 유일한 친구예요.">' +
    '<rect width="320" height="200" fill="#232552"/>' +
    '<rect y="152" width="320" height="48" fill="#161838"/>' +
    '<rect x="22" y="20" width="54" height="64" rx="4" fill="#0E1030"/>' +
    '<circle cx="46" cy="46" r="11" fill="#FFE9A8"/><circle cx="52" cy="42" r="10" fill="#0E1030"/>' +
    '<circle cx="62" cy="68" r="1.6" fill="#FFE9A8"/><circle cx="34" cy="70" r="1.2" fill="#FFE9A8"/>' +
    '<rect x="22" y="20" width="54" height="64" rx="4" fill="none" stroke="#6C72B8" stroke-width="3"/>' +
    '<path d="M40 20v64M58 20v64" stroke="#6C72B8" stroke-width="3"/>' +
    '<rect x="92" y="22" width="58" height="30" rx="3" fill="#F2E8C9"/>' +
    '<text x="121" y="35" text-anchor="middle" font-size="10" fill="#232552">혼자 놀기</text>' +
    '<text x="121" y="47" text-anchor="middle" font-size="10" fill="#232552">1일차</text>' +
    '<path d="M160 0v37" stroke="#6C72B8" stroke-width="2"/>' +
    '<path d="M154 54L108 152H212L166 54z" fill="#FFE9A8" opacity=".10"/>' +
    '<circle class="s-glow" cx="160" cy="46" r="20" fill="#FFE9A8" opacity=".16"/>' +
    '<circle class="s-bulb" cx="160" cy="46" r="9" fill="#FFE9A8"/>' +
    '<rect class="s-thread" x="261.4" y="0" width="1.2" height="74" fill="#8A90D8"/>' +
    '<g class="s-spider"><circle cx="262" cy="79" r="6" fill="#0B0C22"/><circle cx="260" cy="77.5" r="1.3" fill="#FFE9A8"/><circle cx="264" cy="77.5" r="1.3" fill="#FFE9A8"/>' +
    '<path d="M256 77l-8-5M256 80l-9 1M256 83l-8 5M268 77l8-5M268 80l9 1M268 83l8 5" stroke="#0B0C22" stroke-width="1.6" stroke-linecap="round"/></g>' +
    '<path d="M150 156l-6 14M190 156l6 14" stroke="#5B4B8A" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="146" y="150" width="48" height="7" rx="3" fill="#7A66B8"/>' +
    '<ellipse cx="170" cy="128" rx="30" ry="26" fill="#C9C2FF" stroke="#0B0C22" stroke-width="3"/>' +
    '<circle cx="160" cy="125" r="3.2" fill="#0B0C22"/><circle cx="180" cy="125" r="3.2" fill="#0B0C22"/>' +
    '<path d="M153 117l11 4M187 117l-11 4" stroke="#0B0C22" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M163 140q7-6 14 0" fill="none" stroke="#0B0C22" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M159 130q-3.5 6 0 8.5q3.5-2.5 0-8.5z" fill="#7CC8FF"/>' +
    '<g fill="#8FA3C7"><ellipse cx="170" cy="88" rx="27" ry="9"/><circle cx="154" cy="84" r="9"/><circle cx="171" cy="79" r="11"/><circle cx="187" cy="84" r="8"/></g>' +
    '<g class="s-rain" stroke="#7CC8FF" stroke-width="2.2" stroke-linecap="round"><path d="M158 97v6"/><path d="M170 99v6"/><path d="M182 97v6"/></g>' +
    '<g class="s-weed" fill="none" stroke="#8B7355" stroke-width="1.6" stroke-linecap="round"><circle cx="40" cy="170" r="9"/><path d="M31 170h18M40 161v18M34 164l12 12M46 164l-12 12"/></g>' +
    '<path d="M262 172h16v7l-7 6h-9z" fill="#E88FB4"/><path d="M262 172h16" stroke="#F6C6DA" stroke-width="3"/>' +
    '</svg>';

  var pid = null;
  try { pid = localStorage.getItem('pid'); } catch (e) { /* 저장 불가 */ }
  if (!pid) {
    pid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('p' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { localStorage.setItem('pid', pid); } catch (e) { /* 저장 불가 */ }
  }

  var S = {
    state: 'boot', group: null, others: 0, conn: true,
    deck: {}, deckSig: '', inbox: [], outbox: [],
    cat: 'subject', tray: [], sending: false, msg: '', kind: '',
    drafts: {}, inboxSig: '',
    minKinds: 4, jail: null, lockUntil: 0, roomSig: '', answer: '', answering: false, wasLocked: false
  };
  var R = {};
  var es = null;

  function sentence() { return S.tray.map(function (c) { return c.text; }).join(' '); }
  function setStatus(msg, kind) { S.msg = msg; S.kind = kind || ''; if (R.status) { R.status.textContent = msg; R.status.className = 'status ' + (kind || ''); } }
  function pendingList() { return S.inbox.filter(function (m) { return m.status === 'pending'; }); }
  function usedKinds() {
    var used = {};
    S.tray.forEach(function (c) { used[c.key] = true; });
    return used;
  }

  /* ---------- 접속 ---------- */
  function join() {
    S.state = 'joining'; paintHeader();
    post('/api/join', { clientId: pid }).then(function (r) {
      if (r.ok) { S.group = r.body.group; S.state = 'ready'; openStream(); paintAll(); }
      else { S.state = 'error'; paintHeader(); setTimeout(join, 3000); }
    }).catch(function () { S.state = 'error'; paintHeader(); setTimeout(join, 3000); });
  }
  function openStream() {
    if (es) es.close();
    es = new EventSource('/api/stream?clientId=' + encodeURIComponent(pid));
    es.onmessage = function (ev) {
      var d;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === 'reset') {
        es.close(); es = null; S.group = null; S.tray = []; S.state = 'boot';
        S.drafts = {}; S.inbox = []; S.outbox = []; S.inboxSig = ''; S.jail = null; S.roomSig = ''; S.lockUntil = 0;
        paintHeader(); setTimeout(join, 400);
        return;
      }
      if (d.type === 'state') {
        var wasJailed = !!S.jail;
        S.group = d.group; S.others = d.others; S.inbox = d.inbox; S.outbox = d.outbox;
        S.conn = true; S.state = 'ready';
        S.minKinds = d.minKinds || 4;
        S.jail = d.jail || null;
        S.lockUntil = S.jail && S.jail.lockLeftMs > 0 ? Date.now() + S.jail.lockLeftMs : 0;
        var sig = JSON.stringify(d.deck);
        var deckChanged = sig !== S.deckSig;
        S.deck = d.deck; S.deckSig = sig;
        if (wasJailed && !S.jail) { S.answer = ''; setStatus('외톨이의 방에서 나왔어요! 이제 다시 고백할 수 있어요.', 'ok'); }
        paintHeader(); paintTray(); paintInbox(false);
        if (deckChanged) { paintCats(); paintDeck(); }
        if (!wasJailed && S.jail) {
          var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
          R.room.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        }
      }
    };
    es.onerror = function () {
      if (es && es.readyState === 2) { es.close(); es = null; S.state = 'boot'; paintHeader(); setTimeout(join, 1500); }
      else { S.conn = false; paintHeader(); }
    };
  }

  /* ---------- 화면 뼈대 ---------- */
  function build() {
    R.sub = h('p', { class: 'sub' });
    R.badge = h('div', { class: 'stamp' });
    R.notice = h('div', { class: 'notice', hidden: true });
    R.alert = h('button', {
      class: 'alertbar', type: 'button', hidden: true,
      onclick: function () {
        var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        R.inbox.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      }
    });
    R.room = h('section', { class: 'room', hidden: true, 'aria-label': '외톨이의 방' });
    R.cats = h('div', { class: 'cats', role: 'group', 'aria-label': '단어 카드 종류' });
    R.hint = h('p', { class: 'hint' });
    R.deck = h('div', { class: 'deck' });
    R.main = h('section', null, R.cats, R.hint, h('div', { style: 'height:12px' }), R.deck);
    R.chips = h('div', { class: 'chips' });
    R.say = h('p', { class: 'say' });
    R.kinds = h('div', { class: 'kinds', 'aria-hidden': 'true' }, CATS.map(function (c) {
      return h('span', { class: 'kpill k' + c.n, 'data-key': c.key, text: c.name });
    }));
    R.kindsText = h('span', { class: 'kindstext', 'aria-live': 'polite' });
    R.status = h('div', { class: 'status', 'aria-live': 'polite' });
    R.clear = h('button', { class: 'btn', type: 'button', onclick: function () { S.tray = []; setStatus('', ''); paintTray(); } }, '모두 지우기');
    R.send = h('button', { class: 'btn primary', type: 'button', onclick: submit }, '고백 전하기');
    R.tray = h('section', { class: 'tray', 'aria-label': '내가 만든 문장' },
      h('div', { class: 'tray-label' }, '내가 만든 문장'), R.chips, R.say,
      h('div', { class: 'kindsrow' }, R.kinds, R.kindsText),
      h('div', { class: 'tray-actions' }, R.send, R.clear, R.status));
    R.inbox = h('div', { class: 'two' });
    root.replaceChildren(
      h('header', { class: 'top' }, h('div', null, h('h1', { text: '프로포즈 대작전' }), R.sub), h('div', { class: 'headright' }, R.badge)),
      R.notice, R.alert, R.room, R.main, R.tray, R.inbox
    );
    paintAll();
  }
  function paintAll() { paintHeader(); paintCats(); paintDeck(); paintTray(); paintInbox(true); }

  function paintAlert() {
    if (!R.alert) return;
    var n = pendingList().length;
    R.alert.hidden = !(S.state === 'ready' && S.group && n > 0);
    R.alert.textContent = '답장을 기다리는 프로포즈가 ' + n + '개 있어요. 눌러서 답장하러 가기';
  }
  function paintHeader() {
    var ready = S.state === 'ready' && S.group;
    var jailed = !!(ready && S.jail);
    paintAlert();
    R.notice.hidden = true; R.notice.replaceChildren();
    R.main.hidden = !ready || jailed; R.tray.hidden = !ready || jailed; R.inbox.hidden = !ready;
    paintRoom();
    if (ready) {
      R.badge.hidden = false;
      R.badge.textContent = S.group + '조';
      R.sub.textContent = !S.conn
        ? '연결이 잠깐 끊겼어요. 다시 연결하는 중이에요…'
        : jailed
          ? '문제를 풀어야 다시 고백할 수 있어요. 받은 프로포즈에는 답장할 수 있어요.'
          : '단어 카드를 이어 붙여 고백 문장을 만들어요. 지금 접속한 다른 조는 ' + S.others + '개예요.';
      return;
    }
    R.badge.hidden = true;
    R.sub.textContent = '학급 프로포즈 활동';
    R.notice.hidden = false;
    var msg = S.state === 'error' ? '서버에 연결하지 못했어요. 잠시 뒤에 자동으로 다시 시도해요.' : '조 번호를 받는 중이에요. 접속한 순서대로 정해져요.';
    R.notice.append(h('p', { text: msg }));
  }

  /* ---------- 외톨이의 방 ---------- */
  function lockLeft() { return Math.max(0, S.lockUntil - Date.now()); }
  function setAnsMsg(msg, kind) { if (R.ansMsg) { R.ansMsg.textContent = msg; R.ansMsg.className = 'ansmsg ' + (kind || ''); } }

  function paintRoom() {
    var show = !!(S.state === 'ready' && S.group && S.jail);
    R.room.hidden = !show;
    if (!show) { S.roomSig = ''; return; }
    var j = S.jail;
    var sig = JSON.stringify([j.reason, j.byGroup, j.question, j.since]);
    if (sig !== S.roomSig) { S.roomSig = sig; buildRoom(); }
    paintLock();
  }
  function buildRoom() {
    var j = S.jail;
    var hadFocus = document.activeElement && document.activeElement.id === 'ans';
    var why = j.reason === 'rejected'
      ? (j.byGroup ? j.byGroup + '조에게 고백을 거절당했어요.' : '고백을 거절당했어요.')
      : '선생님이 외톨이의 방으로 보냈어요.';
    var scene = h('div', { class: 'scene' });
    scene.innerHTML = SCENE_SVG;   // 위에서 직접 만든 고정 그림이에요
    var body = [
      h('h2', { class: 'roomtitle', text: '외톨이의 방' }),
      h('p', { class: 'why', text: why }),
      h('p', { class: 'quip', text: QUIPS[Math.floor(Math.random() * QUIPS.length)] })
    ];
    if (j.question) {
      R.ans = h('input', { id: 'ans', class: 'ansinput', type: 'text', autocomplete: 'off', maxlength: '200', 'aria-label': '정답', placeholder: '정답을 적어요' });
      R.ans.value = S.answer;
      R.ans.addEventListener('input', function () { S.answer = R.ans.value; });
      R.ansBtn = h('button', { class: 'btn primary', type: 'submit', id: 'ansbtn' }, '탈출하기');
      R.ansMsg = h('p', { class: 'ansmsg', 'aria-live': 'polite' });
      R.lockText = h('p', { class: 'locktext' });
      R.lockbar = h('div', { class: 'lockbar', 'aria-hidden': 'true' }, h('i'));
      R.qcard = h('div', { class: 'qcard' }, h('span', { class: 'qlabel', text: '문제' }), h('p', { class: 'qtext', text: j.question }));
      var form = h('form', { class: 'ansform' },
        h('label', { class: 'qlabel', for: 'ans', text: '정답' }),
        h('div', { class: 'ansrow' }, R.ans, R.ansBtn));
      form.addEventListener('submit', function (e) { e.preventDefault(); sendAnswer(); });
      body.push(R.qcard, form, R.lockbar, R.lockText, R.ansMsg);
    } else {
      R.ans = R.ansBtn = R.ansMsg = R.lockText = R.lockbar = R.qcard = null;
      body.push(h('p', { class: 'noq', text: '선생님이 아직 문제를 준비하지 않았어요. 선생님이 풀어 줄 때까지 조금만 기다려 주세요.' }));
    }
    R.room.replaceChildren(scene, h('div', { class: 'roomtext' }, body));
    if (hadFocus && R.ans) R.ans.focus({ preventScroll: true });
  }
  function paintLock() {
    if (!R.ans) return;
    var left = lockLeft(), locked = left > 0;
    R.ans.disabled = locked || S.answering;
    R.ansBtn.disabled = locked || S.answering;
    R.lockbar.className = 'lockbar' + (locked ? ' on' : '');
    R.lockbar.firstChild.style.width = (locked ? Math.min(100, left / LOCK_MS * 100) : 0) + '%';
    R.lockText.textContent = locked ? Math.ceil(left / 1000) + '초 뒤에 다시 풀 수 있어요.' : '';
    if (!locked && S.wasLocked) { setAnsMsg('다시 도전해 보세요!', ''); R.ans.focus({ preventScroll: true }); }
    S.wasLocked = locked;
  }
  function sendAnswer() {
    if (S.answering || lockLeft() > 0 || !R.ans) return;
    var v = R.ans.value;
    if (!v.trim()) { setAnsMsg('정답을 적어 주세요.', 'warn'); return; }
    S.answering = true; paintLock();
    post('/api/answer', { clientId: pid, answer: v }).then(function (r) {
      S.answering = false;
      if (r.ok && r.body.correct) {
        S.jail = null; S.answer = '';
        setStatus('탈출 성공! 이제 다시 고백할 수 있어요.', 'ok');
        paintHeader(); paintTray();
        return;
      }
      if (r.ok || r.status === 429) {
        S.lockUntil = Date.now() + (r.body.lockLeftMs || LOCK_MS);
        S.answer = ''; if (R.ans) R.ans.value = '';
        setAnsMsg(r.ok ? '땡! 틀렸어요.' : '아직 잠겨 있어요.', 'warn');
        if (R.qcard) { R.qcard.classList.remove('shake'); void R.qcard.offsetWidth; R.qcard.classList.add('shake'); }
      } else if (r.status === 409 || r.status === 400) {
        setAnsMsg('정답을 확인할 수 없어요. 잠시 뒤에 다시 눌러 주세요.', 'warn');
      } else if (r.status === 410) { join(); }
      else setAnsMsg('보내지 못했어요. 한 번 더 눌러 주세요.', 'warn');
      paintLock();
    }).catch(function () { S.answering = false; setAnsMsg('보내지 못했어요. 한 번 더 눌러 주세요.', 'warn'); paintLock(); });
  }
  setInterval(function () { if (S.jail && R.ans) paintLock(); }, 250);

  /* ---------- 카드와 문장 ---------- */
  function paintCats() {
    R.cats.replaceChildren.apply(R.cats, CATS.map(function (c) {
      return h('button', {
        class: 'cat k' + c.n, type: 'button', 'aria-pressed': String(S.cat === c.key),
        onclick: function () { S.cat = c.key; paintCats(); paintDeck(); }
      }, c.name, h('small', { text: String((S.deck[c.key] || []).length) }));
    }));
    R.hint.textContent = C.catByKey(S.cat).hint;
  }
  function paintDeck() {
    var cat = C.catByKey(S.cat);
    var cards = S.deck[cat.key] || [];
    if (!cards.length) { R.deck.replaceChildren(h('p', { class: 'empty', text: '이 종류의 카드는 아직 없어요. 다른 종류를 눌러 보세요.' })); return; }
    R.deck.replaceChildren.apply(R.deck, cards.map(function (c) {
      return h('button', { class: 'wc k' + cat.n, type: 'button', onclick: function () { addCard(cat, c); } }, c.text);
    }));
  }
  function addCard(cat, c) {
    if (S.tray.length >= MAX_CARDS) { setStatus('카드는 ' + MAX_CARDS + '장까지 쓸 수 있어요.', 'warn'); return; }
    S.tray.push({ text: c.text, n: cat.n, key: cat.key });
    setStatus('', '');
    paintTray();
  }
  function moveCard(i, d) {
    var j = i + d;
    if (j < 0 || j >= S.tray.length) return;
    var t = S.tray[i]; S.tray[i] = S.tray[j]; S.tray[j] = t;
    paintTray();
  }
  function paintTray() {
    R.chips.replaceChildren.apply(R.chips, S.tray.map(function (c, i) {
      return h('span', { class: 'chip k' + c.n },
        h('button', { type: 'button', 'aria-label': '앞으로 옮기기', onclick: function () { moveCard(i, -1); } }, '‹'),
        h('span', { text: c.text }),
        h('button', { type: 'button', 'aria-label': '뒤로 옮기기', onclick: function () { moveCard(i, 1); } }, '›'),
        h('button', { type: 'button', 'aria-label': '카드 빼기', onclick: function () { S.tray.splice(i, 1); paintTray(); } }, '×'));
    }));
    if (S.tray.length) { R.say.textContent = sentence(); R.say.className = 'say'; }
    else { R.say.textContent = '아래 카드를 눌러 문장을 만들어 보세요. 서로 다른 문장 성분을 ' + S.minKinds + '가지 이상 써야 해요.'; R.say.className = 'say ph'; }

    var used = usedKinds();
    var n = Object.keys(used).length, need = S.minKinds, enough = n >= need;
    Array.prototype.forEach.call(R.kinds.children, function (el) { el.classList.toggle('on', !!used[el.getAttribute('data-key')]); });
    R.kindsText.textContent = '문장 성분 ' + n + '가지 사용 · ' + (enough ? '고백할 수 있어요' : need + '가지 이상 써야 해요');
    R.kindsText.className = 'kindstext' + (enough ? ' good' : '');

    var noTarget = S.others === 0;
    R.send.disabled = S.sending || !enough || noTarget;
    R.clear.disabled = !S.tray.length;
    if (!S.msg && enough && noTarget) { R.status.textContent = '지금 접속한 다른 조가 없어요.'; R.status.className = 'status warn'; }
    else { R.status.textContent = S.msg; R.status.className = 'status ' + S.kind; }
  }

  function submit() {
    if (S.sending || Object.keys(usedKinds()).length < S.minKinds) return;
    S.sending = true; paintTray();
    var cards = S.tray.map(function (c) { return { cat: c.key, text: c.text }; });
    post('/api/submit', { clientId: pid, cards: cards }).then(function (r) {
      S.sending = false;
      if (r.ok) { S.tray = []; setStatus(r.body.to + '조에게 고백을 전했어요! 답장이 오면 아래에 나타나요.', 'ok'); }
      else if (r.status === 423) setStatus('지금은 외톨이의 방에 있어서 고백할 수 없어요.', 'warn');
      else if (r.status === 409) setStatus('지금 접속한 다른 조가 없어요. 잠시 뒤에 다시 눌러 보세요.', 'warn');
      else if (r.status === 429) setStatus('너무 빨라요. 잠깐 쉬었다가 다시 눌러 주세요.', 'warn');
      else if (r.status === 410) { setStatus('다시 연결하는 중이에요.', 'warn'); join(); }
      else if (r.body && r.body.error === 'few-kinds') setStatus('문장 성분을 ' + S.minKinds + '가지 이상 써 주세요.', 'warn');
      else setStatus('보내지 못했어요. 카드를 확인하고 한 번 더 눌러 주세요.', 'warn');
      paintTray();
    }).catch(function () { S.sending = false; setStatus('보내지 못했어요. 한 번 더 눌러 주세요.', 'warn'); paintTray(); });
  }

  /* ---------- 받은 프로포즈에 답장하기 ---------- */
  function draftOf(id) {
    return S.drafts[id] || (S.drafts[id] = { decision: null, reason: '', novelty: null, sincerity: null, sending: false, error: '' });
  }
  function missing(d) {
    if (!d.decision) return '수락할지 거절할지 먼저 골라 주세요.';
    if (d.novelty == null || d.sincerity == null) return '참신성과 진심 점수를 모두 골라 주세요.';
    return '';
  }
  function scoreRow(id, d, field, label) {
    var buttons = [];
    for (var v = 0; v <= MAX_PART; v++) {
      (function (v) {
        buttons.push(h('button', {
          type: 'button', class: 'segbtn', id: 'sc-' + id + '-' + field + '-' + v,
          'aria-pressed': String(d[field] === v),
          onclick: function () { d[field] = v; paintInbox(true); }
        }, String(v)));
      })(v);
    }
    return h('div', { class: 'segrow' },
      h('span', { class: 'seglabel', text: label }),
      h('div', { class: 'seg', role: 'group', 'aria-label': label + ' 점수 0점부터 ' + MAX_PART + '점' }, buttons));
  }
  function respCard(m) {
    var d = draftOf(m.id);
    var accept = d.decision === 'accept', reject = d.decision === 'reject';
    var label = accept ? '수락한 이유' : reject ? '거절한 이유' : '이유';
    var reason = h('textarea', {
      class: 'reason', id: 'rs-' + m.id, maxlength: '200', rows: '2', 'aria-label': label,
      placeholder: accept ? '왜 수락했나요? 마음에 든 단어나 표현을 적어 보세요.'
        : reject ? '왜 거절했나요? 아쉬웠던 점을 부드럽게 적어 보세요.'
        : '수락이나 거절을 고른 뒤 이유를 적어 보세요. (적지 않아도 보낼 수 있어요)'
    });
    reason.value = d.reason;
    var total = h('span', { class: 'total' });
    var hint = h('span', { class: 'hint2' });
    var sendBtn = h('button', { class: 'btn primary', type: 'button', id: 'sd-' + m.id, onclick: function () { sendAnswerCard(m, d); } }, d.sending ? '보내는 중…' : '답장 보내기');
    var both = d.novelty != null && d.sincerity != null;
    total.textContent = '합계 ' + (both ? d.novelty + d.sincerity : '–') + ' / 10';
    var miss = missing(d);
    sendBtn.disabled = d.sending || !!miss;
    hint.textContent = d.error || miss;
    reason.addEventListener('input', function () { d.reason = reason.value; });
    return h('li', { class: 'msg resp' },
      h('p', { class: 'ptext' }, h('b', { text: m.from + '조' }), String(m.text), h('time', { text: C.timeText(m.at) })),
      h('div', { class: 'decrow' },
        h('button', { type: 'button', class: 'dec ok', id: 'dc-' + m.id + '-accept', 'aria-pressed': String(accept), onclick: function () { d.decision = 'accept'; paintInbox(true); } }, '수락'),
        h('button', { type: 'button', class: 'dec no', id: 'dc-' + m.id + '-reject', 'aria-pressed': String(reject), onclick: function () { d.decision = 'reject'; paintInbox(true); } }, '거절')),
      reason,
      scoreRow(m.id, d, 'novelty', '참신성'),
      scoreRow(m.id, d, 'sincerity', '진심이 느껴지는지'),
      h('div', { class: 'respfoot' }, total, hint, sendBtn));
  }
  function sendAnswerCard(m, d) {
    if (d.sending || missing(d)) return;
    d.sending = true; d.error = ''; paintInbox(true);
    post('/api/respond', { clientId: pid, id: m.id, decision: d.decision, reason: d.reason, novelty: d.novelty, sincerity: d.sincerity }).then(function (r) {
      d.sending = false;
      if (r.ok) {
        // 서버 소식이 오기 전에 화면부터 바꿔요
        S.inbox.forEach(function (x) {
          if (x.id !== m.id) return;
          x.status = d.decision === 'accept' ? 'accepted' : 'rejected';
          x.reason = d.reason.replace(/\s+/g, ' ').trim().slice(0, 200);
          x.novelty = d.novelty; x.sincerity = d.sincerity; x.score = d.novelty + d.sincerity;
        });
        delete S.drafts[m.id];
        paintAlert();
      } else if (r.status === 409) d.error = '이미 답장한 프로포즈예요.';
      else if (r.status === 410) { d.error = '다시 연결하는 중이에요. 잠시 뒤에 다시 눌러 주세요.'; join(); }
      else d.error = '보내지 못했어요. 한 번 더 눌러 주세요.';
      paintInbox(true);
    }).catch(function () { d.sending = false; d.error = '보내지 못했어요. 한 번 더 눌러 주세요.'; paintInbox(true); });
  }

  function paintInbox(force) {
    if (!R.inbox) return;
    var sig = JSON.stringify([S.inbox, S.outbox]);
    if (!force && sig === S.inboxSig) return;
    S.inboxSig = sig;
    paintAlert();
    var ae = document.activeElement, keep = null;
    if (ae && ae.id && R.inbox.contains(ae)) keep = { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd };

    var pending = pendingList();
    var items = pending.map(respCard).concat(S.inbox.filter(function (m) { return m.status !== 'pending'; }).map(function (m) { return C.msgItem(m, 'in'); }));
    var inBody = items.length ? h('ul', { class: 'msgs' }, items) : h('p', { class: 'none', text: '아직 받은 프로포즈가 없어요. 곧 도착할 거예요.' });
    var outBody = S.outbox.length
      ? h('ul', { class: 'msgs' }, S.outbox.map(function (m) { return C.msgItem(m, 'out'); }))
      : h('p', { class: 'none', text: '아직 보낸 프로포즈가 없어요.' });
    R.inbox.replaceChildren(
      h('div', { class: 'panel' },
        h('h2', null, '우리 조가 받은 프로포즈', pending.length ? h('span', { class: 'pill waitpill', text: '답장 대기 ' + pending.length }) : null),
        inBody),
      h('div', { class: 'panel' }, h('h2', { text: '우리 조가 보낸 프로포즈' }), outBody)
    );
    if (keep) {
      var el = document.getElementById(keep.id);
      if (el) {
        el.focus({ preventScroll: true });
        try { if (keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch (e) { /* 선택 불가 */ }
      }
    }
  }

  build();
  join();
})();
