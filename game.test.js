const test = require('node:test');
const assert = require('node:assert');
const MS = require('./game.js');
const NARR = require('./narration.js');

// Tạo ván với vai cố định theo thứ tự ghế.
function fixed(roles, settings) {
  const names = roles.map((_, i) => 'P' + i);
  const counts = {};
  roles.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
  const G = MS.createGame(names, counts, settings);
  G.players.forEach((p, i) => (p.role = roles[i]));
  return G;
}

test('gợi ý vai hợp lệ cho 5–20 người', () => {
  for (let n = MS.MIN_PLAYERS; n <= MS.MAX_PLAYERS; n++) {
    const names = Array.from({ length: n }, (_, i) => 'N' + i);
    assert.strictEqual(MS.validateSetup(names, MS.defaultRoleCounts(n)), null, 'n=' + n);
  }
});

test('kiểm tra thiết lập', () => {
  const c = MS.defaultRoleCounts(6);
  assert.match(MS.validateSetup(['a', 'b', 'c'], c), /ít nhất/);
  assert.match(MS.validateSetup(['a', 'b', 'c', 'd', 'e', 'A'], c), /Trùng tên/);
  assert.match(MS.validateSetup(['a', 'b', 'c', 'd', 'e', ''], c), /chưa có tên/);
  assert.match(MS.validateSetup(['a', 'b', 'c', 'd', 'e', 'f'], { ...c, villager: 5 }), /phải bằng/);
  assert.match(MS.validateSetup(['a', 'b', 'c', 'd', 'e', 'f'], { werewolf: 3, villager: 3 }), /quá nhiều/);
  assert.match(MS.validateSetup(['a', 'b', 'c', 'd', 'e', 'f'], { werewolf: 1, seer: 2, villager: 3 }), /Chỉ được có 1/);
});

test('chia bài đủ vai theo số lượng', () => {
  const counts = MS.defaultRoleCounts(9);
  const G = MS.createGame(Array.from({ length: 9 }, (_, i) => 'N' + i), counts, {});
  const got = {};
  G.players.forEach((p) => (got[p.role] = (got[p.role] || 0) + 1));
  for (const r of Object.keys(counts)) assert.strictEqual(got[r] || 0, counts[r], r);
});

test('kịch bản đêm đổi theo bộ vai, Thần tình yêu chỉ đêm đầu', () => {
  const G = fixed(['werewolf', 'cupid', 'seer', 'villager', 'villager', 'guard']);
  MS.startNight(G);
  assert.deepStrictEqual(MS.nightSteps(G).map((s) => s.kind), ['cupid', 'lovers', 'guard', 'wolves', 'seer']);
  MS.applyNightAction(G, 'cupid', { ids: [3, 4] });
  MS.resolveNight(G);
  MS.startNight(G);
  assert.deepStrictEqual(MS.nightSteps(G).map((s) => s.kind), ['guard', 'wolves', 'seer']);
  assert.deepStrictEqual(MS.planSteps(new Set(['werewolf', 'villager']), 1), ['wolves']);
});

test('vai đã chết vẫn được gọi (giả vờ) hoặc bị bỏ qua tuỳ luật', () => {
  const G = fixed(['werewolf', 'seer', 'villager', 'villager', 'villager']);
  G.players[1].alive = false;
  MS.startNight(G);
  assert.deepStrictEqual(MS.nightSteps(G), [{ kind: 'wolves', active: true }, { kind: 'seer', active: false }]);
  G.settings.callDeadRoles = false;
  assert.deepStrictEqual(MS.nightSteps(G).map((s) => s.kind), ['wolves']);
});

test('Bảo vệ chặn được Sói, không bảo vệ 1 người 2 đêm liền', () => {
  const G = fixed(['werewolf', 'guard', 'villager', 'villager', 'villager']);
  MS.startNight(G);
  MS.applyNightAction(G, 'guard', { target: 2 });
  MS.applyNightAction(G, 'wolves', { target: 2 });
  assert.deepStrictEqual(MS.resolveNight(G), []);
  MS.startNight(G);
  assert.ok(!MS.targetsFor(G, 'guard').includes(2));
  assert.throws(() => MS.applyNightAction(G, 'guard', { target: 2 }));
  G.settings.guardRepeat = true;
  assert.ok(MS.targetsFor(G, 'guard').includes(2));
});

test('Sói không cắn được đồng bọn', () => {
  const G = fixed(['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
  MS.startNight(G);
  assert.deepStrictEqual(MS.targetsFor(G, 'wolves'), [2, 3, 4, 5]);
  assert.throws(() => MS.applyNightAction(G, 'wolves', { target: 1 }));
});

test('Phù thủy: cứu, đầu độc, mỗi bình 1 lần, luật tự cứu', () => {
  const G = fixed(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
  MS.startNight(G);
  MS.applyNightAction(G, 'wolves', { target: 2 });
  assert.ok(MS.canWitchSave(G));
  MS.applyNightAction(G, 'witch', { save: true, poison: 3 });
  const d = MS.resolveNight(G);
  assert.deepStrictEqual(d, [{ id: 3, cause: 'poison' }]);
  assert.deepStrictEqual(G.witch, { heal: false, poison: false });
  MS.startNight(G);
  MS.applyNightAction(G, 'wolves', { target: 4 });
  assert.ok(!MS.canWitchSave(G));
  MS.applyNightAction(G, 'witch', { save: true, poison: 5 });
  assert.deepStrictEqual(MS.resolveNight(G), [{ id: 4, cause: 'wolf' }]);

  const H = fixed(['werewolf', 'witch', 'villager', 'villager', 'villager'], { witchSelfSave: false });
  MS.startNight(H);
  MS.applyNightAction(H, 'wolves', { target: 1 });
  assert.ok(!MS.canWitchSave(H));
});

test('Cặp đôi chết theo nhau, Thợ săn kéo theo dây chuyền', () => {
  const G = fixed(['werewolf', 'cupid', 'hunter', 'villager', 'villager', 'villager', 'werewolf']);
  MS.startNight(G);
  MS.applyNightAction(G, 'cupid', { ids: [2, 3] });
  MS.applyNightAction(G, 'wolves', { target: 3 });
  const d = MS.resolveNight(G);
  assert.deepStrictEqual(d, [{ id: 3, cause: 'wolf' }, { id: 2, cause: 'love' }]);
  assert.deepStrictEqual(G.pendingHunters, [2]);
  const shot = MS.hunterShoot(G, 2, 0);
  assert.deepStrictEqual(shot, [{ id: 0, cause: 'hunter' }]);
  assert.deepStrictEqual(G.pendingHunters, []);
  assert.strictEqual(G.players[0].diedOn, 'Ngày 1');
  assert.strictEqual(G.players[3].diedOn, 'Đêm 1');
});

test('Treo cổ và điều kiện thắng', () => {
  const G = fixed(['werewolf', 'villager', 'villager', 'villager', 'seer']);
  assert.strictEqual(MS.checkWin(G), null);
  MS.startNight(G);
  MS.resolveNight(G);
  MS.lynch(G, 0);
  assert.deepStrictEqual(MS.checkWin(G), { winner: 'village' });
  assert.ok(MS.isWinner(Object.assign(G, { winner: 'village' }), G.players[1]));

  const W = fixed(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
  W.players[2].alive = false;
  assert.deepStrictEqual(MS.checkWin(W), { winner: 'wolf' });

  const L = fixed(['werewolf', 'cupid', 'villager', 'villager', 'villager']);
  MS.startNight(L);
  MS.applyNightAction(L, 'cupid', { ids: [0, 2] });
  [1, 3, 4].forEach((i) => (L.players[i].alive = false));
  assert.deepStrictEqual(MS.checkWin(L), { winner: 'lovers' });
});

test('Tiên tri biết đúng ai là Sói', () => {
  const G = fixed(['werewolf', 'seer', 'villager', 'villager', 'villager']);
  MS.startNight(G);
  assert.deepStrictEqual(MS.applyNightAction(G, 'seer', { target: 0 }), { target: 0, isWolf: true });
  assert.throws(() => MS.applyNightAction(G, 'seer', { target: 1 }));
});

test('văn mẫu đủ khoá cho mọi phong cách', () => {
  const keys = Object.keys(NARR.LINES.classic);
  for (const s of Object.keys(NARR.STYLES)) {
    for (const k of keys) assert.ok(NARR.line(s, k, { n: 2, name: 'A', names: 'A', role: 'Sói', time: '3 phút' }), s + '.' + k);
  }
  for (const k of MS.STEP_ORDER) {
    assert.ok(NARR.LINES.classic[k + '_wake'] || NARR.LINES.classic[k + '_wake1'], k);
    assert.ok(NARR.LINES.classic[k + '_sleep'], k);
  }
  assert.strictEqual(NARR.joinNames(['A', 'B', 'C']), 'A, B và C');
  assert.strictEqual(NARR.spokenTime(150), '2 phút 30 giây');
});
