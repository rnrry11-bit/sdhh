(function () {
  'use strict';
  var C = window.C, h = C.h, CATS = C.CATS, post = C.post;
  var root = document.getElementById('app');

  var token = null;
  try { token = sessionStorage.getItem('tt'); } catch (e) { /* 저장 불가 */ }

  var S = { members: [], proposals: [], deck: {}, deckLoaded: false, tTab: 'status', eCat: 'subject', dirty: {}, confirm: '', minKinds: 4, questions: [], qDirty: false, qSaved: '', jailSig: '', toolsSig: '', tabSig: '' };
  var R = {};
  var Q = {}, T = {};
  var es = null;

  /* ---------- 로그인 ---------- */
  function showLogin(msg) {
    if (es) { es.close(); es = null; }
    var pin = h('input', { type: 'password', id: 'pin', autocomplete: 'current-password', 'aria-label': '교사 비밀번호', style: 'padding:8px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--surface);min-width:0;flex:1 1 180px' });
    var note = h('p', { class: 'status warn', text: msg || '' });
    function go() {
      note.textContent = '확인하는 중이에요…';
      post('/api/teacher/login', { pin: pin.value }).then(function (r) {
        if (r.ok) { token = r.body.token; try { sessionStorage.setItem('tt', token); } catch (e) { /* 저장 불가 */ } start(); }
        else { note.textContent = '비밀번호가 맞지 않아요.'; pin.select(); }
      }).catch(function () { note.textContent = '서버에 연결하지 못했어요.'; });
    }
    pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    root.replaceChildren(
      h('header', { class: 'top' }, h('div', null, h('h1', { text: '프로포즈 대작전' }), h('p', { class: 'sub', text: '교사용 화면' }))),
      h('div', { class: 'notice' },
        h('p', { text: '교사 비밀번호를 입력해 주세요.' }),
        h('div', { class: 'addrow' }, pin, h('button', { class: 'btn primary', type: 'button', onclick: go }, '들어가기')),
        note)
    );
    pin.focus();
  }

  function start() {
    build();
    if (es) es.close();
    es = new EventSource('/api/teacher/stream?token=' + encodeURIComponent(token));
    es.onmessage = function (ev) {
      var d;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type !== 'state') return;
      S.members = d.members; S.proposals = d.proposals; S.minKinds = d.minKinds || 4;
      if (!S.qDirty) S.questions = C.clone(d.questions || []);
      CATS.forEach(function (c) {
        if (S.dirty[c.key]) return;
        var x = d.deck[c.key];
        S.deck[c.key] = { cards: x && Array.isArray(x.cards) ? C.clone(x.cards) : [] };
      });
      S.deckLoaded = true;
      paintTabs(); paintLive(); paintAnalysis(); paintJail(); paintQuiz(false);
      paintEditor(false);
    };
    es.onerror = function () {
      if (es && es.readyState === 2) { try { sessionStorage.removeItem('tt'); } catch (e) { /* 저장 불가 */ } token = null; showLogin('다시 로그인해 주세요.'); }
    };
  }

  /* ---------- 화면 ---------- */
  function build() {
    R = {};
    R.stats = h('div', { class: 'stats' });
    R.groups = h('div');
    R.feed = h('div');
    R.tools = h('div', { class: 'toolbar' });
    R.copyArea = h('div');
    R.live = h('div', { style: 'display:flex;flex-direction:column;gap:22px' }, R.stats, R.tools, R.copyArea, h('div', { class: 'two' }, R.groups, R.feed));
    R.cats = h('div', { class: 'cats', role: 'group', 'aria-label': '카드 종류' });
    R.editor = h('div', { style: 'display:flex;flex-direction:column;gap:14px' });
    R.review = h('div', { style: 'display:flex;flex-direction:column;gap:14px' }, R.cats, R.editor);
    R.analysis = h('div', { class: 'tpane' });
    R.jail = h('div', { class: 'tpane' });
    R.quiz = h('div', { class: 'tpane' });
    R.tabs = h('div', { class: 'tabs' });
    var studentUrl = location.origin + '/';
    R.link = h('p', { class: 'sub' }, '학생들에게 알려 줄 주소: ', h('b', { text: studentUrl }));
    root.replaceChildren(
      h('header', { class: 'top' }, h('div', null, h('h1', { text: '프로포즈 대작전' }), R.link)),
      R.tabs, R.live, R.analysis, R.jail, R.quiz, R.review
    );
    S.tabSig = '';
    paintTabs(); paintLive(); paintAnalysis(); paintJail(); paintQuiz(true); paintEditor(true);
  }
  var TABS = [['status', '활동 현황'], ['analysis', '문장 성분 분석'], ['jail', '외톨이의 방'], ['quiz', '문제 준비'], ['cards', '단어 카드 검수']];
  function jailedCount() { return S.members.filter(function (m) { return m.jail; }).length; }
  function paintTabs() {
    var jc = jailedCount();
    var sig = S.tTab + '|' + jc;
    if (sig !== S.tabSig) {
      S.tabSig = sig;
      var focusKey = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-tab');
      R.tabs.replaceChildren.apply(R.tabs, TABS.map(function (t) {
        var b = h('button', { class: 'tab', type: 'button', 'data-tab': t[0], 'aria-pressed': String(S.tTab === t[0]),
          onclick: function () { S.tTab = t[0]; paintTabs(); paintAnalysis(); paintJail(); paintQuiz(true); paintEditor(true); } },
          t[1], t[0] === 'jail' && jc ? h('small', { text: '(' + jc + ')' }) : null);
        return b;
      }));
      if (focusKey) { var f = R.tabs.querySelector('[data-tab="' + focusKey + '"]'); if (f) f.focus(); }
    }
    R.live.hidden = S.tTab !== 'status';
    R.analysis.hidden = S.tTab !== 'analysis';
    R.jail.hidden = S.tTab !== 'jail';
    R.quiz.hidden = S.tTab !== 'quiz';
    R.review.hidden = S.tTab !== 'cards';
  }

  function paintLive() {
    if (!R.stats) return;
    var online = S.members.filter(function (m) { return m.online; }).length;
    var answered = S.proposals.filter(function (p) { return p.status === 'accepted' || p.status === 'rejected'; });
    var acc = answered.filter(function (p) { return p.status === 'accepted'; }).length;
    var avg = answered.length ? (answered.reduce(function (a, p) { return a + p.score; }, 0) / answered.length).toFixed(1) : '–';
    function stat(v, label) { return h('div', { class: 'stat' }, h('b', { text: String(v) }), h('span', { text: label })); }
    R.stats.replaceChildren(
      stat(S.members.length, '입장한 조'),
      stat(online, '지금 접속 중'),
      stat(jailedCount(), '외톨이의 방에 있는 조'),
      stat(S.proposals.length, '제출된 프로포즈'),
      stat(acc, '수락'),
      stat(answered.length - acc, '거절'),
      stat(avg, '평균 점수 (10점 만점)')
    );
    var rows = S.members.map(function (m) {
      return h('tr', null,
        h('td', null, h('b', { text: m.group + '조' })),
        h('td', null, h('span', { class: 'dot' + (m.online ? ' on' : '') }), ' ', m.online ? '접속 중' : '나감'),
        h('td', { text: String(m.sent) }), h('td', { text: String(m.received) }),
        h('td', { text: String(m.replied) }), h('td', { text: String(m.accepted) }),
        h('td', { text: m.avg == null ? '–' : m.avg.toFixed(1) }));
    });
    R.groups.replaceChildren.apply(R.groups, [
      h('h2', { text: '조별 현황', style: 'margin-bottom:10px' }),
      rows.length
        ? h('div', { class: 'tablewrap' }, h('table', null,
            h('thead', null, h('tr', null, h('th', { text: '조' }), h('th', { text: '상태' }), h('th', { text: '보냄' }), h('th', { text: '받음' }),
              h('th', { text: '답장함' }), h('th', { text: '수락받음' }), h('th', { text: '평균 점수' }))),
            h('tbody', null, rows)))
        : h('p', { class: 'none', text: '아직 입장한 학생이 없어요. 주소를 학생들에게 알려 주세요.' }),
      rows.length ? h('p', { class: 'none', style: 'margin-top:8px', text: '답장함은 그 조가 답장한 개수, 수락받음은 그 조가 보낸 프로포즈 중 수락된 개수, 평균 점수는 그 조가 보낸 프로포즈가 받은 점수의 평균이에요.' }) : null
    ].filter(Boolean));
    var feedList = S.proposals.length
      ? h('ul', { class: 'msgs' }, S.proposals.slice(0, 60).map(function (m) { return C.msgItem(m, 'out'); }))
      : h('p', { class: 'none', text: '아직 제출된 문장이 없어요.' });
    R.feed.replaceChildren(h('h2', { text: '실시간 제출 목록', style: 'margin-bottom:10px' }), feedList);
    paintTools();
  }

  function paintTools() {
    var cfm = S.confirm;
    var tsig = cfm + '|' + S.proposals.length;
    if (tsig === S.toolsSig && R.tools.firstChild) return;
    S.toolsSig = tsig;
    function wipeBtn(kind, label, what) {
      if (cfm === kind) {
        return h('span', { class: 'confirm' }, h('span', { text: what + ' 지울까요?' }),
          h('button', { class: 'btn small danger', type: 'button', onclick: function () { doWipe(kind); } }, '지우기'),
          h('button', { class: 'btn small', type: 'button', onclick: function () { S.confirm = ''; paintTools(); } }, '취소'));
      }
      return h('button', { class: 'btn small danger', type: 'button', onclick: function () { S.confirm = kind; paintTools(); } }, label);
    }
    R.tools.replaceChildren(
      h('button', { class: 'btn small', type: 'button', onclick: copyResults, disabled: !S.proposals.length }, '결과 복사'),
      wipeBtn('proposals', '제출 기록 지우기', '제출 기록을'),
      wipeBtn('all', '새 활동 시작', '제출 기록과 조 번호를 모두')
    );
  }
  function doWipe(kind) {
    S.confirm = ''; paintTools();
    post('/api/teacher/wipe', { kind: kind }, token).then(paintTools);
  }
  function copyResults() {
    var lines = S.proposals.slice().reverse().map(function (p) {
      var base = p.from + '조: ' + p.text + ' -> ' + p.to + '조에게';
      if (p.status !== 'accepted' && p.status !== 'rejected') return base + ' [답장 대기]';
      return base + ' [' + (p.status === 'accepted' ? '수락' : '거절') + ' ' + p.score + '/10 (참신성 ' + p.novelty + ', 진심 ' + p.sincerity + ')' +
        (p.reason ? ' 이유: ' + p.reason : '') + ']';
    });
    var text = lines.join('\n');
    function fallback() {
      var ta = h('textarea', { class: 'copybox', readonly: true, id: 'copy-box', 'aria-label': '복사할 결과' });
      ta.value = text;
      R.copyArea.replaceChildren(ta);
      ta.focus(); ta.select();
    }
    try {
      navigator.clipboard.writeText(text).then(function () {
        R.copyArea.replaceChildren(h('p', { class: 'status ok', text: '복사했어요. (' + lines.length + '개)' }));
      }, fallback);
    } catch (e) { fallback(); }
  }
  function downloadDeck() {
    fetch('/api/teacher/deck.json', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.blob(); }).then(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'deck.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  /* ---------- 문장 성분 분석 ---------- */
  // 학생이 고른 카드의 종류(주어, 서술어 …)를 그대로 읽어서 문장을 분석해요.
  function analyse(p) {
    var parts = Array.isArray(p.parts) ? p.parts : [];
    var kinds = {};
    parts.forEach(function (x) { kinds[x.cat] = true; });
    var hasPred = !!kinds.predicate;
    var last = parts.length ? parts[parts.length - 1].cat : null;
    return { parts: parts, kinds: Object.keys(kinds).length, noPred: parts.length > 0 && !hasPred, predNotLast: hasPred && last !== 'predicate' };
  }
  function paintAnalysis() {
    if (!R.analysis || R.analysis.hidden) return;
    var list = S.proposals.filter(function (p) { return Array.isArray(p.parts) && p.parts.length; });
    var sig = JSON.stringify(list.slice(0, 80).map(function (p) { return [p.id, p.parts]; })) + list.length;
    if (sig === R.anSig) return;
    R.anSig = sig;
    var tally = {}, kindSum = 0, noPred = 0, predNotLast = 0;
    CATS.forEach(function (c) { tally[c.key] = 0; });
    var rows = list.map(function (p) {
      var a = analyse(p);
      a.parts.forEach(function (x) { if (tally[x.cat] != null) tally[x.cat]++; });
      kindSum += a.kinds; if (a.noPred) noPred++; if (a.predNotLast) predNotLast++;
      return { p: p, a: a };
    });
    var max = Math.max.apply(null, CATS.map(function (c) { return tally[c.key]; }).concat([1]));
    function stat(v, label) { return h('div', { class: 'stat' }, h('b', { text: String(v) }), h('span', { text: label })); }
    var items = rows.slice(0, 80).map(function (r) {
      var flags = [];
      if (r.a.noPred) flags.push(h('span', { class: 'flag', text: '서술어가 없어요' }));
      else if (r.a.predNotLast) flags.push(h('span', { class: 'flag', text: '서술어가 문장 끝에 오지 않았어요' }));
      else flags.push(h('span', { class: 'flag good', text: '서술어로 끝나요' }));
      return h('li', { class: 'an' },
        h('div', { class: 'anhead' }, h('b', { text: r.p.from + '조' }), '→ ' + r.p.to + '조 · 문장 성분 ' + r.a.kinds + '가지'),
        h('div', { class: 'parts' }, r.a.parts.map(function (x) {
          var c = C.catByKey(x.cat) || { name: x.cat, n: 1 };
          return h('span', { class: 'part k' + c.n }, h('span', { text: x.text }), h('em', { text: c.name }));
        })),
        h('div', { class: 'flags' }, flags));
    });
    R.analysis.replaceChildren(
      h('p', { class: 'hint', style: 'margin:0', text: '학생이 고른 카드의 종류를 읽어서 자동으로 분석해요. 서술어는 문장 맨 끝에 와야 자연스러워요.' }),
      h('div', { class: 'stats' },
        stat(list.length, '분석한 문장'),
        stat(list.length ? (kindSum / list.length).toFixed(1) : '–', '문장당 평균 성분 수'),
        stat(noPred, '서술어 없는 문장'),
        stat(predNotLast, '서술어가 끝에 없는 문장')),
      h('div', null, h('h2', { text: '성분별로 쓰인 횟수', style: 'margin-bottom:10px' }),
        h('div', { class: 'tally' }, CATS.map(function (c) {
          return h('div', { class: 'tallyrow k' + c.n },
            h('span', { class: 'tallyname', text: c.name }),
            h('div', { class: 'tallybar' }, h('i', { style: 'width:' + Math.round(tally[c.key] / max * 100) + '%' })),
            h('b', { text: String(tally[c.key]) }));
        }))),
      h('div', null, h('h2', { text: '문장별 분석 (최근 ' + Math.min(80, rows.length) + '개)', style: 'margin-bottom:10px' }),
        items.length ? h('ul', { class: 'msgs' }, items) : h('p', { class: 'none', text: '아직 분석할 문장이 없어요.' })));
  }

  /* ---------- 외톨이의 방 ---------- */
  function usable() { return S.questions.filter(function (x) { return x.q && x.a; }).length; }
  function sinceText(ts) { return C.timeText(ts) + '부터'; }
  function jailPost(kind, group) { post('/api/teacher/' + kind, { group: group }, token); }
  function paintJail() {
    if (!R.jail || R.jail.hidden) return;
    var sig = JSON.stringify([usable(), S.members.map(function (m) {
      var j = m.jail;
      return [m.group, m.online, j && [j.reason, j.byGroup, j.since, j.question, j.answer, j.lockLeftMs > 0]];
    })]);
    if (sig === S.jailSig) return;
    S.jailSig = sig;
    var inside = S.members.filter(function (m) { return m.jail; });
    var outside = S.members.filter(function (m) { return !m.jail; });
    var cards = inside.map(function (m) {
      var j = m.jail;
      var lock = h('p', { class: 'jlock' });
      lock._until = j.lockLeftMs > 0 ? Date.now() + j.lockLeftMs : 0;
      lock.className = 'jlock';
      return h('div', { class: 'jcard' },
        h('h3', null, m.group + '조 ', h('span', { class: 'dot' + (m.online ? ' on' : ''), title: m.online ? '접속 중' : '나감' })),
        h('p', { text: (j.reason === 'rejected' ? (j.byGroup ? j.byGroup + '조에게 거절당함' : '거절당함') : '선생님이 보냄') + ' · ' + sinceText(j.since) }),
        j.question ? h('p', { class: 'jq', text: '문제: ' + j.question }) : h('p', { class: 'jq', text: '준비된 문제가 없어요. 석방해 주세요.' }),
        j.question ? h('p', { text: '정답: ' + j.answer }) : null,
        lock,
        h('button', { class: 'btn small primary', type: 'button', onclick: function () { jailPost('release', m.group); } }, '석방'));
    });
    R.jail.replaceChildren.apply(R.jail, [
      usable() ? null : h('div', { class: 'warnbar', text: '준비된 문제가 없어요. 문제 준비 탭에서 문제와 정답을 적어 두세요. 문제가 없으면 선생님이 석방해야만 나올 수 있어요.' }),
      h('div', null, h('h2', { text: '방 안에 있는 조 (' + inside.length + ')', style: 'margin-bottom:10px' }),
        cards.length ? h('div', { class: 'jgrid' }, cards) : h('p', { class: 'none', text: '지금 외톨이의 방에 있는 조는 없어요. 고백이 거절되면 자동으로 들어와요.' })),
      h('div', null, h('h2', { text: '방 밖에 있는 조', style: 'margin-bottom:10px' }),
        outside.length ? h('div', { class: 'outlist' }, outside.map(function (m) {
          return h('span', { class: 'outitem' },
            h('span', { class: 'dot' + (m.online ? ' on' : '') }), h('b', { text: m.group + '조' }),
            h('button', { class: 'btn small danger', type: 'button', onclick: function () { jailPost('jail', m.group); } }, '투옥시키기'));
        })) : h('p', { class: 'none', text: '방 밖에 있는 조가 없어요.' }))
    ].filter(Boolean));
    tickLock();
  }
  function tickLock() {
    if (!R.jail) return;
    Array.prototype.forEach.call(R.jail.querySelectorAll('.jlock'), function (el) {
      var left = el._until ? Math.ceil((el._until - Date.now()) / 1000) : 0;
      var t = left > 0 ? '오답 잠금 ' + left + '초 남음' : '';
      if (el.textContent !== t) el.textContent = t;
    });
  }
  setInterval(tickLock, 500);

  /* ---------- 문제 준비 ---------- */
  var QT = null, QSEQ = 0;
  function qTouch() {
    S.qDirty = true; var seq = ++QSEQ;
    clearTimeout(QT);
    QT = setTimeout(function () { qSave(seq); }, 700);
  }
  function qSave(seq) {
    post('/api/teacher/questions', { questions: C.clone(S.questions) }, token).then(function (r) {
      if (seq === QSEQ) S.qDirty = !r.ok;
      if (R.qstatus) { R.qstatus.textContent = r.ok ? '저장했어요.' : '저장하지 못했어요. 다시 시도해 주세요.'; R.qstatus.className = 'status ' + (r.ok ? 'ok' : 'warn'); }
    }).catch(function () { if (R.qstatus) { R.qstatus.textContent = '저장하지 못했어요.'; R.qstatus.className = 'status warn'; } });
  }
  function downloadQuestions() {
    fetch('/api/teacher/questions.json', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { return r.blob(); }).then(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'questions.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }
  function paintQuiz(force) {
    if (!R.quiz || R.quiz.hidden) return;
    if (!force && R.quiz.contains(document.activeElement)) return;
    var sig = JSON.stringify(S.questions);
    if (!force && R.qSig === sig) return;
    R.qSig = sig;
    R.qstatus = h('span', { class: 'status', 'aria-live': 'polite' });
    var rows = S.questions.map(function (x, i) {
      var q = h('textarea', { id: 'qq-' + i, maxlength: '200', 'aria-label': '문제' }); q.value = x.q;
      var a = h('input', { type: 'text', id: 'qa-' + i, maxlength: '100', 'aria-label': '정답' }); a.value = x.a;
      var note = h('span', { class: 'none' });
      function mark() { var ok = x.q.trim() && x.a.trim(); note.textContent = ok ? '' : '문제와 정답을 모두 적어야 학생에게 나가요.'; row.classList.toggle('off', !ok); }
      var row = h('div', { class: 'qrow' },
        h('div', null, h('label', { for: 'qq-' + i, text: (i + 1) + '번 문제' }), q),
        h('div', null, h('label', { for: 'qa-' + i, text: '정답' }), a),
        h('div', { class: 'qrowfoot' }, note,
          h('button', { class: 'xbtn', type: 'button', 'aria-label': (i + 1) + '번 문제 지우기', onclick: function () { S.questions.splice(i, 1); qTouch(); paintQuiz(true); } }, '지우기')));
      q.addEventListener('input', function () { x.q = q.value; mark(); qTouch(); });
      a.addEventListener('input', function () { x.a = a.value; mark(); qTouch(); });
      mark();
      return row;
    });
    var nq = h('textarea', { id: 'new-q', maxlength: '200', placeholder: '예) 문장에서 “무엇을”에 해당하는 성분은?' });
    var na = h('input', { type: 'text', id: 'new-a', maxlength: '100', placeholder: '예) 목적어' });
    var addMsg = h('p', { class: 'status warn', style: 'margin:0' });
    function doAdd() {
      var q = nq.value.trim(), a = na.value.trim();
      if (!q || !a) { addMsg.textContent = '문제와 정답을 모두 적어 주세요.'; return; }
      if (S.questions.length >= 60) { addMsg.textContent = '문제는 60개까지 만들 수 있어요.'; return; }
      S.questions.push({ id: 'q' + Date.now().toString(36), q: q, a: a });
      qTouch(); paintQuiz(true);
      var nx = document.getElementById('new-q'); if (nx) nx.focus();
    }
    R.quiz.replaceChildren(
      h('p', { class: 'hint', style: 'margin:0', text: '외톨이의 방에 들어온 조에게 문제를 하나씩 내요. 정답이 여러 개면 “목적어/목적격 조사”처럼 /로 나눠 적어요. 띄어쓰기와 문장부호는 달라도 정답으로 쳐요.' }),
      h('div', { class: 'qadd' },
        h('div', null, h('label', { for: 'new-q', text: '문제' }), nq),
        h('div', null, h('label', { for: 'new-a', text: '정답' }), na),
        h('div', { class: 'addrow' }, h('button', { class: 'btn primary', type: 'button', onclick: doAdd }, '문제 추가'), addMsg)),
      h('h2', { text: '준비한 문제 (' + S.questions.length + ')' }),
      rows.length ? h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, rows) : h('p', { class: 'none', text: '아직 준비한 문제가 없어요.' }),
      h('div', { class: 'addrow' }, h('button', { class: 'btn small', type: 'button', onclick: downloadQuestions }, '문제 전체 내려받기 (questions.json)'), R.qstatus,
        h('span', { class: 'none', text: '서버를 다시 켜면 문제는 처음 상태로 돌아가요. 계속 쓰려면 내려받아 GitHub의 questions.json을 바꿔 주세요.' })));
  }

  /* ---------- 카드 검수 ---------- */
  function paintEditor(force) {
    if (!R.editor) return;
    R.cats.replaceChildren.apply(R.cats, CATS.map(function (c) {
      var total = (S.deck[c.key] && S.deck[c.key].cards || []).length;
      return h('button', { class: 'cat k' + c.n, type: 'button', 'aria-pressed': String(S.eCat === c.key),
        onclick: function () { S.eCat = c.key; paintEditor(true); } }, c.name, h('small', { text: String(total) }));
    }));
    if (!force && R.editor.contains(document.activeElement)) return;
    var key = S.eCat, cat = C.catByKey(key);
    var cards = (S.deck[key] && S.deck[key].cards) || [];
    var sig = key + JSON.stringify(cards);
    if (!force && R.edSig === sig) return;
    R.edSig = sig;
    var all = 0, on = 0;
    CATS.forEach(function (c) { var l = (S.deck[c.key] && S.deck[c.key].cards) || []; all += l.length; on += l.filter(function (x) { return x.on !== false; }).length; });

    var rows = cards.map(function (c, i) {
      var cb = h('input', { type: 'checkbox', id: 'on-' + c.id, checked: c.on !== false ? true : null, 'aria-label': '학생에게 보이기' });
      var tx = h('input', { type: 'text', id: 'card-' + c.id, value: c.text, maxlength: '30', 'aria-label': cat.name + ' 카드 글자' });
      var row = h('div', { class: 'edrow k' + cat.n + (c.on === false ? ' off' : '') }, cb, tx,
        h('button', { class: 'xbtn', type: 'button', 'aria-label': '카드 지우기', onclick: function () { cards.splice(i, 1); touch(key, true); paintEditor(true); } }, '지우기'));
      cb.addEventListener('change', function () { c.on = cb.checked; row.classList.toggle('off', !cb.checked); touch(key, true); });
      tx.addEventListener('input', function () { c.text = tx.value; touch(key); });
      tx.addEventListener('blur', function () { flush(key); });
      return row;
    });
    var addIn = h('input', { type: 'text', id: 'add-' + key, maxlength: '30', placeholder: cat.name + ' 카드 새로 만들기', 'aria-label': '새 ' + cat.name + ' 카드' });
    function doAdd() {
      var t = addIn.value.trim();
      if (!t) return;
      if (!S.deck[key]) S.deck[key] = { cards: [] };
      S.deck[key].cards.push({ id: key + '-' + Date.now().toString(36), text: t, on: true });
      touch(key, true); paintEditor(true);
      var next = document.getElementById('add-' + key); if (next) next.focus();
    }
    addIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });
    R.editor.replaceChildren(
      h('p', { class: 'hint', style: 'margin:0', text: cat.hint + ' · 체크를 끄면 학생 화면에서 숨겨져요. 전체 ' + all + '장 중 ' + on + '장이 보여요.' }),
      cards.length ? h('div', { class: 'edlist' }, rows) : h('p', { class: 'none', text: '이 종류의 카드가 아직 없어요. 아래에서 만들어 보세요.' }),
      h('div', { class: 'addrow' }, addIn, h('button', { class: 'btn', type: 'button', onclick: doAdd }, '카드 추가')),
      h('div', { class: 'addrow' }, h('button', { class: 'btn small', type: 'button', onclick: downloadDeck }, '카드 전체 내려받기 (deck.json)'),
        h('span', { class: 'none', text: '서버를 다시 켜면 고친 카드는 처음 상태로 돌아가요. 계속 쓰려면 내려받아 deck.json 파일을 바꿔 주세요.' }))
    );
  }
  function touch(key, now) {
    S.dirty[key] = true;
    clearTimeout(T[key]);
    if (now) saveCat(key);
    else T[key] = setTimeout(function () { saveCat(key); }, 700);
  }
  function flush(key) { if (S.dirty[key]) { clearTimeout(T[key]); saveCat(key); } }
  function saveCat(key) {
    var q = Q[key] || (Q[key] = { busy: false, again: false });
    if (q.busy) { q.again = true; return; }
    q.busy = true;
    (function loop() {
      q.again = false;
      post('/api/teacher/deck', { key: key, cards: C.clone((S.deck[key] && S.deck[key].cards) || []) }, token).then(function () {
        if (q.again) loop(); else { q.busy = false; S.dirty[key] = false; }
      }).catch(function () { q.busy = false; S.dirty[key] = false; });
    })();
  }

  if (token) start(); else showLogin('');
})();
