// Words for the cube: how to hold it to read each face, and what each turn looks like.
// Built from structured claims so the tests can check every sentence against cube geometry.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.CubeDescribe = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const NAMES = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange', x: 'unset' };
  const FACE_WORD = { U: 'Top', D: 'Bottom', F: 'Front', B: 'Back', L: 'Left', R: 'Right' };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // Sticker indices of rows or columns of a face (n: one index or a list), or the whole face.
  function region(face, kind, n) {
    const base = M.FACES.indexOf(face) * 9;
    if (kind === 'face') return [...Array(9).keys()].map(k => base + k);
    return [].concat(n).flatMap(j => [0, 1, 2].map(k => base + (kind === 'row' ? j * 3 + k : k * 3 + j)));
  }

  // A clockwise turn of the face carries the stickers in `from` onto `cw`; counter-clockwise onto `ccw`.
  const TURNS = {
    U: { from: ['F', 'row', 0], cw: ['L', 'row', 0], ccw: ['R', 'row', 0], words: ['the front row slides to the left', 'the front row slides to the right'] },
    D: { from: ['F', 'row', 2], cw: ['R', 'row', 2], ccw: ['L', 'row', 2], words: ['the front row slides to the right', 'the front row slides to the left'] },
    R: { from: ['F', 'col', 2], cw: ['U', 'col', 2], ccw: ['D', 'col', 2], words: ['the front column goes up', 'the front column goes down'] },
    L: { from: ['F', 'col', 0], cw: ['D', 'col', 0], ccw: ['U', 'col', 0], words: ['the front column goes down', 'the front column goes up'] },
    F: { from: ['F', 'row', 0], cw: ['F', 'col', 2], ccw: ['F', 'col', 0], words: ['the top row swings down the right side', 'the top row swings down the left side'] },
    B: { from: ['U', 'row', 0], cw: ['L', 'col', 0], ccw: ['R', 'col', 2], words: ['the back row of the top slides to the left, seen from the front', 'the back row of the top slides to the right, seen from the front'] },
    M: { from: ['F', 'col', 1], cw: ['D', 'col', 1], ccw: ['U', 'col', 1], words: ['the middle column of the front goes down', 'the middle column of the front goes up'] },
    E: { from: ['F', 'row', 1], cw: ['R', 'row', 1], ccw: ['L', 'row', 1], words: ['the middle row of the front slides to the right', 'the middle row of the front slides to the left'] },
    S: { from: ['U', 'row', 1], cw: ['R', 'col', 1], ccw: ['L', 'col', 1], words: ['the middle row of the top swings down the right side', 'the middle row of the top swings down the left side'] },
    r: { from: ['F', 'col', [1, 2]], cw: ['U', 'col', [1, 2]], ccw: ['D', 'col', [1, 2]], words: ['the right two columns of the front go up', 'the right two columns of the front go down'] },
    l: { from: ['F', 'col', [0, 1]], cw: ['D', 'col', [0, 1]], ccw: ['U', 'col', [0, 1]], words: ['the left two columns of the front go down', 'the left two columns of the front go up'] },
    u: { from: ['F', 'row', [0, 1]], cw: ['L', 'row', [0, 1]], ccw: ['R', 'row', [0, 1]], words: ['the top two rows of the front slide to the left', 'the top two rows of the front slide to the right'] },
    d: { from: ['F', 'row', [1, 2]], cw: ['R', 'row', [1, 2]], ccw: ['L', 'row', [1, 2]], words: ['the bottom two rows of the front slide to the right', 'the bottom two rows of the front slide to the left'] },
    f: { from: ['U', 'row', [1, 2]], cw: ['R', 'col', [0, 1]], ccw: ['L', 'col', [1, 2]], words: ['the front two rows of the top swing down the right side', 'the front two rows of the top swing down the left side'] },
    b: { from: ['U', 'row', [0, 1]], cw: ['L', 'col', [0, 1]], ccw: ['R', 'col', [1, 2]], words: ['the back two rows of the top slide to the left, seen from the front', 'the back two rows of the top slide to the right, seen from the front'] },
    x: { from: ['F', 'face'], cw: ['U', 'face'], ccw: ['D', 'face'], words: ['the front comes up to the top', 'the front goes down to the bottom'] },
    y: { from: ['F', 'face'], cw: ['L', 'face'], ccw: ['R', 'face'], words: ['the front goes round to the left', 'the front goes round to the right'] },
    z: { from: ['U', 'face'], cw: ['R', 'face'], ccw: ['L', 'face'], words: ['the top goes round to the right', 'the top goes round to the left'] },
  };
  // What each move turns, and which face to look at to judge clockwise.
  const MOVE_WORD = {
    U: 'Top face', D: 'Bottom face', F: 'Front face', B: 'Back face', L: 'Left face', R: 'Right face',
    M: 'Middle slice between left and right', E: 'Middle slice between top and bottom', S: 'Middle slice between front and back',
    u: 'Top two layers', d: 'Bottom two layers', f: 'Front two layers', b: 'Back two layers', l: 'Left two layers', r: 'Right two layers',
  };
  const LOOK = { U: 'top', D: 'bottom', F: 'front', B: 'back', L: 'left', R: 'right', M: 'left', E: 'bottom', S: 'front', x: 'right', y: 'top', z: 'front' };
  const lookAt = base => LOOK[base] || LOOK[base.toUpperCase()];

  // Reading a face: the whole-cube `rotation` (from the standard hold) that brings it to the
  // front in the net's orientation, and which neighbor touches which edge of the grid.
  const READING = {
    F: { rotation: '', side: ['row', 0], neighbor: 'U', lead: c => `Hold ${c('U')} on top with ${c('F')} facing you.` },
    R: { rotation: 'y', side: ['col', 0], neighbor: 'F', lead: c => `Keep ${c('U')} on top and turn the cube so ${c('R')} faces you.` },
    B: { rotation: 'y2', side: ['col', 0], neighbor: 'R', lead: c => `Keep ${c('U')} on top and turn the cube so ${c('B')} faces you.` },
    L: { rotation: "y'", side: ['col', 2], neighbor: 'F', lead: c => `Keep ${c('U')} on top and turn the cube so ${c('L')} faces you.` },
    U: { rotation: "x'", side: ['row', 2], neighbor: 'F', lead: c => `Start with ${c('F')} facing you, then tip the top toward you until ${c('U')} faces you.` },
    D: { rotation: 'x', side: ['row', 0], neighbor: 'F', lead: c => `Start with ${c('F')} facing you, then tip the top away from you until ${c('D')} faces you.` },
  };
  const WHERE = { row0: 'along the top edge', row2: 'along the bottom edge', col0: 'on your left', col2: 'on your right' };

  function faceHint(face, state) {
    const c = f => NAMES[M.centerColor(state, f)];
    const r = READING[face];
    return `${r.lead(c)} ${cap(c(r.neighbor))} is ${WHERE[r.side.join('')]}.`;
  }

  // Scanning: which face to show next, relative to the one facing the camera now (null at the start;
  // `top` then names the face on top). How the cube is held is only a guess, so no left/right words.
  function nextFaceHint(from, to, top) {
    const n = f => NAMES[M.centerColor(M.SOLVED, f)];
    if (!from) return `Hold the cube with ${n(to)} toward the camera${top ? ` and ${n(top)} on top` : ''}.`;
    if (from === to) return `Keep ${n(to)} toward the camera.`;
    const dot = M.NORMALS[from].reduce((s, v, k) => s + v * M.NORMALS[to][k], 0);
    return dot === 0
      ? `${cap(n(to))} is next to ${n(from)}: give the cube a quarter turn so ${n(to)} faces the camera.`
      : `${cap(n(to))} is opposite ${n(from)}: turn the cube over so ${n(to)} faces the camera.`;
  }

  function describeMove(m) {
    if (m === 'z2') {
      return { title: 'Flip the whole cube', detail: 'Roll the whole cube half a turn like a steering wheel. The front stays facing you; top and bottom swap, and so do left and right.' };
    }
    const base = m[0], suffix = m.slice(1), look = lookAt(base);
    const cw = suffix !== "'";
    const dir = cw ? 'clockwise' : 'counter-clockwise';
    if ('xyz'.includes(base)) {
      const how = 'Nothing twists; you only change how you hold it.';
      if (suffix === '2') return { title: 'Turn the whole cube, half turn', detail: `Turn the whole cube 180°, spinning it around the ${look}-face axis. ${how}` };
      return { title: `Turn the whole cube ${dir}`, detail: `Turn the whole cube ${dir} as seen from the ${look}: ${TURNS[base].words[cw ? 0 : 1]}. ${how}` };
    }
    const what = MOVE_WORD[base], lower = what.charAt(0).toLowerCase() + what.slice(1);
    const centers = 'URFDLB'.includes(base) ? '' : ' The centers move too.';
    if (suffix === '2') return { title: `${what}, half turn`, detail: `Turn the ${lower} 180°. Either direction works.${centers}` };
    return { title: `${what}, ${dir}`, detail: `Quarter turn ${dir}, as if you were looking straight at the ${look} face: ${TURNS[base].words[cw ? 0 : 1]}.${centers}` };
  }

  const holdText = s => `${NAMES[M.centerColor(s, 'U')]} is on top and ${NAMES[M.centerColor(s, 'F')]} faces you`;
  // Slice, wide and whole-cube moves shift the centers; say how the cube now sits.
  function centerChange(before, after) {
    return M.centerKey(before) === M.centerKey(after) ? '' : `After this move, ${holdText(after)}.`;
  }
  // A route can finish with the pattern seen from another side; say how to hold it like the picture.
  function pictureHint(state, picture) {
    if (M.centerKey(state) === M.centerKey(picture)) return '';
    return `Hold ${NAMES[M.centerColor(picture, 'U')]} on top and ${NAMES[M.centerColor(picture, 'F')]} facing you to see it like the picture.`;
  }

  return { NAMES, FACE_WORD, TURNS, READING, region, lookAt, faceHint, nextFaceHint, describeMove, centerChange, pictureHint };
});
