const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const V = require('../js/vision.js');
const { validate } = require('../js/validate.js');
const Scan = require('../js/scan.js');
const { SHADES, light } = require('./imagegen.js');
const { seededRng } = require('./helpers.js');

// Samples for 9 sticker letters (one photo), as sampleFace would return them under some lighting.
function toSamples(letters, rng) {
  const exposure = 0.75 + rng() * 0.35;
  return letters.map(c => {
    const rgb = light(SHADES[c], exposure, rng() * 0.08);
    return { rgb, lab: V.rgbToLab(rgb) };
  });
}
const faceOf = (state, f) => state.slice(M.FACES.indexOf(f) * 9, M.FACES.indexOf(f) * 9 + 9);
const scrambled = (rng, n = 25) => M.applyMoves(M.SOLVED, M.randomScramble(n, rng));
function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// What the camera sees when the cube is held as the guide says for the next face.
function photoFollowingGuide(s, state) {
  const g = s.guide();
  const hold = g.hold.concat(g.move ? [g.move] : []);
  return { face: g.target, letters: M.applyMoves(state, hold).slice(18, 27) };
}
function scanFollowingGuide(state, rng) {
  const s = Scan.createScan();
  while (!s.done()) {
    const p = photoFollowingGuide(s, state);
    s.setFace(p.face, toSamples(p.letters, rng));
  }
  return s;
}

test('colorLetter names a sample with the nearest standard color', () => {
  assert.equal(V.colorLetter(V.rgbToLab(SHADES.o)), 'o');
  assert.equal(V.colorLetter(V.rgbToLab(SHADES.w)), 'w');
});

test('the center color names the face in view, under very different lighting', () => {
  const rng = seededRng(3);
  let wrong = 0;
  for (let n = 0; n < 50; n++) {
    for (const f of M.FACES) {
      const exposure = 0.55 + rng() * 0.7, tint = (rng() * 2 - 1) * 0.15;
      const rgb = light(SHADES[M.centerColor(M.SOLVED, f)], exposure, tint);
      const samples = Array.from({ length: 9 }, () => ({ rgb, lab: V.rgbToLab(rgb) }));
      if (Scan.faceForCenter(samples) !== f) wrong++;
    }
  }
  assert.equal(wrong, 0);
});

test('turnFace: four quarter turns are no turn, and one quarter is how the front looks after z', () => {
  const s = scrambled(seededRng(6), 20), front = s.slice(18, 27);
  assert.deepEqual(Scan.turnFace(front, 4), front);
  assert.deepEqual(Scan.turnFace(Scan.turnFace(front, 3), 1), front);
  assert.deepEqual(Scan.turnFace(front, 1), M.applyMoves(s, 'z').slice(18, 27));
});

test('turnToFront is one whole-cube turn that brings the face to the camera, from any hold', () => {
  for (const hold of M.ROTATIONS) {
    for (const f of M.FACES) {
      const move = Scan.turnToFront(hold, f);
      assert.ok(['', 'y', "y'", 'y2', "x'", 'x'].includes(move), move);
      const after = M.applyMoves(M.SOLVED, hold.concat(move ? [move] : []));
      assert.equal(M.centerColor(after, 'F'), M.centerColor(M.SOLVED, f), `${hold.join(' ')} → ${f}`);
    }
  }
});

test('faces shown in any order and any way up rebuild the cube', () => {
  const rng = seededRng(4);
  for (let n = 0; n < 25; n++) {
    const state = scrambled(rng), s = Scan.createScan();
    for (const f of shuffle(M.FACES, rng)) s.setFace(f, toSamples(Scan.turnFace(faceOf(state, f), Math.floor(rng() * 4)), rng));
    assert.equal(s.done(), true);
    const r = s.check();
    assert.equal(r.ok, true, `scramble ${n}`);
    assert.deepEqual(r.state, state, `scramble ${n}`);
  }
});

test('orient turns each face and its uncertain stickers together', () => {
  const state = scrambled(seededRng(7));
  const photoTurn = { U: 1, R: 2, F: 3, D: 0, L: 1, B: 2 };
  const photos = [].concat(...M.FACES.map(f => Scan.turnFace(faceOf(state, f), photoTurn[f])));
  // Photo position p of the right face shows net sticker 0 of that face.
  const p = Scan.turnFace([...Array(9).keys()], photoTurn.R).indexOf(0);
  const r = Scan.orient(photos, [9 + p], {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, state);
  assert.deepEqual(r.turns, { U: 3, R: 2, F: 1, D: 0, L: 3, B: 2 });
  assert.deepEqual(r.uncertain, [9]);
});

test('solved and checkerboard cubes come back as they are, never ambiguous', () => {
  const rng = seededRng(8);
  for (const alg of ['', 'M2 E2 S2']) {
    const state = M.applyMoves(M.SOLVED, alg), s = Scan.createScan();
    for (const f of shuffle(M.FACES, rng)) s.setFace(f, toSamples(Scan.turnFace(faceOf(state, f), Math.floor(rng() * 4)), rng));
    const r = s.check();
    assert.equal(r.ok, true);
    assert.deepEqual(r.state, state);
    assert.deepEqual(r.ambiguous, []);
  }
});

test('following the guide rebuilds nearly solved cubes exactly, with no correction needed', () => {
  const rng = seededRng(9);
  const cases = M.FACES.flatMap(f => [f, f + "'", f + '2']).map(m => M.applyMoves(M.SOLVED, m));
  for (let n = 0; n < 6; n++) cases.push(scrambled(rng));
  cases.forEach((state, n) => {
    const s = scanFollowingGuide(state, rng), r = s.check();
    assert.equal(r.ok, true, `case ${n}`);
    assert.deepEqual(r.state, state, `case ${n}`);
    M.FACES.forEach(f => assert.equal(r.turns[f], s.faces[f].expected, `case ${n} face ${f}`));
    if (n >= 18) assert.deepEqual(r.ambiguous, [], `scrambled case ${n}: only one real cube fits`);
  });
});

test('holding the cube upside down all along: a nearly solved cube is flagged, never silently wrong', () => {
  const rng = seededRng(19), truth = M.applyMoves(M.SOLVED, 'R'), s = Scan.createScan();
  while (!s.done()) {
    const p = photoFollowingGuide(s, truth);
    s.setFace(p.face, toSamples(Scan.turnFace(p.letters, 2), rng)); // every photo half a turn from the guide
  }
  const r = s.check();
  assert.equal(r.ok, true);
  if (r.state.join('') !== truth.join('')) {
    assert.ok(r.ambiguous.length > 0, 'a different real cube was chosen, so it must be flagged');
    truth.forEach((c, i) => { if (c !== r.state[i]) assert.ok(r.ambiguousCells.includes(i), `sticker ${i} is wrong but not flagged`); });
  }
});

test('with no idea how faces were held, a nearly solved cube is flagged as ambiguous', () => {
  const state = M.applyMoves(M.SOLVED, 'R');
  const r = Scan.orient(state, [], {});
  assert.equal(r.ok, true);
  assert.equal(validate(r.state).ok, true);
  assert.ok(r.ambiguous.length > 0);
  assert.ok(r.ambiguousCells.length > 0);
  r.ambiguousCells.forEach(i => assert.ok(r.ambiguous.includes(M.FACES[Math.floor(i / 9)])));
  // Knowing how each face was held picks the right cube, but the other real cubes stay flagged
  // in case the cube was held some other way.
  const known = Scan.orient(state, [], { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 });
  assert.deepEqual(known.state, state);
  assert.ok(known.ambiguous.length > 0);
});

test('a misread pair of stickers: not a real cube, the right faces kept, and the misread face named', () => {
  const rng = seededRng(10);
  let named = 0;
  const N = 20;
  for (let n = 0; n < N; n++) {
    const truth = scrambled(rng), bad = truth.slice(), r0 = 9; // right face starts at 9
    const [a, b] = bad[r0] !== bad[r0 + 1] ? [r0, r0 + 1] : [r0 + 1, r0 + 2]; // a corner and an edge sticker
    [bad[a], bad[b]] = [bad[b], bad[a]];
    const r = scanFollowingGuide(bad, rng).check();
    assert.equal(r.ok, false, `case ${n}`);
    assert.ok(r.errors.length > 0);
    M.FACES.filter(f => f !== 'R').forEach(f => assert.deepEqual(faceOf(r.state, f), faceOf(bad, f), `case ${n} face ${f}`));
    assert.ok(r.suspects.length >= 1 && r.suspects.length <= 2);
    if (r.suspects.includes('R')) named++;
  }
  assert.ok(named >= N - 2, `misread face named in ${named} of ${N}`);
});

test('errors that name no stickers take their suspects from the uncertain stickers', () => {
  const state = scrambled(seededRng(11));
  const [e0, e1] = [M.EDGES[0], M.EDGES[1]]; // swap two whole edges: only the parity is wrong
  e0.forEach((i, k) => { [state[i], state[e1[k]]] = [state[e1[k]], state[i]]; });
  const zero = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  const r = Scan.orient(state, [49], zero); // one uncertain sticker on the back face
  assert.equal(r.ok, false);
  assert.ok(r.errors.every(e => e.cells.length === 0), r.errors.map(e => e.message).join(' | '));
  assert.deepEqual(r.suspects, ['B']);
});

test('the guide suggests front, right, back, left, top, bottom, one whole-cube turn each', () => {
  const rng = seededRng(12), state = scrambled(rng), s = Scan.createScan();
  const faces = [], moves = [];
  while (!s.done()) {
    const g = s.guide();
    faces.push(g.target);
    moves.push(g.move);
    const p = photoFollowingGuide(s, state);
    s.setFace(p.face, toSamples(p.letters, rng));
  }
  assert.deepEqual(faces, ['F', 'R', 'B', 'L', 'U', 'D']);
  assert.deepEqual(moves, ['', 'y', 'y', 'y', "x'", 'y2']);
  assert.equal(s.suggest(), null);
  assert.equal(s.count(), 6);
});

test('the guide hint names the face to show and how it sits next to the last one', () => {
  const rng = seededRng(13), s = Scan.createScan();
  assert.equal(s.guide().hint, 'Hold the cube with green toward the camera and white on top.');
  s.setFace('F', toSamples(faceOf(M.SOLVED, 'F'), rng));
  assert.equal(s.guide().hint, 'Red is next to green: give the cube a quarter turn so red faces the camera.');
  s.pick('B');
  assert.equal(s.guide().target, 'B');
  assert.equal(s.guide().move, 'y2');
  assert.equal(s.guide().hint, 'Blue is opposite green: keep white on top and spin the cube half a turn so blue faces the camera.');
});

test('the camera captures the face it sees unless that face is already done', () => {
  const rng = seededRng(14), s = Scan.createScan();
  assert.deepEqual(s.seen(null), { capture: false, face: null, message: 'Show the green face, flat to the camera and filling most of the view.' });
  assert.deepEqual(s.seen('F'), { capture: true, face: 'F', message: '✓ Green face found. Hold still…' });
  assert.deepEqual(s.seen('R'), { capture: true, face: 'R', message: '✓ Red face found. Hold still…' });
  s.setFace('R', toSamples(faceOf(M.SOLVED, 'R'), rng));
  const t = s.target();
  assert.notEqual(t, 'R');
  const again = s.seen('R');
  assert.equal(again.capture, false);
  assert.equal(again.message, `Red is already scanned. Show the ${{ U: 'white', F: 'green', B: 'blue', L: 'orange', D: 'yellow' }[t]} face, or press Capture if this is it.`);
  s.pick('R');
  assert.deepEqual(s.seen('R'), { capture: true, face: 'R', message: '✓ Red face found. Hold still…' });
});

test('a face the user tapped is not taken over by another face the camera happens to see', () => {
  const s = Scan.createScan();
  s.pick('D', true);
  assert.equal(s.seen(null).capture, false); // nothing in view yet: the tap still holds
  assert.deepEqual(s.seen('R'), { capture: false, face: 'R', message: 'I see the red face. Show the yellow face, or tap red to scan that one.' });
  assert.equal(s.target(), 'D');
  assert.equal(s.seen(null).capture, false); // the face left the view: the tap no longer holds
  assert.equal(s.seen('R').capture, true);
  s.pick('U'); // picked by the camera, not tapped
  assert.equal(s.seen('B').capture, true);
});

test('when the check renames two swapped centers, the faces are stored under their real names', () => {
  const rng = seededRng(20), truth = scrambled(rng), s = Scan.createScan();
  const red = toSamples(faceOf(truth, 'R'), rng), orange = toSamples(faceOf(truth, 'L'), rng);
  for (const f of M.FACES) {
    if (f === 'R') s.setFace('R', orange); // warm light: the orange face was saved as red…
    else if (f === 'L') s.setFace('L', red); // …and the red face as orange
    else s.setFace(f, toSamples(faceOf(truth, f), rng));
  }
  const r = s.check();
  assert.deepEqual(r.renamed.slice().sort(), ['L', 'R']);
  assert.equal(s.faces.R.samples, red);
  assert.equal(s.faces.L.samples, orange);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, truth);
});

test('a picked face stays the target until it is captured', () => {
  const rng = seededRng(15), s = Scan.createScan();
  s.pick('D');
  assert.equal(s.target(), 'D');
  s.setFace('D', toSamples(faceOf(M.SOLVED, 'D'), rng));
  assert.equal(s.faces.D.samples.length, 9);
  assert.notEqual(s.target(), 'D');
});

test('scanning a face again after a failed check replaces it and fixes the cube', () => {
  const rng = seededRng(16), truth = scrambled(rng), bad = truth.slice();
  [bad[9], bad[10]] = [bad[10], bad[9]];
  if (bad[9] === bad[10]) [bad[10], bad[11]] = [bad[11], bad[10]];
  const s = scanFollowingGuide(bad, rng);
  assert.equal(s.check().ok, false);
  s.pick('R');
  const p = photoFollowingGuide(s, truth);
  assert.equal(p.face, 'R');
  s.setFace('R', toSamples(p.letters, rng));
  assert.equal(s.count(), 6);
  const r = s.check();
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, truth);
});

test('the guide cube shows the centers and the faces scanned so far, the right way round', () => {
  const rng = seededRng(17), truth = scrambled(rng), s = Scan.createScan();
  for (let k = 0; k < 2; k++) {
    const p = photoFollowingGuide(s, truth);
    s.setFace(p.face, toSamples(p.letters, rng));
  }
  const g = s.guideState();
  assert.deepEqual(faceOf(g, 'F'), faceOf(truth, 'F'));
  assert.deepEqual(faceOf(g, 'R'), faceOf(truth, 'R'));
  for (const f of ['U', 'D', 'L', 'B']) {
    assert.deepEqual(faceOf(g, f), faceOf(M.SOLVED, f).map((c, i) => (i === 4 ? c : 'x')));
  }
});

// The first version of orient: every one of the 4096 turn combinations, each checked in full.
// The fast search must give exactly the same answer.
const NINE = [0, 1, 2, 3].map(k => Scan.turnFace([...Array(9).keys()], k));
function referenceOrient(photos, uncertain = [], expected = {}) {
  const turned = M.FACES.map((f, fi) => NINE.map(map => map.map(p => photos[fi * 9 + p])));
  const exp = M.FACES.map(f => (Number.isInteger(expected[f]) ? expected[f] : null));
  const valid = new Map();
  let bad = null;
  for (let c = 0; c < 4096; c++) {
    const ks = M.FACES.map((f, i) => (c >> (2 * i)) & 3);
    const state = [].concat(...ks.map((k, i) => turned[i][k]));
    const off = ks.reduce((n, k, i) => n + (exp[i] !== null && k !== exp[i] ? 1 : 0), 0);
    const key = state.join(''), seen = valid.get(key);
    if (seen) { if (off < seen.off) Object.assign(seen, { ks, off }); continue; }
    const v = validate(state);
    if (v.ok) valid.set(key, { ks, off, state });
    else if (!bad || v.errors.length < bad.errors.length || (v.errors.length === bad.errors.length && off < bad.off)) bad = { ks, off, state, errors: v.errors };
  }
  const unc = new Set(uncertain);
  const follow = ks => {
    const out = [];
    ks.forEach((k, fi) => NINE[k].forEach((p, i) => { if (unc.has(fi * 9 + p)) out.push(fi * 9 + i); }));
    return out.sort((a, b) => a - b);
  };
  const turnsOf = ks => Object.fromEntries(M.FACES.map((f, i) => [f, ks[i]]));
  if (valid.size) {
    const list = [...valid.values()], least = Math.min(...list.map(v => v.off));
    const chosen = list.find(v => v.off === least);
    const cells = new Set();
    list.forEach(v => { if (v !== chosen) v.state.forEach((c, i) => { if (c !== chosen.state[i]) cells.add(i); }); });
    const ambiguousCells = [...cells].sort((a, b) => a - b);
    return {
      ok: true, state: chosen.state, turns: turnsOf(chosen.ks), uncertain: follow(chosen.ks), errors: [], suspects: [],
      ambiguous: M.FACES.filter((f, fi) => ambiguousCells.some(i => Math.floor(i / 9) === fi)), ambiguousCells,
    };
  }
  const u = follow(bad.ks), close = new Set(u), wrong = new Set(bad.errors.flatMap(e => e.cells));
  const score = M.FACES.map((f, fi) => {
    let s = 0;
    for (let i = fi * 9; i < fi * 9 + 9; i++) s += (wrong.has(i) && close.has(i) ? 3 : 0) + (wrong.has(i) ? 1 : 0) + (close.has(i) ? 1 : 0);
    return s;
  });
  const suspects = M.FACES.map((f, fi) => ({ f, s: score[fi] })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2).map(x => x.f);
  return { ok: false, state: bad.state, turns: turnsOf(bad.ks), uncertain: u, errors: bad.errors, suspects, ambiguous: [], ambiguousCells: [] };
}
// Orient inputs of every kind: photos turned at random, some held as expected, some misread.
function orientCases() {
  const rng = seededRng(40), cases = [];
  const photosOf = (state, turns) => [].concat(...M.FACES.map(f => Scan.turnFace(faceOf(state, f), turns[f])));
  const randomTurns = () => Object.fromEntries(M.FACES.map(f => [f, Math.floor(rng() * 4)]));
  const fixOf = turns => Object.fromEntries(M.FACES.map(f => [f, (4 - turns[f]) % 4]));
  const someOf = t => Object.fromEntries(Object.entries(t).filter(() => rng() < 0.6));
  const uncertainOf = () => [...Array(3)].map(() => Math.floor(rng() * 54)).filter(i => i % 9 !== 4);
  const add = (state, turns, expected) => cases.push({ photos: photosOf(state, turns), uncertain: uncertainOf(), expected });
  for (let n = 0; n < 10; n++) { const t = randomTurns(); add(scrambled(rng), t, n % 2 ? fixOf(t) : someOf(fixOf(t))); }
  for (const m of ['R', "U'", 'F2', 'M2', 'L D']) { const t = randomTurns(); add(M.applyMoves(M.SOLVED, m), t, fixOf(t)); add(M.applyMoves(M.SOLVED, m), t, {}); }
  const P = require('../js/patterns.js');
  P.entries().filter((e, i) => i % 15 === 0).forEach(e => { const t = randomTurns(); add(e.state, t, someOf(fixOf(t))); });
  for (const name of ['Worms', 'The Superflip']) { // hundreds of real cubes fit these
    const state = P.entries().find(e => e.name === name).state, misread = state.slice();
    [misread[0], misread[1]] = [misread[1], misread[0]];
    add(state, randomTurns(), {});
    add(misread, randomTurns(), {});
  }
  for (let n = 0; n < 10; n++) {
    const bad = scrambled(rng), f = Math.floor(rng() * 6) * 9, a = f + [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(rng() * 8)];
    const b = f + [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(rng() * 8)];
    [bad[a], bad[b]] = [bad[b], bad[a]]; // a misread pair (sometimes the same sticker, i.e. none)
    if (n % 3 === 0) { const c = Math.floor(rng() * 54), d = Math.floor(rng() * 54); if (c % 9 !== 4 && d % 9 !== 4) [bad[c], bad[d]] = [bad[d], bad[c]]; }
    const t = randomTurns();
    add(bad, t, fixOf(t));
  }
  const parity = scrambled(rng);
  M.EDGES[0].forEach((i, k) => { const j = M.EDGES[1][k]; [parity[i], parity[j]] = [parity[j], parity[i]]; });
  add(parity, randomTurns(), {});
  const twoWhites = scrambled(rng);
  twoWhites[22] = twoWhites[4]; // two centers alike: not even worth turning faces
  add(twoWhites, randomTurns(), {});
  return cases;
}

test('the fast orient gives exactly the same answer as trying every combination in full', () => {
  orientCases().forEach(({ photos, uncertain, expected }, n) => {
    assert.deepEqual(Scan.orient(photos, uncertain, expected), referenceOrient(photos, uncertain, expected), `case ${n}`);
  });
});

test('orient is quick enough for a phone', () => {
  const rng = seededRng(18), times = { real: [], misread: [] };
  for (let n = 0; n < 10; n++) {
    const state = scrambled(rng), bad = state.slice();
    [bad[9], bad[10]] = [bad[10], bad[9]];
    for (const [kind, s] of [['real', state], ['misread', bad]]) {
      const t = process.hrtime.bigint();
      Scan.orient(s, [], {});
      times[kind].push(Number(process.hrtime.bigint() - t) / 1e6);
    }
  }
  const median = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
  // A phone is several times slower than this machine; these leave it well under a tenth of a second.
  assert.ok(median(times.real) < 8, `real cube: ${median(times.real).toFixed(1)} ms`);
  assert.ok(median(times.misread) < 25, `misread cube: ${median(times.misread).toFixed(1)} ms`);
});

test('orient stays quick for patterns that many turns of the faces would also make', () => {
  const P = require('../js/patterns.js'), median = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
  for (const name of ['Worms', 'The Superflip']) {
    const state = P.entries().find(e => e.name === name).state, times = [];
    for (let n = 0; n < 5; n++) {
      const t = process.hrtime.bigint();
      Scan.orient(state, [], {});
      times.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    assert.ok(median(times) < 12, `${name}: ${median(times).toFixed(1)} ms`);
  }
});

// A detection as findFace returns it: a square of side `size` at (x, y).
const det = (x, y, size = 100, method = 'grid') => ({ method, corners: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]] });

test('live capture waits for the same face held steady', () => {
  const st = Scan.createSteadiness({ needed: 4, tolerance: 0.05 });
  assert.equal(st.push(det(10, 10), 'F'), false);
  assert.equal(st.push(det(12, 11), 'F'), false);
  assert.equal(st.push(det(11, 12), 'F'), false);
  assert.equal(st.progress(), 0.75);
  assert.equal(st.push(det(12, 12), 'F'), true, 'fourth steady frame captures');
});

test('moving, a fallback detection, no face or a different face starts the count again', () => {
  const st = Scan.createSteadiness({ needed: 3, tolerance: 0.05 });
  st.push(det(10, 10), 'F');
  st.push(det(10, 10), 'F');
  assert.equal(st.push(det(30, 10), 'F'), false, 'moved 20% of the face');
  assert.equal(st.progress(), 1 / 3);
  st.push(det(30, 10), 'F');
  assert.equal(st.push(det(30, 10, 100, 'body'), 'F'), false);
  assert.equal(st.progress(), 0);
  st.push(det(30, 10), 'F');
  assert.equal(st.push(det(30, 10), null), false, 'no face that may be captured');
  assert.equal(st.progress(), 0);
  st.push(det(30, 10), 'F');
  assert.equal(st.push(det(30, 10), 'R'), false, 'a different face');
  assert.equal(st.progress(), 1 / 3);
  st.reset();
  assert.equal(st.progress(), 0);
});

test('a flickering center never captures', () => {
  const st = Scan.createSteadiness({ needed: 3, tolerance: 0.05 });
  for (let k = 0; k < 20; k++) assert.equal(st.push(det(10, 10), k % 2 ? 'R' : 'L'), false);
});
