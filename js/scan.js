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
  const SAME_CENTER = 12; // weighted color distance under which two centers count as the same color

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
      // Two photos whose centers are the same color: the later one shows the wrong face.
      duplicateCenters() {
        const out = [], taken = ORDER.filter(f => faces[f]);
        taken.forEach((a, i) => taken.slice(i + 1).forEach(b => {
          if (V.distance(faces[a][4].lab, faces[b][4].lab) >= SAME_CENTER) return;
          const seen = D.NAMES[V.colorLetter(faces[a][4].lab)], wanted = D.NAMES[M.centerColor(M.SOLVED, b)];
          out.push({ first: a, second: b,
            message: `Photos ${photoNo(a)} and ${photoNo(b)} both have a ${seen} center. Retake photo ${photoNo(b)} showing the ${wanted} face.` });
        }));
        return out;
      },
      result() {
        const { colors, uncertain } = V.classify(faces);
        return { state: colors, uncertain };
      },
    };
  }

  return { ORDER, createScan };
});
