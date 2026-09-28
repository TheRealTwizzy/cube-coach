// UI in three sections. My Cube: paint a digital twin of the cube in your hands and confirm it.
// Solve and Patterns (open once My Cube is confirmed) play turn-by-turn instructions from it,
// and My Cube follows along as you turn.
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
  const Vis = window.CubeVision;
  const ScanLib = window.CubeScan;

  const NAMES = D.NAMES;
  const FACE_WORD = D.FACE_WORD;
  const PALETTE = ['w', 'y', 'g', 'b', 'r', 'o'];
  const NET_POS = { U: [1, 2], L: [2, 1], F: [2, 2], R: [2, 3], B: [2, 4], D: [3, 2] };
  const PANELS = { cube: 'cube-panel', solve: 'solve-panel', patterns: 'pattern-panel', play: 'play-panel' };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  const $ = id => document.getElementById(id);
  // Only page scrolling honors reduced motion; turn animations always play (they are the instructions).
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const narrow = () => !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);
  const scrollBehavior = () => (reducedMotion ? 'auto' : 'smooth');
  const blankCube = () => M.SOLVED.map((c, i) => (i % 9 === 4 ? c : 'x'));

  const app = {
    mode: 'cube',
    cube: blankCube(),  // My Cube: the digital twin of the cube in the user's hands
    cubeLabel: '',      // where My Cube's current state came from, e.g. "End of Superflip"
    confirmed: false,   // the user confirmed My Cube and it is a real, solvable cube
    color: 'w', face: 'F', bad: new Set(), check: new Set(), method: 'fast', busy: false, view: null,
    play: { kind: 'solve', method: 'fast', name: '', picture: null, relabeled: false, custom: false },
    sel: null,          // selected pattern { index?, name, moves, state, custom, aliasText }
  };
  let netCells = [], miniCells = [], editorCells = [], solveCells = [], scanCells = [], player = null;
  let galleryBuilt = false, customTimer = null;
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
  const visible = name => !$(PANELS[name]).hidden;

  // ---------- sections ----------
  // focus: move keyboard focus to the new panel (user-initiated switches only).
  function showPanel(name, focus) {
    Object.entries(PANELS).forEach(([key, id]) => { $(id).hidden = key !== name; });
    document.body.classList.toggle('is-playing', name === 'play');
    document.body.classList.toggle('is-patterns', name === 'patterns');
    if (focus) {
      const target = name === 'play' ? $('card') : document.querySelector(`#${PANELS[name]} h2`);
      if (target) target.focus({ preventScroll: true });
    }
  }
  function renderModeSwitch() {
    ['cube', 'solve', 'patterns'].forEach(m => {
      const b = $(`mode-${m}`);
      b.setAttribute('aria-pressed', String(app.mode === m));
      if (m !== 'cube') {
        b.disabled = !app.confirmed;
        b.title = app.confirmed ? '' : 'Set up My Cube first';
      }
    });
  }
  function setMode(mode) {
    if (mode !== 'cube' && !app.confirmed) return;
    cancelCustomInput();
    player.afterTurn(() => {
      app.mode = mode;
      renderModeSwitch();
      if (mode === 'cube') enterCube();
      else if (mode === 'solve') enterSolve();
      else enterPatterns();
    });
  }
  function enterCube() {
    showPanel('cube', true);
    renderCube();
  }
  function enterSolve() {
    showPanel('solve', true);
    renderSolvePanel();
  }
  function enterPatterns() {
    buildGallery();
    showPanel('patterns', true);
    renderHold(app.cube);
    showPatternInView();
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
  function paintCell(el, i, state, bad, check) {
    el.style.setProperty('--c', `var(--c-${state[i]})`);
    el.classList.toggle('bad', !!(bad && bad.has(i)));
    el.classList.toggle('check', !!(check && check.has(i)));
    if (el.tagName === 'BUTTON') {
      const f = M.FACELETS[i];
      el.setAttribute('aria-label', `${FACE_WORD[f.face]} face, row ${f.row + 1}, column ${f.col + 1}: ${NAMES[state[i]]}`);
    }
  }
  const paintNet = (cells, state, bad, check) => cells.forEach((el, i) => paintCell(el, i, state, bad, check));
  function renderHold(state) {
    const up = M.centerColor(state, 'U'), front = M.centerColor(state, 'F');
    $('hold').innerHTML = `Hold: <i class="dot" style="--c:var(--c-${up})"></i>${NAMES[up]} on top ` +
      `<i class="dot" style="--c:var(--c-${front})"></i>${NAMES[front]} facing you`;
  }

  // ---------- My Cube ----------
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
    editorCells.forEach((el, k) => paintCell(el, fi * 9 + k, app.cube, app.bad, app.check));
    $('editor-title').textContent = `${FACE_WORD[app.face]} face · ${colorName(app.cube, app.face)} center`;
    $('hint').innerHTML = `<b>How to hold the cube for the ${FACE_WORD[app.face].toLowerCase()} face.</b> ` + D.faceHint(app.face, app.cube);
    document.querySelectorAll('#net .face').forEach(el => el.classList.toggle('active', el.dataset.face === app.face));
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
  function renderCube() {
    paintNet(netCells, app.cube, app.bad, app.check);
    renderFace();
    renderHold(app.cube);
    if (app.view && visible('cube')) app.view.setState(app.cube);
    const status = $('cube-status');
    status.classList.toggle('ok', app.confirmed);
    status.textContent = app.confirmed
      ? `This is your cube${app.cubeLabel ? ` (${app.cubeLabel})` : ''}. Solve and Patterns are open.`
      : 'When this matches your real cube, confirm it to open Solve and Patterns.';
  }
  // Any edit means My Cube may no longer match the real cube: it needs confirming again.
  function unconfirm() {
    app.confirmed = false;
    app.cubeLabel = '';
    renderModeSwitch();
  }
  function paint(i) {
    if (app.busy) return;
    app.face = M.FACELETS[i].face;
    app.cube = app.cube.slice();
    app.cube[i] = app.color;
    app.bad.delete(i);
    app.check.delete(i);
    unconfirm();
    renderCube();
  }
  function setNote(content) {
    const el = $('scramble-note');
    el.textContent = '';
    if (typeof content === 'string') el.textContent = content;
    else if (content) el.appendChild(content);
  }
  function setCube(next, note) {
    if (app.busy) return;
    app.cube = next.slice();
    app.bad = new Set();
    app.check = new Set();
    unconfirm();
    renderErrors([]);
    setNote(note || '');
    renderCube();
  }
  function loadExample() {
    const scramble = M.randomScramble(20);
    const note = document.createDocumentFragment();
    const code = document.createElement('code');
    code.textContent = scramble.join(' ');
    note.append('Example cube loaded. To try the app with a real cube, scramble a solved one with ', code,
      ' (white on top, green facing you).');
    setCube(M.applyMoves(M.SOLVED, scramble), note);
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
  function confirmCube() {
    const result = V.validate(app.cube);
    app.bad = new Set(result.errors.flatMap(e => e.cells));
    renderErrors(result.errors);
    if (result.ok) {
      app.confirmed = true;
      app.cubeLabel = '';
    }
    renderModeSwitch();
    renderCube();
  }

  // ---------- scanning (one photo per face; the camera is opened through a file input) ----------
  let scan = null, shot = null, dragging = -1;
  function startScan() {
    scan = ScanLib.createScan();
    shot = null;
    $('btn-scan').hidden = true;
    $('paint-area').hidden = true;
    $('scan-area').hidden = false;
    $('scan-msg').textContent = '';
    renderScan();
    $('scan-take').focus({ preventScroll: true });
  }
  function endScan() {
    scan = null;
    shot = null;
    $('scan-file').value = '';
    $('scan-area').hidden = true;
    $('paint-area').hidden = false;
    $('btn-scan').hidden = false;
  }
  function renderScan() {
    if (!scan) return;
    const step = scan.step();
    if (!step) { finishScan(); return; }
    $('scan-step').textContent = `Photo ${step.index + 1} of ${step.total} · ${FACE_WORD[step.face]} face`;
    $('scan-hold').textContent = `${step.instruction} Fill most of the photo with that face.`;
    $('scan-take').hidden = !!shot;
    $('scan-photo').hidden = !shot;
    $('scan-read').hidden = !shot;
    $('scan-actions').hidden = !shot;
    scanCells.forEach((el, i) => {
      const s = scan.faces[M.FACES[Math.floor(i / 9)]];
      el.style.setProperty('--c', s ? `rgb(${s[i % 9].rgb.map(Math.round).join(',')})` : 'var(--c-x)');
    });
  }
  function loadImage(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(() => loadImageElement(file));
    return loadImageElement(file);
  }
  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('That file is not a photo this browser can read.'));
      im.src = URL.createObjectURL(file);
    });
  }
  async function onPhoto(file) {
    if (!file || !scan) return;
    let source;
    try {
      source = await loadImage(file);
    } catch (err) {
      $('scan-msg').textContent = err.message;
      return;
    }
    const canvas = $('scan-canvas'), s = Math.min(1, 480 / Math.max(source.width, source.height));
    canvas.width = Math.round(source.width * s);
    canvas.height = Math.round(source.height * s);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = Vis.findFace(img), q = Vis.quality(img);
    shot = { img, corners: found.corners };
    const msgs = [];
    if (found.method === 'none') msgs.push("Couldn't find the face. Drag the 4 corners onto the face's corners.");
    else if (found.method === 'body') msgs.push('Check that the grid lines up with the stickers, and drag the corners if not.');
    if (q.dark) msgs.push('The photo is quite dark; more light gives truer colors.');
    else if (q.blurry && found.method !== 'none') msgs.push('The photo looks blurry. If the colors below look wrong, retake it.');
    $('scan-msg').textContent = msgs.join(' ');
    buildHandles();
    resample();
    renderScan();
  }
  function drawShot() {
    const canvas = $('scan-canvas'), ctx = canvas.getContext('2d'), H = Vis.homography(shot.corners);
    ctx.putImageData(shot.img, 0, 0);
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...H(...a)); ctx.lineTo(...H(...b)); ctx.stroke(); };
    [['rgba(0,0,0,.6)', 4], ['#fff', 2]].forEach(([color, width]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (let t = 0; t <= 3; t++) { line([t / 3, 0], [t / 3, 1]); line([0, t / 3], [1, t / 3]); }
    });
    document.querySelectorAll('#scan-photo .scan-handle').forEach((h, k) => {
      h.style.left = `${(shot.corners[k][0] / canvas.width) * 100}%`;
      h.style.top = `${(shot.corners[k][1] / canvas.height) * 100}%`;
    });
  }
  function resample() {
    shot.samples = Vis.sampleFace(shot.img, shot.corners);
    drawShot();
    const read = $('scan-read');
    read.textContent = '';
    shot.samples.forEach(s => {
      const cell = document.createElement('span');
      cell.style.setProperty('--c', `rgb(${s.rgb.map(Math.round).join(',')})`);
      read.appendChild(cell);
    });
  }
  const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  function buildHandles() {
    const box = $('scan-photo');
    if (box.querySelector('.scan-handle')) return;
    CORNER_NAMES.forEach((name, k) => {
      const h = document.createElement('div');
      h.className = 'scan-handle';
      h.tabIndex = 0;
      h.setAttribute('role', 'slider');
      h.setAttribute('aria-label', `Face corner, ${name}. Arrow keys move it.`);
      const moveTo = (x, y) => {
        const canvas = $('scan-canvas');
        shot.corners[k] = [Math.max(0, Math.min(canvas.width, x)), Math.max(0, Math.min(canvas.height, y))];
        drawShot();
      };
      h.addEventListener('pointerdown', e => { e.preventDefault(); dragging = k; h.setPointerCapture(e.pointerId); });
      h.addEventListener('pointermove', e => {
        if (dragging !== k || !shot) return;
        const canvas = $('scan-canvas'), r = canvas.getBoundingClientRect();
        moveTo((e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height);
      });
      const drop = () => { if (dragging === k && shot) resample(); dragging = -1; };
      h.addEventListener('pointerup', drop);
      h.addEventListener('pointercancel', drop);
      h.addEventListener('keydown', e => {
        const d = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] }[e.key];
        if (!d || !shot) return;
        e.preventDefault();
        moveTo(shot.corners[k][0] + d[0], shot.corners[k][1] + d[1]);
        resample();
      });
      box.appendChild(h);
    });
  }
  function retakePhoto() {
    shot = null;
    $('scan-file').value = '';
    $('scan-msg').textContent = '';
    renderScan();
    $('scan-take').focus({ preventScroll: true });
  }
  function acceptPhoto() {
    const step = scan.step();
    if (!step || !shot) return;
    scan.setFace(step.face, shot.samples);
    const dup = scan.duplicateCenters().find(d => d.second === step.face);
    if (dup) scan.redo(step.face);
    retakePhoto();
    if (dup) $('scan-msg').textContent = dup.message;
  }
  function finishScan() {
    const { state, uncertain } = scan.result();
    endScan();
    const n = uncertain.length;
    setCube(state, n
      ? `Scanned. ${n} sticker${n === 1 ? '' : 's'} I wasn't sure about ${n === 1 ? 'is' : 'are'} outlined with dashes: check ${n === 1 ? 'it' : 'them'} against your cube, then press "This is my cube".`
      : 'Scanned. Check it against your cube, then press "This is my cube".');
    app.check = new Set(uncertain);
    renderCube();
    document.querySelector('#cube-panel h2').focus({ preventScroll: true });
  }

  // ---------- Solve ----------
  function renderSolvePanel() {
    paintNet(solveCells, app.cube, null);
    $('solve-from').textContent = `Solving My Cube${app.cubeLabel ? ` (${app.cubeLabel})` : ''}.` +
      (M.isSolved(app.cube) ? ' It is already solved.' : '');
    renderHold(app.cube);
    if (app.view) app.view.setState(app.cube);
    renderSolveButton();
  }
  function renderSolveButton() {
    const st = Fast.getStatus();
    if (st === 'failed') {
      $('m-fast').disabled = true;
      if (app.method === 'fast') { app.method = 'beginner'; $('m-beginner').checked = true; }
    }
    const waiting = app.method === 'fast' && st !== 'ready';
    const btn = $('btn-solve');
    btn.disabled = app.busy || waiting || !app.confirmed;
    btn.textContent = app.busy ? 'Solving…' : waiting ? 'Preparing solver…' : 'Solve my cube';
    $('solver-status').textContent = st === 'failed'
      ? "The shortest solver couldn't load. The beginner method still works."
      : waiting ? 'Getting the shortest solver ready. This takes a few seconds the first time.' : '';
  }
  function renderSolveErrors(message) {
    const ul = $('solve-errors');
    ul.textContent = '';
    if (!message) return;
    const li = document.createElement('li');
    li.textContent = message;
    ul.appendChild(li);
  }
  async function solve() {
    if (app.busy || !app.confirmed) return;
    // Snapshot My Cube; the solution must match this cube even if the UI changes meanwhile.
    const input = app.cube.slice(), method = app.method;
    app.busy = true;
    renderSolveErrors('');
    renderSolveButton();
    try {
      const steps = method === 'fast' ? await Fast.solve(input) : await later(() => Beginner.solve(input));
      if (app.mode !== 'solve') return;
      startPlayback({ states: statesFrom(input, steps), steps, kind: 'solve', method, name: '', picture: null, relabeled: false, custom: false });
    } catch (err) {
      renderSolveErrors(err.code === 'SOLVER_RESTARTING'
        ? 'The shortest solver stopped and is restarting. Press Solve again in a few seconds, or pick Beginner.'
        : `The solver failed on this cube (${err.message}). Please report this cube code: ${M.toFaceletString(input)}`);
    } finally {
      app.busy = false;
      renderSolveButton();
    }
  }

  // ---------- Patterns ----------
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
  function showPatternInView() {
    if (visible('patterns') && app.view) app.view.setState(app.sel ? app.sel.state : app.cube);
  }
  function selectPattern(sel, scroll) {
    app.sel = sel;
    markCards();
    showPatternInView();
    requestRoute();
    if (scroll) $('pattern-detail').scrollIntoView({ block: narrow() ? 'start' : 'nearest', behavior: scrollBehavior() });
  }
  function onCustomInput() {
    customTimer = null;
    if (!visible('patterns')) return;
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
  // A solved My Cube plays the pattern's own moves; any other cube gets a direct route.
  const fromSolved = () => M.isSolved(app.cube);
  const routeKey = () => (app.sel ? app.cube.join('') + '|' + app.sel.state.join('') : '');
  function requestRoute() {
    if (visible('patterns') && app.sel && !fromSolved()) routes.request(app.cube, app.sel.state);
    renderPatternDetail();
  }
  function routeMessage(r) {
    if (r.code === 'SOLVER_RESTARTING') return 'The route finder stopped and is restarting. Pick the pattern again in a few seconds.';
    return `Couldn't find a route (${r.message}). Please report this cube code: ${M.toFaceletString(app.cube)}`;
  }
  function renderPatternDetail() {
    if (!visible('patterns')) return;
    const sel = app.sel;
    $('pd-empty').hidden = !!sel;
    $('pd-body').hidden = !sel;
    if (!sel) return;
    $('pd-name').textContent = sel.name;
    $('pd-alias').textContent = sel.aliasText || '';
    $('pd-alg').textContent = sel.moves.join(' ');
    let status, canShow = false;
    if (fromSolved()) {
      status = `Your cube is solved: follow the pattern's ${sel.moves.length} moves.`;
      canShow = true;
    } else {
      const r = routes.get(), st = Fast.getStatus();
      if (st === 'failed') status = "The route finder couldn't load. Solve your cube first, then make the pattern from solved.";
      else if (!r || r.key !== routeKey() || r.status === 'waiting') status = st === 'ready' ? 'Finding the shortest route from My Cube…' : 'Preparing solver…';
      else if (r.status === 'queued' || r.status === 'loading') status = 'Finding the shortest route from My Cube…';
      else if (r.status === 'error') status = routeMessage(r);
      else if (!r.moves.length) status = 'My Cube already shows this pattern.';
      else { status = `Route from My Cube: ${r.moves.length} turns.`; canShow = true; }
    }
    $('route-status').textContent = status;
    $('btn-show').disabled = !canShow;
  }
  function showMe() {
    flushCustomInput();
    const sel = app.sel;
    if (!sel) return;
    let moves, kind, relabeled = false;
    if (fromSolved()) {
      moves = sel.moves; kind = 'solved';
    } else {
      const r = routes.get();
      if (!r || r.status !== 'ready' || r.key !== routeKey() || !r.moves.length) return;
      moves = r.moves; kind = 'route'; relabeled = r.plan.relabeled;
    }
    const { states, steps } = Pat.patternSteps({ name: sel.name, start: app.cube, moves, kind });
    startPlayback({ states, steps, kind: 'pattern', method: 'fast', name: sel.name, picture: sel.state, relabeled, custom: !!sel.custom });
  }

  // ---------- playback ----------
  function startPlayback(play) {
    app.play = play;
    showPanel('play', true);
    $('btn-edit').textContent = play.kind === 'pattern' ? '← Patterns' : '← Solve';
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
      if (app.play.kind === 'pattern') enterPatterns();
      else enterSolve();
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
    if (!visible('play')) return;
    const total = p.steps.length, pos = p.pos, cur = p.states[pos], step = p.steps[pos];
    const pattern = app.play.kind === 'pattern';
    if (!p.busy) {
      if (app.view) app.view.setState(cur);
      // My Cube follows the real cube through the playback.
      const label = S.trackPlayback({ pos, total, kind: app.play.kind, name: app.play.name, custom: app.play.custom, startIsPhysical: true });
      if (label) { app.cube = cur.slice(); app.cubeLabel = label; }
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
        ? `${Pat.endMessage({ final: cur, picture: app.play.picture, relabeled: app.play.relabeled })} Pick another pattern to go straight there, or open Solve to solve it back.`
        : total ? 'Your cube should now be solved. Use back or the turn list to review any turn.'
          : 'My Cube is already solved. Open My Cube to set up a scrambled cube.';
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
    ['cube', 'solve', 'patterns'].forEach(m => $(`mode-${m}`).addEventListener('click', () => {
      if (app.mode !== m || !visible(m)) setMode(m);
    }));
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
    $('btn-solved').addEventListener('click', () => setCube(M.SOLVED, ''));
    $('btn-clear').addEventListener('click', () => setCube(
      app.cube.map((c, i) => (i % 9 === 4 ? c : 'x')), 'Cleared. Centers are kept; paint every other sticker.'));
    $('btn-confirm').addEventListener('click', confirmCube);
    $('btn-scan').addEventListener('click', startScan);
    $('scan-take').addEventListener('click', () => $('scan-file').click());
    $('scan-file').addEventListener('change', e => onPhoto(e.target.files && e.target.files[0]));
    $('scan-retake').addEventListener('click', retakePhoto);
    $('scan-ok').addEventListener('click', acceptPhoto);
    $('scan-cancel').addEventListener('click', () => { endScan(); $('btn-scan').focus({ preventScroll: true }); });
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
      if (visible('play')) {
        if (e.key === 'ArrowRight') { e.preventDefault(); player.stop(); player.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); player.back(); }
        else if (e.key === 'Home') { e.preventDefault(); player.jump(0); }
        else if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); player.togglePlay(); }
      } else if (visible('cube') && PALETTE.includes(e.key.toLowerCase())) {
        selectColor(e.key.toLowerCase());
      }
    });
  }
  function boot() {
    buildPalette();
    selectColor('w');
    netCells = buildNet($('net'), true);
    miniCells = buildNet($('mini-net'), false);
    solveCells = buildNet($('solve-net'), false);
    scanCells = buildNet($('scan-net'), false);
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
    setCube(blankCube(), 'Paint each face to match your cube, or tap Example to try the app.');
    Fast.onStatus(() => {
      renderSolveButton();
      if (visible('patterns')) requestRoute();
    });
    Fast.init();
  }
  boot();
})();
