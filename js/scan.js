// A cube scan: six photos, one per face, taken in a fixed order with the same holds as the
// painting hints. Collects each face's 9 color samples and turns them into a cube state.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = isNode
    ? factory(require('./cube.js'), require('./describe.js'), require('./vision.js'))
    : factory(root.CubeModel, root.CubeDescribe, root.CubeVision);
  if (isNode) module.exports = api;
  else root.CubeScan = api;
})(typeof self !== 'undefined' ? self : this, function (M, D, V) {
  'use strict';

  const ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];

  function createScan() {
    const faces = {};
    const photoNo = face => ORDER.indexOf(face) + 1;
    return {
      faces,
      step() {
        const index = ORDER.findIndex(f => !faces[f]);
        if (index < 0) return null;
        const face = ORDER[index];
        return { index, face, total: ORDER.length, instruction: D.faceHint(face, M.SOLVED) };
      },
      setFace(face, samples) { faces[face] = samples; },
      redo(face) { delete faces[face]; },
      done: () => ORDER.every(f => faces[f]),
      // The center shows which face is in the photo; it must be the face this step asked for.
      // live: worded for the camera view rather than a photo already taken.
      checkCenter(face, samples, { live = false } = {}) {
        const seen = V.colorLetter(samples[4].lab), wanted = M.centerColor(M.SOLVED, face);
        if (seen === wanted) return null;
        return `${live ? 'The center' : `Photo ${photoNo(face)}'s center`} looks ${D.NAMES[seen]}, but this step needs the ${D.NAMES[wanted]} face.`;
      },
      result() {
        const { colors, uncertain } = V.classify(faces);
        return { state: colors, uncertain };
      },
    };
  }

  // Live camera: capture once the grid has been found in about the same place for `needed` frames
  // in a row with the center matching the face asked for. Any fallback detection, wrong center or
  // movement of more than `tolerance` (fraction of the face size) starts the count again.
  function createSteadiness({ needed = 6, tolerance = 0.06 } = {}) {
    let last = null, count = 0;
    return {
      push(found, centerOk) {
        if (!found || found.method !== 'grid' || !centerOk) { last = null; count = 0; return false; }
        const [a, b] = found.corners;
        const size = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const moved = last ? Math.max(...found.corners.map((p, k) => Math.hypot(p[0] - last[k][0], p[1] - last[k][1]))) / size : Infinity;
        count = moved <= tolerance ? count + 1 : 1;
        last = found.corners.map(p => p.slice());
        return count >= needed;
      },
      reset() { last = null; count = 0; },
      progress: () => Math.min(1, count / needed),
    };
  }

  return { ORDER, createScan, createSteadiness };
});
