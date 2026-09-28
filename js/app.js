// UI: sticker input, validation, solving, and turn-by-turn playback.
(function () {
  'use strict';
  const M = window.CubeModel;
  const V = window.CubeValidate;
  const Fast = window.FastSolver;
  const Beginner = window.BeginnerSolver;
  const D = window.CubeDescribe;
  const P = window.CubePlayer;

  const NAMES = D.NAMES;
  const FACE_WORD = D.FACE_WORD;
  const PALETTE = ['w', 'y', 'g', 'b', 'r', 'o'];
  const NET_POS = { U: [1, 2], L: [2, 1], F: [2, 2], R: [2, 3], B: [2, 4], D: [3, 2] };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  const $ = id => document.getElementById(id);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // Only page scrolling honors reduced motion; turn animations always play (they are the instructions).
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const app = { state: M.SOLVED.slice(), color: 'w', face: 'F', bad: new Set(), method: 'fast', busy: false, playMethod: 'fast', view: null };
  let netCells = [], miniCells = [], editorCells = [], player = null;

  const colorName = (s, f) => NAMES[M.centerColor(s, f)];
  const later = fn => new Promise((resolve, reject) => setTimeout(() => {
    try { resolve(fn()); } catch (e) { reject(e); }
  }, 30));
  function showBanner(text) { const b = $('banner'); b.textContent = text; b.hidden = false; }

  // ---------- 2D nets ----------
  function buildNet(rootEl, interactive) {
    rootEl.textContent = '';
    const cells = new Array(54);
    M.FACES.forEach((face, fi) => {
      const box = document.createElement('div');
      box.className = 'face';
      box.dataset.face = face;
      box.style.gridRow = String(NET_POS[face][0]);
      box.style.gridColumn = String(NET_POS[face][1]);
      if (interactive) {
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'face-label';
        label.dataset.face = face;
        label.textContent = FACE_WORD[face];
        label.setAttribute('aria-label', `Edit the ${FACE_WORD[face].toLowerCase()} face and see how to hold the cube for it`);
        box.appendChild(label);
      }
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (let k = 0; k < 9; k++) {
        const i = fi * 9 + k;
        const el = document.createElement(interactive ? 'button' : 'span');
        el.className = 'st';
        if (interactive) { el.type = 'button'; el.dataset.i = String(i); }
        grid.appendChild(el);
        cells[i] = el;
      }
      box.appendChild(grid);
      rootEl.appendChild(box);
    });
    return cells;
  }
  function paintCell(el, i, state, bad) {
    el.style.setProperty('--c', `var(--c-${state[i]})`);
    el.classList.toggle('bad', !!(bad && bad.has(i)));
    if (el.tagName === 'BUTTON') {
      const f = M.FACELETS[i];
      el.setAttribute('aria-label', `${FACE_WORD[f.face]} face, row ${f.row + 1}, column ${f.col + 1}: ${NAMES[state[i]]}`);
    }
  }
  const paintNet = (cells, state, bad) => cells.forEach((el, i) => paintCell(el, i, state, bad));

  // ---------- selected face: large editor + reading hint ----------
  function buildEditor() {
    const grid = $('editor');
    for (let k = 0; k < 9; k++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st';
      b.dataset.k = String(k);
      grid.appendChild(b);
      editorCells.push(b);
    }
  }
  function renderFace() {
    const fi = M.FACES.indexOf(app.face);
    editorCells.forEach((el, k) => paintCell(el, fi * 9 + k, app.state, app.bad));
    $('editor-title').textContent = `${FACE_WORD[app.face]} face · ${colorName(app.state, app.face)} center`;
    $('hint').innerHTML = `<b>How to hold the cube for the ${FACE_WORD[app.face].toLowerCase()} face.</b> ` + D.faceHint(app.face, app.state);
    document.querySelectorAll('#net .face').forEach(el => el.classList.toggle('active', el.dataset.face === app.face));
  }
  function renderHold(state) {
    const up = M.centerColor(state, 'U'), front = M.centerColor(state, 'F');
    $('hold').innerHTML = `Hold: <i class="dot" style="--c:var(--c-${up})"></i>${NAMES[up]} on top ` +
      `<i class="dot" style="--c:var(--c-${front})"></i>${NAMES[front]} facing you`;
  }

  // ---------- input mode ----------
  function buildPalette() {
    const rootEl = $('palette');
    PALETTE.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = c;
      b.style.setProperty('--c', `var(--c-${c})`);
      b.setAttribute('aria-label', `Paint ${NAMES[c]} (key ${c.toUpperCase()})`);
      b.innerHTML = `<kbd>${c.toUpperCase()}</kbd>`;
      b.addEventListener('click', () => selectColor(c));
      rootEl.appendChild(b);
    });
  }
  function selectColor(c) {
    app.color = c;
    document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === c)));
  }
  function renderInput() {
    paintNet(netCells, app.state, app.bad);
    renderFace();
    renderHold(app.state);
    if (app.view) app.view.setState(app.state);
  }
  function paint(i) {
    if (app.busy) return;
    app.face = M.FACELETS[i].face;
    app.state = app.state.slice();
    app.state[i] = app.color;
    app.bad.delete(i);
    renderInput();
  }
  function setInputState(next, noteHtml) {
    if (app.busy) return;
    app.state = next;
    app.bad = new Set();
    renderErrors([]);
    $('scramble-note').innerHTML = noteHtml || '';
    renderInput();
  }
  function loadExample() {
    const scramble = M.randomScramble(20);
    setInputState(M.applyMoves(M.SOLVED, scramble),
      'Example cube loaded. Paint over it with your own colors, or scramble a solved cube with ' +
      `<code>${scramble.join(' ')}</code> (white on top, green facing you) to try the app first.`);
  }
  function renderErrors(errors) {
    const ul = $('errors');
    ul.textContent = '';
    errors.forEach(e => {
      const li = document.createElement('li');
      li.textContent = e.message;
      ul.appendChild(li);
    });
    if (errors.some(e => e.cells && e.cells.length)) {
      const li = document.createElement('li');
      li.className = 'tip';
      li.textContent = 'Stickers to recheck are outlined in red. Most mistakes come from holding the cube differently while reading a face. Tap a face name (Top, Front, Right…) to see how to hold the cube for it.';
      ul.appendChild(li);
    }
  }
  function renderSolveButton() {
    const st = Fast.getStatus();
    if (st === 'failed') {
      $('m-fast').disabled = true;
      if (app.method === 'fast') { app.method = 'beginner'; $('m-beginner').checked = true; }
    }
    const waiting = app.method === 'fast' && st !== 'ready';
    const btn = $('btn-solve');
    btn.disabled = app.busy || waiting;
    btn.textContent = app.busy ? 'Solving…' : waiting ? 'Preparing solver…' : 'Solve my cube';
    $('solver-status').textContent = st === 'failed'
      ? "The shortest solver couldn't load. The beginner method still works."
      : waiting ? 'Getting the shortest solver ready. This takes a few seconds the first time.' : '';
  }
  async function solve() {
    if (app.busy) return;
    const result = V.validate(app.state);
    app.bad = new Set(result.errors.flatMap(e => e.cells));
    renderErrors(result.errors);
    renderInput();
    if (!result.ok) return;
    // Snapshot what was validated; the solution must match this cube even if the UI changes meanwhile.
    const input = app.state.slice(), method = app.method;
    app.busy = true;
    renderSolveButton();
    try {
      const steps = method === 'fast' ? await Fast.solve(input) : await later(() => Beginner.solve(input));
      app.state = input;
      startPlayback(steps, method);
    } catch (err) {
      renderErrors([{
        message: err.code === 'SOLVER_RESTARTING'
          ? 'The shortest solver stopped and is restarting. Press Solve again in a few seconds, or pick Beginner.'
          : `The solver failed on this cube (${err.message}). Please report this cube code: ${M.toFaceletString(input)}`,
        cells: [],
      }]);
    } finally {
      app.busy = false;
      renderSolveButton();
    }
  }

  // ---------- playback ----------
  function startPlayback(steps, method) {
    app.playMethod = method;
    const states = [app.state.slice()];
    steps.forEach((st, k) => states.push(M.applyMove(states[k], st.move)));
    $('input-panel').hidden = true;
    $('play-panel').hidden = false;
    document.body.classList.add('is-playing');
    if (app.view) app.view.resetView();
    player.load(states, steps);
    buildMoveList(steps);
    renderPlay(player);
    const behavior = reducedMotion ? 'auto' : 'smooth';
    // Phones: bring the step card up under the sticky cube; controls stick to the bottom.
    if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) $('card').scrollIntoView({ block: 'start', behavior });
    else window.scrollTo({ top: 0, behavior });
  }
  function backToEdit() {
    player.afterTurn(() => {
      $('play-panel').hidden = true;
      $('input-panel').hidden = false;
      document.body.classList.remove('is-playing');
      renderInput();
    });
  }
  function buildMoveList(steps) {
    const box = $('moves');
    box.textContent = '';
    if (!steps.length) { box.textContent = 'No turns needed.'; return; }
    let chips = null, stage = -1;
    steps.forEach((st, k) => {
      if (st.stage !== stage) {
        stage = st.stage;
        const sec = document.createElement('div');
        if (app.playMethod === 'beginner') {
          const h = document.createElement('h3');
          h.textContent = st.stage === 0 ? st.stageName : `${st.stage}. ${st.stageName}`;
          sec.appendChild(h);
        }
        chips = document.createElement('div');
        chips.className = 'chips';
        sec.appendChild(chips);
        box.appendChild(sec);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = st.move;
      b.dataset.k = String(k);
      b.setAttribute('aria-label', `Jump to turn ${k + 1}: ${st.move}`);
      chips.appendChild(b);
    });
  }
  function renderAlg(step) {
    const el = $('card-alg');
    el.textContent = '';
    if (!step.algName) return;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = step.algLen > 1 ? `${step.algName} · move ${step.algPos + 1} of ${step.algLen}` : step.algName;
    el.appendChild(name);
    if (step.algLen < 2) return;
    step.alg.split(' ').forEach((m, k) => {
      const span = document.createElement('span');
      span.className = 'm' + (k < step.algPos ? ' done' : k === step.algPos ? ' now' : '');
      span.textContent = m;
      el.appendChild(span);
    });
  }
  function renderPlay(p) {
    if ($('play-panel').hidden) return;
    const total = p.steps.length, pos = p.pos, cur = p.states[pos], step = p.steps[pos];
    if (app.view && !p.busy) app.view.setState(cur);
    $('counter').textContent = total ? (step ? `Turn ${pos + 1} of ${total}` : `Done · ${total} turns`) : '';
    $('progress-bar').style.width = total ? `${(pos / total) * 100}%` : '100%';
    renderHold(cur);
    paintNet(miniCells, cur, null);
    $('card').classList.toggle('finished', !step);
    if (!step) {
      $('card-stage').textContent = total ? 'Finished' : 'Nothing to do';
      $('card-move').textContent = 'Solved';
      $('card-title').textContent = total ? `${total} turns` : 'Already solved';
      $('card-detail').textContent = total
        ? 'Your cube should now be solved. Use back or the turn list to review any turn.'
        : 'This cube is already solved. Go back and enter a scrambled cube.';
      $('card-alg').textContent = '';
      $('card-note').hidden = true;
    } else {
      const d = D.describeMove(step.move);
      $('card-stage').textContent = app.playMethod === 'beginner'
        ? (step.stage === 0 ? 'Before you start' : `Stage ${step.stage} of 7 · ${step.stageName}`)
        : 'Next turn';
      $('card-move').textContent = step.move;
      $('card-title').textContent = d.title;
      $('card-detail').textContent = d.detail;
      renderAlg(step);
      $('card-note').textContent = step.note || '';
      $('card-note').hidden = !step.note;
    }
    const box = $('moves');
    box.querySelectorAll('.chip').forEach((el, k) => {
      el.classList.toggle('done', k < pos);
      el.classList.toggle('now', k === pos);
    });
    const now = box.querySelector('.chip.now');
    if (now && (now.offsetTop < box.scrollTop || now.offsetTop > box.scrollTop + box.clientHeight - 40)) {
      box.scrollTop = now.offsetTop - 40;
    }
    $('btn-restart').disabled = pos === 0 && !p.busy;
    $('btn-prev').disabled = pos === 0 && !p.busy;
    $('btn-next').disabled = pos >= total;
    $('btn-play').disabled = total === 0;
    $('btn-play').innerHTML = p.playing ? ICON_PAUSE : ICON_PLAY;
    $('btn-play').setAttribute('aria-label', p.playing ? 'Pause' : 'Play all turns');
  }
  function renderSpeed() {
    $('speed-out').textContent = `${(P.turnMs(player.speed) / 1000).toFixed(2)} s per turn`;
  }

  // ---------- boot ----------
  function initView() {
    if (!window.THREE || !window.CubeView) {
      showBanner("Couldn't load the 3D library (three.js). Check your internet connection and reload. The flat cube map still shows every turn.");
      $('view').innerHTML = '<p class="no3d">3D view unavailable</p>';
      $('btn-reset-view').hidden = true;
      return;
    }
    try {
      app.view = new window.CubeView($('view'));
    } catch (e) {
      app.view = null;
      showBanner('The 3D view could not start on this device (WebGL is unavailable). The flat cube map still shows every turn.');
      $('view').innerHTML = '<p class="no3d">3D view unavailable</p>';
      $('btn-reset-view').hidden = true;
    }
  }
  function wire() {
    $('net').addEventListener('click', e => {
      const label = e.target.closest('.face-label');
      if (label) { app.face = label.dataset.face; renderFace(); return; }
      const el = e.target.closest('button.st');
      if (el) paint(Number(el.dataset.i));
    });
    $('net').addEventListener('focusin', e => {
      const el = e.target.closest('button.st');
      if (!el) return;
      app.face = M.FACELETS[Number(el.dataset.i)].face;
      renderFace();
    });
    $('editor').addEventListener('click', e => {
      const el = e.target.closest('button.st');
      if (el) paint(M.FACES.indexOf(app.face) * 9 + Number(el.dataset.k));
    });
    $('btn-example').addEventListener('click', loadExample);
    $('btn-solved').addEventListener('click', () => setInputState(M.SOLVED.slice(), ''));
    $('btn-clear').addEventListener('click', () => setInputState(
      app.state.map((c, i) => (i % 9 === 4 ? c : 'x')), 'Cleared. Centers are kept; paint every other sticker.'));
    document.querySelectorAll('input[name="method"]').forEach(r => r.addEventListener('change', () => {
      app.method = r.value;
      renderSolveButton();
    }));
    $('btn-solve').addEventListener('click', solve);
    $('btn-edit').addEventListener('click', backToEdit);
    $('btn-reset-view').addEventListener('click', () => { if (app.view) app.view.resetView(); });
    $('btn-restart').addEventListener('click', () => player.jump(0));
    $('btn-prev').addEventListener('click', () => player.back());
    $('btn-next').addEventListener('click', () => { player.stop(); player.next(); });
    $('btn-play').addEventListener('click', () => player.togglePlay());
    $('speed').addEventListener('input', e => { player.setSpeed(Number(e.target.value)); renderSpeed(); });
    $('moves').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (b) player.jump(Number(b.dataset.k));
    });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (!$('play-panel').hidden) {
        if (e.key === 'ArrowRight') { e.preventDefault(); player.stop(); player.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); player.back(); }
        else if (e.key === 'Home') { e.preventDefault(); player.jump(0); }
        else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); player.togglePlay(); }
      } else if (PALETTE.includes(e.key.toLowerCase())) {
        selectColor(e.key.toLowerCase());
      }
    });
  }
  function boot() {
    buildPalette();
    selectColor('w');
    netCells = buildNet($('net'), true);
    miniCells = buildNet($('mini-net'), false);
    buildEditor();
    initView();
    player = P.createPlayer({
      animate: (move, ms) => (app.view ? app.view.animateMove(move, ms) : Promise.resolve()),
      onChange: renderPlay,
    });
    player.setSpeed(Number($('speed').value));
    renderSpeed();
    wire();
    loadExample();
    Fast.onStatus(renderSolveButton);
    Fast.init();
  }
  boot();
})();
