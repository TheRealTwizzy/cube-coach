const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const V = require('../js/vision.js');
const Scan = require('../js/scan.js');
const { SHADES, light } = require('./imagegen.js');
const { seededRng } = require('./helpers.js');

// Samples for one face of `state`, as sampleFace would return them under some lighting.
function samplesOf(state, face, rng) {
  const fi = M.FACES.indexOf(face), exposure = 0.75 + rng() * 0.35;
  return [...Array(9).keys()].map(k => {
    const rgb = light(SHADES[state[fi * 9 + k]], exposure, rng() * 0.08);
    return { rgb, lab: V.rgbToLab(rgb) };
  });
}

test('colorLetter names a sample with the nearest standard color', () => {
  assert.equal(V.colorLetter(V.rgbToLab(SHADES.o)), 'o');
  assert.equal(V.colorLetter(V.rgbToLab(SHADES.w)), 'w');
});

test('photos go front, right, back, left, top, bottom with hold instructions', () => {
  const s = Scan.createScan();
  assert.deepEqual(Scan.ORDER, ['F', 'R', 'B', 'L', 'U', 'D']);
  const first = s.step();
  assert.equal(first.index, 0);
  assert.equal(first.face, 'F');
  assert.equal(first.total, 6);
  assert.match(first.instruction, /white on top with green facing you/);
  const rng = seededRng(1);
  s.setFace('F', samplesOf(M.SOLVED, 'F', rng));
  assert.equal(s.step().face, 'R');
  assert.match(s.step().instruction, /red faces you/);
});

test('redo sends the next step back to that face', () => {
  const rng = seededRng(2), s = Scan.createScan();
  ['F', 'R', 'B'].forEach(f => s.setFace(f, samplesOf(M.SOLVED, f, rng)));
  s.redo('R');
  assert.equal(s.step().face, 'R');
  assert.equal(s.done(), false);
});

test("each photo's center is checked against the face asked for", () => {
  const rng = seededRng(3), s = Scan.createScan();
  let wrongCalls = 0;
  for (let n = 0; n < 50; n++) {
    for (const f of Scan.ORDER) {
      const fi = M.FACES.indexOf(f), exposure = 0.55 + rng() * 0.7, tint = (rng() * 2 - 1) * 0.15;
      const samples = [...Array(9).keys()].map(() => {
        const rgb = light(SHADES[M.SOLVED[fi * 9 + 4]], exposure, tint);
        return { rgb, lab: V.rgbToLab(rgb) };
      });
      if (s.checkCenter(f, samples)) wrongCalls++;
    }
  }
  assert.equal(wrongCalls, 0, 'correct faces are never rejected');
  const orange = samplesOf(M.SOLVED, 'L', rng);
  assert.equal(s.checkCenter('R', orange), "Photo 2's center looks orange, but this step needs the red face.");
});

test('six photos give back the scrambled cube', () => {
  const rng = seededRng(4);
  for (let n = 0; n < 10; n++) {
    const state = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    const s = Scan.createScan();
    Scan.ORDER.forEach(f => s.setFace(f, samplesOf(state, f, rng)));
    assert.equal(s.done(), true);
    assert.equal(s.step(), null);
    assert.deepEqual(s.result().state, state);
  }
});

test('turning the cube as each instruction says and photographing the front rebuilds the cube', () => {
  const D = require('../js/describe.js');
  const rng = seededRng(5);
  for (let n = 0; n < 10; n++) {
    const state = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    const s = Scan.createScan();
    for (const face of Scan.ORDER) {
      const r = D.READING[face].rotation;
      const view = r ? M.applyMoves(state, r) : state; // the cube as held for this photo
      const photo = view.slice(18, 27); // what faces the camera, row by row as seen
      s.setFace(face, photo.map(c => { const rgb = light(SHADES[c], 0.8 + rng() * 0.3, 0); return { rgb, lab: V.rgbToLab(rgb) }; }));
    }
    assert.deepEqual(s.result().state, state, `scramble ${n}`);
  }
});

// A detection as findFace returns it: a square of side `size` at (x, y).
const det = (x, y, size = 100, method = 'grid') => ({ method, corners: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]] });

test('live capture waits for a steady grid with the right center', () => {
  const st = Scan.createSteadiness({ needed: 4, tolerance: 0.05 });
  assert.equal(st.push(det(10, 10), true), false);
  assert.equal(st.push(det(12, 11), true), false);
  assert.equal(st.push(det(11, 12), true), false);
  assert.equal(st.progress(), 0.75);
  assert.equal(st.push(det(12, 12), true), true, 'fourth steady frame captures');
});

test('moving, a fallback detection or the wrong face starts the count again', () => {
  const st = Scan.createSteadiness({ needed: 3, tolerance: 0.05 });
  st.push(det(10, 10), true);
  st.push(det(10, 10), true);
  assert.equal(st.push(det(30, 10), true), false, 'moved 20% of the face');
  assert.equal(st.progress(), 1 / 3);
  st.push(det(30, 10), true);
  assert.equal(st.push(det(30, 10, 100, 'body'), true), false);
  assert.equal(st.progress(), 0);
  st.push(det(30, 10), true);
  assert.equal(st.push(det(30, 10), false), false, 'center does not match the face asked for');
  assert.equal(st.progress(), 0);
  st.push(det(30, 10), true);
  st.reset();
  assert.equal(st.progress(), 0);
});
