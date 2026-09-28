// UI: sticker input, validation, solving, and turn-by-turn playback.
(function () {
  'use strict';
  const M = window.CubeModel;
  const V = window.CubeValidate;
  const Fast = window.FastSolver;
  const Beginner = window.BeginnerSolver;

  const NAMES = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange', x: 'unset' };
  const PALETTE = ['w', 'y', 'g', 'b', 'r', 'o'];
  const FACE_WORD = { U: 'Top', D: 'Bottom', F: 'Front', B: 'Back', L: 'Left', R: 'Right' };
  const NET_POS = { U: [1, 2], L: [2, 1], F: [2, 2], R: [2, 3], B: [2, 4], D: [3, 2] };
  const TURN_HINT = {
    U: ['the front row slides to the left', 'the front row slides to the right'],
    D: ['the front row slides to the right', 'the front row slides to the left'],
    R: ['the front column goes up', 'the front column goes down'],
    L: ['the front column goes down', 'the front column goes up'],
    F: ['the top row slides to the right', 'the top row slides to the left'],
    B: ['the top row slides to the left, seen from the front', 'the top row slides to the right, seen from the front'],
  };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  const $ = id => document.getElementById(id);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const app = {
    state: M.SOLVED.slice(), color: 'w', face: 'F', bad: new Set(), method: 'fast', busy: false,
    steps: [], states: [], pos: 0, playing: false, speed: 5, view: null,
  };
  let netCells = [], miniCells = [], playTimer = null;

  const colorName = (s, f) => NAMES[M.centerColor(s, f)];
  const animMs = () => (reducedMotion ? 0 : 1300 - app.speed * 115);
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
        const label = document.createElement('span');
        label.className = 'face-label';
        label.textContent = FACE_WORD[face];
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
  function paintNet(cells, state, bad) {
    cells.forEach((el, i) => {
      el.style.setProperty('--c', `var(--c-${state[i]})`);
      el.classList.toggle('bad', !!(bad && bad.has(i)));
      if (el.tagName === 'BUTTON') {
        const f = M.FACELETS[i];
        el.setAttribute('aria-label', `${FACE_WORD[f.face]} face, row ${f.row + 1}, column ${f.col + 1}: ${NAMES[state[i]]}`);
      }
    });
  }

  // ---------- hold + reading hints ----------
  function renderHold(state) {
    const up = M.centerColor(state, 'U'), front = M.centerColor(state, 'F');
    $('hold').innerHTML = `Hold: <i class="dot" style="--c:var(--c-${up})"></i>${NAMES[up]} on top ` +
      `<i class="dot" style="--c:var(--c-${front})"></i>${NAMES[front]} facing you`;
  }
  function faceHint(face, s) {
    const c = f => colorName(s, f);
    return {
      F: `Hold ${c('U')} on top with ${c('F')} facing you. Paint the stickers exactly as you see them.`,
      R: `Keep ${c('U')} on top and turn the cube so ${c('R')} faces you. ${cap(c('F'))} is now on your left.`,
      B: `Keep ${c('U')} on top and turn the cube so ${c('B')} faces you. ${cap(c('R'))} is now on your left.`,
      L: `Keep ${c('U')} on top and turn the cube so ${c('L')} faces you. ${cap(c('F'))} is now on your right.`,
      U: `Start with ${c('F')} facing you, then tip the top toward you until ${c('U')} faces you. ${cap(c('F'))} is now along the bottom edge.`,
      D: `Start with ${c('F')} facing you, then tip the top away from you until ${c('D')} faces you. ${cap(c('F'))} is now along the top edge.`,
    }[face];
  }
  function renderHint() {
    $('hint').innerHTML = `<b>Reading the ${FACE_WORD[app.face].toLowerCase()} face (${colorName(app.state, app.face)} center).</b> ` +
      faceHint(app.face, app.state);
    document.querySelectorAll('#net .face').forEach(el => el.classList.toggle('active', el.dataset.face === app.face));
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
    renderHint();
    renderHold(app.state);
    if (app.view) app.view.setState(app.state);
  }
  function setInputState(next, noteHtml) {
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
      li.textContent = 'Stickers to recheck are outlined in red. Most mistakes come from holding the cube differently while reading a face. Tap any sticker on a face to see how to hold the cube for it.';
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
      ? "The shortest solver couldn't load (check your internet connection). The beginner method still works."
      : waiting ? 'Getting the shortest solver ready. This takes a few seconds the first time.' : '';
  }
  async function solve() {
    if (app.busy) return;
    const result = V.validate(app.state);
    app.bad = new Set(result.errors.flatMap(e => e.cells));
    renderErrors(result.errors);
    renderInput();
    if (!result.ok) return;
    app.busy = true;
    renderSolveButton();
    try {
      const steps = app.method === 'fast' ? await Fast.solve(app.state) : await later(() => Beginner.solve(app.state));
      startPlayback(steps);
    } catch (err) {
      renderErrors([{ message: `The solver failed on this cube (${err.message}). Please report this cube code: ${M.toFaceletString(app.state)}`, cells: [] }]);
    } finally {
      app.busy = false;
      renderSolveButton();
    }
  }

  // ---------- playback ----------
  function describeMove(m) {
    if (m === 'z2') {
      return { title: 'Flip the whole cube', detail: 'Roll the whole cube half a turn like a steering wheel. The front stays facing you; top and bottom swap, and so do left and right.' };
    }
    const face = FACE_WORD[m[0]], lower = face.toLowerCase(), suffix = m.slice(1);
    if (suffix === '2') return { title: `${face} face, half turn`, detail: `Turn the ${lower} face 180°. Either direction works.` };
    const cw = suffix === '';
    const dir = cw ? 'clockwise' : 'counter-clockwise';
    return { title: `${face} face, ${dir}`, detail: `Quarter turn ${dir}, as if you were looking straight at the ${lower} face: ${TURN_HINT[m[0]][cw ? 0 : 1]}.` };
  }
  function startPlayback(steps) {
    app.steps = steps;
    app.states = [app.state.slice()];
    steps.forEach((st, k) => app.states.push(M.applyMove(app.states[k], st.move)));
    app.pos = 0;
    stopPlay();
    $('input-panel').hidden = true;
    $('play-panel').hidden = false;
    buildMoveList();
    if (app.view) app.view.setState(app.states[0]);
    renderPlay();
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  function backToEdit() {
    if (app.busy) return;
    stopPlay();
    $('play-panel').hidden = true;
    $('input-panel').hidden = false;
    renderInput();
  }
  function buildMoveList() {
    const box = $('moves');
    box.textContent = '';
    if (!app.steps.length) { box.textContent = 'No turns needed.'; return; }
    let chips = null, stage = -1;
    app.steps.forEach((st, k) => {
      if (st.stage !== stage) {
        stage = st.stage;
        const sec = document.createElement('div');
        if (app.method === 'beginner') {
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
  function renderPlayButton() {
    const b = $('btn-play');
    b.innerHTML = app.playing ? ICON_PAUSE : ICON_PLAY;
    b.setAttribute('aria-label', app.playing ? 'Pause' : 'Play all turns');
  }
  function renderPlay() {
    const total = app.steps.length, pos = app.pos, cur = app.states[pos], step = app.steps[pos];
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
    } else {
      const d = describeMove(step.move);
      $('card-stage').textContent = app.method === 'beginner'
        ? (step.stage === 0 ? 'Before you start' : `Stage ${step.stage} of 7 · ${step.stageName}`)
        : 'Next turn';
      $('card-move').textContent = step.move;
      $('card-title').textContent = d.title;
      $('card-detail').textContent = d.detail;
      renderAlg(step);
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
    $('btn-restart').disabled = pos === 0;
    $('btn-prev').disabled = pos === 0;
    $('btn-next').disabled = pos >= total;
    $('btn-play').disabled = total === 0;
    renderPlayButton();
  }
  async function stepForward() {
    if (app.busy || app.pos >= app.steps.length) return false;
    app.busy = true;
    if (app.view) await app.view.animateMove(app.steps[app.pos].move, animMs());
    app.pos++;
    if (app.view) app.view.setState(app.states[app.pos]);
    app.busy = false;
    renderPlay();
    return true;
  }
  async function stepBack() {
    if (app.busy || app.pos === 0) return;
    stopPlay();
    app.busy = true;
    if (app.view) await app.view.animateMove(M.invertMove(app.steps[app.pos - 1].move), animMs());
    app.pos--;
    if (app.view) app.view.setState(app.states[app.pos]);
    app.busy = false;
    renderPlay();
  }
  function jump(k) {
    if (app.busy) return;
    stopPlay();
    app.pos = Math.max(0, Math.min(k, app.steps.length));
    if (app.view) app.view.setState(app.states[app.pos]);
    renderPlay();
  }
  function stopPlay() {
    app.playing = false;
    clearTimeout(playTimer);
    renderPlayButton();
  }
  function togglePlay() {
    if (app.playing) { stopPlay(); return; }
    if (app.busy || !app.steps.length) return;
    if (app.pos >= app.steps.length) jump(0);
    app.playing = true;
    renderPlayButton();
    tick();
  }
  async function tick() {
    if (!app.playing) return;
    const moved = await stepForward();
    if (!app.playing) return;
    if (!moved || app.pos >= app.steps.length) { stopPlay(); return; }
    playTimer = setTimeout(tick, reducedMotion ? 700 : 250 + animMs() * 0.6);
  }

  // ---------- boot ----------
  function initView() {
    if (!window.THREE || !window.CubeView) {
      showBanner("Couldn't load the 3D library (three.js). Check your internet connection and reload. The flat cube map still shows every turn.");
      $('view').innerHTML = '<p class="no3d">3D view unavailable</p>';
      return;
    }
    try {
      app.view = new window.CubeView($('view'));
    } catch (e) {
      app.view = null;
      showBanner('The 3D view could not start on this device (WebGL is unavailable). The flat cube map still shows every turn.');
      $('view').innerHTML = '<p class="no3d">3D view unavailable</p>';
    }
  }
  function wire() {
    $('net').addEventListener('click', e => {
      const el = e.target.closest('button.st');
      if (!el) return;
      const i = Number(el.dataset.i);
      app.face = M.FACELETS[i].face;
      app.state = app.state.slice();
      app.state[i] = app.color;
      app.bad.delete(i);
      renderInput();
    });
    $('net').addEventListener('focusin', e => {
      const el = e.target.closest('button.st');
      if (!el) return;
      app.face = M.FACELETS[Number(el.dataset.i)].face;
      renderHint();
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
    $('btn-restart').addEventListener('click', () => jump(0));
    $('btn-prev').addEventListener('click', stepBack);
    $('btn-next').addEventListener('click', () => { stopPlay(); stepForward(); });
    $('btn-play').addEventListener('click', togglePlay);
    $('speed').addEventListener('input', e => { app.speed = Number(e.target.value); });
    $('moves').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (b) jump(Number(b.dataset.k));
    });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (!$('play-panel').hidden) {
        if (e.key === 'ArrowRight') { e.preventDefault(); stopPlay(); stepForward(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBack(); }
        else if (e.key === 'Home') { e.preventDefault(); jump(0); }
        else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); togglePlay(); }
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
    initView();
    wire();
    loadExample();
    Fast.onStatus(renderSolveButton);
    Fast.init();
  }
  boot();
})();
