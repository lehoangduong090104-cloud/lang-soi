/* Làng Sói – giao diện. Một máy chung đặt giữa bàn: chia vai, đọc lời dẫn, nhận thao tác đêm, tự tính kết quả. */
(() => {
  'use strict';
  const { ROLES, ROLE_ORDER, STEPS } = MS;
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  // ---------- Lưu trữ ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('langsoi:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('langsoi:' + k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
    del(k) { try { localStorage.removeItem('langsoi:' + k); } catch { /* bỏ qua */ } },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const setup = Object.assign({ names: [], counts: null, touched: false, page: 'names' }, store.get('setup', {}));
  setup.settings = Object.assign({}, MS.DEFAULT_SETTINGS, setup.settings || {});
  const voice = Object.assign({ on: true, uri: '', rate: 1 }, store.get('voice', {}));
  let G = store.get('game', null);
  if (G && (!G.flow || !Array.isArray(G.players))) G = null;
  let undo = G ? store.get('undo', []) : [];

  const ui = {
    screen: G ? (G.flow.phase === 'end' ? 'game' : 'resume') : 'setup',
    sel: [], confirm: null, menu: null, peek: null, held: false, preview: false, focusAdd: false, lastKey: '',
  };

  const saveSetup = () => store.set('setup', setup);
  const saveVoice = () => store.set('voice', voice);
  function saveGame() {
    if (G) store.set('game', G); else store.del('game');
    store.set('undo', undo);
  }
  function snapshot() {
    if (!G) return;
    undo.push(JSON.stringify(G));
    if (undo.length > 30) undo.shift();
  }
  function syncCounts() {
    if (!setup.touched || !setup.counts) setup.counts = MS.defaultRoleCounts(setup.names.length);
  }
  syncCounts();

  let toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($toast.hidden = true), 2800);
  }

  // ---------- Giọng đọc ----------
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voices = [];
  let booted = false;
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    if (booted && ui.screen === 'setup' && setup.page === 'start') render();
  }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }
  const viVoices = () => voices.filter((v) => /^vi/i.test(v.lang));
  function currentVoice() {
    if (voice.uri) {
      const v = voices.find((x) => x.voiceURI === voice.uri);
      if (v) return v;
    }
    const vi = viVoices();
    return vi.find((v) => /natural|online/i.test(v.name)) || vi.find((v) => /google/i.test(v.name)) || vi[0] || null;
  }
  const estimate = (t) => Math.max(1300, (t.length * 72) / (voice.rate || 1));
  let unlocked = false;
  function unlockAudio() {
    if (unlocked || !synth) return;
    unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch { /* bỏ qua */ }
  }
  function speak(text) {
    return new Promise((resolve) => {
      if (!synth || !voice.on) return setTimeout(resolve, estimate(text));
      let done = false;
      let timer;
      const fin = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = currentVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'vi-VN';
        u.rate = voice.rate || 1;
        u.onend = fin;
        u.onerror = fin;
        timer = setTimeout(fin, estimate(text) * 2 + 4000);
        synth.speak(u);
      } catch { setTimeout(fin, estimate(text)); }
    });
  }

  // Mỗi chuỗi lời dẫn mang một "token"; hoàn tác / bỏ ván sẽ đổi token để dừng chuỗi cũ.
  let token = 0;
  function newRun() {
    token++;
    if (synth) try { synth.cancel(); } catch { /* bỏ qua */ }
    return token;
  }
  const wait = (my, ms) => new Promise((r) => setTimeout(() => r(my === token), ms));
  const N = (key, vars) => NARR.line(G ? G.settings.style : setup.settings.style, key, vars);
  function setCaption(text) {
    $app.querySelectorAll('[data-caption]').forEach((el) => (el.textContent = text));
  }
  async function say(my, text) {
    if (my !== token) return false;
    if (G && G.flow) { G.flow.caption = text; saveGame(); }
    setCaption(text);
    await speak(text);
    return my === token;
  }

  // ---------- Giữ màn hình sáng ----------
  let wakeLock = null;
  async function requestWake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch { /* bỏ qua */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ui.screen === 'game') requestWake();
  });

  // ---------- Tiện ích ----------
  const pname = (id) => G.players[id].name;
  const roleName = (id) => ROLES[G.players[id].role].name;
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const step = () => (G.flow.steps ? G.flow.steps[G.flow.idx] : null);
  const holders = (role) => G.players.filter((p) => p.alive && p.role === role).map((p) => p.id);
  const wakeKey = (kind) => (kind === 'wolves' && G.night === 1 ? 'wolves_wake1' : kind + '_wake');

  // ================= LUỒNG CHƠI =================
  function startGame() {
    syncCounts();
    const err = MS.validateSetup(setup.names, setup.counts);
    if (err) return toast(err);
    unlockAudio();
    requestWake();
    newRun();
    G = MS.createGame(setup.names, setup.counts, setup.settings);
    G.flow = { phase: 'reveal', idx: 0, stage: 'handoff', caption: '' };
    undo = [];
    ui.held = false;
    ui.screen = 'game';
    saveGame();
    render();
  }

  async function startNight(my) {
    MS.startNight(G);
    G.flow = { phase: 'night', steps: MS.nightSteps(G), idx: -1, stage: 'intro', caption: '' };
    ui.sel = [];
    saveGame();
    render();
    if (!(await wait(my, 600))) return;
    if (!(await say(my, N(G.night === 1 ? 'nightStart1' : 'nightStart', { n: G.night })))) return;
    if (!(await wait(my, 1800))) return;
    nextStep(my);
  }

  async function nextStep(my) {
    const f = G.flow;
    f.idx++;
    f.sub = null;
    f.result = null;
    f.witchSave = false;
    ui.sel = [];
    ui.confirm = null;
    if (f.idx >= f.steps.length) return endNight(my);
    const st = step();
    f.stage = 'wake';
    saveGame();
    render();
    if (!(await say(my, N(wakeKey(st.kind))))) return;
    if (!st.active) {
      // Vai đã chết: vẫn chờ như thật để không ai đoán ra.
      f.stage = 'fake';
      saveGame();
      render();
      if (!(await wait(my, 6000 + Math.random() * 5000))) return;
      return sleepStep(my);
    }
    f.stage = 'act';
    if (st.kind === 'witch') f.sub = G.rec.wolf != null && G.witch.heal ? 'save' : G.witch.poison ? 'poison' : 'none';
    saveGame();
    render();
  }

  async function sleepStep(my) {
    const f = G.flow;
    const st = step();
    f.stage = 'sleep';
    f.result = null;
    ui.sel = [];
    saveGame();
    render();
    if (!(await say(my, N(st.kind + '_sleep')))) return;
    if (!(await wait(my, 1500 + Math.random() * 1500))) return;
    nextStep(my);
  }

  function revealLines(deaths) {
    const out = [];
    deaths.filter((d) => d.cause === 'love').forEach((d) => out.push(N('love', { name: pname(d.id) })));
    if (G.settings.revealOnDeath) {
      deaths
        .filter((d) => G.players[d.id].role !== 'hunter') // Thợ săn tự lộ ở lượt bắn
        .forEach((d) => out.push(N('reveal', { name: pname(d.id), role: roleName(d.id) })));
    }
    return out;
  }

  function endNight(my) {
    const deaths = MS.resolveNight(G);
    const lines = [N('dawn')];
    if (!deaths.length) lines.push(N('peaceful'));
    else lines.push(N('deaths', { names: NARR.joinNames(deaths.filter((d) => d.cause !== 'love').map((d) => pname(d.id))) }));
    lines.push(...revealLines(deaths));
    announce(my, { title: `☀️ Ngày ${G.day}`, lines, deaths: deaths.map((d) => d.id), after: 'day' });
  }

  async function announce(my, { title, lines, deaths, after }) {
    G.flow = { phase: 'announce', title, lines, deaths, after, stage: 'speaking', cur: 0, caption: '' };
    ui.sel = [];
    ui.confirm = null;
    saveGame();
    render();
    for (let i = 0; i < lines.length; i++) {
      G.flow.cur = i;
      render();
      if (!(await say(my, lines[i]))) return;
      if (!(await wait(my, 450))) return;
    }
    G.flow.stage = 'ready';
    G.flow.cur = -1;
    saveGame();
    render();
  }

  function proceed() {
    const my = newRun();
    const after = G.flow.after;
    if (G.pendingHunters.length) return startHunter(my, after);
    const win = MS.checkWin(G);
    if (win) return endGame(my, win);
    if (after === 'day') startDay(my);
    else startNight(my);
  }

  async function startHunter(my, after) {
    const h = G.pendingHunters[0];
    G.flow = { phase: 'hunter', hunter: h, after, stage: 'speaking', caption: '' };
    ui.sel = [];
    ui.confirm = null;
    saveGame();
    render();
    if (!(await say(my, N('hunter', { name: pname(h) })))) return;
    G.flow.stage = 'act';
    saveGame();
    render();
  }

  function doShoot(target) {
    snapshot();
    const my = newRun();
    const f = G.flow;
    const deaths = MS.hunterShoot(G, f.hunter, target);
    const lines = [target == null ? N('noshot') : N('shot', { name: pname(target) })];
    lines.push(...revealLines(deaths));
    announce(my, { title: '🏹 Thợ săn', lines, deaths: deaths.map((d) => d.id), after: f.after });
  }

  async function startDay(my) {
    const sec = G.settings.discussSec;
    G.flow = { phase: 'day', endsAt: Date.now() + sec * 1000, left: null, timeup: false, caption: '' };
    saveGame();
    render();
    await say(my, N('discuss', { time: NARR.spokenTime(sec) }));
  }

  async function startVote(my, timeup) {
    G.flow = { phase: 'vote', caption: '' };
    ui.sel = [];
    ui.confirm = null;
    saveGame();
    render();
    if (timeup && !(await say(my, N('timeup')))) return;
    await say(my, N('vote'));
  }

  function doLynch(id) {
    snapshot();
    const my = newRun();
    const deaths = MS.lynch(G, id);
    const lines = [id == null ? N('nolynch') : N('lynch', { name: pname(id) })];
    lines.push(...revealLines(deaths));
    announce(my, { title: '⚖️ Kết quả bỏ phiếu', lines, deaths: deaths.map((d) => d.id), after: 'night' });
  }

  async function endGame(my, win) {
    G.winner = win.winner;
    G.flow = { phase: 'end', caption: '' };
    saveGame();
    render();
    await say(my, N('win_' + win.winner));
  }

  // Thao tác ban đêm
  function nightConfirm() {
    const f = G.flow;
    const st = step();
    try {
      switch (st.kind) {
        case 'cupid':
          if (ui.sel.length !== 2) return toast('Hãy chọn đúng 2 người.');
          snapshot();
          MS.applyNightAction(G, 'cupid', { ids: ui.sel.slice() });
          return sleepStep(newRun());
        case 'lovers':
          return sleepStep(newRun());
        case 'guard':
          snapshot();
          MS.applyNightAction(G, 'guard', { target: ui.sel.length ? ui.sel[0] : null });
          return sleepStep(newRun());
        case 'wolves':
          if (!ui.sel.length) return toast('Hãy chọn 1 người.');
          snapshot();
          MS.applyNightAction(G, 'wolves', { target: ui.sel[0] });
          return sleepStep(newRun());
        case 'seer':
          if (f.stage === 'result') return sleepStep(newRun());
          if (!ui.sel.length) {
            if (!MS.targetsFor(G, 'seer').length) return sleepStep(newRun());
            return toast('Hãy chọn 1 người.');
          }
          snapshot();
          f.result = MS.applyNightAction(G, 'seer', { target: ui.sel[0] });
          f.stage = 'result';
          saveGame();
          return render();
        default:
          return undefined;
      }
    } catch (e) {
      toast(e.message);
    }
  }
  function witchApply(poison) {
    snapshot();
    MS.applyNightAction(G, 'witch', { save: G.flow.witchSave, poison });
    sleepStep(newRun());
  }

  // Khôi phục sau khi tải lại trang hoặc hoàn tác.
  function restoreFlow() {
    const my = newRun();
    const f = G.flow;
    ui.sel = [];
    ui.confirm = null;
    ui.menu = null;
    ui.peek = null;
    ui.held = false;
    render();
    switch (f.phase) {
      case 'night':
        if (f.stage === 'intro') {
          return (async () => {
            if (!(await say(my, N(G.night === 1 ? 'nightStart1' : 'nightStart', { n: G.night })))) return;
            if (!(await wait(my, 1500))) return;
            nextStep(my);
          })();
        }
        if (f.stage === 'wake' || f.stage === 'fake') { f.idx--; return nextStep(my); }
        if (f.stage === 'sleep') return nextStep(my);
        return (async () => {
          const keep = f.stage;
          f.stage = 'wake';
          render();
          if (!(await say(my, N(wakeKey(step().kind))))) return;
          f.stage = keep;
          saveGame();
          render();
        })();
      case 'announce':
        if (f.stage === 'speaking') return announce(my, f);
        return undefined;
      case 'hunter':
        if (f.stage === 'speaking') return startHunter(my, f.after);
        return undefined;
      case 'day':
        f.timeup = false;
        if (f.left == null && f.endsAt < Date.now() + 5000) f.endsAt = Date.now() + 60000;
        saveGame();
        return render();
      default:
        return undefined;
    }
  }

  function doUndo() {
    if (!undo.length) return toast('Không còn bước nào để hoàn tác.');
    G = JSON.parse(undo.pop());
    saveGame();
    toast('Đã quay lại bước trước.');
    restoreFlow();
  }

  function quitGame() {
    newRun();
    G = null;
    undo = [];
    saveGame();
    ui.menu = null;
    ui.confirm = null;
    ui.screen = 'setup';
    render();
  }

  // Đồng hồ thảo luận
  setInterval(() => {
    if (!G || ui.screen !== 'game' || G.flow.phase !== 'day') return;
    const f = G.flow;
    const left = f.left != null ? f.left : Math.max(0, f.endsAt - Date.now());
    const el = $app.querySelector('[data-timer]');
    if (el) el.textContent = fmt(left);
    if (f.left == null && left <= 0 && !f.timeup) {
      f.timeup = true;
      snapshot();
      startVote(newRun(), true);
    }
  }, 250);

  // ================= GIAO DIỆN =================
  function circleHTML({ players, selectable = () => false, cls = () => '', badge = () => '', center = '', small = false }) {
    const n = players.length;
    if (!n) return '';
    const seat = n <= 6 ? 23 : n <= 8 ? 21 : n <= 10 ? 19 : n <= 12 ? 17 : n <= 15 ? 15 : 13;
    const R = 50 - seat / 2 - 1.5;
    const seats = players.map((p, i) => {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
      const x = 50 + R * Math.cos(a);
      const y = 50 + R * Math.sin(a);
      const can = selectable(p);
      const b = badge(p);
      return `<button class="seat ${cls(p)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%" data-seat="${i}" ${can ? `data-pid="${p.id}"` : 'disabled'} aria-label="${esc(p.name)}"><span class="no">${i + 1}</span><span class="nm">${esc(p.name)}</span>${b ? `<span class="bd">${b}</span>` : ''}</button>`;
    });
    return `<div class="circle${small ? ' small' : ''}" style="--seat:${seat}%;--sf:${(seat * 0.14).toFixed(2)}">${seats.join('')}<div class="mid">${center}</div></div>`;
  }

  const deadCls = (p) => (p.alive ? '' : 'dead');
  const deadBadge = (p) => (p.alive ? '' : G.settings.revealOnDeath ? ROLES[p.role].icon : '✝');
  const selCls = (p) => (ui.sel.includes(p.id) ? ' sel' : '');

  function render() {
    const night = ui.screen === 'game' && G && G.flow.phase === 'night';
    document.body.classList.toggle('night', night);
    let html;
    if (ui.screen === 'setup') html = viewSetup();
    else if (ui.screen === 'resume') html = viewResume();
    else html = viewGame();
    if (ui.peek) html += viewPeek();
    if (ui.menu) html += viewMenu();
    $app.innerHTML = html;
    const key = ui.screen + '|' + (G ? `${G.flow.phase}|${G.flow.idx}|${G.flow.stage}|${G.flow.sub}` : setup.page);
    if (key !== ui.lastKey) { window.scrollTo(0, 0); ui.lastKey = key; }
    if (ui.focusAdd) {
      ui.focusAdd = false;
      const el = document.getElementById('addName');
      if (el) el.focus();
    }
  }

  const brand = () => `<div class="brand"><span class="logo">🐺</span><div><h1>Làng Sói</h1><p class="muted small">Ma sói nhiều đêm · 1 điện thoại tự dẫn trò, không cần quản trò</p></div></div>`;

  // ----- Thiết lập -----
  function viewSetup() {
    const tabs = [['names', '1. Người chơi'], ['roles', '2. Vai & luật'], ['start', '3. Bắt đầu']]
      .map(([k, l]) => `<button data-act="page" data-v="${k}" class="${setup.page === k ? 'on' : ''}">${l}</button>`)
      .join('');
    const body = setup.page === 'roles' ? setupRoles() : setup.page === 'start' ? setupStart() : setupNames();
    return `${brand()}<div class="steps">${tabs}</div>${body}<p class="footer">Dữ liệu chỉ lưu trên máy này.</p>`;
  }

  function setupNames() {
    const n = setup.names.length;
    const rows = setup.names
      .map((x, i) => `<div class="name-row"><span class="no">${i + 1}</span><input data-name="${i}" value="${esc(x)}" maxlength="24" aria-label="Tên người thứ ${i + 1}"><button class="icon" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Lên">↑</button><button class="icon" data-act="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Xuống">↓</button><button class="icon" data-act="delName" data-i="${i}" aria-label="Xoá">✕</button></div>`)
      .join('');
    const players = setup.names.map((name, id) => ({ id, name: name || '…' }));
    return `
      <div class="card stack">
        <div><h2>Ai đang ngồi trong vòng?</h2><p class="muted small">Ngồi thành vòng tròn, nhập tên lần lượt <b>theo chiều kim đồng hồ</b>, bắt đầu từ bất kỳ ai. Có thể dán nhiều tên cách nhau bằng dấu phẩy.</p></div>
        <form class="row nowrap" data-form="add"><input id="addName" placeholder="Tên người chơi…" maxlength="200" autocomplete="off" enterkeyhint="done"><button class="primary" type="submit">Thêm</button></form>
        ${n ? `<div class="names">${rows}</div>` : '<p class="muted small center">Chưa có ai. Cần ít nhất 5 người.</p>'}
        ${n ? `<div class="row between"><span class="muted small">${n}/${MS.MAX_PLAYERS} người</span><button class="ghost small" data-act="clearNames">${ui.confirm === 'clear' ? 'Bấm lần nữa để xoá hết' : 'Xoá hết'}</button></div>` : ''}
      </div>
      ${n ? `<div class="card stack"><h3>Vòng tròn trên màn hình</h3>${circleHTML({ players, small: true, center: '<div class="muted small">Chiều kim đồng hồ ↻</div>' })}</div>` : ''}
      <button class="big primary" data-act="page" data-v="roles" ${n < MS.MIN_PLAYERS ? 'disabled' : ''}>${n < MS.MIN_PLAYERS ? `Cần thêm ${MS.MIN_PLAYERS - n} người` : 'Tiếp: chọn vai →'}</button>`;
  }

  function scriptHTML(night) {
    const set = new Set(Object.keys(setup.counts).filter((r) => setup.counts[r] > 0));
    const ks = MS.planSteps(set, night);
    const chips = ks.map((k) => `<span class="st">${STEPS[k].icon} ${STEPS[k].name}</span>`);
    chips.push('<span class="st">☀️ Trời sáng</span>');
    return chips.join('<span class="arrow">→</span>');
  }

  function setupRoles() {
    const n = setup.names.length;
    const c = setup.counts;
    const total = MS.sumCounts(c);
    const roleRows = ROLE_ORDER.map((r) => {
      const R = ROLES[r];
      return `<div class="role-row"><span class="ic">${R.icon}</span><span class="nm">${R.name}<small>${R.short}</small></span><button class="icon" data-act="role" data-r="${r}" data-d="-1" ${c[r] ? '' : 'disabled'} aria-label="Bớt ${R.name}">−</button><span class="ct">${c[r] || 0}</span><button class="icon" data-act="role" data-r="${r}" data-d="1" ${MS.UNIQUE.includes(r) && c[r] >= 1 ? 'disabled' : ''} aria-label="Thêm ${R.name}">+</button></div>`;
    }).join('');
    const s = setup.settings;
    const chk = (k, label, hint, show = true) => (show ? `<label class="check"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}><span>${label}<small>${hint}</small></span></label>` : '');
    const styles = Object.entries(NARR.STYLES)
      .map(([k, v]) => `<button class="choice ${s.style === k ? 'selected' : ''}" data-act="style" data-v="${k}"><b>${v.name}</b><span class="muted small">${v.desc}</span></button>`)
      .join('');
    const err = MS.validateSetup(setup.names, c);
    return `
      <div class="card stack">
        <div class="row between"><h2>Bộ vai</h2><span class="pill ${total === n ? 'ok' : 'bad'}">${total}/${n} lá</span></div>
        <div class="roles">${roleRows}</div>
        <div class="row"><button data-act="preset">✨ Gợi ý cho ${n} người</button></div>
      </div>
      <div class="card stack">
        <h2>🎙️ Kịch bản đêm</h2>
        <p class="muted small">Lời dẫn được <b>tự ghép theo bộ vai</b> ở trên: vai không có trong ván sẽ không bị gọi, thêm vai nào thì lượt của vai đó tự chen vào đúng chỗ. Thông tin bí mật chỉ hiện trên màn hình, không bao giờ đọc to.</p>
        <div class="stack"><div><h3>Đêm 1</h3><div class="script">${scriptHTML(1)}</div></div>
        <div><h3>Các đêm sau</h3><div class="script">${scriptHTML(2)}</div></div></div>
        <div><h3>Phong cách lời dẫn</h3></div>
        <div class="styles">${styles}</div>
        ${ui.preview ? '<p class="caption small" data-caption></p>' : ''}
        <button data-act="previewScript">${ui.preview ? '⏹ Dừng nghe thử' : '▶ Nghe thử lời dẫn đêm 1'}</button>
      </div>
      <div class="card stack">
        <h2>Luật chơi</h2>
        <div>
          ${chk('revealOnDeath', 'Lật bài người chết', 'Ai chết thì máy đọc to vai của người đó.')}
          ${chk('callDeadRoles', 'Vẫn gọi vai đã chết', 'Máy vẫn gọi và chờ như thường để không ai đoán được vai nào đã chết.')}
          ${chk('guardSelf', 'Bảo vệ được tự bảo vệ mình', '', c.guard > 0)}
          ${chk('guardRepeat', 'Bảo vệ được bảo vệ 1 người 2 đêm liền', 'Mặc định không được.', c.guard > 0)}
          ${chk('witchSelfSave', 'Phù thủy được dùng bình cứu cho chính mình', '', c.witch > 0)}
        </div>
        <div class="row between"><span>Thời gian thảo luận</span><span class="stepper"><button class="icon" data-act="disc" data-d="-30" aria-label="Bớt">−</button><span class="val">${fmt(s.discussSec * 1000)}</span><button class="icon" data-act="disc" data-d="30" aria-label="Thêm">+</button></span></div>
      </div>
      ${err ? `<div class="info warn">${esc(err)}</div>` : ''}
      <button class="big primary" data-act="page" data-v="start">Tiếp →</button>`;
  }

  function setupStart() {
    const n = setup.names.length;
    const err = MS.validateSetup(setup.names, setup.counts);
    const isAndroid = /Android/i.test(navigator.userAgent);
    let warn = '';
    if (!synth) {
      warn = `<div class="info warn">Trình duyệt này không đọc được giọng nói (thường gặp khi mở link trong Zalo/Messenger). Lời dẫn vẫn hiện chữ to, nhưng nên mở bằng Chrome (Android), Safari (iPhone) hoặc Edge.
        ${isAndroid ? `<p style="margin-top:8px"><a class="btn" style="color:var(--moon)" href="intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end">Mở bằng Chrome</a></p>` : ''}</div>`;
    } else if (voices.length && !viVoices().length) {
      warn = '<div class="info warn">Máy này chưa có giọng tiếng Việt nên có thể đọc sai giọng. Nên dùng Chrome trên Android, Safari trên iPhone hoặc Edge trên Windows.</div>';
    }
    const vi = viVoices();
    const others = voices.filter((v) => !/^vi/i.test(v.lang));
    const opt = (v) => `<option value="${esc(v.voiceURI)}" ${voice.uri === v.voiceURI ? 'selected' : ''}>${esc(v.name.replace(/^Microsoft\s+/, ''))} (${esc(v.lang)})</option>`;
    const chips = ROLE_ORDER.filter((r) => setup.counts[r] > 0).map((r) => `<span class="pill">${ROLES[r].icon} ${ROLES[r].name}${setup.counts[r] > 1 ? ' ×' + setup.counts[r] : ''}</span>`).join('');
    return `
      <div class="card stack">
        <h2>Giọng quản trò</h2>
        ${warn}
        <label class="check"><input type="checkbox" data-voice="on" ${voice.on ? 'checked' : ''}><span>Đọc lời dẫn bằng giọng nói<small>Tắt đi thì lời dẫn chỉ hiện chữ trên màn hình.</small></span></label>
        ${synth ? `<div><label for="vsel">Giọng đọc</label><select id="vsel" data-voice="uri"><option value="">Tự động (giọng tiếng Việt tốt nhất)</option>${vi.map(opt).join('')}${others.length ? `<optgroup label="Ngôn ngữ khác">${others.map(opt).join('')}</optgroup>` : ''}</select></div>
        <div><label>Tốc độ đọc: <b data-rate>${voice.rate.toFixed(2)}×</b></label><input type="range" min="0.7" max="1.4" step="0.05" value="${voice.rate}" data-voice="rate" aria-label="Tốc độ đọc"></div>
        <button data-act="testVoice">🔊 Nghe thử</button>` : ''}
      </div>
      <div class="card stack">
        <h2>Sẵn sàng</h2>
        <p>${n} người chơi</p>
        <div class="chips">${chips}</div>
        <ul class="small muted" style="margin:0;padding-left:18px">
          <li>Cả bàn chỉ cần <b>1 điện thoại này</b>: bật loa to, đặt giữa bàn.</li>
          <li>Đầu ván, chuyền máy theo vòng tròn để từng người xem vai.</li>
          <li>Ban đêm, ai được gọi thì mở mắt, cầm máy chạm vào tên trên vòng tròn.</li>
          <li>Màn hình được giữ sáng. Lỡ tải lại trang vẫn chơi tiếp được.</li>
        </ul>
      </div>
      ${err ? `<div class="info warn">${esc(err)}</div>` : ''}
      <button class="big primary" data-act="start" ${err ? 'disabled' : ''}>🃏 Chia bài & bắt đầu</button>`;
  }

  function phaseLabel() {
    const f = G.flow;
    if (f.phase === 'reveal') return '🃏 Xem vai';
    if (f.phase === 'night') {
      const st = step();
      return `🌙 Đêm ${G.night}${st && f.stage !== 'intro' ? ' · ' + STEPS[st.kind].name : ''}`;
    }
    if (f.phase === 'end') return '🏁 Kết thúc';
    return `☀️ Ngày ${G.day}`;
  }

  function viewResume() {
    const alive = G.players.filter((p) => p.alive).length;
    return `${brand()}
      <div class="card stack center">
        <h2>Đang có ván chơi dở</h2>
        <p class="muted">${phaseLabel()} · ${alive}/${G.players.length} người còn sống</p>
        ${G.flow.phase === 'night' ? '<div class="info warn">Đang là ban đêm: mọi người nhắm mắt trước khi bấm Chơi tiếp.</div>' : ''}
        <button class="big primary" data-act="resume">▶ Chơi tiếp</button>
        <button data-act="abandon">${ui.confirm === 'abandon' ? 'Bấm lần nữa để bỏ ván' : 'Bỏ ván, về màn hình thiết lập'}</button>
      </div>`;
  }

  // ----- Trong ván -----
  function viewGame() {
    const f = G.flow;
    const top = `<div class="topbar"><span class="ph">${phaseLabel()}</span>
      ${f.caption ? '<button class="icon" data-act="repeat" aria-label="Đọc lại">🔁</button>' : ''}
      <button class="icon" data-act="toggleVoice" aria-label="Bật/tắt giọng">${voice.on ? '🔊' : '🔇'}</button>
      <button class="icon" data-act="menu" aria-label="Menu">⋯</button></div>`;
    let body = '';
    switch (f.phase) {
      case 'reveal': body = viewReveal(); break;
      case 'night': body = viewNight(); break;
      case 'announce': body = viewAnnounce(); break;
      case 'hunter': body = viewHunter(); break;
      case 'day': body = viewDay(); break;
      case 'vote': body = viewVote(); break;
      case 'end': body = viewEnd(); break;
      default: body = '';
    }
    return top + body;
  }

  function roleCard(p) {
    const r = ROLES[p.role];
    return `<div class="rolecard ${r.team}" data-hold>
      <div class="back"><div class="big">🃏</div><div>Nhấn giữ để xem</div></div>
      <div class="front"><div class="ic">${r.icon}</div><div class="nm">${r.name}</div><p class="muted small">${r.desc}</p>
      ${p.role === 'werewolf' ? '<p class="small">Đêm đầu tiên, bầy Sói sẽ nhận mặt nhau.</p>' : ''}</div></div>`;
  }

  function viewReveal() {
    const f = G.flow;
    const n = G.players.length;
    if (f.idx >= n) {
      return `<div class="card stack center"><div style="font-size:56px">🌙</div><h2>Mọi người đã xem vai</h2>
        <p class="muted">Đặt máy giữa bàn, bật loa. Bấm bắt đầu rồi cả làng nhắm mắt.</p>
        <button class="big primary" data-act="startNight">🌙 Bắt đầu đêm 1</button></div>`;
    }
    const p = G.players[f.idx];
    if (f.stage === 'handoff') {
      return `<div class="card stack center"><p class="muted">Người ${f.idx + 1}/${n} · chuyền máy theo vòng tròn</p>
        <div class="handoff"><p class="muted">Đưa máy cho</p><div class="who">${esc(p.name)}</div></div>
        <p class="muted small">Những người khác đừng nhìn màn hình nhé.</p>
        <button class="big primary" data-act="revealMe">Tôi là ${esc(p.name)} · xem vai</button></div>`;
    }
    return `<div class="stack"><p class="center"><b>${esc(p.name)}</b>, nhấn giữ lá bài để xem vai. Thả tay là ẩn.</p>
      ${roleCard(p)}
      <button class="big primary" data-act="revealDone" ${ui.held ? '' : 'disabled'}>Đã nhớ · đưa máy cho người tiếp theo</button></div>`;
  }

  function actWrap(icon, title, hint, inner) {
    return `<div class="act"><div class="title"><span class="ic">${icon}</span><div><h2>${title}</h2>${hint ? `<p class="muted small">${hint}</p>` : ''}</div></div>${inner}</div>`;
  }
  const selName = () => (ui.sel.length ? ui.sel.map(pname).map(esc).join(' & ') : '');
  const midText = (icon, text) => `<div class="big">${icon}</div><div class="t">${text}</div>`;

  function viewNight() {
    const f = G.flow;
    if (f.stage !== 'act' && f.stage !== 'result') {
      return `<div class="sleep"><div class="big">🌙</div><p class="caption" data-caption>${esc(f.caption || '')}</p><p class="small">Mọi người nhắm mắt. Chỉ mở mắt khi được gọi.</p></div>`;
    }
    const st = step();
    const ids = new Set(MS.targetsFor(G, st.kind));
    const base = { players: G.players };
    switch (st.kind) {
      case 'cupid':
        return actWrap('💘', 'Thần tình yêu', 'Chọn 2 người sẽ yêu nhau (có thể chọn chính mình).',
          circleHTML({ ...base, selectable: (p) => ids.has(p.id), cls: (p) => deadCls(p) + selCls(p), badge: (p) => (ui.sel.includes(p.id) ? '💘' : ''), center: midText('💘', selName() || 'Chọn 2 người') })
          + `<button class="big primary" data-act="nightOk" ${ui.sel.length === 2 ? '' : 'disabled'}>Ghép đôi</button>`);
      case 'lovers': {
        const [a, b] = G.lovers || [];
        return actWrap('💞', 'Cặp đôi', 'Hai bạn là người yêu của nhau. Một người chết, người kia chết theo.',
          (G.lovers ? `<div class="result love">${esc(pname(a))} 💘 ${esc(pname(b))}</div>` : '')
          + circleHTML({ ...base, cls: (p) => deadCls(p) + (p.lover ? ' love' : ' dim'), badge: (p) => (p.lover ? '💘' : ''), center: midText('💞', 'Nhớ người yêu của mình') })
          + '<button class="big primary" data-act="nightOk">Đã xem</button>');
      }
      case 'guard': {
        const me = new Set(holders('guard'));
        const locked = !G.settings.guardRepeat ? G.guardLast : null;
        const hint = 'Chọn 1 người để bảo vệ khỏi Sói đêm nay.' + (locked != null && G.players[locked].alive ? ` Không được chọn lại ${esc(pname(locked))} (đã bảo vệ đêm trước).` : '');
        return actWrap('🛡️', 'Bảo vệ', hint,
          circleHTML({ ...base, selectable: (p) => ids.has(p.id), cls: (p) => deadCls(p) + selCls(p) + (me.has(p.id) ? ' me' : '') + (p.alive && !ids.has(p.id) ? ' dim' : ''), badge: (p) => (ui.sel.includes(p.id) ? '🛡️' : p.id === locked && p.alive ? '🔒' : ''), center: midText('🛡️', selName() || 'Chạm để chọn') })
          + `<button class="big primary" data-act="nightOk" ${ui.sel.length ? '' : 'disabled'}>Bảo vệ ${selName()}</button>
             <button data-act="nightSkip">Không bảo vệ ai</button>`);
      }
      case 'wolves': {
        const mates = new Set(holders('werewolf'));
        return actWrap('🐺', 'Bầy Sói', `Các Sói được tô đỏ (${mates.size} con). Thống nhất với nhau rồi chọn 1 người để cắn.`,
          circleHTML({ ...base, selectable: (p) => ids.has(p.id), cls: (p) => deadCls(p) + selCls(p) + (mates.has(p.id) ? ' mate' : ''), badge: (p) => (mates.has(p.id) ? '🐺' : ui.sel.includes(p.id) ? '🩸' : ''), center: midText('🐺', selName() || 'Chạm để chọn') })
          + `<button class="big danger" data-act="nightOk" ${ui.sel.length ? '' : 'disabled'}>Cắn ${selName()}</button>`);
      }
      case 'witch': return viewWitch(ids);
      case 'seer': {
        const me = new Set(holders('seer'));
        if (f.stage === 'result' && f.result) {
          const t = f.result.target;
          const w = f.result.isWolf;
          return actWrap('🔮', 'Tiên tri', 'Ghi nhớ kết quả rồi bấm Đã xem.',
            `<div class="result ${w ? 'wolf' : 'good'}">${esc(pname(t))} ${w ? 'LÀ SÓI 🐺' : 'không phải Sói ✅'}</div>`
            + circleHTML({ ...base, cls: (p) => deadCls(p) + (p.id === t ? (w ? ' mate' : ' good') : ' dim'), badge: (p) => (p.id === t ? (w ? '🐺' : '✅') : ''), center: midText('🔮', esc(pname(t))) })
            + '<button class="big primary" data-act="nightOk">Đã xem</button>');
        }
        return actWrap('🔮', 'Tiên tri', 'Chọn 1 người để soi xem có phải Sói không.',
          circleHTML({ ...base, selectable: (p) => ids.has(p.id), cls: (p) => deadCls(p) + selCls(p) + (me.has(p.id) ? ' me' : ''), badge: (p) => (ui.sel.includes(p.id) ? '🔮' : ''), center: midText('🔮', selName() || 'Chạm để chọn') })
          + `<button class="big primary" data-act="nightOk" ${ui.sel.length || !ids.size ? '' : 'disabled'}>${ids.size ? 'Soi ' + selName() : 'Không còn ai để soi'}</button>`);
      }
      default:
        return '';
    }
  }

  function viewWitch(ids) {
    const f = G.flow;
    const me = new Set(holders('witch'));
    const victim = G.rec.wolf;
    const potions = `<div class="chips"><span class="pill ${G.witch.heal ? 'ok' : ''}">💚 Bình cứu: ${G.witch.heal ? 'còn' : 'đã dùng'}</span><span class="pill ${G.witch.poison ? 'bad' : ''}">☠️ Bình độc: ${G.witch.poison ? 'còn' : 'đã dùng'}</span></div>`;
    const vicCls = (p) => deadCls(p) + (p.id === victim ? ' victim' : '') + (me.has(p.id) ? ' me' : '');
    if (f.sub === 'save') {
      const can = MS.canWitchSave(G);
      return actWrap('🧪', 'Phù thủy', 'Đêm nay Sói đã cắn người được đánh dấu 🩸.',
        potions
        + circleHTML({ players: G.players, cls: vicCls, badge: (p) => (p.id === victim ? '🩸' : ''), center: midText('🩸', esc(pname(victim))) })
        + (can
          ? `<button class="big primary" data-act="witchSave">💚 Cứu ${esc(pname(victim))}</button><button data-act="witchNoSave">Không cứu</button>`
          : `<div class="info warn">Luật ván này: Phù thủy không được tự cứu mình.</div><button class="big primary" data-act="witchNoSave">Tiếp tục</button>`));
    }
    if (f.sub === 'poison') {
      const note = victim != null && !f.witchSave ? `Sói đã cắn ${esc(pname(victim))}${G.witch.heal ? ' (bạn không cứu)' : ''}. ` : f.witchSave ? `Bạn đã cứu ${esc(pname(victim))}. ` : 'Đêm nay Sói không cắn ai. ';
      return actWrap('🧪', 'Phù thủy', note + 'Có muốn dùng bình độc giết 1 người không?',
        potions
        + circleHTML({ players: G.players, selectable: (p) => ids.has(p.id), cls: (p) => vicCls(p) + selCls(p), badge: (p) => (ui.sel.includes(p.id) ? '☠️' : p.id === victim ? (f.witchSave ? '💚' : '🩸') : ''), center: midText('☠️', selName() || 'Chạm để chọn') })
        + `<button class="big danger" data-act="witchPoison" ${ui.sel.length ? '' : 'disabled'}>☠️ Đầu độc ${selName()}</button><button data-act="witchNoPoison">Không dùng bình độc</button>`);
    }
    const msg = victim != null ? `Đêm nay Sói đã cắn ${esc(pname(victim))}, nhưng bạn đã dùng hết bình thuốc.` : 'Bạn đã dùng hết bình thuốc.';
    return actWrap('🧪', 'Phù thủy', msg,
      potions + circleHTML({ players: G.players, cls: vicCls, badge: (p) => (p.id === victim ? '🩸' : '') })
      + '<button class="big primary" data-act="witchOk">Đã hiểu</button>');
  }

  function nextLabel() {
    if (G.pendingHunters.length) return '🏹 Đến lượt Thợ săn';
    if (MS.checkWin(G)) return '🏁 Xem kết quả';
    return G.flow.after === 'day' ? '💬 Bắt đầu thảo luận' : `🌙 Đi ngủ · đêm ${G.night + 1}`;
  }

  function viewAnnounce() {
    const f = G.flow;
    const lines = f.lines.map((l, i) => `<p class="${i === f.cur ? 'cur' : ''}">${esc(l)}</p>`).join('');
    return `<div class="stack"><h2 class="center">${esc(f.title)}</h2>
      <div class="card lines">${lines}</div>
      ${circleHTML({ players: G.players, cls: (p) => deadCls(p) + (f.deaths.includes(p.id) ? ' new' : ''), badge: deadBadge })}
      ${f.stage === 'ready'
        ? `<button class="big primary" data-act="proceed">${nextLabel()}</button>`
        : '<button class="ghost small" data-act="skipSpeech">Bỏ qua lời đọc ⏭</button>'}
    </div>`;
  }

  function viewHunter() {
    const f = G.flow;
    const h = f.hunter;
    const ids = new Set(MS.targetsFor(G, 'hunter'));
    return actWrap('🏹', `${esc(pname(h))} là Thợ săn`, 'Thợ săn hãy chọn 1 người để bắn chết theo mình.',
      circleHTML({ players: G.players, selectable: (p) => f.stage === 'act' && ids.has(p.id), cls: (p) => deadCls(p) + selCls(p) + (p.id === h ? ' me' : ''), badge: (p) => (p.id === h ? '🏹' : ui.sel.includes(p.id) ? '🎯' : deadBadge(p)), center: midText('🏹', selName() || 'Chạm để chọn') })
      + (f.stage === 'act'
        ? `<button class="big danger" data-act="shoot" ${ui.sel.length ? '' : 'disabled'}>🏹 Bắn ${selName()}</button><button data-act="noShoot">Không bắn ai</button>`
        : '<p class="muted center small">Đang đọc…</p>'));
  }

  function viewDay() {
    const f = G.flow;
    const left = f.left != null ? f.left : Math.max(0, f.endsAt - Date.now());
    const alive = G.players.filter((p) => p.alive).length;
    return `<div class="stack"><h2 class="center">💬 Ngày ${G.day} · Thảo luận</h2>
      ${circleHTML({ players: G.players, cls: deadCls, badge: deadBadge, center: `<div class="timer" data-timer>${fmt(left)}</div><div class="small muted">${alive} người còn sống</div>` })}
      <div class="row nowrap"><button class="grow" data-act="pause">${f.left != null ? '▶ Tiếp tục' : '⏸ Tạm dừng'}</button><button class="grow" data-act="addMin">+1 phút</button></div>
      <button class="big primary" data-act="voteNow">🗳️ Bỏ phiếu ngay</button>
      <p class="muted small center">Dân thắng khi hết Sói. Sói thắng khi số Sói bằng hoặc nhiều hơn số người còn lại.</p></div>`;
  }

  function viewVote() {
    const ids = new Set(MS.targetsFor(G, 'lynch'));
    const nm = selName();
    return actWrap('🗳️', 'Bỏ phiếu treo cổ', 'Cả làng chỉ tay vào người mình nghi. Ai nhiều phiếu nhất thì chạm vào người đó.',
      circleHTML({ players: G.players, selectable: (p) => ids.has(p.id), cls: (p) => deadCls(p) + selCls(p), badge: (p) => (ui.sel.includes(p.id) ? '⚖️' : deadBadge(p)), center: midText('⚖️', nm || 'Chạm để chọn') })
      + `<button class="big danger" data-act="lynch" ${ui.sel.length ? '' : 'disabled'}>${ui.confirm === 'lynch' ? `Chắc chắn treo cổ ${nm}? Bấm lần nữa` : `⚖️ Treo cổ ${nm}`}</button>
         <button data-act="noLynch">${ui.confirm === 'nolynch' ? 'Chắc chắn không treo ai? Bấm lần nữa' : 'Hôm nay không treo ai'}</button>`);
  }

  function viewEnd() {
    const w = G.winner;
    const titles = { village: '🧑‍🌾 Dân làng chiến thắng!', wolf: '🐺 Phe Sói chiến thắng!', lovers: '💘 Cặp đôi chiến thắng!', none: 'Không ai chiến thắng' };
    const rows = G.players.map((p, i) => `<tr class="${p.alive ? '' : 'dead'} ${MS.isWinner(G, p) ? 'won' : ''}"><td>${i + 1}</td><td>${esc(p.name)}${p.lover ? ' 💘' : ''}</td><td>${ROLES[p.role].icon} ${ROLES[p.role].name}</td><td>${p.alive ? 'Sống sót' : `${MS.CAUSES[p.cause] || 'Chết'} · ${p.diedOn}`}</td></tr>`).join('');
    return `<div class="banner ${w}"><div class="t">${titles[w]}</div><p class="muted">Sau ${G.night} đêm</p></div>
      ${circleHTML({ players: G.players, cls: (p) => (p.alive ? '' : 'dead ') + (MS.isWinner(G, p) ? 'good' : ''), badge: (p) => ROLES[p.role].icon })}
      <div class="card"><table><thead><tr><th>#</th><th>Người chơi</th><th>Vai</th><th>Kết cục</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="card stack"><h3>Nhật ký ván</h3><ol class="log">${G.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></div>
      <button class="big primary" data-act="again">🔁 Ván mới, giữ người chơi</button>
      <button data-act="toSetup">Sửa người chơi / vai</button>`;
  }

  function viewMenu() {
    if (ui.menu === 'rules') {
      const counts = {};
      G.players.forEach((p) => (counts[p.role] = (counts[p.role] || 0) + 1));
      const s = G.settings;
      const items = [
        s.revealOnDeath ? 'Lật bài người chết' : 'Không lật bài người chết',
        s.callDeadRoles ? 'Vẫn gọi vai đã chết' : 'Bỏ qua vai đã chết',
        counts.guard ? (s.guardSelf ? 'Bảo vệ được tự bảo vệ' : 'Bảo vệ không được tự bảo vệ') : '',
        counts.guard ? (s.guardRepeat ? 'Bảo vệ được chọn lại người cũ' : 'Bảo vệ không được bảo vệ 1 người 2 đêm liền') : '',
        counts.witch ? (s.witchSelfSave ? 'Phù thủy được tự cứu' : 'Phù thủy không được tự cứu') : '',
        `Thảo luận ${fmt(s.discussSec * 1000)}`,
      ].filter(Boolean);
      return `<div class="overlay"><div class="card stack" data-stop><div class="row between"><h2>Ván này có</h2><button class="icon" data-act="closeMenu" aria-label="Đóng">✕</button></div>
        <div class="chips">${ROLE_ORDER.filter((r) => counts[r]).map((r) => `<span class="pill">${ROLES[r].icon} ${ROLES[r].name}${counts[r] > 1 ? ' ×' + counts[r] : ''}</span>`).join('')}</div>
        <ul class="small" style="margin:0;padding-left:18px">${items.map((x) => `<li>${x}</li>`).join('')}</ul>
        <button data-act="closeMenu">Đóng</button></div></div>`;
    }
    const ph = G.flow.phase;
    const canPeek = ['announce', 'day', 'vote', 'hunter'].includes(ph);
    return `<div class="overlay"><div class="card stack" data-stop>
      <div class="row between"><h2>Menu</h2><button class="icon" data-act="closeMenu" aria-label="Đóng">✕</button></div>
      <div class="menu">
        <button class="choice" data-act="undo" ${undo.length ? '' : 'disabled'}>↶ Hoàn tác bước vừa rồi <span class="muted small">(lỡ bấm nhầm)</span></button>
        ${canPeek ? '<button class="choice" data-act="peek">🃏 Xem lại vai của tôi</button>' : ''}
        <button class="choice" data-act="rules">📖 Bộ vai & luật ván này</button>
        <button class="choice danger" data-act="quit">${ui.confirm === 'quit' ? 'Bấm lần nữa để kết thúc ván' : '⏹ Kết thúc ván này'}</button>
      </div></div></div>`;
  }

  function viewPeek() {
    if (ui.peek.stage === 'pick') {
      return `<div class="overlay"><div class="card stack" data-stop><div class="row between"><h2>Ai muốn xem lại vai?</h2><button class="icon" data-act="closePeek" aria-label="Đóng">✕</button></div>
        ${circleHTML({ players: G.players, selectable: () => true, cls: deadCls })}</div></div>`;
    }
    const p = G.players[ui.peek.id];
    return `<div class="overlay"><div class="card stack" data-stop>
      <p class="center"><b>${esc(p.name)}</b>, nhấn giữ lá bài để xem vai.</p>${roleCard(p)}
      <button class="big primary" data-act="closePeek">Xong</button></div></div>`;
  }

  // ================= SỰ KIỆN =================
  function addNames() {
    const el = document.getElementById('addName');
    if (!el) return;
    const parts = el.value.split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    for (const x of parts) {
      if (setup.names.length >= MS.MAX_PLAYERS) { toast(`Tối đa ${MS.MAX_PLAYERS} người.`); break; }
      setup.names.push(x.slice(0, 24));
    }
    syncCounts();
    saveSetup();
    ui.focusAdd = true;
    render();
  }

  async function previewScript() {
    if (ui.preview) { ui.preview = false; newRun(); return render(); }
    syncCounts();
    unlockAudio();
    const my = newRun();
    ui.preview = true;
    render();
    const set = new Set(Object.keys(setup.counts).filter((r) => setup.counts[r] > 0));
    const style = setup.settings.style;
    const lines = [NARR.line(style, 'nightStart1')];
    for (const k of MS.planSteps(set, 1)) {
      lines.push(NARR.line(style, k === 'wolves' ? 'wolves_wake1' : k + '_wake'));
      lines.push(NARR.line(style, k + '_sleep'));
    }
    lines.push(NARR.line(style, 'dawn'));
    for (const l of lines) {
      if (!(await say(my, l))) return;
      if (!(await wait(my, 400))) return;
    }
    ui.preview = false;
    render();
  }

  const handlers = {
    // thiết lập
    page: (el) => { setup.page = el.dataset.v; ui.confirm = null; if (ui.preview) { ui.preview = false; newRun(); } saveSetup(); render(); },
    up: (el) => { const i = +el.dataset.i; const a = setup.names; [a[i - 1], a[i]] = [a[i], a[i - 1]]; saveSetup(); render(); },
    down: (el) => { const i = +el.dataset.i; const a = setup.names; [a[i + 1], a[i]] = [a[i], a[i + 1]]; saveSetup(); render(); },
    delName: (el) => { setup.names.splice(+el.dataset.i, 1); syncCounts(); saveSetup(); render(); },
    clearNames: () => {
      if (ui.confirm !== 'clear') { ui.confirm = 'clear'; return render(); }
      ui.confirm = null; setup.names = []; syncCounts(); saveSetup(); render();
    },
    role: (el) => {
      const r = el.dataset.r;
      const c = setup.counts;
      c[r] = Math.max(0, Math.min(MS.UNIQUE.includes(r) ? 1 : MS.MAX_PLAYERS, (c[r] || 0) + +el.dataset.d));
      setup.touched = true;
      saveSetup();
      render();
    },
    preset: () => { setup.touched = false; setup.counts = MS.defaultRoleCounts(setup.names.length); saveSetup(); render(); },
    style: (el) => { setup.settings.style = el.dataset.v; saveSetup(); render(); },
    disc: (el) => { setup.settings.discussSec = Math.max(30, Math.min(900, setup.settings.discussSec + +el.dataset.d)); saveSetup(); render(); },
    previewScript,
    testVoice: () => { unlockAudio(); const my = newRun(); say(my, NARR.line(setup.settings.style, 'nightStart1')); },
    start: startGame,
    resume: () => { ui.screen = 'game'; ui.confirm = null; unlockAudio(); requestWake(); restoreFlow(); },
    abandon: () => {
      if (ui.confirm !== 'abandon') { ui.confirm = 'abandon'; return render(); }
      quitGame();
    },
    // xem vai
    revealMe: () => { G.flow.stage = 'card'; ui.held = false; saveGame(); render(); },
    revealDone: () => { G.flow.idx++; G.flow.stage = 'handoff'; ui.held = false; saveGame(); render(); },
    startNight: () => { snapshot(); unlockAudio(); requestWake(); startNight(newRun()); },
    // đêm
    nightOk: nightConfirm,
    nightSkip: () => { ui.sel = []; nightConfirm(); },
    witchSave: () => { G.flow.witchSave = true; if (G.witch.poison) { G.flow.sub = 'poison'; ui.sel = []; saveGame(); render(); } else witchApply(null); },
    witchNoSave: () => { G.flow.witchSave = false; if (G.witch.poison) { G.flow.sub = 'poison'; ui.sel = []; saveGame(); render(); } else witchApply(null); },
    witchPoison: () => { if (ui.sel.length) witchApply(ui.sel[0]); },
    witchNoPoison: () => witchApply(null),
    witchOk: () => witchApply(null),
    // ngày
    proceed: () => { snapshot(); proceed(); },
    skipSpeech: () => {
      newRun();
      const f = G.flow;
      if (f.phase === 'announce') { f.stage = 'ready'; f.cur = -1; saveGame(); render(); }
    },
    shoot: () => { if (ui.sel.length) doShoot(ui.sel[0]); },
    noShoot: () => doShoot(null),
    pause: () => {
      const f = G.flow;
      if (f.left != null) { f.endsAt = Date.now() + f.left; f.left = null; } else f.left = Math.max(0, f.endsAt - Date.now());
      saveGame();
      render();
    },
    addMin: () => { const f = G.flow; if (f.left != null) f.left += 60000; else f.endsAt += 60000; saveGame(); render(); },
    voteNow: () => { snapshot(); startVote(newRun(), false); },
    lynch: () => {
      if (!ui.sel.length) return;
      if (ui.confirm !== 'lynch') { ui.confirm = 'lynch'; return render(); }
      ui.confirm = null;
      doLynch(ui.sel[0]);
    },
    noLynch: () => {
      if (ui.confirm !== 'nolynch') { ui.confirm = 'nolynch'; return render(); }
      ui.confirm = null;
      doLynch(null);
    },
    again: () => { setup.page = 'start'; saveSetup(); G = null; startGame(); },
    toSetup: () => { quitGame(); setup.page = 'names'; saveSetup(); render(); },
    // thanh trên
    repeat: () => { const t = G && G.flow.caption; if (t) speak(t); },
    toggleVoice: () => { voice.on = !voice.on; if (!voice.on && synth) synth.cancel(); saveVoice(); render(); },
    menu: () => { ui.menu = 'main'; ui.confirm = null; render(); },
    closeMenu: () => { ui.menu = null; ui.confirm = null; render(); },
    rules: () => { ui.menu = 'rules'; render(); },
    undo: () => { ui.menu = null; doUndo(); },
    quit: () => {
      if (ui.confirm !== 'quit') { ui.confirm = 'quit'; return render(); }
      quitGame();
    },
    peek: () => { ui.menu = null; ui.peek = { stage: 'pick' }; render(); },
    closePeek: () => { ui.peek = null; render(); },
  };

  $app.addEventListener('click', (e) => {
    const seat = e.target.closest('[data-pid]');
    if (seat) return pickSeat(+seat.dataset.pid);
    const el = e.target.closest('[data-act],[data-stop]');
    if (!el || !el.dataset.act) return;
    const h = handlers[el.dataset.act];
    if (h) h(el);
  });

  function pickSeat(id) {
    if (ui.peek) { ui.peek = { stage: 'card', id }; ui.held = false; return render(); }
    if (!G) return;
    const multi = G.flow.phase === 'night' && step() && step().kind === 'cupid';
    if (multi) {
      if (ui.sel.includes(id)) ui.sel = ui.sel.filter((x) => x !== id);
      else ui.sel = [...ui.sel, id].slice(-2);
    } else {
      ui.sel = ui.sel[0] === id ? [] : [id];
    }
    ui.confirm = null;
    render();
  }

  $app.addEventListener('submit', (e) => {
    if (e.target.dataset.form === 'add') { e.preventDefault(); addNames(); }
  });

  $app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.name != null) {
      const i = +t.dataset.name;
      setup.names[i] = t.value;
      saveSetup();
      const s = $app.querySelector(`.seat[data-seat="${i}"] .nm`);
      if (s) s.textContent = t.value || '…';
    } else if (t.dataset.voice === 'rate') {
      voice.rate = +t.value;
      saveVoice();
      const l = $app.querySelector('[data-rate]');
      if (l) l.textContent = voice.rate.toFixed(2) + '×';
    }
  });

  $app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.set) { setup.settings[t.dataset.set] = t.checked; saveSetup(); }
    else if (t.dataset.voice === 'on') { voice.on = t.checked; saveVoice(); }
    else if (t.dataset.voice === 'uri') { voice.uri = t.value; saveVoice(); unlockAudio(); const my = newRun(); say(my, NARR.line(setup.settings.style, 'dawn')); }
    else if (t.dataset.voice === 'rate') { unlockAudio(); const my = newRun(); say(my, NARR.line(setup.settings.style, 'dawn')); }
  });

  // Nhấn giữ để lật bài
  $app.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-hold]');
    if (!card) return;
    e.preventDefault();
    card.classList.add('open');
    if (!ui.held) {
      ui.held = true;
      const b = $app.querySelector('[data-act="revealDone"]');
      if (b) b.disabled = false;
    }
  });
  const closeCards = () => $app.querySelectorAll('[data-hold].open').forEach((c) => c.classList.remove('open'));
  window.addEventListener('pointerup', closeCards);
  window.addEventListener('pointercancel', closeCards);
  $app.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-hold]')) e.preventDefault(); });

  booted = true;
  render();
})();
