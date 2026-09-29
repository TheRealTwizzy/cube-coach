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

test('every one of the 54 moves has wording', () => {
  for (const m of M.MOVES) {
    const d = D.describeMove(m);
    assert.ok(d.title && d.detail.length > 20, m);
    assert.doesNotMatch(d.title + d.detail, /undefined/, m);
  }
  assert.match(D.describeMove('M').detail, /centers move too/);
  assert.match(D.describeMove("x'").title, /whole cube/i);
});

test('the turn claims cover slices, wide moves and rotations', () => {
  for (const m of 'MESurfdlbxyz') assert.ok(D.TURNS[m], m);
});

test('centerChange tells the new hold when centers move', () => {
  assert.equal(D.centerChange(M.SOLVED, M.applyMove(M.SOLVED, 'R')), '');
  assert.match(D.centerChange(M.SOLVED, M.applyMove(M.SOLVED, 'M2')), /yellow is on top and blue faces you/);
});

test('pictureHint says how to hold the cube to match the picture', () => {
  assert.equal(D.pictureHint(M.SOLVED, M.SOLVED), '');
  assert.match(D.pictureHint(M.applyMove(M.SOLVED, 'z2'), M.SOLVED), /Hold white on top and green facing you/);
});

test('"as seen from the … face" matches each move\'s real turning axis', () => {
  const faceOfWord = Object.fromEntries(Object.entries(D.FACE_WORD).map(([f, w]) => [w.toLowerCase(), f]));
  for (const base of Object.keys(D.TURNS)) {
    const face = faceOfWord[D.lookAt(base)];
    assert.deepEqual(M.NORMALS[face], M.moveGeometry(base).axis, base);
  }
});

test('nextFaceHint says which face to show and how it sits next to the one facing the camera', () => {
  assert.equal(D.nextFaceHint(null, 'F', 'U'), 'Hold the cube with green toward the camera and white on top.');
  assert.equal(D.nextFaceHint(null, 'U', 'B'), 'Hold the cube with white toward the camera and blue on top.');
  assert.equal(D.nextFaceHint('F', 'R'), 'Red is next to green: give the cube a quarter turn so red faces the camera.');
  assert.equal(D.nextFaceHint('F', 'B'), 'Blue is opposite green: turn the cube over so blue faces the camera.');
  assert.equal(D.nextFaceHint('R', 'R'), 'Keep red toward the camera.');
  for (const a of M.FACES) {
    for (const b of M.FACES) {
      if (a === b) continue;
      const dot = M.NORMALS[a].reduce((s, v, k) => s + v * M.NORMALS[b][k], 0);
      const hint = D.nextFaceHint(a, b);
      assert.equal(hint.includes('next to'), dot === 0, `${a} → ${b}`);
      assert.equal(hint.includes('opposite'), dot === -1, `${a} → ${b}`);
      assert.doesNotMatch(hint, /left|right|clockwise/, 'no direction words: the hold is not known for sure');
    }
  }
});
