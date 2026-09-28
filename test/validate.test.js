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
