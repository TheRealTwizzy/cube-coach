// Synthetic "photos" of one cube face for the vision tests: a black sticker face placed by a
// homography on a background, with pixel noise, an optional glare spot and optional blur.
const { seededRng } = require('./helpers.js');
const V = require('../js/vision.js');

const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Realistic sticker colors for a mini cube, and a lighting change per photo.
const SHADES = { w: [228, 228, 222], y: [236, 206, 38], g: [30, 160, 78], b: [28, 78, 185], r: [196, 32, 44], o: [238, 112, 32] };
const light = (rgb, exposure, warm) => [rgb[0] * exposure * (1 + warm), rgb[1] * exposure, rgb[2] * exposure * (1 - warm)].map(v => Math.max(0, Math.min(255, v)));

function renderFace(opts) {
  const { width = 400, height = 300, corners, stickers, seed = 1, background = 'busy', noise = 8, glare = null, gap = 0.1, blur = 0 } = opts;
  const rng = seededRng(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  const rects = background === 'busy'
    ? Array.from({ length: 14 }, () => ({ x: rng() * width, y: rng() * height, w: 15 + rng() * 110, h: 15 + rng() * 80, c: [rng() * 255, rng() * 255, rng() * 255] }))
    : [];
  const toFace = V.homographyMatrix(corners, UNIT);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c;
      const [u, v] = V.applyH(toFace, x + 0.5, y + 0.5);
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const cu = u * 3, cv = v * 3, i = Math.min(2, Math.floor(cu)), j = Math.min(2, Math.floor(cv));
        const fu = cu - i, fv = cv - j, cell = j * 3 + i;
        const inSticker = fu > gap && fu < 1 - gap && fv > gap && fv < 1 - gap;
        c = inSticker ? stickers[cell] : [16, 16, 18];
        if (inSticker && glare && glare.cell === cell && Math.hypot(fu - 0.45, fv - 0.4) < glare.r) c = [255, 255, 255];
      } else if (background === 'dark') {
        c = [30, 30, 34];
      } else if (background === 'plain') {
        c = [200, 196, 188];
      } else {
        c = [150 + 60 * (x / width), 140 + 50 * (y / height), 120];
        for (const r of rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) c = r.c;
      }
      const k = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[k + ch] = c[ch] + (rng() * 2 - 1) * noise;
      data[k + 3] = 255;
    }
  }
  const img = { width, height, data };
  return blur ? boxBlur(img, blur) : img;
}

function boxBlur(img, r) {
  const { width: w, height: h, data } = img, out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0];
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy)), k = (yy * w + xx) * 4;
          sum[0] += data[k]; sum[1] += data[k + 1]; sum[2] += data[k + 2]; n++;
        }
      }
      const k = (y * w + x) * 4;
      out[k] = sum[0] / n; out[k + 1] = sum[1] / n; out[k + 2] = sum[2] / n; out[k + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// A face of side `size` centered at (cx, cy), rotated by `angle` radians, with each corner nudged
// by up to `skew` (fraction of size) for perspective.
function placeFace({ cx, cy, size, angle = 0, skew = 0, rng }) {
  const half = size / 2, cos = Math.cos(angle), sin = Math.sin(angle);
  return [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => [
    cx + x * cos - y * sin + (rng ? (rng() * 2 - 1) * skew * size : 0),
    cy + x * sin + y * cos + (rng ? (rng() * 2 - 1) * skew * size : 0),
  ]);
}

module.exports = { SHADES, light, renderFace, boxBlur, placeFace };
