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

  // Sticker indices of one row or column of a face, in the net's orientation.
  function region(face, kind, n) {
    const base = M.FACES.indexOf(face) * 9;
    return [0, 1, 2].map(k => base + (kind === 'row' ? n * 3 + k : k * 3 + n));
  }

  // A clockwise turn of the face carries the stickers in `from` onto `cw`; counter-clockwise onto `ccw`.
  const TURNS = {
    U: { from: ['F', 'row', 0], cw: ['L', 'row', 0], ccw: ['R', 'row', 0], words: ['the front row slides to the left', 'the front row slides to the right'] },
    D: { from: ['F', 'row', 2], cw: ['R', 'row', 2], ccw: ['L', 'row', 2], words: ['the front row slides to the right', 'the front row slides to the left'] },
    R: { from: ['F', 'col', 2], cw: ['U', 'col', 2], ccw: ['D', 'col', 2], words: ['the front column goes up', 'the front column goes down'] },
    L: { from: ['F', 'col', 0], cw: ['D', 'col', 0], ccw: ['U', 'col', 0], words: ['the front column goes down', 'the front column goes up'] },
    F: { from: ['F', 'row', 0], cw: ['F', 'col', 2], ccw: ['F', 'col', 0], words: ['the top row swings down the right side', 'the top row swings down the left side'] },
    B: { from: ['U', 'row', 0], cw: ['L', 'col', 0], ccw: ['R', 'col', 2], words: ['the back row of the top slides to the left, seen from the front', 'the back row of the top slides to the right, seen from the front'] },
  };

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

  function describeMove(m) {
    if (m === 'z2') {
      return { title: 'Flip the whole cube', detail: 'Roll the whole cube half a turn like a steering wheel. The front stays facing you; top and bottom swap, and so do left and right.' };
    }
    const face = FACE_WORD[m[0]], lower = face.toLowerCase(), suffix = m.slice(1);
    if (suffix === '2') return { title: `${face} face, half turn`, detail: `Turn the ${lower} face 180°. Either direction works.` };
    const cw = suffix === '';
    const dir = cw ? 'clockwise' : 'counter-clockwise';
    return { title: `${face} face, ${dir}`, detail: `Quarter turn ${dir}, as if you were looking straight at the ${lower} face: ${TURNS[m[0]].words[cw ? 0 : 1]}.` };
  }

  return { NAMES, FACE_WORD, TURNS, READING, region, faceHint, describeMove };
});
