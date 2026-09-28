// UI: two modes. Solve: paint the cube, validate, solve. Patterns: pick or type a pattern and
// make it from a solved cube or straight from "my cube now". Both play back turn by turn.
(function () {
  'use strict';
  const M = window.CubeModel;
  const V = window.CubeValidate;
  const Fast = window.FastSolver;
  const Beginner = window.BeginnerSolver;
  const D = window.CubeDescribe;
  const P = window.CubePlayer;
  const Pat = window.CubePatterns;
  const S = window.CubeSession;

  const NAMES = D.NAMES;
  const FACE_WORD = D.FACE_WORD;
  const PALETTE = ['w', 'y', 'g', 'b', 'r', 'o'];
  const NET_POS = { U: [1, 2], L: [2, 1], F: [2, 2], R: [2, 3], B: [2, 4], D: [3, 2] };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  const $ = id => document.getElementById(id);
  // Only page scrolling honors reduced motion; turn animations always play (they are the instructions).
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const narrow = () => !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);
  const scrollBehavior = () => (reducedMotion ? 'auto' : 'smooth');

  const app = {
    mode: 'solve', state: M.SOLVED.slice(), color: 'w', face: 'F', bad: new Set(), method: 'fast', busy: false, view: null,
    play: { kind: 'solve', method: 'fast', name: '', picture: null, relabeled: false, startIsPhysical: true },
    sel: null,               // selected pattern { name, moves, state, custom, aliasText }
    startFrom: 'solved',     // 'solved' | 'now'
  };
  let netCells = [], miniCells = [], editorCells = [], nowCells = [], player = null;
  let galleryBuilt = false, customTimer = null;
  const physical = S.createPhysical(); // 'my cube now': the cube as the user last had it in their hands
  const routes = S.createRouteRequester({
    getStatus: () => Fast.getStatus(),
    solve: input => Fast.solve(input).then(steps => steps.map(st => st.move)),
    onChange: () => renderPatternDetail(),
  });

  const colorName = (s, f) => NAMES[M.centerColor(s, f)];
  const statesFrom = (start, steps) => steps.reduce((acc, st) => { acc.push(M.applyMove(acc[acc.length - 1], st.move)); return acc; }, [start.slice()]);
  const later = fn => new Promise((resolve, reject) => setTimeout(() => {
    try { resolve(fn()); } catch (e) { reject(e); }
  }, 30));
  function showBanner(text) { const b = $('banner'); b.textContent = text; b.hidden = false; }

  // ---------- panels and modes ----------
  function showPanel(name) {
    $('input-panel').hidden = name !== 'input';
    $('pattern-panel').hidden = name !== 'patterns';
    $('play-panel').hidden = name !== 'play';
    document.body.classList.toggle('is-playing', name === 'play');
    document.body.classList.toggle('is-patterns', name === 'patterns');
  }
  function renderModeSwitch() {
    $('mode-solve').setAttribute('aria-pressed', String(app.mode === 'solve'));
    $('mode-patterns').setAttribute('aria-pressed', String(app.mode === 'patterns'));
  }
  function setMode(mode) {
    cancelCustomInput();
    player.afterTurn(() => {
      app.mode = mode;
      renderModeSwitch();
      if (mode === 'solve') enterSolve();
      else enterPatterns();
    });
  }
  function enterSolve() {
    showPanel('input');
    if (physical.shouldLoadIntoNet(app.state)) {
      const now = physical.get();
      setInputState(now.state, `Loaded from: ${now.label}. If your real cube looks different, paint over it.`);
    } else {
      renderInput();
    }
  }
  function enterPatterns() {
    buildGallery();
    showPanel('patterns');
    const now = physical.get();
    app.startFrom = now && !M.isSolved(now.state) ? 'now' : 'solved';
    showPatternInView();
    renderPatternDetail();
    requestRoute();
  }

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

  // ---------- Solve mode: painting ----------
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
    physical.netChanged();
    renderInput();
  }
  function setNote(content) {
    const el = $('scramble-note');
    el.textContent = '';
    if (typeof content === 'string') el.textContent = content;
    else if (content) el.appendChild(content);
  }
  function setInputState(next, note) {
    if (app.busy) return;
    app.state = next.slice();
    app.bad = new Set();
    physical.netChanged();
    renderErrors([]);
    setNote(note || '');
    renderInput();
  }
  function loadExample() {
    const scramble = M.randomScramble(20);
    const note = document.createDocumentFragment();
    const code = document.createElement('code');
    code.textContent = scramble.join(' ');
    note.append('Example cube loaded. Paint over it with your own colors, or scramble a solved cube with ', code,
      ' (white on top, green facing you) to try the app first.');
    setInputState(M.applyMoves(M.SOLVED, scramble), note);
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
    physical.set(input, 'Your checked cube');
    physical.netChanged();
    app.busy = true;
    renderSolveButton();
    try {
      const steps = method === 'fast' ? await Fast.solve(input) : await later(() => Beginner.solve(input));
      if (app.mode !== 'solve') return;
      app.state = input;
      startPlayback({ states: statesFrom(input, steps), steps, kind: 'solve', method, name: '', picture: null, relabeled: false, startIsPhysical: true });
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

  // ---------- Patterns mode ----------
  function buildGallery() {
    if (galleryBuilt) return;
    galleryBuilt = true;
    const grid = $('gallery');
    Pat.entries().forEach(e => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pcard';
      b.dataset.index = String(e.index);
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = Pat.thumbnailSvg(e.state); // generated from sticker data only
      const name = document.createElement('span');
      name.className = 'pname';
      name.textContent = e.name;
      const turns = document.createElement('span');
      turns.className = 'pturns';
      turns.textContent = `${e.moves.length} moves`;
      b.append(name, turns);
      grid.appendChild(b);
    });
    filterGallery();
  }
  function filterGallery() {
    const q = $('pattern-search').value;
    const all = Pat.entries();
    let shown = 0;
    $('gallery').querySelectorAll('.pcard').forEach(card => {
      const hit = Pat.matches(all[Number(card.dataset.index)], q);
      card.hidden = !hit;
      if (hit) shown++;
    });
    $('pattern-count').textContent = shown === all.length ? `${all.length} patterns` : `${shown} of ${all.length}`;
  }
  function markCards() {
    const idx = app.sel && !app.sel.custom ? String(app.sel.index) : null;
    $('gallery').querySelectorAll('.pcard').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.index === idx)));
  }
  const patternsVisible = () => !$('pattern-panel').hidden;
  function showPatternInView() {
    if (!patternsVisible() || !app.view) return;
    const now = physical.get();
    app.view.setState(app.sel ? app.sel.state : now ? now.state : M.SOLVED);
  }
  function selectPattern(sel, scroll) {
    app.sel = sel;
    markCards();
    showPatternInView();
    renderPatternDetail();
    requestRoute();
    if (scroll && narrow()) $('pattern-detail').scrollIntoView({ block: 'start', behavior: scrollBehavior() });
  }
  function onCustomInput() {
    customTimer = null;
    if (!patternsVisible()) return;
    const text = $('custom-alg').value;
    const clearCustom = () => {
      if (app.sel && app.sel.custom) { app.sel = null; markCards(); showPatternInView(); renderPatternDetail(); }
    };
    if (!text.trim()) { $('custom-error').textContent = ''; clearCustom(); return; }
    const r = Pat.fromAlgorithm(text);
    if (r.error) { $('custom-error').textContent = r.error; clearCustom(); return; }
    $('custom-error').textContent = '';
    const same = Pat.findByKey(Pat.canonicalKey(r.state));
    const aliasText = same ? `Makes the same pattern as ${same.name}` : M.isSolved(r.state) ? 'This sequence leaves the cube solved' : '';
    selectPattern({ name: 'Your sequence', moves: r.moves, state: r.state, custom: true, aliasText }, false);
  }
  // Apply a custom-box parse that is still waiting on its debounce (before acting on the selection).
  function flushCustomInput() {
    if (customTimer === null) return;
    clearTimeout(customTimer);
    onCustomInput();
  }
  function cancelCustomInput() {
    clearTimeout(customTimer);
    customTimer = null;
  }
  const routeKey = () => {
    const now = physical.get();
    return app.sel && now ? now.state.join('') + '|' + app.sel.state.join('') : '';
  };
  function requestRoute() {
    const now = physical.get();
    if (app.mode === 'patterns' && app.startFrom === 'now' && app.sel && now) routes.request(now.state, app.sel.state);
    renderPatternDetail();
  }
  function routeMessage(r) {
    if (r.code === 'SOLVER_RESTARTING') return 'The route finder stopped and is restarting. Pick the pattern again in a few seconds.';
    return `Couldn't find a route (${r.message}). Please report this cube code: ${M.toFaceletString(physical.get().state)}`;
  }
  function renderPatternDetail() {
    if (!patternsVisible()) return;
    const sel = app.sel, now = physical.get();
    renderHold(app.startFrom === 'now' && now ? now.state : M.SOLVED);
    $('pd-empty').hidden = !!sel;
    $('pd-body').hidden = !sel;
    if (!sel) return;
    $('pd-name').textContent = sel.name;
    $('pd-alias').textContent = sel.aliasText || '';
    $('pd-alg').textContent = sel.moves.join(' ');
    $('from-solved-info').textContent = `${sel.moves.length} moves from a solved cube`;
    if (!now && app.startFrom === 'now') app.startFrom = 'solved';
    $('from-now').disabled = !now;
    $('from-now-info').textContent = now ? 'Direct route, about 20 turns' : 'Enter and check your cube in Solve first';
    $('from-solved').checked = app.startFrom === 'solved';
    $('from-now').checked = app.startFrom === 'now';
    $('pd-now').hidden = app.startFrom !== 'now';
    let status = '', canShow = true;
    if (app.startFrom === 'now') {
      paintNet(nowCells, now.state, null);
      $('now-label').textContent = `My cube now: ${now.label}. If your real cube looks different, switch to Solve and paint it.`;
      const r = routes.get(), st = Fast.getStatus();
      canShow = false;
      if (st === 'failed') status = "The route finder couldn't load. Start from a solved cube instead.";
      else if (!r || r.key !== routeKey() || r.status === 'waiting') status = st === 'ready' ? 'Finding the shortest route…' : 'Preparing solver…';
      else if (r.status === 'queued' || r.status === 'loading') status = 'Finding the shortest route…';
      else if (r.status === 'error') status = routeMessage(r);
      else if (!r.moves.length) status = 'Your cube already shows this pattern.';
      else { status = `Route found: ${r.moves.length} turns.`; canShow = true; }
    }
    $('route-status').textContent = status;
    $('btn-show').disabled = !canShow;
  }
  function showMe() {
    flushCustomInput();
    const sel = app.sel;
    if (!sel) return;
    let start, moves, kind, relabeled = false;
    if (app.startFrom === 'solved') {
      start = M.SOLVED; moves = sel.moves; kind = 'solved';
    } else {
      const r = routes.get();
      if (!r || r.status !== 'ready' || r.key !== routeKey() || !r.moves.length) return;
      start = r.from; moves = r.moves; kind = 'route'; relabeled = r.plan.relabeled;
    }
    const { states, steps } = Pat.patternSteps({ name: sel.name, start, moves, kind });
    startPlayback({ states, steps, kind: 'pattern', method: 'fast', name: sel.name, picture: sel.state, relabeled, startIsPhysical: kind === 'route' });
  }

  // ---------- playback ----------
  function startPlayback(play) {
    app.play = play;
    showPanel('play');
    $('btn-edit').textContent = play.kind === 'pattern' ? '← Patterns' : '← Edit cube';
    if (app.view) app.view.resetView();
    player.load(play.states, play.steps);
    buildMoveList(play.steps);
    renderPlay(player);
    // Phones: bring the step card up under the sticky cube; controls stick to the bottom.
    if (narrow()) $('card').scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    else window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }
  function backFromPlay() {
    player.afterTurn(() => {
      if (app.play.kind === 'pattern') { enterPatterns(); return; }
      showPanel('input');
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
        if (app.play.kind === 'solve' && app.play.method === 'beginner') {
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
    if (step.algLen < 2 || step.algLen > 30) return;
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
    const pattern = app.play.kind === 'pattern';
    if (!p.busy) {
      if (app.view) app.view.setState(cur);
      const label = S.trackPlayback({ pos, total, kind: app.play.kind, name: app.play.name, startIsPhysical: app.play.startIsPhysical });
      if (label) physical.set(cur, label);
    }
    $('counter').textContent = total ? (step ? `Turn ${pos + 1} of ${total}` : `Done · ${total} turns`) : '';
    $('progress-bar').style.width = total ? `${(pos / total) * 100}%` : '100%';
    renderHold(cur);
    paintNet(miniCells, cur, null);
    $('card').classList.toggle('finished', !step);
    if (!step) {
      $('card-stage').textContent = total ? 'Finished' : 'Nothing to do';
      $('card-move').textContent = pattern ? 'Done' : 'Solved';
      $('card-title').textContent = pattern ? app.play.name : total ? `${total} turns` : 'Already solved';
      $('card-detail').textContent = pattern
        ? `${Pat.endMessage({ final: cur, picture: app.play.picture, relabeled: app.play.relabeled })} Pick another pattern to go straight there, or switch to Solve to solve it back.`
        : total ? 'Your cube should now be solved. Use back or the turn list to review any turn.'
          : 'This cube is already solved. Go back and enter a scrambled cube.';
      $('card-alg').textContent = '';
      $('card-note').hidden = true;
    } else {
      const d = D.describeMove(step.move);
      $('card-stage').textContent = pattern ? `Pattern · ${app.play.name}`
        : app.play.method === 'beginner' ? (step.stage === 0 ? 'Before you start' : `Stage ${step.stage} of 7 · ${step.stageName}`)
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
    $('mode-solve').addEventListener('click', () => { if (app.mode !== 'solve' || $('input-panel').hidden) setMode('solve'); });
    $('mode-patterns').addEventListener('click', () => { if (app.mode !== 'patterns' || $('pattern-panel').hidden) setMode('patterns'); });
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
    $('btn-solved').addEventListener('click', () => setInputState(M.SOLVED, ''));
    $('btn-clear').addEventListener('click', () => setInputState(
      app.state.map((c, i) => (i % 9 === 4 ? c : 'x')), 'Cleared. Centers are kept; paint every other sticker.'));
    document.querySelectorAll('input[name="method"]').forEach(r => r.addEventListener('change', () => {
      app.method = r.value;
      renderSolveButton();
    }));
    $('btn-solve').addEventListener('click', solve);

    $('pattern-search').addEventListener('input', filterGallery);
    $('custom-alg').addEventListener('input', () => { clearTimeout(customTimer); customTimer = setTimeout(onCustomInput, 250); });
    $('gallery').addEventListener('click', e => {
      const card = e.target.closest('.pcard');
      if (!card) return;
      cancelCustomInput();
      const entry = Pat.entries()[Number(card.dataset.index)];
      selectPattern({ index: entry.index, name: entry.name, moves: entry.moves, state: entry.state, custom: false,
        aliasText: entry.aliases.length ? `Also called ${entry.aliases.join(', ')}` : '' }, true);
    });
    document.querySelectorAll('input[name="from"]').forEach(r => r.addEventListener('change', () => {
      app.startFrom = r.value;
      renderPatternDetail();
      requestRoute();
    }));
    $('btn-show').addEventListener('click', showMe);

    $('btn-edit').addEventListener('click', backFromPlay);
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
      } else if (!$('input-panel').hidden && PALETTE.includes(e.key.toLowerCase())) {
        selectColor(e.key.toLowerCase());
      }
    });
  }
  function boot() {
    buildPalette();
    selectColor('w');
    netCells = buildNet($('net'), true);
    miniCells = buildNet($('mini-net'), false);
    nowCells = buildNet($('now-net'), false);
    buildEditor();
    initView();
    player = P.createPlayer({
      animate: (move, ms) => (app.view ? app.view.animateMove(move, ms) : Promise.resolve()),
      onChange: renderPlay,
    });
    player.setSpeed(Number($('speed').value));
    renderSpeed();
    renderModeSwitch();
    wire();
    loadExample();
    Fast.onStatus(() => {
      renderSolveButton();
      if (app.mode === 'patterns' && !$('pattern-panel').hidden) requestRoute();
    });
    Fast.init();
  }
  boot();
})();
