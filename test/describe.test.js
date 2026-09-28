const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const D = require('../js/describe.js');
const { seededRng } = require('./helpers.js');

const sorted = a => a.slice().sort((p, q) => p - q);

test('every turn description matches where the stickers really go', () => {
  for (const [face, t] of Object.entries(D.TURNS)) {
    const from = D.region(...t.from);
    const landed = move => sorted(from.map(i => M.PERMS[move][i]));
    assert.deepEqual(landed(face), sorted(D.region(...t.cw)), `${face}: ${t.words[0]}`);
    assert.deepEqual(landed(face + "'"), sorted(D.region(...t.ccw)), `${face}': ${t.words[1]}`);
  }
});

test('describeMove wording', () => {
  assert.deepEqual(D.describeMove('U'), {
    title: 'Top face, clockwise',
    detail: 'Quarter turn clockwise, as if you were looking straight at the top face: the front row slides to the left.',
  });
  assert.match(D.describeMove("R'").title, /^Right face, counter-clockwise$/);
  assert.match(D.describeMove("R'").detail, /the front column goes down/);
  assert.equal(D.describeMove('B2').title, 'Back face, half turn');
  assert.equal(D.describeMove('z2').title, 'Flip the whole cube');
  for (const m of M.MOVES.filter(x => 'URFDLB'.includes(x[0]))) assert.ok(D.describeMove(m).detail.length > 20, m);
});

test('each face-reading hold shows that face in the net orientation', () => {
  const s = M.applyMoves(M.SOLVED, M.randomScramble(25, seededRng(5)));
  for (const [face, r] of Object.entries(D.READING)) {
    const seen = r.rotation ? M.applyMoves(s, r.rotation) : s;
    const fi = M.FACES.indexOf(face);
    assert.deepEqual(seen.slice(18, 27), s.slice(fi * 9, fi * 9 + 9), `${face}: rotate "${r.rotation}" then look at the front`);
  }
});

test('each face-reading neighbor claim is geometrically true', () => {
  for (const [face, r] of Object.entries(D.READING)) {
    const edge = D.region(face, r.side[0], r.side[1]);
    for (const i of edge) {
      const pos = M.FACELETS[i].pos.join();
      assert.ok(M.FACELETS.some(f => f.face === r.neighbor && f.pos.join() === pos), `${face} ${r.side} touches ${r.neighbor}`);
    }
  }
});

test('faceHint names the colors and where the neighbor is', () => {
  const hint = D.faceHint('R', M.SOLVED);
  assert.match(hint, /white on top/);
  assert.match(hint, /red faces you/);
  assert.match(hint, /Green is on your left\./);
  assert.match(D.faceHint('U', M.SOLVED), /Green is along the bottom edge\./);
  assert.match(D.faceHint('D', M.SOLVED), /Green is along the top edge\./);
});
