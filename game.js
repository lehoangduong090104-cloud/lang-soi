/* Làng Sói – logic thuần (không đụng tới giao diện).
   Chạy được trên trình duyệt (window.MS) và trong Node (require) để test. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROLES = {
    werewolf: { name: 'Sói', icon: '🐺', team: 'wolf', short: 'Mỗi đêm cùng bầy cắn 1 người', desc: 'Mỗi đêm cùng bầy Sói chọn 1 người để cắn. Phe Sói thắng khi số Sói bằng hoặc nhiều hơn số người còn lại.' },
    seer: { name: 'Tiên tri', icon: '🔮', team: 'village', short: 'Mỗi đêm soi 1 người có phải Sói không', desc: 'Mỗi đêm soi 1 người để biết người đó có phải Sói hay không.' },
    guard: { name: 'Bảo vệ', icon: '🛡️', team: 'village', short: 'Mỗi đêm bảo vệ 1 người khỏi Sói', desc: 'Mỗi đêm chọn 1 người để bảo vệ khỏi bị Sói cắn.' },
    witch: { name: 'Phù thủy', icon: '🧪', team: 'village', short: '1 bình cứu + 1 bình độc, dùng 1 lần', desc: 'Có 1 bình cứu (cứu người bị Sói cắn) và 1 bình độc (giết 1 người). Mỗi bình chỉ dùng được 1 lần trong cả ván.' },
    hunter: { name: 'Thợ săn', icon: '🏹', team: 'village', short: 'Chết thì được bắn theo 1 người', desc: 'Khi chết (dù vì lý do gì), được chọn bắn chết theo 1 người.' },
    cupid: { name: 'Thần tình yêu', icon: '💘', team: 'village', short: 'Đêm đầu ghép 1 cặp đôi sống chết có nhau', desc: 'Đêm đầu tiên ghép đôi 2 người. Một người chết thì người kia chết theo. Nếu cặp đôi khác phe, họ thắng khi chỉ còn lại 2 người.' },
    villager: { name: 'Dân làng', icon: '🧑‍🌾', team: 'village', short: 'Không có chức năng đêm', desc: 'Không có chức năng ban đêm. Hãy dùng lý lẽ để tìm ra Sói và treo cổ chúng.' },
  };
  const ROLE_ORDER = ['werewolf', 'seer', 'guard', 'witch', 'hunter', 'cupid', 'villager'];
  const UNIQUE = ['seer', 'guard', 'witch', 'hunter', 'cupid'];
  const MIN_PLAYERS = 5;
  const MAX_PLAYERS = 20;

  // Các lượt gọi ban đêm. "role" là vai cần có trong ván để lượt đó xuất hiện.
  const STEPS = {
    cupid: { role: 'cupid', icon: '💘', name: 'Thần tình yêu', firstNightOnly: true },
    lovers: { role: 'cupid', icon: '💞', name: 'Cặp đôi', firstNightOnly: true },
    guard: { role: 'guard', icon: '🛡️', name: 'Bảo vệ' },
    wolves: { role: 'werewolf', icon: '🐺', name: 'Sói' },
    witch: { role: 'witch', icon: '🧪', name: 'Phù thủy' },
    seer: { role: 'seer', icon: '🔮', name: 'Tiên tri' },
  };
  const STEP_ORDER = ['cupid', 'lovers', 'guard', 'wolves', 'witch', 'seer'];

  const CAUSES = {
    wolf: 'Bị Sói cắn',
    poison: 'Trúng độc',
    love: 'Chết theo người yêu',
    hunter: 'Bị Thợ săn bắn',
    lynch: 'Bị treo cổ',
  };

  const DEFAULT_SETTINGS = {
    revealOnDeath: true,   // lật bài người chết
    guardSelf: true,       // Bảo vệ được tự bảo vệ
    guardRepeat: false,    // Bảo vệ được bảo vệ 1 người 2 đêm liền
    witchSelfSave: true,   // Phù thủy được tự cứu mình
    callDeadRoles: true,   // vẫn gọi vai đã chết để không lộ
    discussSec: 180,
    style: 'classic',
  };

  const sumCounts = (c) => Object.values(c || {}).reduce((a, b) => a + (b | 0), 0);

  function defaultRoleCounts(n) {
    const c = { werewolf: Math.max(1, Math.round(n / 4)), seer: 0, guard: 0, witch: 0, hunter: 0, cupid: 0, villager: 0 };
    if (n >= 5) c.seer = 1;
    if (n >= 6) c.guard = 1;
    if (n >= 7) c.witch = 1;
    if (n >= 9) c.hunter = 1;
    if (n >= 11) c.cupid = 1;
    c.villager = Math.max(0, n - sumCounts(c));
    return c;
  }

  function validateSetup(names, counts) {
    const n = names.length;
    if (n < MIN_PLAYERS) return `Cần ít nhất ${MIN_PLAYERS} người chơi.`;
    if (n > MAX_PLAYERS) return `Tối đa ${MAX_PLAYERS} người chơi.`;
    if (names.some((x) => !String(x || '').trim())) return 'Còn người chưa có tên.';
    const seen = new Map();
    for (const x of names) {
      const k = String(x).trim().toLowerCase();
      if (seen.has(k)) return `Trùng tên "${String(x).trim()}". Hãy đặt tên khác nhau (vd. thêm chữ cái đầu họ).`;
      seen.set(k, true);
    }
    const total = sumCounts(counts);
    if (total !== n) return `Số vai (${total}) phải bằng số người chơi (${n}).`;
    const wolves = counts.werewolf | 0;
    if (wolves < 1) return 'Cần ít nhất 1 Sói.';
    if (wolves >= n - wolves) return 'Sói quá nhiều: số Sói phải ít hơn số người còn lại.';
    for (const r of UNIQUE) if ((counts[r] | 0) > 1) return `Chỉ được có 1 ${ROLES[r].name}.`;
    return null;
  }

  function shuffle(arr, rng = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function createGame(names, counts, settings, rng = Math.random) {
    const deck = [];
    for (const r of ROLE_ORDER) for (let i = 0; i < (counts[r] | 0); i++) deck.push(r);
    const roles = shuffle(deck, rng);
    return {
      v: 1,
      settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}),
      players: names.map((name, i) => ({ id: i, name: String(name).trim(), role: roles[i], alive: true, lover: false, cause: null, diedOn: null })),
      night: 0,
      day: 0,
      isDay: false,
      witch: { heal: true, poison: true },
      guardLast: null,
      lovers: null,
      rec: null,
      pendingHunters: [],
      log: [],
      winner: null,
    };
  }

  const nm = (G, id) => G.players[id].name;
  const hasRole = (G, role) => G.players.some((p) => p.role === role);
  const aliveWith = (G, role) => G.players.filter((p) => p.alive && p.role === role);
  const alivePlayers = (G) => G.players.filter((p) => p.alive);

  // Danh sách lượt gọi cho một bộ vai (dùng cho cả xem trước kịch bản ở màn hình thiết lập).
  function planSteps(roleSet, night) {
    return STEP_ORDER.filter((k) => roleSet.has(STEPS[k].role) && (!STEPS[k].firstNightOnly || night === 1));
  }

  function nightSteps(G) {
    const roleSet = new Set(G.players.map((p) => p.role));
    const out = [];
    for (const kind of planSteps(roleSet, G.night)) {
      let active;
      if (kind === 'lovers') active = !!G.lovers || aliveWith(G, 'cupid').length > 0;
      else active = aliveWith(G, STEPS[kind].role).length > 0;
      if (active || G.settings.callDeadRoles) out.push({ kind, active });
    }
    return out;
  }

  function startNight(G) {
    G.night += 1;
    G.isDay = false;
    G.rec = { guard: null, wolf: null, save: false, poison: null, seer: null };
  }

  // Ai được chọn trong mỗi lượt.
  function targetsFor(G, kind) {
    const alive = alivePlayers(G);
    switch (kind) {
      case 'cupid':
        return alive.map((p) => p.id);
      case 'guard': {
        const guard = aliveWith(G, 'guard')[0];
        return alive
          .filter((p) => G.settings.guardSelf || !guard || p.id !== guard.id)
          .filter((p) => G.settings.guardRepeat || p.id !== G.guardLast)
          .map((p) => p.id);
      }
      case 'wolves':
        return alive.filter((p) => p.role !== 'werewolf').map((p) => p.id);
      case 'witch': {
        const witch = aliveWith(G, 'witch')[0];
        return alive.filter((p) => !witch || p.id !== witch.id).map((p) => p.id);
      }
      case 'seer': {
        const seer = aliveWith(G, 'seer')[0];
        return alive.filter((p) => !seer || p.id !== seer.id).map((p) => p.id);
      }
      case 'hunter':
        return alive.map((p) => p.id);
      case 'lynch':
        return alive.map((p) => p.id);
      default:
        return [];
    }
  }

  function canWitchSave(G) {
    const witch = aliveWith(G, 'witch')[0];
    if (!witch || !G.witch.heal || G.rec.wolf == null) return false;
    if (G.rec.wolf === witch.id && !G.settings.witchSelfSave) return false;
    return true;
  }

  function applyNightAction(G, kind, a) {
    a = a || {};
    const n = G.night;
    const allowed = new Set(targetsFor(G, kind));
    const check = (id) => {
      if (id == null) return null;
      if (!allowed.has(id)) throw new Error('Lựa chọn không hợp lệ');
      return id;
    };
    switch (kind) {
      case 'cupid': {
        const ids = (a.ids || []).map(check);
        if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('Cần chọn đúng 2 người');
        G.lovers = ids;
        ids.forEach((id) => (G.players[id].lover = true));
        G.log.push(`Đêm ${n}: Thần tình yêu ghép đôi ${nm(G, ids[0])} và ${nm(G, ids[1])}.`);
        return { lovers: ids };
      }
      case 'guard': {
        const t = check(a.target);
        G.rec.guard = t;
        G.log.push(t == null ? `Đêm ${n}: Bảo vệ không bảo vệ ai.` : `Đêm ${n}: Bảo vệ bảo vệ ${nm(G, t)}.`);
        return { target: t };
      }
      case 'wolves': {
        const t = check(a.target);
        G.rec.wolf = t;
        G.log.push(t == null ? `Đêm ${n}: Sói không cắn ai.` : `Đêm ${n}: Sói cắn ${nm(G, t)}.`);
        return { target: t };
      }
      case 'witch': {
        const save = !!a.save && canWitchSave(G);
        const poison = G.witch.poison ? check(a.poison) : null;
        G.rec.save = save;
        G.rec.poison = poison;
        if (save) {
          G.witch.heal = false;
          G.log.push(`Đêm ${n}: Phù thủy dùng bình cứu cho ${nm(G, G.rec.wolf)}.`);
        }
        if (poison != null) {
          G.witch.poison = false;
          G.log.push(`Đêm ${n}: Phù thủy đầu độc ${nm(G, poison)}.`);
        }
        return { save, poison };
      }
      case 'seer': {
        const t = check(a.target);
        if (t == null) throw new Error('Cần chọn 1 người');
        const isWolf = G.players[t].role === 'werewolf';
        G.rec.seer = { target: t, isWolf };
        G.log.push(`Đêm ${n}: Tiên tri soi ${nm(G, t)}: ${isWolf ? 'là Sói' : 'không phải Sói'}.`);
        return { target: t, isWolf };
      }
      default:
        throw new Error('Lượt không hợp lệ: ' + kind);
    }
  }

  function kill(G, id, cause, out) {
    const p = G.players[id];
    if (!p || !p.alive) return;
    p.alive = false;
    p.cause = cause;
    p.diedOn = G.isDay ? `Ngày ${G.day}` : `Đêm ${G.night}`;
    out.push({ id, cause });
    if (p.role === 'hunter') G.pendingHunters.push(id);
    if (p.lover && G.lovers) {
      const other = G.lovers[0] === id ? G.lovers[1] : G.lovers[0];
      if (G.players[other].alive) kill(G, other, 'love', out);
    }
  }

  function resolveNight(G) {
    const r = G.rec;
    const out = [];
    if (r.wolf != null) {
      const guarded = r.guard === r.wolf;
      if (guarded) G.log.push(`Đêm ${G.night}: ${nm(G, r.wolf)} được Bảo vệ che chở nên không chết.`);
      if (!guarded && !r.save) kill(G, r.wolf, 'wolf', out);
    }
    if (r.poison != null) kill(G, r.poison, 'poison', out);
    G.guardLast = r.guard;
    G.isDay = true;
    G.day = G.night;
    return out;
  }

  function hunterShoot(G, hunterId, targetId) {
    G.pendingHunters = G.pendingHunters.filter((x) => x !== hunterId);
    const out = [];
    if (targetId != null) {
      if (!G.players[targetId] || !G.players[targetId].alive) throw new Error('Lựa chọn không hợp lệ');
      G.log.push(`${G.isDay ? 'Ngày ' + G.day : 'Đêm ' + G.night}: Thợ săn ${nm(G, hunterId)} bắn ${nm(G, targetId)}.`);
      kill(G, targetId, 'hunter', out);
    } else {
      G.log.push(`Thợ săn ${nm(G, hunterId)} không bắn ai.`);
    }
    return out;
  }

  function lynch(G, id) {
    const out = [];
    if (id == null) {
      G.log.push(`Ngày ${G.day}: Cả làng không treo cổ ai.`);
      return out;
    }
    if (!G.players[id] || !G.players[id].alive) throw new Error('Lựa chọn không hợp lệ');
    G.log.push(`Ngày ${G.day}: Cả làng treo cổ ${nm(G, id)} (${ROLES[G.players[id].role].name}).`);
    kill(G, id, 'lynch', out);
    return out;
  }

  function checkWin(G) {
    const alive = alivePlayers(G);
    if (!alive.length) return { winner: 'none' };
    if (G.lovers && alive.length === 2) {
      const [a, b] = G.lovers.map((i) => G.players[i]);
      if (a.alive && b.alive && ROLES[a.role].team !== ROLES[b.role].team) return { winner: 'lovers' };
    }
    const wolves = alive.filter((p) => p.role === 'werewolf').length;
    if (wolves === 0) return { winner: 'village' };
    if (wolves >= alive.length - wolves) return { winner: 'wolf' };
    return null;
  }

  function isWinner(G, p) {
    if (!G.winner) return false;
    if (G.winner === 'lovers') return p.lover;
    if (G.winner === 'none') return false;
    return ROLES[p.role].team === G.winner;
  }

  return {
    ROLES, ROLE_ORDER, UNIQUE, STEPS, STEP_ORDER, CAUSES, DEFAULT_SETTINGS, MIN_PLAYERS, MAX_PLAYERS,
    sumCounts, defaultRoleCounts, validateSetup, shuffle, createGame, planSteps, nightSteps, startNight,
    targetsFor, canWitchSave, applyNightAction, resolveNight, hunterShoot, lynch, checkWin, isWinner,
    hasRole, alivePlayers, aliveWith,
  };
});
