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
  assert.equal(M.MOVES.length, 54);
  for (const b of ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'u', 'r', 'f', 'd', 'l', 'b', 'x', 'y', 'z']) {
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

// --- slice, wide and rotation moves ---
const Cube = require('../vendor/cubejs/cube.js');
const SCR = M.applyMoves(M.SOLVED, "R U F' L2 D B' U2 R'");
const byIdentity = s => s.map(c => 'URFDLB'[M.COLORS.indexOf(c)]).join('');

test('slice and wide moves match their standard definitions', () => {
  const same = (a, b) => assert.deepEqual(M.applyMoves(SCR, a), M.applyMoves(SCR, b), `${a} = ${b}`);
  same('M', "x' R L'");
  same('E', "y' U D'");
  same('S', "z F' B");
  same('r', "R M'");
  same('l', 'L M');
  same('u', "U E'");
  same('d', 'D E');
  same('f', 'F S');
  same('b', "B S'");
});

test('slices, wide moves and rotations move 4 centers; face turns move none', () => {
  const movedCenters = m => [4, 13, 22, 31, 40, 49].filter(i => M.applyMove(M.SOLVED, m)[i] !== M.SOLVED[i]).length;
  for (const m of 'URFDLB') assert.equal(movedCenters(m), 0, m);
  for (const m of 'MESurfdlbxyz') assert.equal(movedCenters(m), 4, m);
});

test('animation geometry lands every sticker where the permutation sends it (all 54 moves)', () => {
  const rot = (v, a, t) => {
    const c = Math.cos(t), s = Math.sin(t), d = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    const x = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
    return v.map((vi, k) => Math.round(vi * c + x[k] * s + a[k] * d * (1 - c)));
  };
  const key = (p, n) => p.join() + '|' + n.join();
  const at = new Map(M.FACELETS.map(f => [key(f.pos, f.normal), f.index]));
  for (const m of M.MOVES) {
    const g = M.moveGeometry(m);
    for (const f of M.FACELETS) {
      const to = g.inLayer(f.pos) ? at.get(key(rot(f.pos, g.axis, g.angle), rot(f.normal, g.axis, g.angle))) : f.index;
      assert.equal(M.PERMS[m][f.index], to, `${m} sticker ${f.index}`);
    }
  }
});

test('all moves match cubejs (compared by sticker color, 200 random sequences)', () => {
  const rng = seededRng(12);
  for (let n = 0; n < 200; n++) {
    const seq = Array.from({ length: 20 }, () => M.MOVES[Math.floor(rng() * M.MOVES.length)]);
    assert.equal(byIdentity(M.applyMoves(M.SOLVED, seq)), new Cube().move(seq.join(' ')).asString(), seq.join(' '));
  }
});

test('24 whole-cube rotations; rotationTo finds the one that matches centers', () => {
  assert.equal(M.ROTATIONS.length, 24);
  assert.equal(new Set(M.ROTATIONS.map(r => M.centerKey(M.applyMoves(M.SOLVED, r)))).size, 24);
  assert.deepEqual(M.ROTATIONS[0], []);
  const held = M.applyMoves(SCR, "x y'");
  const r = M.rotationTo(held, M.centerKey(SCR));
  assert.equal(M.centerKey(M.applyMoves(held, r)), M.centerKey(SCR));
  const mirror = M.SOLVED.map(c => (c === 'r' ? 'o' : c === 'o' ? 'r' : c));
  assert.equal(M.rotationTo(mirror, M.centerKey(M.SOLVED)), null);
});

test('parseAlgorithm reads pasted notation', () => {
  const moves = t => M.parseAlgorithm(t).moves;
  assert.deepEqual(moves("R U2' F’ D'2"), ['R', 'U2', "F'", 'D2']);
  assert.deepEqual(moves("RUR'U'"), ['R', 'U', "R'", "U'"]);
  assert.deepEqual(moves("Rw r' Lw2 Uw'"), ['r', "r'", 'l2', "u'"]);
  assert.deepEqual(moves("M E' S2 x2 y' z"), ['M', "E'", 'S2', 'x2', "y'", 'z']);
  assert.equal(moves("(R U R' U')3").length, 12);
  assert.deepEqual(moves('((R U)2 F)2'), ['R', 'U', 'R', 'U', 'F', 'R', 'U', 'R', 'U', 'F']);
  assert.equal(moves("(R U)x2").length, 4);
  assert.equal(moves("(R U)×3").length, 6);
  assert.deepEqual(moves('(R U) x2'), ['R', 'U', 'x2'], 'a spaced x2 is a rotation, not a repeat');
});

test('parseAlgorithm explains bad input', () => {
  const err = t => M.parseAlgorithm(t).error;
  assert.match(err('R U Q'), /Unknown move 'Q' \(move 3\)/);
  assert.match(err('R m'), /Unknown move 'm' \(move 2\)\. Slice moves are written in capitals/);
  assert.match(err('R3'), /Unknown move 'R3'/);
  assert.match(err('[R, U]'), /Brackets/);
  assert.match(err('R (U'), /never closed/);
  assert.match(err('R )'), /without a matching/);
  assert.match(err('(R)5000'), /more than 1000 moves/);
  assert.match(err('   '), /at least one move/);
});

test('parseAlgorithm never hangs on repeated empty groups and explains inverted groups', () => {
  const t0 = Date.now();
  assert.match(M.parseAlgorithm('()99999999999').error, /at least one move/);
  assert.deepEqual(M.parseAlgorithm('R (())99999999').moves, ['R']);
  assert.match(M.parseAlgorithm('(R U)99999999').error, /more than 1000 moves/);
  assert.ok(Date.now() - t0 < 200, `took ${Date.now() - t0} ms`);
  assert.match(M.parseAlgorithm("(R U)'").error, /Inverting a group/);
  assert.match(M.parseAlgorithm("(R U R' U')2'").error, /Inverting a group/);
});
