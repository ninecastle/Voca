/* app.js — 화면과 동작. 단어: words.js(WORDS), 기록 구조·병합: core.js(VocaCore), 서버 연동: sync.js */
const C = window.VocaCore;
const DATA = window.WORDS;
const BY = new Map(DATA.map(w => [w.n, w]));
const GROUPS = Array.from({ length: 9 }, (_, g) => ({
  g, d0: g * 5 + 1, d1: g * 5 + 5, from: g * 200 + 1, to: g * 200 + 200,
  ready: BY.has(g * 200 + 1) && BY.has(g * 200 + 200)
}));
const KEY = 'hackers-voca-hoedok-v2';
const KEY_V1 = 'hackers-voca-hoedok-v1';
const $app = document.getElementById('app');

/* ---------- 기기 id ---------- */
const DEV = (() => {
  try {
    let d = localStorage.getItem('voca-dev');
    if (!d) { d = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); localStorage.setItem('voca-dev', d); }
    return d;
  } catch (e) { return 'tmp'; }
})();
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- 기록 ---------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return C.parse(raw);
    const v1 = localStorage.getItem(KEY_V1);
    if (v1) { const m = C.migrateV1(JSON.parse(v1), Date.now(), DEV); try { localStorage.setItem(KEY, C.canon(m)); } catch (e) {} return C.clean(m); }
  } catch (e) {}
  return C.blank();
}
let S = load();
let lastSaved = '';
function save() {
  const str = C.canon(S);
  if (str !== lastSaved) {
    lastSaved = str;
    try { localStorage.setItem(KEY, str); } catch (e) {}
    pushSoon();
  }
}
const sess = () => C.activeSess(S);
const roundsDone = (g, m) => C.roundsOf(S, g, m);
const starList = () => C.starList(S).filter(n => BY.has(n));
function toggleStar(n) { S.stars[n] = { on: C.starOn(S, n) ? 0 : 1, at: Date.now() }; save(); }
let star = null; // { order, idx, cycle } — 별표 단어 랜덤 반복

/* ---------- helpers ---------- */
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function interleave(others, seq) {
  const total = others.length + seq.length;
  const slots = new Set(shuffle(range(0, total - 1)).slice(0, seq.length));
  const out = []; let a = 0, b = 0;
  for (let i = 0; i < total; i++) out.push(slots.has(i) ? seq[b++] : others[a++]);
  return out;
}
function fmt(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return h ? `${h}시간 ${m}분 ${r}초` : `${m}분 ${r}초`;
}
const gname = g => `DAY ${GROUPS[g].d0}~${GROUPS[g].d1}`;
const mname = m => m === 'cum' ? '누적' : '단일';
const pad4 = n => String(n).padStart(4, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function wordsOf(g, mode) { const G = GROUPS[g]; return mode === 'cum' ? range(1, G.to) : range(G.from, G.to); }
function orderNote(g, mode) {
  const seen = !!S.seen[g];
  if (mode === 'single') return seen ? '랜덤 순서' : '처음이라 순서대로';
  return seen ? '전체 랜덤 순서' : `앞 DAY는 랜덤, ${gname(g)}는 순서대로 사이사이에`;
}
const roundNo = s => roundsDone(s.g, s.mode).length + 1;
const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.9 9.1 4.5 4.5 0 0 0 7 18z"/></svg>'
};

/* ---------- 세션 ---------- */
function startSession(g, mode) {
  const G = GROUPS[g];
  let order;
  if (mode === 'single') order = S.seen[g] ? shuffle(wordsOf(g, mode)) : wordsOf(g, mode);
  else {
    const earlier = shuffle(range(1, G.from - 1)), target = range(G.from, G.to);
    order = S.seen[g] ? shuffle(earlier.concat(target)) : interleave(earlier, target);
  }
  S.sess = { sid: newId(), g, mode, order, idx: 0, lap: 1, review: [], elapsed: 0, lapEnd: false, startedAt: Date.now(), rev: 0, dev: DEV };
  save();
  enter('study');
}
function bump(s) { s.rev++; s.dev = DEV; }
function answer(known) {
  const s = sess(); if (!s || s.lapEnd || sheetOpen) return;
  if (!known) s.review.push(s.order[s.idx]);
  s.idx++; bump(s);
  reveal = { ko: false, ex: false };
  if (s.idx >= s.order.length) endLap(); else { save(); render(); }
  window.scrollTo({ top: 0 });
}
function endLap() {
  const s = sess(), now = Date.now();
  if (s.lap === 1) for (let g = (s.mode === 'cum' ? 0 : s.g); g <= s.g; g++) S.seen[g] = now;
  if (s.review.length === 0) {
    const done = { g: s.g, mode: s.mode, round: roundNo(s), elapsed: s.elapsed, laps: s.lap, words: wordsOf(s.g, s.mode).length };
    S.rounds[s.sid] = { g: s.g, mode: s.mode, ms: Math.round(s.elapsed), at: now, laps: s.lap, n: done.words };
    S.sess = null; save();
    goHome(); showDone(done);
    return;
  }
  s.lapEnd = true; save(); render(); showLapEnd();
}
function nextLap(keep) {
  const s = sess();
  s.order = keep ? s.review.slice() : shuffle(s.review);
  s.review = []; s.idx = 0; s.lap++; s.lapEnd = false; bump(s);
  save(); closeSheet(); render(); window.scrollTo({ top: 0 });
}

function startStar() {
  const list = starList(); if (!list.length) return;
  star = { order: shuffle(list), idx: 0, cycle: 1 };
  closeSheet(); enter('star');
}
function starNext() {
  if (!star || sheetOpen) return;
  star.idx++; reveal = { ko: false, ex: false };
  if (star.idx >= star.order.length) {
    const list = starList();
    if (!list.length) { star = null; goHome(); return; }
    const lastN = star.order[star.order.length - 1];
    let o = shuffle(list);
    if (o.length > 1 && o[0] === lastN) [o[0], o[1]] = [o[1], o[0]];
    star = { order: o, idx: 0, cycle: star.cycle + 1 };
  }
  render(); window.scrollTo({ top: 0 });
}

/* ---------- 화면 전환 + 안드로이드 뒤로가기 ---------- */
let view = 'home';
let reveal = { ko: false, ex: false };
let sheetOpen = false, pauseForSheet = false, sheetDismiss = true;
let suppressPop = false;
try { history.replaceState({ v: 'home' }, ''); } catch (e) {}
function enter(v) {
  view = v; reveal = { ko: false, ex: false };
  try { if (!history.state || history.state.v === 'home') history.pushState({ v, sheet: history.state && history.state.sheet ? 1 : 0 }, ''); } catch (e) {}
  render(); window.scrollTo({ top: 0 });
}
function goHome() {
  save(); star = null; view = 'home'; render(); window.scrollTo({ top: 0 });
  try { if (history.state && history.state.v !== 'home') { suppressPop = true; history.back(); } } catch (e) {}
}
window.addEventListener('popstate', () => {
  if (suppressPop) { suppressPop = false; return; }
  if (sheetOpen) {
    if (sheetDismiss) closeSheet();
    if (view !== 'home') { try { history.pushState({ v: view, sheet: history.state && history.state.sheet ? 1 : 0 }, ''); } catch (e) {} }
    return;
  }
  if (view !== 'home') { save(); star = null; view = 'home'; render(); window.scrollTo({ top: 0 }); }
});

/* ---------- 타이머 ---------- */
let last = performance.now(), sinceSave = 0, sincePush = 0;
function ticking() { return view === 'study' && sess() && !document.hidden && !pauseForSheet; }
setInterval(() => {
  const now = performance.now(), d = Math.min(now - last, 2000); last = now;
  if (!ticking()) return;
  const s = sess();
  s.elapsed += d; sinceSave += d; sincePush += d;
  if (sinceSave > 5000) { sinceSave = 0; const str = C.canon(S); lastSaved = str; try { localStorage.setItem(KEY, str); } catch (e) {} }
  if (sincePush > 60000) { sincePush = 0; pushSoon(); }
  const t = document.getElementById('time'); if (t) t.textContent = fmt(s.elapsed);
}, 500);
document.addEventListener('visibilitychange', () => { last = performance.now(); save(); if (!document.hidden) pushSoon(); });
window.addEventListener('pagehide', save);
document.addEventListener('keydown', e => {
  if ((view !== 'study' && view !== 'star') || sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (view === 'star') {
    if (k === ' ' || k === 'enter' || k === 'arrowright' || k === '1') { e.preventDefault(); starNext(); }
  } else if (k === '1' || k === 'arrowleft') { e.preventDefault(); answer(true); }
  else if (k === '2' || k === 'arrowright') { e.preventDefault(); answer(false); }
  if (k === 'k') { reveal.ko = !reveal.ko; render(); }
  else if (k === 'e') { reveal.ex = !reveal.ex; render(); }
  else if (k === 's') { const b = document.getElementById('starBtn'); if (b) b.click(); }
});

/* ---------- 동기화 ---------- */
const sync = { status: window.FIREBASE_CONFIG ? 'init' : 'off', user: null, api: null, msg: '', lastAt: 0, pending: false };
let pushTimer = 0, pushing = false, pushAgain = false;
const SYNC_LABEL = {
  off: '이 기기에만 저장', init: '연결 준비 중', out: '로그인하면 기기 연동', syncing: '동기화 중',
  synced: '동기화됨', offline: '오프라인 · 연결되면 동기화', error: '동기화 오류'
};
function setSync(status, msg) {
  sync.status = status; if (msg !== undefined) sync.msg = msg;
  const el = document.getElementById('syncPill');
  if (el) { el.dataset.s = status; el.querySelector('span').textContent = SYNC_LABEL[status]; }
}
function pushSoon() {
  if (!sync.api || !sync.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 1500);
}
async function pushNow() {
  if (!sync.api || !sync.user) return;
  if (pushing) { pushAgain = true; return; }
  if (!navigator.onLine) { setSync('offline'); return; }
  pushing = true; setSync('syncing');
  try {
    const mine = C.canon(S);
    const result = await sync.api.transact(cur => C.canon(C.join(C.parse(cur), S)));
    absorb(result);
    sync.lastAt = Date.now();
    setSync('synced', '');
    if (C.canon(S) !== mine) save();
  } catch (e) {
    const code = (e && e.code) || '';
    if (!navigator.onLine || /unavailable|deadline|network/i.test(code + (e && e.message))) setSync('offline');
    else { setSync('error', code || String(e)); console.warn('sync', e); }
  } finally {
    pushing = false;
    if (pushAgain) { pushAgain = false; pushSoon(); }
  }
}
/* 서버에서 온 기록을 내 기록과 합치고, 바뀐 게 있으면 화면도 다시 그려요 */
function absorb(remoteStr) {
  if (remoteStr == null) return;
  const before = C.canon(S), beforeSess = sess();
  S = C.join(S, C.parse(remoteStr));
  const after = C.canon(S);
  if (after === before) return;
  lastSaved = after; try { localStorage.setItem(KEY, after); } catch (e) {}
  const now = sess();
  if (view === 'study') {
    if (!now) { closeSheet(); goHome(); toast('이 묶음은 다른 기기에서 이미 끝냈어요'); }
    else if (!beforeSess || now.sid !== beforeSess.sid || now.rev !== beforeSess.rev) {
      if (now.dev !== DEV) toast('다른 기기의 진행 상황을 가져왔어요');
      closeSheet(); render(); if (now.lapEnd) showLapEnd();
    }
  } else render();
}
async function startSync() {
  if (!window.FIREBASE_CONFIG) return;
  try {
    const mod = await import('./sync.js');
    sync.api = await mod.start({
      config: window.FIREBASE_CONFIG, dev: DEV,
      onAuth(user) {
        sync.user = user;
        if (user) { setSync(navigator.onLine ? 'syncing' : 'offline'); pushSoon(); }
        else setSync('out');
        if (view === 'home') render();
      },
      onRemote(str, meta) {
        if (str != null) absorb(str);
        if (!meta.fromCache && !pushing) setSync('synced');
      },
      onError(err) { setSync('error', (err && err.code) || String(err)); }
    });
  } catch (e) {
    console.warn('sync init', e);
    setSync(navigator.onLine ? 'error' : 'offline', String(e && e.message || e));
  }
}
window.addEventListener('online', () => { if (sync.api) { if (sync.user) { setSync('syncing'); pushSoon(); } } else startSync(); });
window.addEventListener('offline', () => { if (sync.status !== 'off' && sync.status !== 'out') setSync('offline'); });

/* ---------- 설치 / 업데이트 ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (view === 'home') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('홈 화면에 설치됐어요'); if (view === 'home') render(); });
function toast(msg, action) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.fn(); t.remove(); };
  document.body.appendChild(t);
  if (!action) setTimeout(() => t.remove(), 3500);
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offer = w => toast('새 버전이 있어요', { label: '업데이트', fn: () => w.postMessage('skipWaiting') });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      // 첫 설치 때(이전 워커 없음)는 그대로 두고, 새 버전으로 바뀔 때만 다시 불러와요
      let hadController = !!navigator.serviceWorker.controller, reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { hadController = true; return; }
        if (reloading) return; reloading = true; save(); location.reload();
      });
    } catch (e) { console.warn('sw', e); }
  });
}

/* ---------- render ---------- */
function render() { if (view === 'star' && star) renderStar(); else if (view === 'study' && sess()) renderStudy(); else renderHome(); }

function syncPill() {
  if (sync.status === 'off') return '';
  return `<button class="sync-pill" id="syncPill" data-s="${sync.status}">${ICON.cloud}<span>${SYNC_LABEL[sync.status]}</span></button>`;
}
function renderHome() {
  view = 'home';
  const s = sess();
  let cont;
  if (s) {
    const total = s.order.length, left = total - s.idx;
    cont = `<button class="continue" id="resumeBtn">
      <span class="c-top"><span><span class="c-title">${gname(s.g)} · ${mname(s.mode)}</span><br><span class="c-sub">${roundNo(s)}회독 · ${s.lap}바퀴째 · 공부시간 ${fmt(s.elapsed)}</span></span><span class="c-go">이어하기</span></span>
      <span class="c-bar"><i style="width:${s.idx / total * 100}%"></i></span>
      <span class="c-meta"><span>이번 바퀴 <span class="tnum">${s.idx} / ${total}</span></span><span>남은 단어 <span class="tnum">${left}</span>개</span></span>
    </button>`;
  } else cont = `<div class="no-continue">진행 중인 단어 묶음이 없어요. 아래에서 골라 시작하세요.</div>`;

  let totalRounds = 0;
  const rows = GROUPS.filter(G => G.ready).map(G => {
    const sc = roundsDone(G.g, 'single').length, cc = roundsDone(G.g, 'cum').length, on = s && s.g === G.g;
    totalRounds += sc + cc;
    const chip = (label, n) => `<span class="chip${n ? ' has' : ''}"><small>${label}</small><b class="tnum">${n}</b></span>`;
    const desc = on ? `<span class="live">진행 중 · ${mname(s.mode)} ${roundNo(s)}회독</span>` : `no.${pad4(G.from)}–${pad4(G.to)} · 200단어`;
    return `<button class="set${on ? ' on' : ''}${sc || cc ? ' done' : ''}" data-g="${G.g}">
      <span class="badge"><small>DAY</small><b>${G.d0}–${G.d1}</b></span>
      <span class="s-main"><span class="s-name">${gname(G.g)}</span><span class="s-desc">${desc}</span></span>
      <span class="chips">${G.g > 0 ? chip('누적', cc) : ''}${chip('단일', sc)}</span>
    </button>`;
  }).join('');

  const install = installPrompt && !matchMedia('(display-mode: standalone)').matches
    ? `<button class="install" id="installBtn"><b>홈 화면에 앱으로 설치</b><span>와이파이 없어도 열려요</span></button>` : '';

  $app.innerHTML = `
    <header class="home-head">
      <div><div class="sub">해커스 보카 수능완성 1800</div><h1>단어장</h1></div>
      <div class="total">완료한 회독<b class="tnum">${totalRounds}</b></div>
    </header>
    <div class="toolrow">${syncPill()}</div>
    ${install}
    <div class="label">진행 중</div>${cont}
    <div class="label">별표 단어</div>
    <button class="starset" id="starSetBtn"><span class="badge">${ICON.star}</span>
      <span><span class="s-name">별표 단어 모아보기</span><span class="s-desc">${starList().length ? '회독 없이 랜덤으로 계속 반복' : '암기 화면에서 ★를 눌러 단어를 모아요'}</span></span>
      <span class="cnt tnum">${starList().length}</span></button>
    <div class="label">단어 묶음 · DAY 5개 = 200단어</div>
    <div class="sets">${rows}</div>
    <div class="foot"><button class="text-btn" id="resetBtn">기록 초기화</button></div>`;
  const rb = document.getElementById('resumeBtn');
  if (rb) rb.onclick = () => { enter('study'); if (sess().lapEnd) showLapEnd(); };
  $app.querySelectorAll('.set[data-g]').forEach(b => b.onclick = () => showModeSheet(+b.dataset.g));
  document.getElementById('resetBtn').onclick = showReset;
  document.getElementById('starSetBtn').onclick = showStarSheet;
  const sp = document.getElementById('syncPill'); if (sp) sp.onclick = showSyncSheet;
  const ib = document.getElementById('installBtn'); if (ib) ib.onclick = async () => { const p = installPrompt; installPrompt = null; render(); try { await p.prompt(); } catch (e) {} };
}

function wordBody(w) {
  const pron = w.p.map(p => `<span>${p.pos ? `<span class="pos">${p.pos}</span>` : ''}${p.ipa}</span>`).join('');
  const boxes = [];
  if (reveal.ko) boxes.push(`<div class="box"><span class="bl">뜻 <small class="pm-hint"><mark>형광펜</mark> = 가장 많이 쓰이는 뜻, 먼저 외워요</small></span><div class="meaning">${w.m}</div></div>`);
  if (reveal.ex) boxes.push(`<div class="box"><span class="bl">예문</span>
      <div class="ex-en">${w.ex}${w.src ? `<span class="src">${w.src}</span>` : ''}</div><div class="ex-ko">${w.ko}</div></div>`);
  if ((reveal.ko || reveal.ex) && w.x.length) {
    const K = { '+': ['d', '파생어'], '=': ['s', '유의어'], '↔': ['a', '반의어'] };
    boxes.push(`<div class="box"><div class="xl">${w.x.map(x => `<div class="xr"><span class="k ${K[x.k][0]}">${K[x.k][1]}</span><div>${x.t.replace(/ (?=<b>)/g, '<br>')}</div></div>`).join('')}</div></div>`);
  }
  if ((reveal.ko || reveal.ex) && w.tb) boxes.push(`<div class="box"><span class="bl">Tips · ${w.tt}</span><div class="tips">${w.tb.startsWith('<b>') ? w.tb.replace(/ (?=<b>)/g, '<br>') : w.tb}</div></div>`);

  return `<section class="card"><button class="star-btn" id="starBtn" aria-pressed="${C.starOn(S, w.n)}" aria-label="별표">${ICON.star}</button><h2 class="word">${w.w}</h2><div class="ipa">${pron}</div></section>
    <div class="toggles">
      <button class="tg" id="koBtn" aria-pressed="${reveal.ko}">한국어 ${ICON.chev}</button>
      <button class="tg" id="exBtn" aria-pressed="${reveal.ex}">예문 ${ICON.chev}</button>
    </div>
    <div class="panel">${boxes.join('')}</div>`;
}
function bindWord(w) {
  document.getElementById('koBtn').onclick = () => { reveal.ko = !reveal.ko; render(); };
  document.getElementById('exBtn').onclick = () => { reveal.ex = !reveal.ex; render(); };
  document.getElementById('starBtn').onclick = e => { toggleStar(w.n); e.currentTarget.setAttribute('aria-pressed', C.starOn(S, w.n)); const c = document.getElementById('starCnt'); if (c) c.textContent = starList().length; };
}
function renderStar() {
  const w = BY.get(star.order[star.idx]), total = star.order.length;
  $app.innerHTML = `<div class="study">
    <div class="topbar">
      <div class="tb-row">
        <span></span>
        <div class="tb-title"><b>★ 별표 단어</b><div>랜덤 반복 · ${star.cycle}바퀴째</div></div>
        <button class="icon-btn" id="closeBtn" aria-label="나가기">${ICON.close}</button>
      </div>
      <div class="prog"><div class="bar"><i style="width:${star.idx / total * 100}%"></i></div><span class="cnt tnum">${star.idx + 1} / ${total}</span></div>
      <div class="meta">
        <span class="pill-s"><span class="k">no.</span><span class="r tnum">${w.n}</span></span>
        <span class="pill-s"><span class="k">별표 단어</span><b class="tnum" id="starCnt">${starList().length}</b></span>
      </div>
    </div>
    ${wordBody(w)}
    <div class="kbd-hint">키보드: K 한국어 · E 예문 · S 별표 · Space 다음</div>
    <div class="answer"><div class="in one"><button class="big next" id="nextBtn">다음 단어</button></div></div>
  </div>`;
  bindWord(w);
  document.getElementById('nextBtn').onclick = starNext;
  document.getElementById('closeBtn').onclick = goHome;
}
function renderStudy() {
  const s = sess();
  const w = BY.get(s.order[Math.min(s.idx, s.order.length - 1)]);
  const done = s.idx, total = s.order.length;
  $app.innerHTML = `<div class="study">
    <div class="topbar">
      <div class="tb-row">
        <button class="icon-btn" id="menuBtn" aria-label="회독별 공부시간">${ICON.menu}</button>
        <div class="tb-title"><b>${gname(s.g)} <span class="r">${roundNo(s)}</span>회독</b><div>${mname(s.mode)} · ${s.lap}바퀴째</div></div>
        <button class="icon-btn" id="closeBtn" aria-label="그만하기">${ICON.close}</button>
      </div>
      <div class="prog"><div class="bar"><i style="width:${done / total * 100}%"></i></div><span class="cnt tnum">${Math.min(done + 1, total)} / ${total}</span></div>
      <div class="meta">
        <span class="pill-s"><span class="k">no.</span><span class="r tnum">${w.n}</span></span>
        <span class="pill-s"><span class="k">공부시간</span><span class="tnum" id="time">${fmt(s.elapsed)}</span></span>
        <span class="pill-s left"><span class="k">공부하겠음</span><b class="tnum">${s.review.length}</b></span>
      </div>
    </div>
    ${wordBody(w)}
    <div class="kbd-hint">키보드: K 한국어 · E 예문 · S 별표 · 1 알고있음 · 2 공부하겠음</div>
    <div class="answer"><div class="in">
      <button class="big know" id="knowBtn">알고있음</button>
      <button class="big again" id="againBtn">공부하겠음</button>
    </div></div>
  </div>`;
  bindWord(w);
  document.getElementById('knowBtn').onclick = () => answer(true);
  document.getElementById('againBtn').onclick = () => answer(false);
  document.getElementById('menuBtn').onclick = showLog;
  document.getElementById('closeBtn').onclick = showQuit;
}

/* ---------- sheets ---------- */
function openSheet(html, { pause = false, dismiss = true } = {}) {
  closeSheet();
  pauseForSheet = pause; sheetOpen = true; sheetDismiss = dismiss;
  // 홈에서 뒤로가기를 누르면 앱이 닫히는 대신 창이 닫히도록 기록을 하나 넣어 둬요
  try { if (view === 'home' && history.state && history.state.v === 'home' && !history.state.sheet) history.pushState({ v: 'home', sheet: 1 }, ''); } catch (e) {}
  const bd = document.createElement('div');
  bd.className = 'backdrop'; bd.id = 'backdrop';
  bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  if (dismiss) bd.addEventListener('click', e => { if (e.target === bd) closeSheet(); });
  document.body.appendChild(bd);
  return bd;
}
function closeSheet() {
  const bd = document.getElementById('backdrop'); if (bd) bd.remove();
  sheetOpen = false; pauseForSheet = false; sheetDismiss = true; last = performance.now();
}
function showModeSheet(g) {
  const s = sess(), G = GROUPS[g];
  const modes = g > 0 ? ['single', 'cum'] : ['single'];
  const opt = m => {
    const same = s && s.g === g && s.mode === m;
    const n = wordsOf(g, m).length;
    const scope = m === 'cum' ? `DAY 1~${G.d1} 전체 ${n}단어` : `${gname(g)} ${n}단어만`;
    return `<button class="opt" data-m="${m}">
      <span class="o-name">${mname(m)}${same ? '<span class="tag">이어하기</span>' : ''}</span>
      <span class="o-desc">${scope}</span>
      <span class="o-desc">${same ? `${roundNo(s)}회독 ${s.lap}바퀴째 진행 중` : orderNote(g, m)}</span>
      <span class="o-count"><b class="tnum">${roundsDone(g, m).length}</b><small>회독</small></span></button>`;
  };
  const bd = openSheet(`<h2>${gname(g)}</h2>
    <p>어떻게 외울지 골라주세요.</p>
    ${modes.map(opt).join('')}
    <button class="btn" id="cancel">닫기</button>`);
  bd.querySelector('#cancel').onclick = closeSheet;
  bd.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const m = b.dataset.m;
    if (s && s.g === g && s.mode === m) { closeSheet(); enter('study'); if (s.lapEnd) showLapEnd(); return; }
    if (s) return confirmReplace(g, m);
    closeSheet(); startSession(g, m);
  });
}
function confirmReplace(g, m) {
  const s = sess();
  const bd = openSheet(`<h2>새로 시작할까요?</h2>
    <div class="warn">진행 중인 <b>${gname(s.g)} ${mname(s.mode)} ${roundNo(s)}회독</b>(${s.lap}바퀴째, 공부시간 ${fmt(s.elapsed)})이 사라져요. 진행 중인 묶음은 하나만 둘 수 있어요.</div>
    <div class="row2"><button class="btn" id="no">취소</button><button class="btn danger" id="yes">새로 시작</button></div>`);
  bd.querySelector('#no').onclick = closeSheet;
  bd.querySelector('#yes').onclick = () => { closeSheet(); S.sess = null; startSession(g, m); };
}
function showLapEnd() {
  const s = sess();
  const bd = openSheet(`<h2>${s.lap}바퀴 완료</h2>
    <p>공부하겠음 단어 <b class="tnum">${s.review.length}</b>개로 ${s.lap + 1}바퀴째를 시작해요. 순서는 어떻게 할까요?</p>
    <div class="row2"><button class="btn" id="keep">순서 그대로</button><button class="btn primary" id="mix">새로 섞기</button></div>`, { dismiss: false });
  bd.querySelector('#keep').onclick = () => nextLap(true);
  bd.querySelector('#mix').onclick = () => nextLap(false);
}
function showQuit() {
  const bd = openSheet(`<h2>그만할까요?</h2>
    <p>중단하면 공부시간이 멈추고, 단어장 맨 위 '진행 중'에서 이어서 할 수 있어요.</p>
    <div class="row2"><button class="btn primary" id="cont">계속하기</button><button class="btn" id="stop">중단</button></div>`, { pause: true });
  bd.querySelector('#cont').onclick = closeSheet;
  bd.querySelector('#stop').onclick = () => { closeSheet(); goHome(); };
}
function showLog() {
  const s = sess(), g = s.g;
  const list = m => {
    const rows = roundsDone(g, m).map((r, i) => `<div class="lr"><span>${i + 1}회독</span><span class="tnum">${fmt(r.ms)}</span></div>`);
    if (s.mode === m) rows.push(`<div class="lr now"><span>${roundNo(s)}회독 (진행 중)</span><span class="tnum">${fmt(s.elapsed)}</span></div>`);
    return `<h3>${mname(m)}</h3>${rows.length ? rows.join('') : '<div class="none">아직 기록이 없어요</div>'}`;
  };
  const bd = openSheet(`<h2>${gname(g)} 회독별 공부시간</h2>
    <div class="log">${list('single')}${g > 0 ? list('cum') : ''}</div>
    <button class="btn" id="ok">닫기</button>`, { pause: true });
  bd.querySelector('#ok').onclick = closeSheet;
}
function showDone(d) {
  const bd = openSheet(`<div class="done-hero"><div class="medal">${ICON.check}</div>
      <p>${gname(d.g)} · ${mname(d.mode)}</p><div class="big-t">${d.round}회독 완료!</div></div>
    <div class="stats">
      <div class="stat"><small>공부시간</small><b>${fmt(d.elapsed)}</b></div>
      <div class="stat"><small>${d.words}단어를</small><b>${d.laps}바퀴</b></div>
    </div>
    <button class="btn primary" id="ok">단어장으로</button>`);
  bd.querySelector('#ok').onclick = closeSheet;
}
function showStarSheet() {
  const list = starList();
  const plain = h => h.replace(/<[^>]+>/g, '');
  const rows = list.map(n => { const w = BY.get(n); return `<div class="sl"><div style="min-width:0"><b>${w.w}<small class="tnum">no.${n}</small></b><span>${plain(w.m)}</span></div><button data-n="${n}" aria-label="별표 해제">${ICON.star}</button></div>`; }).join('');
  const bd = openSheet(`<h2>별표 단어 ${list.length}개</h2>
    <p>${list.length ? '회독 수 없이 랜덤 순서로 계속 반복해요. ★를 누르면 목록에서 빠져요.' : '암기 화면에서 단어 카드 오른쪽 위 ★를 누르면 여기에 모여요.'}</p>
    ${list.length ? `<div class="slist">${rows}</div>` : ''}
    <div class="row2"><button class="btn" id="cl">닫기</button><button class="btn primary" id="go" ${list.length ? '' : 'disabled'}>랜덤으로 외우기</button></div>`);
  bd.querySelector('#cl').onclick = () => { closeSheet(); render(); };
  bd.querySelector('#go').onclick = startStar;
  bd.querySelectorAll('.sl button').forEach(b => b.onclick = () => {
    toggleStar(+b.dataset.n); b.classList.toggle('off', !C.starOn(S, +b.dataset.n));
    const c = starList().length;
    bd.querySelector('h2').textContent = `별표 단어 ${c}개`;
    bd.querySelector('#go').disabled = !c;
    renderHome();
  });
}
function showReset() {
  const linked = sync.user ? ' 연동된 다른 기기의 기록도 함께 지워져요.' : '';
  const bd = openSheet(`<h2>기록을 모두 지울까요?</h2>
    <div class="warn">회독 수, 공부시간, 진행 중인 묶음, 별표 단어가 모두 지워져요.${linked} 되돌릴 수 없어요.</div>
    <div class="row2"><button class="btn" id="no">취소</button><button class="btn danger" id="yes">모두 지우기</button></div>`);
  bd.querySelector('#no').onclick = closeSheet;
  bd.querySelector('#yes').onclick = () => { S = C.blank(Date.now()); save(); closeSheet(); render(); };
}
function showSyncSheet() {
  const u = sync.user;
  const when = sync.lastAt ? `마지막 동기화 ${new Date(sync.lastAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '';
  const err = sync.status === 'error' && sync.msg ? `<div class="warn">오류: ${esc(sync.msg)}</div>` : '';
  const body = u
    ? `<p><b>${esc(u.email || u.name || '구글 계정')}</b>으로 로그인되어 있어요.<br>같은 계정으로 로그인한 기기끼리 회독·공부시간·별표·진행 중인 묶음이 자동으로 맞춰져요. 인터넷이 없을 때는 이 기기에 저장되고, 연결되면 올라가요.</p>
       <p class="dim">${SYNC_LABEL[sync.status]}${when ? ' · ' + when : ''} · 이 기기 ${DEV}</p>${err}
       <div class="row2"><button class="btn" id="out">로그아웃</button><button class="btn primary" id="now">지금 동기화</button></div>`
    : `<p>구글 계정으로 로그인하면 패드와 폰에서 같은 기록을 이어서 볼 수 있어요. 로그인할 때만 인터넷이 필요해요.</p>${err}
       <div class="row2"><button class="btn" id="cl">닫기</button><button class="btn primary" id="in" ${sync.api ? '' : 'disabled'}>구글로 로그인</button></div>`;
  const bd = openSheet(`<h2>기기 연동</h2>${body}`, { pause: true });
  const q = id => bd.querySelector('#' + id);
  if (q('cl')) q('cl').onclick = closeSheet;
  if (q('in')) q('in').onclick = async () => {
    q('in').disabled = true;
    try { await sync.api.signIn(); closeSheet(); }
    catch (e) { q('in').disabled = false; toast('로그인에 실패했어요: ' + ((e && e.code) || e)); }
  };
  if (q('out')) q('out').onclick = async () => { try { await sync.api.signOut(); } catch (e) {} closeSheet(); toast('로그아웃했어요. 기록은 이 기기에 남아 있어요'); };
  if (q('now')) q('now').onclick = () => { closeSheet(); pushNow(); };
}

render();
startSync();
