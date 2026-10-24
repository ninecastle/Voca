/* core.js — 기록 데이터 구조와 기기 간 병합 규칙
 * 화면과 무관한 순수 함수만 모아 둔 파일이에요. (브라우저: window.VocaCore / Node 테스트: require)
 *
 * 기록 구조 (v2)
 *   resetAt  : 마지막 "기록 초기화" 시각. 이보다 오래된 기록은 모든 기기에서 무시돼요.
 *   rounds   : 끝낸 회독. 키 = 세션 id → { g, mode, ms(공부시간), at(끝낸 시각), laps, n }
 *              두 기기가 같은 회독을 끝내도 키가 같아서 한 번만 세요.
 *   seen     : 한 번이라도 1바퀴를 끝낸 묶음 → 시각
 *   stars    : 단어 번호 → { on: 1|0, at } (마지막으로 누른 상태가 이겨요)
 *   sess     : 진행 중인 묶음 하나. 더 나중에 시작한 묶음이 이기고,
 *              같은 묶음이면 더 많이 진행한 쪽(rev)이 이겨요.
 *
 * join(a, b)는 순서·반복과 상관없이 같은 결과를 내도록(교환·결합·멱등) 만들었어요.
 * 그래서 두 기기가 서로의 기록을 몇 번 주고받든 결국 똑같은 상태로 모여요.
 */
(function (root) {
  'use strict';

  var GROUP_COUNT = 9;
  var WORD_MAX = 1800;

  function blank(resetAt) {
    return { v: 2, resetAt: resetAt || 0, rounds: {}, seen: {}, stars: {}, sess: null };
  }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isInt(x) { return typeof x === 'number' && Math.floor(x) === x && isFinite(x); }
  function isWord(n) { return isInt(n) && n >= 1 && n <= WORD_MAX; }
  function isGroup(g) { return isInt(g) && g >= 0 && g < GROUP_COUNT; }
  function isMode(m) { return m === 'single' || m === 'cum'; }
  function isId(s) { return typeof s === 'string' && s.length > 0 && s.length <= 64; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  /* 키 순서를 고정한 JSON — 같은 내용이면 기기와 상관없이 같은 문자열이 나와요 */
  function stable(x) {
    if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    var keys = Object.keys(x).filter(function (k) { return x[k] !== undefined; }).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + stable(x[k]); }).join(',') + '}';
  }

  function cleanRound(r) {
    if (!isObj(r) || !isGroup(r.g) || !isMode(r.mode) || !isNum(r.ms) || !isNum(r.at)) return null;
    var out = { g: r.g, mode: r.mode, ms: Math.max(0, Math.round(r.ms)), at: r.at };
    if (isInt(r.laps) && r.laps > 0) out.laps = r.laps;
    if (isInt(r.n) && r.n > 0) out.n = r.n;
    return out;
  }

  function cleanSess(s) {
    if (!isObj(s) || !isId(s.sid) || !isGroup(s.g) || !isMode(s.mode)) return null;
    if (!Array.isArray(s.order) || s.order.length === 0 || !s.order.every(isWord)) return null;
    if (!Array.isArray(s.review) || !s.review.every(isWord)) return null;
    if (!isInt(s.idx) || s.idx < 0 || s.idx > s.order.length) return null;
    if (!isInt(s.lap) || s.lap < 1 || !isNum(s.startedAt) || !isInt(s.rev) || s.rev < 0) return null;
    return {
      sid: s.sid, g: s.g, mode: s.mode,
      order: s.order.slice(), idx: s.idx, lap: s.lap, review: s.review.slice(),
      elapsed: isNum(s.elapsed) ? Math.max(0, Math.round(s.elapsed)) : 0,
      lapEnd: !!s.lapEnd, startedAt: s.startedAt, rev: s.rev,
      dev: typeof s.dev === 'string' ? s.dev.slice(0, 64) : ''
    };
  }

  /* 밖에서 들어온 값(서버·저장소)을 믿지 않고 형식을 검사해 정리해요 */
  function clean(x) {
    var out = blank();
    if (!isObj(x)) return out;
    if (isNum(x.resetAt) && x.resetAt > 0) out.resetAt = x.resetAt;
    if (isObj(x.rounds)) {
      Object.keys(x.rounds).forEach(function (k) {
        var r = isId(k) ? cleanRound(x.rounds[k]) : null;
        if (r) out.rounds[k] = r;
      });
    }
    if (isObj(x.seen)) {
      Object.keys(x.seen).forEach(function (k) {
        if (isGroup(Number(k)) && String(Number(k)) === k && isNum(x.seen[k])) out.seen[k] = x.seen[k];
      });
    }
    if (isObj(x.stars)) {
      Object.keys(x.stars).forEach(function (k) {
        var s = x.stars[k];
        if (isWord(Number(k)) && String(Number(k)) === k && isObj(s) && isNum(s.at)) out.stars[k] = { on: s.on ? 1 : 0, at: s.at };
      });
    }
    out.sess = cleanSess(x.sess);
    return out;
  }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function cmpRound(a, b) { return cmp(a.at, b.at) || cmp(a.ms, b.ms) || cmp(stable(a), stable(b)); }
  function cmpStar(a, b) { return cmp(a.at, b.at) || cmp(a.on, b.on); }
  function cmpSess(a, b) {
    return cmp(a.startedAt, b.startedAt) || cmp(a.sid, b.sid) || cmp(a.rev, b.rev) ||
      cmp(a.elapsed, b.elapsed) || cmp(a.dev, b.dev) || cmp(stable(a), stable(b));
  }

  /* 두 기록을 합쳐요. 초기화 시각보다 오래된 항목은 버려요. */
  function join(a, b) {
    a = clean(a); b = clean(b);
    var resetAt = Math.max(a.resetAt, b.resetAt);
    var out = blank(resetAt);
    [a, b].forEach(function (src) {
      Object.keys(src.rounds).forEach(function (k) {
        var r = src.rounds[k], cur = out.rounds[k];
        if (r.at >= resetAt && (!cur || cmpRound(r, cur) > 0)) out.rounds[k] = r;
      });
      Object.keys(src.seen).forEach(function (k) {
        var t = src.seen[k];
        if (t >= resetAt && !(out.seen[k] >= t)) out.seen[k] = t;
      });
      Object.keys(src.stars).forEach(function (k) {
        var s = src.stars[k], cur = out.stars[k];
        if (s.at >= resetAt && (!cur || cmpStar(s, cur) > 0)) out.stars[k] = s;
      });
      var s = src.sess;
      if (s && s.startedAt >= resetAt && (!out.sess || cmpSess(s, out.sess) > 0)) out.sess = s;
    });
    return out;
  }

  /* 비교·전송용 표준 문자열 */
  function canon(x) { return stable(join(x, null)); }

  function parse(str) {
    if (typeof str !== 'string' || !str) return blank();
    try { return clean(JSON.parse(str)); } catch (e) { return blank(); }
  }

  /* 기록 안에서 가장 늦은 시각 — 기기 시계가 서로 조금 달라도 순서가 꼬이지 않게 써요 */
  function maxTs(x) {
    var m = x.resetAt || 0;
    Object.keys(x.rounds).forEach(function (k) { if (x.rounds[k].at > m) m = x.rounds[k].at; });
    Object.keys(x.seen).forEach(function (k) { if (x.seen[k] > m) m = x.seen[k]; });
    Object.keys(x.stars).forEach(function (k) { if (x.stars[k].at > m) m = x.stars[k].at; });
    if (x.sess && x.sess.startedAt > m) m = x.sess.startedAt;
    return m;
  }

  /* 지금 진행 중인 묶음 (이미 끝낸 회독이면 없음) */
  function activeSess(x) {
    var s = x.sess;
    if (!s || x.rounds[s.sid] || s.startedAt < x.resetAt) return null;
    return s;
  }

  /* 묶음·모드별로 끝낸 회독을 끝낸 순서대로 */
  function roundsOf(x, g, mode) {
    return Object.keys(x.rounds)
      .map(function (k) { var r = x.rounds[k]; return { sid: k, g: r.g, mode: r.mode, ms: r.ms, at: r.at, laps: r.laps, n: r.n }; })
      .filter(function (r) { return r.g === g && r.mode === mode; })
      .sort(function (p, q) { return cmp(p.at, q.at) || cmp(p.sid, q.sid); });
  }

  function starOn(x, n) { var s = x.stars[n]; return !!(s && s.on); }

  function starList(x) {
    return Object.keys(x.stars).filter(function (k) { return x.stars[k].on; })
      .map(Number).sort(function (p, q) { return p - q; });
  }

  /* 예전 앱(v1) 기록을 새 구조로 옮겨요 */
  function migrateV1(v1, now, dev) {
    var out = blank();
    if (!isObj(v1)) return out;
    var groups = isObj(v1.groups) ? v1.groups : {};
    Object.keys(groups).forEach(function (gk) {
      var g = Number(gk);
      if (!isGroup(g)) return;
      ['single', 'cum'].forEach(function (mode) {
        var rec = groups[gk] && groups[gk][mode];
        if (!isObj(rec)) return;
        var times = Array.isArray(rec.times) ? rec.times : [];
        var count = isInt(rec.count) ? rec.count : times.length;
        for (var i = 0; i < count; i++) {
          out.rounds['v1-' + g + '-' + mode + '-' + i] = {
            g: g, mode: mode, ms: isNum(times[i]) ? Math.round(times[i]) : 0, at: now - (count - i) * 1000
          };
        }
      });
    });
    if (isObj(v1.seen)) Object.keys(v1.seen).forEach(function (k) {
      if (v1.seen[k] && isGroup(Number(k))) out.seen[String(Number(k))] = now;
    });
    if (isObj(v1.stars)) Object.keys(v1.stars).forEach(function (k) {
      if (v1.stars[k] && isWord(Number(k))) out.stars[String(Number(k))] = { on: 1, at: now };
    });
    var s = v1.session;
    if (isObj(s)) {
      out.sess = cleanSess({
        sid: 'v1s-' + now.toString(36), g: s.g, mode: s.mode, order: s.order, idx: s.idx, lap: s.lap,
        review: s.review, elapsed: s.elapsed, lapEnd: s.lapEnd, startedAt: now, rev: 0, dev: dev || ''
      });
    }
    return out;
  }

  var Core = {
    blank: blank, clean: clean, join: join, canon: canon, parse: parse, stable: stable, maxTs: maxTs,
    activeSess: activeSess, roundsOf: roundsOf, starOn: starOn, starList: starList, migrateV1: migrateV1,
    GROUP_COUNT: GROUP_COUNT, WORD_MAX: WORD_MAX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.VocaCore = Core;
})(this);
