// Reading a cube face from a photo: find the 3x3 sticker grid, sample each sticker's color,
// and sort all 54 samples into the cube's six colors. Works on plain RGBA pixel arrays
// ({ width, height, data }, like ImageData) so it runs in the browser and in Node tests.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.CubeVision = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  // ---------- color ----------
  function rgbToLab(rgb) {
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b] = rgb.map(lin);
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  // Photos differ in exposure and white balance, which move lightness and chroma far more than hue;
  // so hue differences count fully, chroma half and lightness little (keeps red vs orange apart).
  function distance(a, b) {
    const c1 = Math.hypot(a[1], a[2]), c2 = Math.hypot(b[1], b[2]);
    const dH = Math.sqrt(Math.max(0, (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 - (c1 - c2) ** 2));
    return Math.hypot((a[0] - b[0]) * 0.3, (c1 - c2) * 0.5, dH);
  }
  function hsv(data, k) {
    const r = data[k], g = data[k + 1], b = data[k + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return { v: max / 255, s: max ? (max - min) / max : 0 };
  }

  // ---------- geometry ----------
  // 3x3 homography taking the 4 src points onto the 4 dst points.
  function homographyMatrix(src, dst) {
    const A = [];
    src.forEach(([x, y], k) => {
      const [X, Y] = dst[k];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
    });
    for (let c = 0; c < 8; c++) {
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, c) => row[8] / row[c]).concat([1]);
  }
  function applyH(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }
  const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function homography(corners) {
    const H = homographyMatrix(UNIT, corners);
    return (u, v) => applyH(H, u, v);
  }

  // ---------- pixels ----------
  function downscale(img, maxSide) {
    const s = Math.max(img.width, img.height) / maxSide;
    if (s <= 1) return img;
    const w = Math.max(1, Math.round(img.width / s)), h = Math.max(1, Math.round(img.height / s));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * s), y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) * s)));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * s), x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) * s)));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const k = (yy * img.width + xx) * 4;
            r += img.data[k]; g += img.data[k + 1]; b += img.data[k + 2]; n++;
          }
        }
        const k = (y * w + x) * 4;
        out[k] = r / n; out[k + 1] = g / n; out[k + 2] = b / n; out[k + 3] = 255;
      }
    }
    return { width: w, height: h, data: out };
  }
  // 4-connected regions of a mask, with area, centroid and bounding box.
  function components(mask, w, h) {
    const label = new Int32Array(w * h).fill(-1), out = [], stack = [];
    for (let start = 0; start < w * h; start++) {
      if (!mask[start] || label[start] >= 0) continue;
      const blob = { area: 0, sx: 0, sy: 0, minX: w, minY: h, maxX: 0, maxY: 0 };
      label[start] = out.length;
      stack.push(start);
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p - x) / w;
        blob.area++; blob.sx += x; blob.sy += y;
        if (x < blob.minX) blob.minX = x;
        if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y;
        if (y > blob.maxY) blob.maxY = y;
        const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of next) if (q >= 0 && mask[q] && label[q] < 0) { label[q] = out.length; stack.push(q); }
      }
      blob.x = blob.sx / blob.area;
      blob.y = blob.sy / blob.area;
      blob.bw = blob.maxX - blob.minX + 1;
      blob.bh = blob.maxY - blob.minY + 1;
      out.push(blob);
    }
    return out;
  }
  function maskOf(img, test) {
    const mask = new Uint8Array(img.width * img.height);
    for (let p = 0; p < mask.length; p++) mask[p] = test(hsv(img.data, p * 4)) ? 1 : 0;
    return mask;
  }

  // ---------- finding the face ----------
  // Least-squares fit of center c and steps u, v to blobs at lattice positions (i, j).
  function fitLattice(matches) {
    const solve3 = (A, b) => {
      const m = A.map((row, r) => row.concat([b[r]]));
      for (let c = 0; c < 3; c++) {
        let p = c;
        for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
        [m[c], m[p]] = [m[p], m[c]];
        for (let r = 0; r < 3; r++) {
          if (r === c) continue;
          const f = m[r][c] / m[c][c];
          for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
        }
      }
      return m.map((row, c) => row[3] / row[c]);
    };
    const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    const full = Math.max(...matches.map(m => m.blob.area));
    for (const { i, j, blob } of matches) {
      const a = [1, i, j], wt = blob.area / full; // partly hidden stickers have shifted centroids; trust them less
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) AtA[r][c] += wt * a[r] * a[c];
        bx[r] += wt * a[r] * blob.x;
        by[r] += wt * a[r] * blob.y;
      }
    }
    const X = solve3(AtA, bx), Y = solve3(AtA, by);
    const fit = { c: [X[0], Y[0]], u: [X[1], Y[1]], v: [X[2], Y[2]] };
    fit.residual = matches.reduce((s, { i, j, blob }) =>
      s + Math.hypot(fit.c[0] + i * fit.u[0] + j * fit.v[0] - blob.x, fit.c[1] + i * fit.u[1] + j * fit.v[1] - blob.y), 0) / matches.length;
    return fit;
  }
  // Stickers: bright, or clearly colored even in shade. Fill > 0.45 keeps squares tilted up to ~40 degrees.
  const STICKER = p => p.v > 0.4 || (p.v > 0.35 && p.s > 0.3) || (p.v > 0.2 && p.s > 0.55);
  // A glossy reflection is blown out (near 255 and colorless) and can join stickers across the black gaps.
  const STICKER_NO_GLARE = p => STICKER(p) && !(p.v > 0.95 && p.s < 0.1);
  function findGrid(img, sticker) {
    const { width: w, height: h } = img, total = w * h;
    const blobs = components(maskOf(img, sticker), w, h).filter(b =>
      b.area > total * 0.001 && b.area < total * 0.12 && b.area / (b.bw * b.bh) > 0.45 && b.bw / b.bh > 0.5 && b.bw / b.bh < 2);
    let best = null;
    for (const c of blobs) {
      const side = Math.sqrt(c.area);
      const near = blobs.filter(b => b !== c && b.area > c.area * 0.4 && b.area < c.area * 2.5)
        .map(b => ({ b, d: Math.hypot(b.x - c.x, b.y - c.y), dx: b.x - c.x, dy: b.y - c.y }))
        .filter(n => n.d > side * 0.9 && n.d < side * 2.2)
        .sort((p, q) => p.d - q.d);
      if (near.length < 2) continue;
      const a = near[0];
      const bNear = near.find(n => {
        const cos = (n.dx * a.dx + n.dy * a.dy) / (n.d * a.d);
        return Math.abs(cos) < 0.5 && n.d / a.d > 0.7 && n.d / a.d < 1.4;
      });
      if (!bNear) continue;
      let u = [a.dx, a.dy], v = [bNear.dx, bNear.dy];
      if (Math.abs(u[0]) < Math.abs(v[0])) [u, v] = [v, u];
      if (u[0] < 0) u = [-u[0], -u[1]];
      if (v[1] < 0) v = [-v[0], -v[1]];
      const tol = 0.35 * Math.min(Math.hypot(...u), Math.hypot(...v));
      const matches = [];
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const px = c.x + i * u[0] + j * v[0], py = c.y + i * u[1] + j * v[1];
          let hit = null, hd = tol;
          for (const b of blobs) {
            const d = Math.hypot(b.x - px, b.y - py);
            if (d < hd) { hd = d; hit = b; }
          }
          if (hit) matches.push({ i, j, blob: hit });
        }
      }
      if (matches.length < 7) continue;
      const fit = fitLattice(matches);
      const area = Math.abs(fit.u[0] * fit.v[1] - fit.u[1] * fit.v[0]);
      const spread = fit.residual / Math.hypot(...fit.u);
      // Most stickers wins; on a tie prefer the bigger grid (the face in front, not a side seen at an angle).
      if (!best || matches.length > best.count ||
        (matches.length === best.count && (area > best.area * 1.1 || (area > best.area / 1.1 && spread < best.spread)))) {
        best = { count: matches.length, fit, area, spread };
      }
    }
    if (!best) return null;
    const { c, u, v } = best.fit;
    const corner = (i, j) => [c[0] + i * u[0] + j * v[0], c[1] + i * u[1] + j * v[1]];
    return { corners: [corner(-1.5, -1.5), corner(1.5, -1.5), corner(1.5, 1.5), corner(-1.5, 1.5)], confidence: best.count / 9 };
  }
  function findBody(img) {
    const { width: w, height: h } = img, total = w * h;
    const body = components(maskOf(img, p => p.v < 0.22), w, h)
      .filter(b => b.area > total * 0.04 && b.bw * b.bh < total * 0.9 && b.bw / b.bh > 0.6 && b.bw / b.bh < 1.6)
      .sort((p, q) => q.area - p.area)[0];
    if (!body) return null;
    const x0 = body.minX, y0 = body.minY, x1 = body.maxX + 1, y1 = body.maxY + 1;
    return { corners: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], confidence: 0.4 };
  }
  function findFace(img) {
    const small = downscale(img, 320), sx = img.width / small.width, sy = img.height / small.height;
    const scale = r => ({ corners: r.corners.map(([x, y]) => [x * sx, y * sy]), confidence: r.confidence });
    const grid = findGrid(small, STICKER) || findGrid(small, STICKER_NO_GLARE);
    if (grid) return Object.assign(scale(grid), { method: 'grid' });
    const body = findBody(small);
    if (body) return Object.assign(scale(body), { method: 'body' });
    const side = Math.min(img.width, img.height) * 0.6, x0 = (img.width - side) / 2, y0 = (img.height - side) / 2;
    return { corners: [[x0, y0], [x0 + side, y0], [x0 + side, y0 + side], [x0, y0 + side]], method: 'none', confidence: 0 };
  }

  // ---------- sampling ----------
  const median = a => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  function sampleFace(img, corners) {
    const H = homography(corners), out = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const px = [];
        for (let a = 0; a < 5; a++) {
          for (let b = 0; b < 5; b++) {
            const [x, y] = H((c + 0.25 + 0.125 * a) / 3, (r + 0.25 + 0.125 * b) / 3);
            const xi = Math.min(img.width - 1, Math.max(0, Math.round(x))), yi = Math.min(img.height - 1, Math.max(0, Math.round(y)));
            const k = (yi * img.width + xi) * 4;
            px.push({ rgb: [img.data[k], img.data[k + 1], img.data[k + 2]], ...hsv(img.data, k) });
          }
        }
        const matte = px.filter(p => !(p.v > 0.98 && p.s < 0.08));
        const use = matte.length >= 8 ? matte : px;
        const rgb = [0, 1, 2].map(ch => median(use.map(p => p.rgb[ch])));
        out.push({ rgb, lab: rgbToLab(rgb) });
      }
    }
    return out;
  }

  // ---------- sorting colors ----------
  // Minimum-cost perfect matching of rows to columns (square cost matrix).
  function hungarian(cost) {
    const n = cost.length, INF = 1e18;
    const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = INF, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const rowToCol = new Int32Array(n);
    for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
    return rowToCol;
  }
  const LETTERS = ['w', 'y', 'g', 'b', 'r', 'o'];
  // Typical sticker colors (red and orange as real cubes print them, about 23 degrees of hue apart).
  const CANON = { w: [240, 240, 240], y: [240, 210, 40], g: [30, 160, 78], b: [28, 78, 185], r: [196, 32, 44], o: [238, 112, 32] };
  const CANON_LAB = LETTERS.map(l => rgbToLab(CANON[l]));
  // faces: { U: [9 samples], R: …, … } in net orientation → 54 color letters + uncertain indices.
  function classify(faces) {
    const centers = M.FACES.map(f => faces[f][4].lab);
    // Each photo shows the face the user was asked for, so its center names that face's color.
    const centerLetter = M.FACES.map(f => M.centerColor(M.SOLVED, f));
    // Each sticker goes to one of 6 colors x 9 slots; centers are pinned to their own color.
    const samples = [];
    M.FACES.forEach((f, fi) => faces[f].forEach((s, k) => samples.push({ index: fi * 9 + k, lab: s.lab, center: k === 4 ? fi : -1 })));
    const cost = samples.map(s => {
      const row = [];
      for (let ci = 0; ci < 6; ci++) {
        const d = s.center >= 0 ? (s.center === ci ? 0 : 1e6) : distance(s.lab, centers[ci]);
        for (let slot = 0; slot < 9; slot++) row.push(d);
      }
      return row;
    });
    const assign = hungarian(cost);
    const colors = new Array(54), uncertain = [];
    samples.forEach((s, r) => {
      const ci = Math.floor(assign[r] / 9);
      colors[s.index] = centerLetter[ci];
      if (s.center >= 0) return;
      const ds = centers.map(c => distance(s.lab, c));
      const order = ds.map((d, i) => i).sort((p, q) => ds[p] - ds[q]);
      if (order[0] !== ci || ds[order[1]] - ds[order[0]] < 8) uncertain.push(s.index);
    });
    return { colors, uncertain };
  }

  // ---------- photo quality ----------
  function quality(img) {
    const small = downscale(img, 200), { width: w, height: h, data } = small;
    let sumV = 0;
    const gray = new Float32Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const k = p * 4;
      sumV += Math.max(data[k], data[k + 1], data[k + 2]) / 255;
      gray[p] = 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
    }
    let n = 0, mean = 0, sq = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const lap = 4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - w] - gray[p + w];
        n++; mean += lap; sq += lap * lap;
      }
    }
    mean /= n;
    const lapVar = sq / n - mean * mean;
    return { dark: sumV / (w * h) < 0.18, blurry: lapVar < BLUR_LIMIT };
  }
  // Sharp synthetic faces score 850+, heavily blurred ones under 40; used only as a gentle hint.
  const BLUR_LIMIT = 60;

  // The standard color a sample looks most like, robust to exposure and white balance: nearly
  // colorless and light means white (dark colorless is a color in shade); otherwise the nearest hue.
  const hueOf = lab => Math.atan2(lab[2], lab[1]);
  function colorLetter(lab) {
    const chroma = Math.hypot(lab[1], lab[2]);
    if (chroma < 32 && chroma < 0.6 * lab[0]) return 'w';
    let best = null, bestGap = Infinity;
    LETTERS.forEach((l, i) => {
      if (l === 'w') return;
      const d = Math.abs(hueOf(lab) - hueOf(CANON_LAB[i]));
      const gap = Math.min(d, 2 * Math.PI - d);
      if (gap < bestGap) { bestGap = gap; best = l; }
    });
    return best;
  }

  return { rgbToLab, homographyMatrix, applyH, homography, downscale, findFace, sampleFace, classify, quality, colorLetter, distance };
});
