const test = require('node:test');
const assert = require('node:assert/strict');
const Cube = require('../vendor/cubejs/cube.js');
require('../vendor/cubejs/solve.js');
const M = require('../js/cube.js');
const { validate } = require('../js/validate.js');
const Fast = require('../js/fast.js');
const P = require('../js/patterns.js');
const { seededRng } = require('./helpers.js');

const byIdentity = s => s.map(c => 'URFDLB'[M.COLORS.indexOf(c)]).join('');
const entry = name => P.entries().find(e => e.name === name);
const faceIdx = f => [...Array(9).keys()].map(k => M.FACES.indexOf(f) * 9 + k);
let solverReady = false;
const route = (from, picture) => {
  if (!solverReady) { Cube.initSolver(); solverReady = true; }
  const plan = P.planRoute(from, picture);
  const moves = Fast.solveWith(Cube, plan.input).map(st => st.move);
  return { plan, moves };
};

test('library: 109 named patterns, every one valid, unsolved and distinct', () => {
  const all = P.entries();
  assert.equal(all.length, 109);
  assert.equal(new Set(all.map(e => e.name.toLowerCase())).size, 109, 'names unique');
  assert.equal(new Set(all.map(e => e.key)).size, 109, 'states unique, even allowing for how the cube is held');
  for (const e of all) {
    assert.ok(validate(e.state).ok, e.name);
    assert.ok(!M.isSolved(e.state), e.name);
    assert.equal(byIdentity(e.state), new Cube().move(e.moves.join(' ')).asString(), `${e.name} matches cubejs`);
  }
  const moved = all.filter(e => M.centerKey(e.state) !== M.centerKey(M.SOLVED)).map(e => e.name).sort();
  assert.deepEqual(moved, ["Don't cross line", 'Flower field', 'Perpendicular lines']);
  assert.deepEqual(entry('Tetris').aliases, ['Yan Ying']);
  assert.equal(P.SOURCE.label, 'ruwix.com');
});

test('library spot checks: superflip and the easy checkerboard look right', () => {
  const sf = entry('The Superflip').state;
  M.CORNERS.flat().forEach(i => assert.equal(sf[i], M.SOLVED[i], 'corners solved'));
  M.EDGES.forEach(([a, b]) => { assert.equal(sf[a], M.SOLVED[b]); assert.equal(sf[b], M.SOLVED[a]); });
  const cb = entry('The easy checkerboard').state;
  const OPP = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
  for (const f of M.FACES) {
    const idx = faceIdx(f);
    [0, 2, 4, 6, 8].forEach(k => assert.equal(cb[idx[k]], M.centerColor(M.SOLVED, f), `${f} corners+center`));
    [1, 3, 5, 7].forEach(k => assert.equal(cb[idx[k]], M.centerColor(M.SOLVED, OPP[f]), `${f} edges`));
  }
});

test('homes: every sticker of a solved cube (any hold) is home; stickers moved by an algorithm point back', () => {
  for (const r of M.ROTATIONS) assert.deepEqual(P.homes(M.applyMoves(M.SOLVED, r)), [...Array(54).keys()], r.join(' '));
  const alg = "R U F' L2 D B'";
  const perm = M.sequencePerm(alg);
  const h = P.homes(M.applyMoves(M.SOLVED, alg));
  for (let i = 0; i < 54; i++) assert.equal(h[perm[i]], i);
  assert.equal(P.homes(M.SOLVED.map((c, i) => (i === 0 ? 'y' : c))), null, 'impossible piece → null');
});

test('canonicalKey ignores how the cube is held', () => {
  const s = entry('Cube in the cube').state;
  const keys = new Set(M.ROTATIONS.map(r => P.canonicalKey(M.applyMoves(s, r))));
  assert.equal(keys.size, 1);
  assert.equal(P.findByKey(P.canonicalKey(M.applyMoves(s, 'y2'))).name, 'Cube in the cube');
});

test('routes from scrambled cubes, held any way, land exactly on the pattern', () => {
  const rng = seededRng(21);
  const names = ['The Superflip', 'Perpendicular lines', "Don't cross line", 'Flower field', 'Cube in the cube', 'The easy checkerboard'];
  for (let n = 0; n < 5; n++) {
    const hold = M.ROTATIONS[Math.floor(rng() * 24)];
    const from = M.applyMoves(M.applyMoves(M.SOLVED, M.randomScramble(25, rng)), hold);
    for (const name of names) {
      const picture = entry(name).state;
      const { plan, moves } = route(from, picture);
      assert.ok(P.checkRoute(from, plan, moves), `${name} from scramble ${n}`);
      assert.ok(moves.length <= 22, `${moves.length} turns`);
      assert.equal(plan.relabeled, false);
      assert.equal(P.canonicalKey(plan.target), P.canonicalKey(picture));
    }
  }
});

test('routes pattern to pattern, and an empty route when already there', () => {
  const from = entry('The Superflip').state;
  const { plan, moves } = route(from, entry('Cube in the cube').state);
  assert.ok(P.checkRoute(from, plan, moves));
  const same = route(from, from);
  assert.ok(M.isSolved(same.plan.input));
  assert.deepEqual(same.moves, []);
});

test('routes a cube with a mirror color scheme by repainting the target', () => {
  const swap = c => (c === 'r' ? 'o' : c === 'o' ? 'r' : c);
  const from = M.applyMoves(M.SOLVED, "R U F' D2 L").map(swap);
  const { plan, moves } = route(from, entry('Cube in the cube').state);
  assert.equal(plan.relabeled, true);
  assert.ok(P.checkRoute(from, plan, moves));
});

test('every library pattern can be reached from solved in at most 22 turns', () => {
  for (const e of P.entries()) {
    const { plan, moves } = route(M.SOLVED, e.state);
    assert.ok(P.checkRoute(M.SOLVED, plan, moves) && moves.length <= 22, e.name);
  }
});

test('patternSteps: labels, start note, center notes and states', () => {
  const e = entry('Perpendicular lines');
  const { states, steps } = P.patternSteps({ name: e.name, start: M.SOLVED, moves: e.moves, kind: 'solved' });
  assert.equal(steps.length, e.moves.length);
  assert.deepEqual(states[states.length - 1], e.state);
  assert.match(steps[0].note, /Start from a solved cube, white on top, green facing you/);
  const slice = steps.find(st => st.move === 'M2');
  assert.match(slice.note, /After this move, .* is on top/);
  steps.forEach((st, k) => {
    assert.equal(st.alg.split(' ')[st.algPos], st.move);
    assert.equal(st.algLen, e.moves.length);
    assert.equal(st.stageName, e.name);
    assert.equal(st.algPos, k);
  });
  const r = P.patternSteps({ name: e.name, start: M.SOLVED, moves: ['R'], kind: 'route' });
  assert.equal(r.steps[0].algName, 'Route to Perpendicular lines');
  assert.equal(r.steps[0].note, '');
});

test('search matches names and aliases', () => {
  const hits = q => P.entries().filter(e => P.matches(e, q)).map(e => e.name);
  assert.ok(hits('plus').includes('Plus minus'));
  assert.ok(hits('plus').includes('4 plus 2 dots'));
  assert.ok(hits('PLUS').includes('Plus'));
  assert.deepEqual(hits('yan ying'), ['Tetris'], 'found through its alias');
  assert.equal(hits('').length, 109);
  const cubeIn = hits('cube in');
  ['Cube in the cube', 'Cube in a cube in a cube', "Ron's cube in a cube"].forEach(n => assert.ok(cubeIn.includes(n), n));
  assert.ok(!cubeIn.includes('Flower'), 'every word must match');
});

test('fromAlgorithm previews custom sequences and passes errors through', () => {
  const ok = P.fromAlgorithm("(R2 U2)3");
  assert.deepEqual(ok.state, M.applyMoves(M.SOLVED, 'R2 U2 R2 U2 R2 U2'));
  assert.match(P.fromAlgorithm('R Q').error, /Unknown move 'Q'/);
});

test('thumbnail shows the top, front and right faces the right way round', () => {
  const svg = P.thumbnailSvg(M.SOLVED);
  const quads = [...svg.matchAll(/data-i="(\d+)" class="s-(\w)" points="([^"]+)"/g)].map(m => {
    const pts = m[3].trim().split(' ').map(p => p.split(',').map(Number));
    return { i: Number(m[1]), color: m[2], x: pts.reduce((a, p) => a + p[0], 0) / 4, y: pts.reduce((a, p) => a + p[1], 0) / 4 };
  });
  assert.equal(quads.length, 27);
  const q = i => quads.find(t => t.i === i);
  quads.forEach(t => assert.equal(t.color, M.SOLVED[t.i]));
  assert.ok(q(faceIdx('U')[1]).y < q(faceIdx('U')[7]).y, 'top face: back row drawn above front row');
  assert.ok(q(faceIdx('F')[3]).x < q(faceIdx('F')[5]).x, 'front face: left column drawn left');
  assert.ok(q(faceIdx('R')[3]).x < q(faceIdx('R')[5]).x, 'right face: front column drawn left');
  assert.ok(q(faceIdx('F')[1]).y < q(faceIdx('F')[7]).y, 'front face: top row drawn above');
});
