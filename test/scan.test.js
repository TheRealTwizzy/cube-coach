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

test('a face photographed twice is caught with a retake message', () => {
  const rng = seededRng(3), s = Scan.createScan();
  s.setFace('F', samplesOf(M.SOLVED, 'F', rng));
  s.setFace('R', samplesOf(M.SOLVED, 'R', rng));
  s.setFace('B', samplesOf(M.SOLVED, 'B', rng));
  s.setFace('L', samplesOf(M.SOLVED, 'R', rng)); // red face again instead of orange
  const dup = s.duplicateCenters();
  assert.equal(dup.length, 1);
  assert.equal(dup[0].message, 'Photos 2 and 4 both have a red center. Retake photo 4 showing the orange face.');
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
