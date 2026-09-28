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
