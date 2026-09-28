// Checks that 54 painted sticker colors describe a real cube that can be solved by turning.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.CubeValidate = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const NAMES = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange' };
  const FACE_WORD = { U: 'top', D: 'bottom', F: 'front', B: 'back', L: 'left', R: 'right' };
  const faceOf = i => M.FACELETS[i].face;
  const colorsText = cols => cols.map(c => NAMES[c]).join('-');
  function facesText(slot) {
    const words = slot.map(i => FACE_WORD[faceOf(i)]);
    return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }
  function parity(perm) {
    const seen = new Array(perm.length).fill(false);
    let swaps = 0;
    for (let i = 0; i < perm.length; i++) {
      let j = i, len = 0;
      while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
      if (len) swaps += len - 1;
    }
    return swaps % 2;
  }

  function validate(state) {
    const errors = [];
    const add = (message, cells) => errors.push({ message, cells: cells || [] });
    const done = () => ({ ok: errors.length === 0, errors });

    const unfilled = [];
    state.forEach((c, i) => { if (!NAMES[c]) unfilled.push(i); });
    if (unfilled.length) {
      add(`${unfilled.length} sticker${unfilled.length === 1 ? ' is' : 's are'} not filled in yet.`, unfilled);
      return done();
    }

    const centerIdx = M.FACES.map((f, fi) => fi * 9 + 4);
    const centers = centerIdx.map(i => state[i]);
    if (new Set(centers).size !== 6) {
      add('Two faces have the same center color. Every center must be a different color.',
        centerIdx.filter(i => centers.filter(c => c === state[i]).length > 1));
      return done();
    }

    const counts = {};
    state.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    const off = Object.keys(NAMES).filter(c => counts[c] !== 9);
    if (off.length) {
      add(`Each color must appear exactly 9 times. Found ${off.map(c => `${counts[c] || 0} ${NAMES[c]}`).join(', ')}.`);
      return done();
    }

    const home = i => M.centerColor(state, faceOf(i));

    const edgePerm = [], edgeFlip = [];
    M.EDGES.forEach(slot => {
      const cols = slot.map(i => state[i]);
      let piece = -1, flip = 0;
      M.EDGES.forEach((ref, k) => {
        const want = ref.map(home);
        if (want[0] === cols[0] && want[1] === cols[1]) { piece = k; flip = 0; }
        else if (want[0] === cols[1] && want[1] === cols[0]) { piece = k; flip = 1; }
      });
      if (piece < 0) add(`The ${colorsText(cols)} edge can't exist on a real cube. Recheck the ${facesText(slot)} faces.`, slot);
      edgePerm.push(piece);
      edgeFlip.push(flip);
    });

    const cornerPerm = [], cornerTwist = [];
    M.CORNERS.forEach(slot => {
      const cols = slot.map(i => state[i]);
      let piece = -1, twist = 0, mirrored = false;
      if (new Set(cols).size === 3) {
        M.CORNERS.forEach((ref, k) => {
          const want = ref.map(home);
          if (!want.every(c => cols.includes(c))) return;
          const t = cols.indexOf(want[0]);
          if (cols[(t + 1) % 3] === want[1] && cols[(t + 2) % 3] === want[2]) { piece = k; twist = t; }
          else mirrored = true;
        });
      }
      if (piece < 0) {
        add(mirrored
          ? `The ${colorsText(cols)} corner has its colors in an impossible (mirror-image) order. Recheck the ${facesText(slot)} faces.`
          : `The ${colorsText(cols)} corner can't exist on a real cube. Recheck the ${facesText(slot)} faces.`, slot);
      }
      cornerPerm.push(piece);
      cornerTwist.push(twist);
    });

    const duplicates = (perm, slots, kind) => {
      const bySlot = new Map();
      perm.forEach((p, s) => {
        if (p < 0) return;
        if (!bySlot.has(p)) bySlot.set(p, []);
        bySlot.get(p).push(s);
      });
      bySlot.forEach(ss => {
        if (ss.length < 2) return;
        add(`Two ${kind}s both have the ${colorsText(slots[ss[0]].map(i => state[i]))} colors. One of them was misread.`,
          ss.flatMap(s => slots[s]));
      });
    };
    duplicates(edgePerm, M.EDGES, 'edge');
    duplicates(cornerPerm, M.CORNERS, 'corner');
    if (errors.length) return done();

    if (cornerTwist.reduce((a, b) => a + b, 0) % 3 !== 0) {
      add('One corner is twisted. Recheck the corner stickers. If they are right, a corner on the real cube was twisted in place, so it cannot be solved by turning.');
    }
    if (edgeFlip.reduce((a, b) => a + b, 0) % 2 !== 0) {
      add('One edge is flipped. Recheck the edge stickers. If they are right, an edge on the real cube was flipped in place, so it cannot be solved by turning.');
    }
    if (parity(edgePerm) !== parity(cornerPerm)) {
      add('Two pieces are swapped. Recheck the stickers. If they are right, the real cube was put back together with two pieces swapped, so it cannot be solved by turning.');
    }
    return done();
  }

  return { validate };
});
