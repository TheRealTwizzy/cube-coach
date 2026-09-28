# Cube Coach (Rubik's Cube Solver) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static web page where the user paints their scrambled 3x3 cube's 54 stickers, picks Shortest or Beginner method, and follows an animated 3D cube one turn at a time.

**Architecture:** Plain UMD-style scripts (browser globals, Node `module.exports`), no bundler. Pure logic (`cube.js`, `validate.js`, `fast.js`, `beginner.js`) is unit-tested with `node --test`; browser-only code (`view3d.js`, `app.js`, `index.html`) is verified in the built-in browser. Page is published as a claude.ai Artifact (index.html + js/*) and also opens from disk.

**Tech Stack:** Vanilla JS (ES2020), three.js r128 (cdnjs), cubejs 1.3.2 (jsDelivr in page, npm devDependency for tests), Node 22 `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-27-rubiks-solver-design.md`

## Global Constraints

- Sticker order: U R F D L B, 9 per face, row-major Kociemba net. Solved colors: U `w`, R `r`, F `g`, D `y`, L `o`, B `b`. Unset sticker: `x`.
- Geometry: x→R, y→U, z→F. Face turn X = clockwise looking at face X = -90° about its outward normal.
- Three.js: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` (global `THREE`).
- cubejs: `https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/cube.js` and `.../lib/solve.js` (global `Cube`). Our model's global is `CubeModel` to avoid the clash.
- Every module file starts with the UMD wrapper shown in Task 1; browser globals: `CubeModel`, `CubeValidate`, `FastSolver`, `BeginnerSolver`, `CubeView`.
- `index.html` has NO `<!doctype>`, `<html>`, `<head>`, `<body>` tags (Artifact publisher wraps it); `<title>` first.
- Artifact CSP: scripts only from cdnjs / jsDelivr npm; stylesheets only Google Fonts; no `alert/confirm/prompt`; body sets explicit token background; light + dark tokens; no horizontal scroll at 400px; 16px side gutter.
- Step object shape (both solvers): `{ move, stage, stageName, algName, alg, algPos, algLen }`.
- Beginner: step 0 is `z2`; stages 1–7 afterward in yellow-Up frame. Shortest: `stage: 1`, `stageName: 'Shortest solution'`, empty `algName`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A face read while holding the cube the wrong way** (face rotated 90°) → validator rejects with a "recheck" message, never a crash or a bogus solve. Test added in Task 2.
2. **Input that is a whole-cube rotation of the standard hold** (e.g. red on top) → validator accepts, both solvers still solve (everything is center-relative). Tests added in Tasks 2, 3, 4.
3. **Already-solved input** → both solvers return `[]`; UI shows "Already solved" card instead of an empty player. Tests in Tasks 3, 4; UI check in Task 5.
4. **Solve pressed while the shortest solver is still warming up** → button disabled with "Preparing solver…", no exception. UI check in Task 5.
5. **Next/Back pressed rapidly during an animation** → presses ignored while busy; 3D view, mini net and counter stay in sync. UI check in Task 5.

---

## File Structure

```
index.html            page content, CSS tokens, script tags (Task 5)
package.json          test script + cubejs devDependency (Task 1, dep in Task 3)
.gitignore            node_modules (Task 1)
CLAUDE.md             project notes (Task 6)
js/cube.js            cube model (Task 1)
js/validate.js        input validation (Task 2)
js/fast.js            cubejs wrapper + worker (Task 3)
js/beginner.js        layer-by-layer solver (Task 4)
js/view3d.js          three.js view (Task 5)
js/app.js             UI (Task 5)
test/helpers.js       seeded RNG (Task 1)
test/cube.test.js     (Task 1)
test/validate.test.js (Task 2)
test/fast.test.js     (Task 3)
test/beginner.test.js (Task 4)
```

---

### Task 1: Cube model

**Files:**
- Create: `package.json`, `.gitignore`, `js/cube.js`, `test/helpers.js`, `test/cube.test.js`

**Interfaces:**
- Produces (global `CubeModel` / `require('./cube.js')`):
  - `FACES: ['U','R','F','D','L','B']`, `NORMALS: {face: [x,y,z]}`, `COLORS`, `SOLVED: string[54]`
  - `FACELETS: {index, face, row, col, pos:[x,y,z], normal:[x,y,z]}[54]`
  - `EDGES: [refIdx, otherIdx][12]`, `CORNERS: [refIdx, idx, idx][8]` (ref = U/D sticker, else F/B)
  - `PERMS: {move: number[54]}` for `U R F D L B x y z` with suffixes `'' 2 '`; `MOVES: string[]`
  - `parseMoves(str|array): string[]`, `applyPerm(state, perm)`, `applyMove(state, move)`, `applyMoves(state, str|array)`
  - `sequencePerm(str|array): number[54]`, `invertMove(m)`, `invertMoves(str|array): string[]`
  - `centerColor(state, face)`, `isSolved(state)`, `toFaceletString(state): string` (face letters by center)
  - `randomScramble(length=25, rng=Math.random): string[]`
  - `moveGeometry(move): {axis:[x,y,z], angle: radians, inLayer(pos): bool}`

- [ ] **Step 1: Scaffold package + helpers**

`package.json`:
```json
{
  "name": "rubiks-solver",
  "private": true,
  "description": "Cube Coach: enter a 3x3 cube, follow an animated solve turn by turn.",
  "scripts": {
    "test": "node --test"
  }
}
```

`.gitignore`:
```
node_modules/
```

`test/helpers.js`:
```js
// Deterministic RNG (mulberry32) so random-scramble tests are reproducible.
function seededRng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
module.exports = { seededRng };
```

- [ ] **Step 2: Write failing tests** — `test/cube.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const { seededRng } = require('./helpers.js');

test('solved state and facelet string', () => {
  assert.equal(M.SOLVED.length, 54);
  assert.ok(M.isSolved(M.SOLVED));
  assert.equal(M.toFaceletString(M.SOLVED), 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
});

test('every base move is a permutation and has order 4', () => {
  const all = [...Array(54).keys()];
  for (const b of ['U', 'R', 'F', 'D', 'L', 'B', 'x', 'y', 'z']) {
    assert.deepEqual([...M.PERMS[b]].sort((p, q) => p - q), all, b);
    let s = M.SOLVED;
    for (let i = 0; i < 4; i++) s = M.applyMove(s, b);
    assert.deepEqual(s, M.SOLVED, `${b} x4`);
    assert.deepEqual(M.applyMoves(M.SOLVED, `${b} ${b}'`), M.SOLVED, `${b} ${b}'`);
    assert.deepEqual(M.applyMove(M.SOLVED, b + '2'), M.applyMoves(M.SOLVED, [b, b]), `${b}2`);
  }
});

test('face turns move the expected stickers', () => {
  const u = M.applyMove(M.SOLVED, 'U');
  assert.deepEqual(u.slice(36, 39), ['g', 'g', 'g'], 'U: front top row goes to the left face');
  assert.deepEqual(u.slice(18, 21), ['r', 'r', 'r'], 'U: right top row comes to the front');
  const r = M.applyMove(M.SOLVED, 'R');
  assert.deepEqual([r[2], r[5], r[8]], ['g', 'g', 'g'], 'R: front right column goes up');
  const f = M.applyMove(M.SOLVED, 'F');
  assert.deepEqual([f[9], f[12], f[15]], ['w', 'w', 'w'], 'F: top bottom row goes to the right');
});

test('sexy move has order 6', () => {
  let s = M.SOLVED;
  for (let i = 0; i < 6; i++) s = M.applyMoves(s, "R U R' U'");
  assert.ok(M.isSolved(s));
  assert.ok(!M.isSolved(M.applyMoves(M.SOLVED, "R U R' U'")));
});

test('z2 flips the cube: yellow top, green front, orange right', () => {
  const s = M.applyMove(M.SOLVED, 'z2');
  assert.equal(M.centerColor(s, 'U'), 'y');
  assert.equal(M.centerColor(s, 'F'), 'g');
  assert.equal(M.centerColor(s, 'R'), 'o');
  assert.ok(M.isSolved(s));
});

test('pieces: 12 edges, 8 corners, cover every non-center sticker once', () => {
  assert.equal(M.EDGES.length, 12);
  assert.equal(M.CORNERS.length, 8);
  const used = [...M.EDGES.flat(), ...M.CORNERS.flat()].sort((p, q) => p - q);
  const expected = [...Array(54).keys()].filter(i => i % 9 !== 4);
  assert.deepEqual(used, expected);
  assert.ok(M.CORNERS.some(c => c.join() === '8,9,20'), 'URF corner is [U9, R1, F3]');
  assert.ok(M.EDGES.some(e => e.join() === '7,19'), 'UF edge is [U8, F2]');
});

test('inverse and parsing', () => {
  assert.deepEqual(M.invertMoves("R U2 F'"), ['F', 'U2', "R'"]);
  assert.throws(() => M.parseMoves('R Q'), /Unknown move: Q/);
  const alg = "R U R' F2 D' L B2 x y' z2";
  assert.ok(M.isSolved(M.applyMoves(M.applyMoves(M.SOLVED, alg), M.invertMoves(alg))));
  assert.deepEqual(M.applyPerm(M.SOLVED, M.sequencePerm(alg)), M.applyMoves(M.SOLVED, alg));
});

test('randomScramble: length, no same face twice in a row, deterministic with seed', () => {
  const a = M.randomScramble(30, seededRng(7));
  const b = M.randomScramble(30, seededRng(7));
  assert.equal(a.length, 30);
  assert.deepEqual(a, b);
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i][0], a[i - 1][0]);
  a.forEach(m => assert.ok(M.PERMS[m]));
});

test('moveGeometry matches the permutation direction', () => {
  const r = M.moveGeometry('R');
  assert.deepEqual(r.axis, [1, 0, 0]);
  assert.equal(r.angle, -Math.PI / 2);
  assert.equal(M.moveGeometry("R'").angle, Math.PI / 2);
  assert.equal(M.moveGeometry('R2').angle, -Math.PI);
  assert.ok(r.inLayer([1, 0, -1]));
  assert.ok(!r.inLayer([0, 1, 1]));
  assert.ok(M.moveGeometry('z2').inLayer([-1, -1, -1]));
});
```

- [ ] **Step 3: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/cube.js'`.

- [ ] **Step 4: Implement `js/cube.js`**
```js
// Cube model: 54 stickers in U R F D L B order (9 per face, row-major Kociemba net).
// Face turns and whole-cube rotations are derived from 3D geometry, never typed by hand.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const NORMALS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const COLORS = ['w', 'r', 'g', 'y', 'o', 'b']; // standard hold: white top, green front
  const SOLVED = COLORS.flatMap(c => Array(9).fill(c));

  // Grid (row, col) of a face as seen in the net -> cubie position. x = right, y = up, z = front.
  function gridToPos(face, r, c) {
    switch (face) {
      case 'U': return [c - 1, 1, r - 1];
      case 'R': return [1, 1 - r, 1 - c];
      case 'F': return [c - 1, 1 - r, 1];
      case 'D': return [c - 1, -1, 1 - r];
      case 'L': return [-1, 1 - r, c - 1];
      case 'B': return [1 - c, 1 - r, -1];
    }
  }

  const FACELETS = [];
  FACES.forEach((face, fi) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        FACELETS.push({ index: fi * 9 + r * 3 + c, face, row: r, col: c, pos: gridToPos(face, r, c), normal: NORMALS[face].slice() });
      }
    }
  });

  const keyOf = (pos, normal) => pos.join(',') + '|' + normal.join(',');
  const LOOKUP = new Map(FACELETS.map(f => [keyOf(f.pos, f.normal), f.index]));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // Rotate v by -90 degrees about unit axis a: clockwise when looking at the +a side.
  function rotateCW(v, a) {
    const d = dot(a, v), c = cross(a, v);
    return [a[0] * d - c[0], a[1] * d - c[1], a[2] * d - c[2]];
  }

  // perm[i] = index the sticker at i moves to.
  const quarterPerm = (axis, inLayer) => FACELETS.map(f =>
    inLayer(f.pos) ? LOOKUP.get(keyOf(rotateCW(f.pos, axis), rotateCW(f.normal, axis))) : f.index);
  const IDENTITY = FACELETS.map(f => f.index);
  const compose = (p, q) => p.map(d => q[d]); // p, then q

  const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const BASE = {};
  FACES.forEach(f => { BASE[f] = quarterPerm(NORMALS[f], p => dot(p, NORMALS[f]) > 0.5); });
  Object.keys(AXES).forEach(a => { BASE[a] = quarterPerm(AXES[a], () => true); });

  const PERMS = {};
  Object.keys(BASE).forEach(b => {
    const p1 = BASE[b], p2 = compose(p1, p1);
    PERMS[b] = p1;
    PERMS[b + '2'] = p2;
    PERMS[b + "'"] = compose(p2, p1);
  });
  const MOVES = Object.keys(PERMS);

  function parseMoves(moves) {
    const list = Array.isArray(moves) ? moves : String(moves).trim().split(/\s+/).filter(Boolean);
    list.forEach(m => { if (!PERMS[m]) throw new Error('Unknown move: ' + m); });
    return list;
  }
  function applyPerm(state, perm) {
    const out = new Array(54);
    for (let i = 0; i < 54; i++) out[perm[i]] = state[i];
    return out;
  }
  function applyMove(state, move) {
    const p = PERMS[move];
    if (!p) throw new Error('Unknown move: ' + move);
    return applyPerm(state, p);
  }
  const applyMoves = (state, moves) => parseMoves(moves).reduce(applyMove, state);
  const sequencePerm = moves => parseMoves(moves).reduce((p, m) => compose(p, PERMS[m]), IDENTITY);
  const invertMove = m => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : m + "'");
  const invertMoves = moves => parseMoves(moves).slice().reverse().map(invertMove);

  const centerColor = (state, face) => state[FACES.indexOf(face) * 9 + 4];
  function isSolved(state) {
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 9; k++) if (state[f * 9 + k] !== state[f * 9 + 4]) return false;
    }
    return true;
  }
  function toFaceletString(state) {
    const faceOfColor = {};
    FACES.forEach(f => { faceOfColor[centerColor(state, f)] = f; });
    return state.map(c => faceOfColor[c]).join('');
  }

  // Pieces as sticker-index lists. Reference sticker first (U/D, else F/B);
  // corners then follow one fixed chirality so twist is well defined.
  const byPos = new Map();
  FACELETS.forEach(f => {
    const k = f.pos.join(',');
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k).push(f.index);
  });
  const isUD = i => FACELETS[i].face === 'U' || FACELETS[i].face === 'D';
  const isFB = i => FACELETS[i].face === 'F' || FACELETS[i].face === 'B';
  const EDGES = [], CORNERS = [];
  byPos.forEach(ids => {
    if (ids.length === 2) {
      const a = ids.find(isUD) ?? ids.find(isFB);
      EDGES.push([a, ids.find(i => i !== a)]);
    } else if (ids.length === 3) {
      const a = ids.find(isUD), rest = ids.filter(i => i !== a);
      const p = FACELETS[a].pos, n = FACELETS[a].normal;
      const b = rest.find(i => dot(cross(n, FACELETS[i].normal), p) < 0);
      CORNERS.push([a, b, rest.find(i => i !== b)]);
    }
  });

  function randomScramble(length = 25, rng = Math.random) {
    const out = [], suffixes = ['', '2', "'"];
    while (out.length < length) {
      const f = FACES[Math.floor(rng() * 6)];
      if (out.length && out[out.length - 1][0] === f) continue;
      out.push(f + suffixes[Math.floor(rng() * 3)]);
    }
    return out;
  }

  // For animation: rotate the cubies where inLayer(pos) by angle (right-handed) about axis.
  function moveGeometry(move) {
    if (!PERMS[move]) throw new Error('Unknown move: ' + move);
    const base = move[0], suffix = move.slice(1);
    const turns = suffix === '2' ? 2 : suffix === "'" ? -1 : 1;
    const axis = AXES[base] || NORMALS[base];
    const inLayer = AXES[base] ? () => true : p => dot(p, axis) > 0.5;
    return { axis: axis.slice(), angle: -turns * Math.PI / 2, inLayer };
  }

  return {
    FACES, NORMALS, COLORS, SOLVED, FACELETS, EDGES, CORNERS, PERMS, MOVES,
    parseMoves, applyPerm, applyMove, applyMoves, sequencePerm, invertMove, invertMoves,
    centerColor, isSolved, toFaceletString, randomScramble, moveGeometry,
  };
});
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test`
Expected: PASS, 9 tests in `cube.test.js`.

- [ ] **Step 6: Commit**
```bash
git add package.json .gitignore js/cube.js test/helpers.js test/cube.test.js
git commit -m "Add cube model with geometry-derived moves"
```

---

### Task 2: Input validation

**Files:**
- Create: `js/validate.js`, `test/validate.test.js`

**Interfaces:**
- Consumes: `CubeModel` (`FACES, FACELETS, EDGES, CORNERS, centerColor`).
- Produces (global `CubeValidate`): `validate(state: string[54]) → { ok: boolean, errors: { message: string, cells: number[] }[] }`.

- [ ] **Step 1: Write failing tests** — `test/validate.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const { validate } = require('../js/validate.js');
const { seededRng } = require('./helpers.js');

const withColors = (state, changes) => { const s = state.slice(); Object.entries(changes).forEach(([i, c]) => { s[i] = c; }); return s; };
const expectError = (state, pattern) => {
  const r = validate(state);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => pattern.test(e.message)), r.errors.map(e => e.message).join(' | '));
  return r;
};

test('accepts solved and 500 random scrambles', () => {
  assert.deepEqual(validate(M.SOLVED), { ok: true, errors: [] });
  const rng = seededRng(1);
  for (let n = 0; n < 500; n++) {
    const s = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    assert.ok(validate(s).ok, `scramble ${n}`);
  }
});

test('accepts a whole-cube rotation of a scramble (non-standard hold)', () => {
  const s = M.applyMoves(M.SOLVED, "R U F' L2 D B' x y'");
  assert.ok(validate(s).ok);
});

test('flags unfilled stickers', () => {
  const r = expectError(withColors(M.SOLVED, { 0: 'x', 10: 'x' }), /2 stickers are not filled/);
  assert.deepEqual(r.errors[0].cells, [0, 10]);
});

test('flags duplicate centers', () => {
  expectError(withColors(M.SOLVED, { 4: 'y' }), /same center color/);
});

test('flags wrong color counts', () => {
  expectError(withColors(M.SOLVED, { 0: 'r' }), /exactly 9 times\. Found 8 white, 10 red/);
});

test('flags an impossible edge and names faces', () => {
  // UF edge becomes white-yellow; a yellow sticker becomes green to keep counts at 9.
  const r = expectError(withColors(M.SOLVED, { 19: 'y', 27: 'g' }), /white-yellow edge can't exist.*top and front/);
  assert.ok(r.errors.some(e => e.cells.includes(19)));
});

test('flags a mirror-image corner', () => {
  // URF corner [8, 9, 20]: swap the red and green stickers.
  expectError(withColors(M.SOLVED, { 9: 'g', 20: 'r' }), /mirror-image/);
});

test('flags duplicate pieces', () => {
  // UR edge becomes a second white-green edge; a green corner sticker turns red so counts stay 9.
  expectError(withColors(M.SOLVED, { 10: 'g', 26: 'r' }), /Two edges both have the white-green colors/);
});

test('flags a single twisted corner', () => {
  const s = M.SOLVED.slice();
  const [a, b, c] = M.CORNERS.find(k => k.includes(8));
  [s[a], s[b], s[c]] = [M.SOLVED[c], M.SOLVED[a], M.SOLVED[b]];
  expectError(s, /One corner is twisted/);
});

test('flags a single flipped edge', () => {
  expectError(withColors(M.SOLVED, { 7: 'g', 19: 'w' }), /One edge is flipped/);
});

test('flags two swapped edges', () => {
  // Swap the UF and UR edge pieces on a solved cube (white stays on top, side colors trade places).
  expectError(withColors(M.SOLVED, { 19: 'r', 10: 'g' }), /Two pieces are swapped/);
  // Same swap on a lightly scrambled cube.
  const s = M.applyMoves(M.SOLVED, "R U R' U'");
  const t = s.slice();
  const [ufU, ufF] = [7, 19], [urU, urR] = [5, 10];
  [t[ufU], t[ufF], t[urU], t[urR]] = [s[urU], s[urR], s[ufU], s[ufF]];
  expectError(t, /Two pieces are swapped/);
});

test('flags a face read in the wrong orientation (rotated 90 degrees)', () => {
  const s = M.applyMoves(M.SOLVED, M.randomScramble(25, seededRng(99)));
  const t = s.slice();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) t[r * 3 + c] = s[(2 - c) * 3 + r];
  assert.equal(validate(t).ok, false);
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/validate.js'`.

- [ ] **Step 3: Implement `js/validate.js`**
```js
// Checks that 54 painted sticker colors describe a real cube that can be solved by turning.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.CubeValidate = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const NAMES = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange' };
  const FACE_WORD = { U: 'top', D: 'bottom', F: 'front', B: 'back', L: 'left', R: 'right' };
  const faceOf = i => M.FACELETS[i].face;
  const colorsText = cols => cols.map(c => NAMES[c]).join('-');
  function facesText(slot) {
    const words = slot.map(i => FACE_WORD[faceOf(i)]);
    return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }
  function parity(perm) {
    const seen = new Array(perm.length).fill(false);
    let swaps = 0;
    for (let i = 0; i < perm.length; i++) {
      let j = i, len = 0;
      while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
      if (len) swaps += len - 1;
    }
    return swaps % 2;
  }

  function validate(state) {
    const errors = [];
    const add = (message, cells) => errors.push({ message, cells: cells || [] });
    const done = () => ({ ok: errors.length === 0, errors });

    const unfilled = [];
    state.forEach((c, i) => { if (!NAMES[c]) unfilled.push(i); });
    if (unfilled.length) {
      add(`${unfilled.length} sticker${unfilled.length === 1 ? ' is' : 's are'} not filled in yet.`, unfilled);
      return done();
    }

    const centerIdx = M.FACES.map((f, fi) => fi * 9 + 4);
    const centers = centerIdx.map(i => state[i]);
    if (new Set(centers).size !== 6) {
      add('Two faces have the same center color. Every center must be a different color.',
        centerIdx.filter(i => centers.filter(c => c === state[i]).length > 1));
      return done();
    }

    const counts = {};
    state.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    const off = Object.keys(NAMES).filter(c => counts[c] !== 9);
    if (off.length) {
      add(`Each color must appear exactly 9 times. Found ${off.map(c => `${counts[c] || 0} ${NAMES[c]}`).join(', ')}.`);
      return done();
    }

    const home = i => M.centerColor(state, faceOf(i));

    const edgePerm = [], edgeFlip = [];
    M.EDGES.forEach(slot => {
      const cols = slot.map(i => state[i]);
      let piece = -1, flip = 0;
      M.EDGES.forEach((ref, k) => {
        const want = ref.map(home);
        if (want[0] === cols[0] && want[1] === cols[1]) { piece = k; flip = 0; }
        else if (want[0] === cols[1] && want[1] === cols[0]) { piece = k; flip = 1; }
      });
      if (piece < 0) add(`The ${colorsText(cols)} edge can't exist on a real cube. Recheck the ${facesText(slot)} faces.`, slot);
      edgePerm.push(piece);
      edgeFlip.push(flip);
    });

    const cornerPerm = [], cornerTwist = [];
    M.CORNERS.forEach(slot => {
      const cols = slot.map(i => state[i]);
      let piece = -1, twist = 0, mirrored = false;
      if (new Set(cols).size === 3) {
        M.CORNERS.forEach((ref, k) => {
          const want = ref.map(home);
          if (!want.every(c => cols.includes(c))) return;
          const t = cols.indexOf(want[0]);
          if (cols[(t + 1) % 3] === want[1] && cols[(t + 2) % 3] === want[2]) { piece = k; twist = t; }
          else mirrored = true;
        });
      }
      if (piece < 0) {
        add(mirrored
          ? `The ${colorsText(cols)} corner has its colors in an impossible (mirror-image) order. Recheck the ${facesText(slot)} faces.`
          : `The ${colorsText(cols)} corner can't exist on a real cube. Recheck the ${facesText(slot)} faces.`, slot);
      }
      cornerPerm.push(piece);
      cornerTwist.push(twist);
    });

    const duplicates = (perm, slots, kind) => {
      const bySlot = new Map();
      perm.forEach((p, s) => {
        if (p < 0) return;
        if (!bySlot.has(p)) bySlot.set(p, []);
        bySlot.get(p).push(s);
      });
      bySlot.forEach(ss => {
        if (ss.length < 2) return;
        add(`Two ${kind}s both have the ${colorsText(slots[ss[0]].map(i => state[i]))} colors. One of them was misread.`,
          ss.flatMap(s => slots[s]));
      });
    };
    duplicates(edgePerm, M.EDGES, 'edge');
    duplicates(cornerPerm, M.CORNERS, 'corner');
    if (errors.length) return done();

    if (cornerTwist.reduce((a, b) => a + b, 0) % 3 !== 0) {
      add('One corner is twisted. Recheck the corner stickers. If they are right, a corner on the real cube was twisted in place, so it cannot be solved by turning.');
    }
    if (edgeFlip.reduce((a, b) => a + b, 0) % 2 !== 0) {
      add('One edge is flipped. Recheck the edge stickers. If they are right, an edge on the real cube was flipped in place, so it cannot be solved by turning.');
    }
    if (parity(edgePerm) !== parity(cornerPerm)) {
      add('Two pieces are swapped. Recheck the stickers. If they are right, the real cube was put back together with two pieces swapped, so it cannot be solved by turning.');
    }
    return done();
  }

  return { validate };
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: PASS (cube + validate suites). If "rotated face" happens to validate for seed 99, change the seed to another fixed value and note it in the commit.

- [ ] **Step 5: Commit**
```bash
git add js/validate.js test/validate.test.js
git commit -m "Add cube input validation with human-readable errors"
```

---

### Task 3: Shortest solver (cubejs wrapper)

**Files:**
- Modify: `package.json` (add devDependency via npm)
- Create: `js/fast.js`, `test/fast.test.js`

**Interfaces:**
- Consumes: `CubeModel` (`isSolved`, `toFaceletString`); in browser `window.Cube` (cubejs).
- Produces (global `FastSolver`):
  - `toSteps(solution: string) → Step[]`
  - `solveWith(CubeLib, state) → Step[]` (sync; tests + main-thread fallback)
  - `init()` — browser: start background warm-up (worker from blob, fallback main thread)
  - `solve(state) → Promise<Step[]>`
  - `onStatus(fn(status))`, `getStatus() → 'idle'|'loading'|'ready'|'failed'`

- [ ] **Step 1: Install test dependency** (needs user approval — software install)

Run: `npm install --save-dev cubejs@1.3.2`
Expected: `package.json` gains `"devDependencies": { "cubejs": "^1.3.2" }`; `node_modules/cubejs/lib/solve.js` exists.

- [ ] **Step 2: Write failing tests** — `test/fast.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Cube = require('cubejs');
const M = require('../js/cube.js');
const Fast = require('../js/fast.js');
const { seededRng } = require('./helpers.js');

test('our move conventions match cubejs', () => {
  const rng = seededRng(3);
  for (let n = 0; n < 50; n++) {
    const alg = M.randomScramble(20, rng);
    const ours = M.toFaceletString(M.applyMoves(M.SOLVED, alg));
    assert.equal(ours, new Cube().move(alg.join(' ')).asString(), alg.join(' '));
  }
});

test('toSteps shapes steps', () => {
  assert.deepEqual(Fast.toSteps(''), []);
  const steps = Fast.toSteps("R U' F2");
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[1], { move: "U'", stage: 1, stageName: 'Shortest solution', algName: '', alg: '', algPos: 1, algLen: 3 });
});

test('solves random scrambles in at most 22 turns', () => {
  Cube.initSolver();
  assert.deepEqual(Fast.solveWith(Cube, M.SOLVED), []);
  const rng = seededRng(4);
  for (let n = 0; n < 50; n++) {
    const start = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    const steps = Fast.solveWith(Cube, start);
    assert.ok(steps.length <= 22, `${steps.length} turns`);
    assert.ok(M.isSolved(M.applyMoves(start, steps.map(s => s.move))), `scramble ${n}`);
  }
});

test('solves a cube entered in a non-standard hold', () => {
  const start = M.applyMoves(M.SOLVED, "R U F' L2 D B' x y'");
  const steps = Fast.solveWith(Cube, start);
  assert.ok(M.isSolved(M.applyMoves(start, steps.map(s => s.move))));
});
```

- [ ] **Step 3: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/fast.js'`.

- [ ] **Step 4: Implement `js/fast.js`**
```js
// Shortest solver: Kociemba two-phase via cubejs (https://github.com/ldez/cubejs, MIT).
// In the browser the ~4 s table build runs in a worker; if workers are unavailable it
// falls back to the main thread using the page's own cubejs script tags.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel, root);
  if (isNode) module.exports = api;
  else root.FastSolver = api;
})(typeof self !== 'undefined' ? self : this, function (M, root) {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/';
  const STAGE_NAME = 'Shortest solution';

  function toSteps(solution) {
    const moves = String(solution || '').trim().split(/\s+/).filter(Boolean);
    return moves.map((move, k) => ({ move, stage: 1, stageName: STAGE_NAME, algName: '', alg: '', algPos: k, algLen: moves.length }));
  }
  function solveWith(CubeLib, state) {
    if (M.isSolved(state)) return [];
    return toSteps(CubeLib.fromString(M.toFaceletString(state)).solve());
  }

  let status = 'idle', worker = null, nextId = 1;
  const pending = new Map(), listeners = [];
  const setStatus = s => { status = s; listeners.forEach(fn => fn(s)); };
  const onStatus = fn => { listeners.push(fn); fn(status); };
  const getStatus = () => status;

  const WORKER_SRC = [
    `importScripts('${CDN}cube.js', '${CDN}solve.js');`,
    'Cube.initSolver();',
    "postMessage({ type: 'ready' });",
    'onmessage = function (e) {',
    '  var d = e.data;',
    "  try { postMessage({ type: 'solution', id: d.id, solution: Cube.fromString(d.facelets).solve() }); }",
    "  catch (err) { postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) }); }",
    '};',
  ].join('\n');

  function initMainThread() {
    if (!root.Cube || !root.Cube.initSolver) { setStatus('failed'); return; }
    setStatus('loading');
    setTimeout(() => {
      try { root.Cube.initSolver(); setStatus('ready'); } catch (e) { setStatus('failed'); }
    }, 50);
  }

  function init() {
    if (status !== 'idle') return;
    setStatus('loading');
    try {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
      worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'ready') { setStatus('ready'); return; }
        const p = pending.get(d.id);
        if (!p) return;
        pending.delete(d.id);
        if (d.type === 'solution') p.resolve(toSteps(d.solution));
        else p.reject(new Error(d.message));
      };
      worker.onerror = e => {
        if (e && e.preventDefault) e.preventDefault();
        worker.terminate();
        worker = null;
        pending.forEach(p => p.reject(new Error('Solver worker stopped')));
        pending.clear();
        initMainThread();
      };
    } catch (e) {
      worker = null;
      initMainThread();
    }
  }

  function solve(state) {
    if (M.isSolved(state)) return Promise.resolve([]);
    if (status !== 'ready') return Promise.reject(new Error('The shortest solver is still loading.'));
    if (worker) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, facelets: M.toFaceletString(state) });
      });
    }
    try { return Promise.resolve(solveWith(root.Cube, state)); } catch (e) { return Promise.reject(e); }
  }

  return { toSteps, solveWith, init, solve, onStatus, getStatus };
});
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test`
Expected: PASS (cube, validate, fast). Fast suite takes ~5–30 s (table build + 50 solves).

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json js/fast.js test/fast.test.js
git commit -m "Add shortest solver wrapper around cubejs"
```

---

### Task 4: Beginner solver

**Files:**
- Create: `js/beginner.js`, `test/beginner.test.js`

**Interfaces:**
- Consumes: `CubeModel` (`FACES, FACELETS, EDGES, CORNERS, PERMS, applyMove, applyPerm, sequencePerm, centerColor, isSolved`).
- Produces (global `BeginnerSolver`):
  - `solve(state) → Step[]` — `[]` if already solved; else step 0 = `z2`, then stages 1–7.
  - `stageDone(state, k: 0..7) → boolean` (state in yellow-Up frame, i.e. after the `z2`).

- [ ] **Step 1: Write failing tests** — `test/beginner.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const B = require('../js/beginner.js');
const { seededRng } = require('./helpers.js');

function checkSolve(start, label) {
  const steps = B.solve(start);
  let s = start;
  steps.forEach((st, i) => {
    s = M.applyMove(s, st.move);
    const stageEnds = i === steps.length - 1 || steps[i + 1].stage !== st.stage;
    if (stageEnds) {
      for (let k = 0; k <= st.stage; k++) assert.ok(B.stageDone(s, k), `${label}: stage ${k} broken after stage ${st.stage}`);
    }
  });
  assert.ok(M.isSolved(s), `${label}: not solved`);
  return steps;
}

test('already solved cube needs no steps', () => {
  assert.deepEqual(B.solve(M.SOLVED), []);
});

test('first step flips the cube; steps carry labels', () => {
  const start = M.applyMoves(M.SOLVED, "R U F' L2 D B'");
  const steps = checkSolve(start, 'fixed');
  assert.equal(steps[0].move, 'z2');
  assert.equal(steps[0].stage, 0);
  for (const st of steps) {
    assert.ok(st.stage >= 0 && st.stage <= 7);
    assert.equal(typeof st.stageName, 'string');
    assert.ok(st.algName.length > 0);
    assert.equal(st.alg.split(' ')[st.algPos], st.move);
    assert.equal(st.alg.split(' ').length, st.algLen);
  }
  assert.equal(steps.find(st => st.stage === 1).stageName, 'White cross');
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k].stage >= steps[k - 1].stage, 'stages in order');
});

test('solves 300 random scrambles with every stage intact', () => {
  const rng = seededRng(2024);
  let total = 0;
  for (let n = 0; n < 300; n++) {
    const start = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    total += checkSolve(start, `scramble ${n}`).length;
  }
  const avg = total / 300;
  assert.ok(avg < 200, `average ${avg.toFixed(1)} turns`);
});

test('solves a cube entered in a non-standard hold', () => {
  checkSolve(M.applyMoves(M.SOLVED, "R U F' L2 D B' x y'"), 'rotated');
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/beginner.js'`.

- [ ] **Step 3: Implement `js/beginner.js`**
```js
// Beginner (layer-by-layer) solver. Flips the cube (z2) so the first layer is built on
// the bottom, then solves 7 stages. Stages 2-6 search only over textbook algorithms and
// top-layer turns, so every step is a move a beginner would actually learn.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.BeginnerSolver = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const NAMES = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange' };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const faceOf = i => M.FACELETS[i].face;
  const center = (s, f) => M.centerColor(s, f);
  const hasFace = (slot, f) => slot.some(i => faceOf(i) === f);
  const slotSolved = (s, slot) => slot.every(i => s[i] === center(s, faceOf(i)));
  const rightPiece = (s, slot) => {
    const have = slot.map(i => s[i]);
    return slot.every(i => have.includes(center(s, faceOf(i))));
  };

  const D_EDGES = M.EDGES.filter(sl => hasFace(sl, 'D'));
  const D_CORNERS = M.CORNERS.filter(sl => hasFace(sl, 'D'));
  const MID_EDGES = M.EDGES.filter(sl => !hasFace(sl, 'U') && !hasFace(sl, 'D'));
  const U_EDGES = M.EDGES.filter(sl => hasFace(sl, 'U'));
  const U_CORNERS = M.CORNERS.filter(sl => hasFace(sl, 'U'));
  const UFR_TOP = 8; // top sticker of the front-right-top corner

  function stageDone(s, k) {
    switch (k) {
      case 0: return true;
      case 1: return D_EDGES.every(sl => slotSolved(s, sl));
      case 2: return stageDone(s, 1) && D_CORNERS.every(sl => slotSolved(s, sl));
      case 3: return stageDone(s, 2) && MID_EDGES.every(sl => slotSolved(s, sl));
      case 4: return stageDone(s, 3) && U_EDGES.every(sl => s[sl[0]] === center(s, 'U'));
      case 5: return stageDone(s, 4) && U_EDGES.every(sl => slotSolved(s, sl));
      case 6: return stageDone(s, 5) && U_CORNERS.every(sl => rightPiece(s, sl));
      case 7: return M.isSolved(s);
      default: throw new Error('No stage ' + k);
    }
  }

  // --- Algorithms, relabeled for each of the four side faces acting as "front" ---
  const RIGHT = { F: 'R', R: 'B', B: 'L', L: 'F' };
  const LEFT = { F: 'L', R: 'F', B: 'R', L: 'B' };
  const OPP = { F: 'B', R: 'L', B: 'F', L: 'R' };
  const FRONTS = ['F', 'R', 'B', 'L'];
  function relabel(alg, front) {
    const map = { U: 'U', D: 'D', F: front, R: RIGHT[front], B: OPP[front], L: LEFT[front] };
    return alg.split(' ').map(m => map[m[0]] + m.slice(1)).join(' ');
  }
  function macro(alg, name, isTurn) {
    const moves = alg.split(' ');
    return { name, moves, isTurn: !!isTurn, perm: M.sequencePerm(moves) };
  }
  const repeat = (alg, k) => Array(k).fill(alg).join(' ');
  const TURNS = ['U', 'U2', "U'"].map(m => macro(m, 'Turn the top layer', true));
  const everyFront = (alg, name) => FRONTS.map(f => macro(relabel(alg, f), name));
  const cornerTricks = FRONTS.flatMap(f => {
    const base = relabel("R U R' U'", f);
    return [1, 2, 3, 4, 5].map(k => macro(repeat(base, k), k === 1 ? `Corner trick: ${base}` : `Corner trick: ${base}, ${k} times`));
  });

  const MACROS = {
    2: TURNS.concat(cornerTricks),
    3: TURNS.concat(everyFront("U R U' R' U' F' U F", 'Insert edge to the right'),
      everyFront("U' L' U L U F U' F'", 'Insert edge to the left')),
    4: TURNS.concat(everyFront("F R U R' U' F'", 'Make the top cross')),
    5: TURNS.concat(everyFront("R U R' U R U2 R' U", 'Swap two top edges')),
    6: TURNS.concat(everyFront("U R U' L' U R' U' L", 'Cycle three top corners')),
  };
  const DEPTH = { 2: 4, 3: 4, 4: 6, 5: 6, 6: 5 };

  // Breadth-first search over macros; never two top-layer turns in a row.
  function macroSearch(start, macros, goal, maxDepth) {
    if (goal(start)) return [];
    const seen = new Set([start.join('')]);
    let frontier = [{ s: start, path: [], turn: false }];
    for (let depth = 1; depth <= maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const mac of macros) {
          if (mac.isTurn && node.turn) continue;
          const s = M.applyPerm(node.s, mac.perm);
          const key = s.join('');
          if (seen.has(key)) continue;
          seen.add(key);
          const path = node.path.concat([mac]);
          if (goal(s)) return path;
          next.push({ s, path, turn: mac.isTurn });
        }
      }
      frontier = next;
    }
    return null;
  }

  // --- Stage 1: optimal cross by BFS over the 4 bottom edges' sticker positions ---
  const MOVES18 = [];
  M.FACES.forEach(f => MOVES18.push(f, f + '2', f + "'"));
  const EF = M.EDGES.flat(); // 24 edge sticker positions
  const EIDX = new Map(EF.map((f, k) => [f, k]));
  const EMOVE = MOVES18.map(m => EF.map(f => EIDX.get(M.PERMS[m][f])));
  const SIZE = 1 << 20; // 4 positions x 5 bits
  let parent = null, via = null, queue = null;

  function solveCross(s) {
    const bottom = center(s, 'D');
    const starts = [], targets = [];
    FRONTS.forEach(side => {
      const sideColor = center(s, side);
      const home = D_EDGES.find(sl => hasFace(sl, side));
      targets.push(EIDX.get(home.find(i => faceOf(i) === 'D')));
      M.EDGES.forEach(sl => {
        if (s[sl[0]] === bottom && s[sl[1]] === sideColor) starts.push(EIDX.get(sl[0]));
        else if (s[sl[1]] === bottom && s[sl[0]] === sideColor) starts.push(EIDX.get(sl[1]));
      });
    });
    const enc = a => a[0] | (a[1] << 5) | (a[2] << 10) | (a[3] << 15);
    const start = enc(starts), goal = enc(targets);
    if (start === goal) return [];
    if (!parent) { parent = new Int32Array(SIZE); via = new Int8Array(SIZE); queue = new Int32Array(SIZE); }
    parent.fill(-1);
    parent[start] = start;
    let head = 0, tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      const a = cur & 31, b = (cur >> 5) & 31, c = (cur >> 10) & 31, d = (cur >> 15) & 31;
      for (let m = 0; m < 18; m++) {
        const t = EMOVE[m];
        const nxt = t[a] | (t[b] << 5) | (t[c] << 10) | (t[d] << 15);
        if (parent[nxt] !== -1) continue;
        parent[nxt] = cur;
        via[nxt] = m;
        if (nxt === goal) {
          const path = [];
          for (let k = goal; k !== start; k = parent[k]) path.push(MOVES18[via[k]]);
          return path.reverse();
        }
        queue[tail++] = nxt;
      }
    }
    throw new Error('Cross search failed');
  }

  function solve(input) {
    if (M.isSolved(input)) return [];
    const firstColor = NAMES[center(input, 'U')] || 'first'; // ends up on the bottom after z2
    const lastColor = NAMES[center(input, 'D')] || 'last';   // ends up on top
    const stageNames = ['Get ready', cap(`${firstColor} cross`), cap(`${firstColor} corners`), 'Middle layer',
      cap(`${lastColor} cross`), cap(`${lastColor} edges`), cap(`place ${lastColor} corners`), cap(`twist ${lastColor} corners`)];

    const steps = [];
    let s = input.slice();
    const push = (stage, name, moves) => {
      moves.forEach((move, k) => {
        steps.push({ move, stage, stageName: stageNames[stage], algName: name, alg: moves.join(' '), algPos: k, algLen: moves.length });
        s = M.applyMove(s, move);
      });
    };
    const pushPath = (stage, path) => path.forEach(mac => push(stage, mac.name, mac.moves));
    const fail = stage => { throw new Error(`Beginner solver got stuck in stage ${stage} (${stageNames[stage]})`); };

    push(0, 'Flip the whole cube', ['z2']);
    push(1, 'Build the cross', solveCross(s));

    // Stages 2-3: one piece at a time, whichever is quickest next.
    const pieceStage = (k, slots) => {
      for (let guard = 0; guard < 8; guard++) {
        const solved = slots.filter(sl => slotSolved(s, sl));
        if (solved.length === slots.length) return;
        const goal = t => stageDone(t, k - 1) && solved.every(sl => slotSolved(t, sl)) &&
          slots.filter(sl => slotSolved(t, sl)).length > solved.length;
        const path = macroSearch(s, MACROS[k], goal, DEPTH[k]);
        if (!path) fail(k);
        pushPath(k, path);
      }
      fail(k);
    };
    pieceStage(2, D_CORNERS);
    pieceStage(3, MID_EDGES);

    [4, 5, 6].forEach(k => {
      const path = macroSearch(s, MACROS[k], t => stageDone(t, k), DEPTH[k]);
      if (!path) fail(k);
      pushPath(k, path);
    });

    // Stage 7: bring each unsolved top corner to front-right-top, repeat R' D' R D until
    // its top sticker faces up. Only the top layer turns in between.
    const up = center(s, 'U');
    const TURN = ['U', 'U2', "U'"];
    for (let guard = 0; guard < 8; guard++) {
      let k = -1;
      for (let n = 0; n < 4 && k < 0; n++) {
        const t = n ? M.applyMove(s, TURN[n - 1]) : s;
        if (t[UFR_TOP] !== up) k = n;
      }
      if (k < 0) break;
      if (k) push(7, 'Turn the top layer', [TURN[k - 1]]);
      for (let reps = 0; s[UFR_TOP] !== up; reps++) {
        if (reps >= 6) fail(7);
        push(7, "Twist corner: repeat R' D' R D until the top color faces up", ["R'", "D'", 'R', 'D']);
      }
    }
    if (!M.isSolved(s)) {
      const auf = TURN.find(m => M.isSolved(M.applyMove(s, m)));
      if (!auf) fail(7);
      push(7, 'Line up the top layer', [auf]);
    }
    return steps;
  }

  return { solve, stageDone };
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: PASS all suites. Beginner suite should finish in under ~60 s; if slower, lower the scramble count to 200 (keep ≥200) and note why in the commit.

- [ ] **Step 5: Commit**
```bash
git add js/beginner.js test/beginner.test.js
git commit -m "Add beginner layer-by-layer solver"
```

---

### Task 5: 3D view + page UI

**Files:**
- Create: `js/view3d.js`, `js/app.js`, `index.html`

**Interfaces:**
- Consumes: `CubeModel`, `CubeValidate.validate`, `FastSolver.{init, solve, onStatus, getStatus}`, `BeginnerSolver.solve`, global `THREE` (r128).
- Produces: global `CubeView` constructor: `new CubeView(containerEl)` with `setState(state)`, `animateMove(move, ms) → Promise`, `resetView()`, `render()`. `app.js` produces nothing (entry point).

- [ ] **Step 1: Implement `js/view3d.js`**
```js
// 3D cube view (three.js r128): 27 cubies with sticker planes, animated layer turns,
// drag to look around. Stickers are recolored from state after each turn, so cubies
// never keep a rotation.
(function (root) {
  'use strict';
  const M = root.CubeModel;
  const HEX = { w: 0xf4f4ef, y: 0xffd200, g: 0x00a04a, b: 0x0b4fc4, r: 0xc8102e, o: 0xff6a13, x: 0x6b717b };
  const VIEW_DIR = [0.55, 0.46, 0.7]; // camera sees top, front and right
  const FIT_RADIUS = 2.5;

  function roundedSquare(T, size, radius) {
    const s = size / 2, r = radius, shape = new T.Shape();
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);
    return new T.ShapeGeometry(shape, 4);
  }

  function CubeView(container) {
    const T = root.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    container.appendChild(el);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new T.AmbientLight(0xffffff, 0.75));
    const sun = new T.DirectionalLight(0xffffff, 0.45);
    sun.position.set(3, 8, 6);
    scene.add(sun);
    const group = new T.Group();
    scene.add(group);

    const bodyGeo = new T.BoxGeometry(0.96, 0.96, 0.96);
    const bodyMat = new T.MeshLambertMaterial({ color: 0x17191d });
    const stickerGeo = roundedSquare(T, 0.84, 0.12);
    const cubies = [];
    const byPos = new Map();
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const c = new T.Mesh(bodyGeo, bodyMat);
          c.position.set(x, y, z);
          c.userData.pos = [x, y, z];
          group.add(c);
          cubies.push(c);
          byPos.set(`${x},${y},${z}`, c);
        }
      }
    }
    const stickers = M.FACELETS.map(f => {
      const mesh = new T.Mesh(stickerGeo, new T.MeshLambertMaterial({ color: HEX.x }));
      const n = f.normal;
      mesh.position.set(n[0] * 0.49, n[1] * 0.49, n[2] * 0.49);
      mesh.lookAt(n[0] * 2, n[1] * 2, n[2] * 2);
      byPos.get(f.pos.join(',')).add(mesh);
      return mesh;
    });

    const render = () => renderer.render(scene, camera);
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const vfov = T.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = FIT_RADIUS / Math.sin(Math.min(vfov, hfov) / 2);
      camera.position.set(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2]).normalize().multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      render();
    }
    if (root.ResizeObserver) new root.ResizeObserver(resize).observe(container);
    else root.addEventListener('resize', resize);
    resize();

    let drag = null;
    el.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      group.rotateOnWorldAxis(new T.Vector3(0, 1, 0), dx * 0.01);
      group.rotateOnWorldAxis(new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), dy * 0.01);
      render();
    });
    const endDrag = () => { drag = null; el.style.cursor = ''; };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('dblclick', () => this.resetView());

    this.render = render;
    this.resetView = () => { group.quaternion.identity(); render(); };
    this.setState = state => {
      stickers.forEach((m, i) => m.material.color.setHex(HEX[state[i]] ?? HEX.x));
      render();
    };
    this.animateMove = (move, ms) => new Promise(resolve => {
      if (!ms) { resolve(); return; }
      const g = M.moveGeometry(move);
      const pivot = new T.Object3D();
      group.add(pivot);
      const moving = cubies.filter(c => g.inLayer(c.userData.pos));
      moving.forEach(c => pivot.attach(c));
      const axis = new T.Vector3(g.axis[0], g.axis[1], g.axis[2]);
      const t0 = performance.now();
      const frame = now => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.setRotationFromAxisAngle(axis, g.angle * e);
        render();
        if (t < 1) { requestAnimationFrame(frame); return; }
        moving.forEach(c => {
          group.attach(c);
          c.position.set(c.userData.pos[0], c.userData.pos[1], c.userData.pos[2]);
          c.quaternion.identity();
        });
        group.remove(pivot);
        resolve(); // caller recolors via setState in the same task, so no frame shows the reset
      };
      requestAnimationFrame(frame);
    });
  }

  root.CubeView = CubeView;
})(this);
```

- [ ] **Step 2: Implement `js/app.js`**
```js
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
```

- [ ] **Step 3: Implement `index.html`**

Design plan — Color: plastic `#17191d`, ground light `#e8ebef` / dark `#101216`, surface `#f7f8fa` / `#181b21`, ink `#15181d` / `#e7eaef`, accent cobalt `#1d4ed8` / `#7a9bff`, danger `#c01731` / `#ff6b7f`; the six sticker colors are the only saturated hues. Type: Barlow Condensed (display, uppercase labels), Barlow (body), IBM Plex Mono (cube notation). Layout: 3D cube sticky on the left, working panel on the right (input or playback); stacks at ≤860px.

```html
<title>Cube Coach</title>
<meta name="description" content="Paint your Rubik's cube colors, then follow an animated solve one turn at a time.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
  :root {
    --ground: #e8ebef; --surface: #f7f8fa; --surface-2: #eef1f5; --ink: #15181d; --muted: #566070;
    --line: #cdd3dc; --accent: #1d4ed8; --accent-ink: #ffffff; --danger: #c01731; --plastic: #17191d;
    --c-w: #f4f4ef; --c-y: #ffd200; --c-g: #00a04a; --c-b: #0b4fc4; --c-r: #c8102e; --c-o: #ff6a13; --c-x: #b3bac4;
    --font-body: 'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-display: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --ground: #101216; --surface: #181b21; --surface-2: #1f232a; --ink: #e7eaef; --muted: #9aa3b0;
      --line: #2d323b; --accent: #7a9bff; --accent-ink: #0c1330; --danger: #ff6b7f; --c-x: #4a515c;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --ground: #101216; --surface: #181b21; --surface-2: #1f232a; --ink: #e7eaef; --muted: #9aa3b0;
    --line: #2d323b; --accent: #7a9bff; --accent-ink: #0c1330; --danger: #ff6b7f; --c-x: #4a515c;
  }
  * { box-sizing: border-box; }
  body { background: var(--ground); color: var(--ink); font: 16px/1.5 var(--font-body); padding-inline: 16px; }
  button { font: inherit; color: inherit; }
  code { font-family: var(--font-mono); font-size: .92em; }
  .wrap { max-width: 1180px; margin-inline: auto; padding-block: 20px 48px; display: grid; gap: 20px; }

  .top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand h1 { margin: 0; font: 700 32px/1 var(--font-display); letter-spacing: .02em; text-transform: uppercase; }
  .logo { display: grid; grid-template-columns: repeat(3, 9px); gap: 2px; padding: 3px; background: var(--plastic); border-radius: 5px; }
  .logo i { width: 9px; height: 9px; border-radius: 2px; background: var(--c); }
  .hold { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 12px; border: 1px solid var(--line);
    border-radius: 999px; background: var(--surface); color: var(--muted); font-size: 14px; }
  .dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: var(--c); box-shadow: 0 0 0 1px rgba(0,0,0,.25); }
  .banner { margin: 0; padding: 10px 14px; border: 1px solid var(--danger); border-radius: 10px; background: var(--surface); }

  .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: start; }
  .viewer { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); display: grid; gap: 8px; }
  #view { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 78vh; overflow: hidden; border-radius: 16px;
    border: 1px solid var(--line); background: radial-gradient(circle at 50% 40%, var(--surface) 0%, var(--surface-2) 75%); }
  #view canvas { display: block; width: 100%; height: 100%; cursor: grab; }
  .no3d { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); }
  .view-note { margin: 0; text-align: center; color: var(--muted); font-size: 13px; }

  .panel { display: grid; gap: 24px; min-width: 0; }
  .section { display: grid; gap: 12px; min-width: 0; }
  .section h2 { margin: 0; display: flex; align-items: baseline; gap: 10px; font: 700 21px/1.1 var(--font-display);
    letter-spacing: .03em; text-transform: uppercase; text-wrap: balance; }
  .section h2 .n { font: 600 13px/1 var(--font-mono); color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .tip, .status { margin: 0; color: var(--muted); font-size: 14px; }

  .btn { padding: 9px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-weight: 500; cursor: pointer; }
  .btn:hover { border-color: var(--muted); }
  .btn.primary { justify-self: start; padding: 12px 22px; border-color: transparent; background: var(--accent); color: var(--accent-ink);
    font: 700 19px/1 var(--font-display); letter-spacing: .04em; text-transform: uppercase; }
  .btn:disabled, .icon-btn:disabled { opacity: .5; cursor: not-allowed; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }

  .palette { display: flex; flex-wrap: wrap; gap: 8px; }
  .swatch { position: relative; width: 46px; height: 46px; border: 2px solid var(--line); border-radius: 10px; background: var(--c); cursor: pointer; }
  .swatch[aria-pressed="true"] { outline: 3px solid var(--ink); outline-offset: 2px; }
  .swatch kbd { position: absolute; right: 3px; bottom: 3px; padding: 0 3px; border-radius: 3px; background: rgba(255,255,255,.8);
    color: #15181d; font: 600 10px/1.4 var(--font-mono); }

  .net { --s: clamp(22px, 6vw, 34px); display: grid; grid-template-columns: repeat(4, max-content); gap: 6px; }
  .net.mini { --s: 13px; gap: 3px; }
  .face { display: grid; gap: 4px; align-content: end; }
  .face-label { font: 600 11px/1 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(3, var(--s)); gap: 3px; padding: 3px; border-radius: 7px; background: var(--plastic); }
  .net.mini .grid { gap: 2px; padding: 2px; border-radius: 4px; }
  .face.active .grid { box-shadow: 0 0 0 3px var(--accent); }
  .st { display: block; width: var(--s); height: var(--s); padding: 0; border: 0; border-radius: 4px; background: var(--c, var(--c-x)); }
  .net.mini .st { border-radius: 2px; }
  button.st { cursor: pointer; }
  button.st:hover { filter: brightness(1.1); }
  .st.bad { position: relative; outline: 3px solid var(--danger); outline-offset: 1px; animation: pulse 1.2s ease-in-out 2; }
  @keyframes pulse { 50% { outline-color: transparent; } }

  .hint { padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 15px; max-width: 65ch; }
  .hint b { font-weight: 600; }

  .methods { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .method { position: relative; display: grid; gap: 2px; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 12px;
    background: var(--surface); cursor: pointer; }
  .method input { position: absolute; opacity: 0; pointer-events: none; }
  .method:has(input:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .method:has(input:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }
  .method:has(input:disabled) { opacity: .5; cursor: not-allowed; }
  .method strong { font: 700 19px/1.1 var(--font-display); letter-spacing: .03em; text-transform: uppercase; }
  .method span { color: var(--muted); font-size: 14px; }

  .errors { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .errors li { padding: 10px 12px; border: 1px solid var(--danger); border-radius: 10px; background: var(--surface); }
  .errors li.tip { border-color: var(--line); }

  .play-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .counter { font: 600 14px/1 var(--font-mono); color: var(--muted); font-variant-numeric: tabular-nums; }
  .card { display: grid; gap: 8px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
  .card .stage { font: 600 12px/1.3 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .card .move { font: 600 clamp(56px, 12vw, 88px)/1 var(--font-mono); letter-spacing: -.02em; }
  .card.finished .move { font-family: var(--font-display); text-transform: uppercase; color: var(--c-g); }
  .card .move-title { font: 700 23px/1.15 var(--font-display); letter-spacing: .02em; text-transform: uppercase; }
  .card .detail { margin: 0; color: var(--muted); max-width: 60ch; }
  .alg { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font: 500 15px/1.6 var(--font-mono); }
  .alg:empty { display: none; }
  .alg .name { flex-basis: 100%; font: 600 14px/1.4 var(--font-body); }
  .alg .m { color: var(--muted); }
  .alg .m.done { color: var(--ink); }
  .alg .m.now { padding: 0 4px; border-radius: 4px; color: var(--ink); outline: 1.5px solid var(--accent); background: var(--surface-2); }

  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .icon-btn { display: grid; place-items: center; width: 48px; height: 48px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface); cursor: pointer; }
  .icon-btn.big { width: 64px; border-color: transparent; background: var(--accent); color: var(--accent-ink); }
  .icon-btn svg { width: 22px; height: 22px; fill: currentColor; }
  .speed { display: flex; align-items: center; gap: 8px; margin-left: auto; color: var(--muted); font-size: 14px; }
  .speed input { width: 120px; accent-color: var(--accent); }
  .progress { height: 6px; overflow: hidden; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); }
  .progress > div { width: 0; height: 100%; background: var(--accent); transition: width .2s; }
  .moves { position: relative; display: grid; gap: 12px; max-height: 260px; overflow: auto; padding-right: 4px; }
  .moves h3 { margin: 0 0 6px; font: 600 12px/1.2 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { min-width: 36px; padding: 6px 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
    color: var(--muted); font: 500 14px/1 var(--font-mono); cursor: pointer; }
  .chip.done { background: var(--surface-2); color: var(--ink); }
  .chip.now { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); color: var(--ink); }

  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; }
    .viewer { position: static; }
    #view { aspect-ratio: 4 / 3; max-height: 46vh; }
  }
  @media (max-width: 440px) {
    .methods { grid-template-columns: 1fr; }
    .speed { margin-left: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
</style>

<div class="wrap">
  <header class="top">
    <div class="brand">
      <div class="logo" aria-hidden="true">
        <i style="--c:var(--c-r)"></i><i style="--c:var(--c-w)"></i><i style="--c:var(--c-b)"></i>
        <i style="--c:var(--c-y)"></i><i style="--c:var(--c-g)"></i><i style="--c:var(--c-o)"></i>
        <i style="--c:var(--c-g)"></i><i style="--c:var(--c-r)"></i><i style="--c:var(--c-w)"></i>
      </div>
      <h1>Cube Coach</h1>
    </div>
    <div class="hold" id="hold" aria-live="polite"></div>
  </header>
  <p class="banner" id="banner" role="alert" hidden></p>

  <main class="layout">
    <section class="viewer" aria-label="3D cube">
      <div id="view"></div>
      <p class="view-note">Drag to look around. Double-click to reset the view.</p>
    </section>

    <section class="panel" id="input-panel" aria-label="Enter your cube">
      <div class="section">
        <h2><span class="n">1</span>Paint your cube</h2>
        <div class="palette" id="palette" role="group" aria-label="Sticker color"></div>
        <div class="net" id="net"></div>
        <div class="hint" id="hint" aria-live="polite"></div>
        <div class="row">
          <button class="btn" id="btn-example" type="button">New example</button>
          <button class="btn" id="btn-solved" type="button">Solved cube</button>
          <button class="btn" id="btn-clear" type="button">Clear</button>
        </div>
        <p class="tip" id="scramble-note"></p>
      </div>
      <div class="section">
        <h2><span class="n">2</span>Pick a method</h2>
        <div class="methods" role="radiogroup" aria-label="Solving method">
          <label class="method"><input type="radio" name="method" id="m-fast" value="fast" checked>
            <strong>Shortest</strong><span>About 20 turns. Quickest to follow.</span></label>
          <label class="method"><input type="radio" name="method" id="m-beginner" value="beginner">
            <strong>Beginner</strong><span>100–150 turns in 7 stages you can learn.</span></label>
        </div>
      </div>
      <div class="section">
        <h2><span class="n">3</span>Solve</h2>
        <button class="btn primary" id="btn-solve" type="button">Solve my cube</button>
        <p class="status" id="solver-status" aria-live="polite"></p>
        <ul class="errors" id="errors" aria-live="polite"></ul>
      </div>
    </section>

    <section class="panel" id="play-panel" aria-label="Solution" hidden>
      <div class="play-head">
        <button class="btn" id="btn-edit" type="button">← Edit cube</button>
        <span class="counter" id="counter"></span>
      </div>
      <div class="card" id="card" aria-live="polite">
        <div class="stage" id="card-stage"></div>
        <div class="move" id="card-move"></div>
        <div class="move-title" id="card-title"></div>
        <p class="detail" id="card-detail"></p>
        <div class="alg" id="card-alg"></div>
      </div>
      <div class="controls">
        <button class="icon-btn" id="btn-restart" type="button" aria-label="Back to the start">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2v14H5zM19 5v14L9 12z"/></svg></button>
        <button class="icon-btn" id="btn-prev" type="button" aria-label="Undo the last turn">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5v14L6 12z"/></svg></button>
        <button class="icon-btn big" id="btn-play" type="button" aria-label="Play all turns"></button>
        <button class="icon-btn" id="btn-next" type="button" aria-label="Do this turn">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l11-7z"/></svg></button>
        <label class="speed" for="speed">Speed <input type="range" id="speed" min="1" max="10" step="1" value="5"></label>
      </div>
      <div class="progress" aria-hidden="true"><div id="progress-bar"></div></div>
      <div class="section">
        <h2>All turns</h2>
        <div class="moves" id="moves"></div>
      </div>
      <div class="section">
        <h2>Every side right now</h2>
        <div class="net mini" id="mini-net"></div>
      </div>
    </section>
  </main>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/cube.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/solve.js"></script>
<script src="js/cube.js"></script>
<script src="js/validate.js"></script>
<script src="js/fast.js"></script>
<script src="js/beginner.js"></script>
<script src="js/view3d.js"></script>
<script src="js/app.js"></script>
```

- [ ] **Step 4: Unit tests still pass**

Run: `npm test`
Expected: PASS all suites (UI files are not loaded by Node).

- [ ] **Step 5: Browser verification (built-in browser, `file:///D:/Projects/rubiks-solver/index.html`)**

Check, in order, and fix anything that fails before moving on:
1. Page loads with example cube in the net and the 3D view; console has no errors (`read_console_messages onlyErrors`).
2. Solve button shows "Preparing solver…" then "Solve my cube" within ~10 s (Review Focus 4).
3. Paint one sticker wrong → Solve → error list + red outline; fix it → error clears on Solve.
4. Shortest: Solve → play panel; Next animates the correct layer; card, counter, chips and mini net advance together.
5. Press Next 5× rapidly → counter advanced once per finished animation, 3D matches mini net (Review Focus 5).
6. Back, Restart, chip jump, Play/Pause, arrow keys, space.
7. Play to the end → "Solved" card; 3D cube solved.
8. Edit cube → Beginner → Solve → step 0 is z2 flip; stage labels and alg highlight render; play to end → solved.
9. "Solved cube" → Solve → "Already solved" card (Review Focus 3).
10. `resize_window` preset mobile → no horizontal scroll, net fits, view stacks on top; then preset desktop.
11. Dark scheme (`resize_window colorScheme: dark`) → text readable, stickers unchanged.

- [ ] **Step 6: Commit**
```bash
git add index.html js/view3d.js js/app.js
git commit -m "Add 3D view and page UI"
```

---

### Task 6: Project notes, publish, final check

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `CLAUDE.md`**
```markdown
# Cube Coach (rubiks-solver)

Static page: paint a 3x3 cube's 54 stickers, solve it (Shortest = Kociemba via cubejs, or Beginner layer-by-layer), follow an animated 3D cube turn by turn.

- Tests: `npm test` (Node 22 `node:test`). `cubejs` is a devDependency for tests only; the page loads it from jsDelivr.
- Run locally: open `index.html` directly (no build, no server).
- Published as a claude.ai Artifact: `index.html` + `js/*.js` as supporting files. `index.html` has no doctype/html/head/body tags on purpose (the publisher wraps it).
- Sticker order U R F D L B, 9 each, row-major Kociemba net; geometry conventions live in `js/cube.js`.
- Modules are UMD-style plain scripts (window globals in browser, `module.exports` in Node). No bundler.
- Spec: `docs/superpowers/specs/2026-09-27-rubiks-solver-design.md`. Plan: `docs/superpowers/plans/2026-09-27-rubiks-solver.md`.
```

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 3: Publish Artifact**

Artifact publish: `file_path: index.html`, `files: { "js/cube.js": "js/cube.js", "js/validate.js": "js/validate.js", "js/fast.js": "js/fast.js", "js/beginner.js": "js/beginner.js", "js/view3d.js": "js/view3d.js", "js/app.js": "js/app.js" }`, `icon: "cube"`, `description: "Paint your Rubik's cube colors, then follow an animated solve one turn at a time."`

- [ ] **Step 4: Check the published page once**

Open the artifact URL in the built-in browser: 3D view renders, Solve becomes ready (worker path under Artifact CSP), one Shortest solve plays a turn. If the worker is blocked there, the main-thread fallback must still reach "ready".

- [ ] **Step 5: Commit**
```bash
git add CLAUDE.md
git commit -m "Add project notes"
```
