const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const V = require('../js/vision.js');
const { SHADES, light, renderFace, boxBlur, placeFace } = require('./imagegen.js');
const { seededRng } = require('./helpers.js');

const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cornerError = (found, truth, size) => Math.max(...found.map((p, k) => Math.hypot(p[0] - truth[k][0], p[1] - truth[k][1]))) / size;

test('rgbToLab matches reference values', () => {
  const white = V.rgbToLab([255, 255, 255]);
  assert.ok(Math.abs(white[0] - 100) < 0.5 && Math.abs(white[1]) < 0.5 && Math.abs(white[2]) < 0.5);
  const red = V.rgbToLab([255, 0, 0]);
  assert.ok(dE(red, [53.24, 80.09, 67.2]) < 0.6, red.join());
});

test('homography maps the unit square onto the corners', () => {
  const corners = [[10, 20], [110, 30], [120, 140], [5, 130]];
  const H = V.homography(corners);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], k) => {
    const [x, y] = H(u, v);
    assert.ok(Math.hypot(x - corners[k][0], y - corners[k][1]) < 1e-6);
  });
});

test('findFace locates the face in busy, tilted, noisy photos (at least 18 of 20)', () => {
  const rng = seededRng(33);
  let ok = 0;
  const misses = [];
  for (let n = 0; n < 20; n++) {
    const size = 110 + rng() * 110;
    const truth = placeFace({ cx: 200 + (rng() - 0.5) * 60, cy: 150 + (rng() - 0.5) * 40, size, angle: (rng() - 0.5) * 0.5, skew: 0.04, rng });
    const colors = Array.from({ length: 9 }, () => SHADES['wygbro'[Math.floor(rng() * 6)]]);
    const img = renderFace({ corners: truth, stickers: colors.map(c => light(c, 0.8 + rng() * 0.3, rng() * 0.08)), seed: n + 1,
      glare: n % 2 ? { cell: Math.floor(rng() * 9), r: 0.12 } : null });
    const found = V.findFace(img);
    const err = cornerError(found.corners, truth, size);
    if (found.method === 'grid' && err < 0.04) ok++;
    else misses.push(`${n}: ${found.method} err ${err.toFixed(3)}`);
  }
  assert.ok(ok >= 18, `found ${ok}/20; misses ${misses.join('; ')}`);
});

test('findFace falls back to the black body when stickers are hard to see', () => {
  const truth = placeFace({ cx: 200, cy: 150, size: 180 });
  const colors = ['w', 'g', 'b', 'r', 'y', 'o', 'w', 'g', 'b'].map(c => SHADES[c]);
  [1, 4, 7].forEach(k => { colors[k] = [48, 46, 50]; }); // three stickers lost in shadow
  const found = V.findFace(renderFace({ corners: truth, stickers: colors, background: 'plain', seed: 3 }));
  assert.equal(found.method, 'body');
  assert.ok(cornerError(found.corners, truth, 180) < 0.05);
});

test('findFace with nothing to find returns a centered starting square', () => {
  const img = renderFace({ corners: [[-10, -10], [-5, -10], [-5, -5], [-10, -5]], stickers: Array(9).fill([0, 0, 0]), background: 'plain' });
  const found = V.findFace(img);
  assert.equal(found.method, 'none');
  assert.equal(found.confidence, 0);
});

test('sampleFace reads the drawn colors, ignoring gaps and a glare spot', () => {
  const truth = placeFace({ cx: 200, cy: 150, size: 200, angle: 0.2 });
  const colors = ['w', 'y', 'g', 'b', 'r', 'o', 'y', 'g', 'b'].map(c => SHADES[c]);
  const img = renderFace({ corners: truth, stickers: colors, glare: { cell: 4, r: 0.15 }, seed: 9 });
  const samples = V.sampleFace(img, truth);
  samples.forEach((s, k) => assert.ok(dE(s.lab, V.rgbToLab(colors[k])) < 6, `cell ${k}`));
});

// Six faces of a scrambled cube as the camera would see them, each photo with its own lighting.
function scannedFaces(state, rng) {
  const faces = {};
  const RGB = { w: SHADES.w, y: SHADES.y, g: SHADES.g, b: SHADES.b, r: SHADES.r, o: SHADES.o };
  M.FACES.forEach((f, fi) => {
    const exposure = 0.72 + rng() * 0.4, warm = rng() * 0.1;
    faces[f] = [...Array(9).keys()].map(k => {
      const rgb = light(RGB[state[fi * 9 + k]], exposure, warm).map(v => v + (rng() * 2 - 1) * 6);
      return { rgb, lab: V.rgbToLab(rgb) };
    });
  });
  return faces;
}

test('classify reads a whole scrambled cube under six different lightings', () => {
  const rng = seededRng(44);
  for (let n = 0; n < 25; n++) {
    const state = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    const { colors } = V.classify(scannedFaces(state, rng));
    assert.deepEqual(colors, state, `scramble ${n}`);
  }
});

test('classify always gives exactly 9 of each color and flags close calls', () => {
  const rng = seededRng(45);
  const state = M.applyMoves(M.SOLVED, "R U F' L2 D B'");
  const faces = scannedFaces(state, rng);
  const target = M.FACES.map((f, fi) => [f, fi]).find(([, fi]) => state[fi * 9] === 'r' || state[fi * 9] === 'o');
  const mid = V.rgbToLab([218, 72, 38]); // halfway between red and orange
  faces[target[0]][0] = { rgb: [218, 72, 38], lab: mid };
  const { colors, uncertain } = V.classify(faces);
  const counts = {};
  colors.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
  assert.deepEqual(Object.values(counts), [9, 9, 9, 9, 9, 9]);
  assert.ok(uncertain.includes(target[1] * 9), 'the in-between sticker is flagged');
});

test('quality flags dark and blurry photos', () => {
  const truth = placeFace({ cx: 200, cy: 150, size: 180 });
  const colors = ['w', 'y', 'g', 'b', 'r', 'o', 'y', 'g', 'b'].map(c => SHADES[c]);
  const sharp = renderFace({ corners: truth, stickers: colors, seed: 5, noise: 3 });
  assert.deepEqual(V.quality(sharp), { dark: false, blurry: false });
  const dark = { width: sharp.width, height: sharp.height, data: sharp.data.map((v, i) => (i % 4 === 3 ? v : v * 0.12)) };
  assert.equal(V.quality(dark).dark, true);
  assert.equal(V.quality(boxBlur(sharp, 5)).blurry, true);
});
