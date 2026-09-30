// A cube scan: six faces shown to the camera in any order and any way up. Each face is known by its
// center color; which way round each photo was is worked out at the end, by trying every quarter
// turn of every face and keeping the one real cube (closest to how the guide asked for the cube to
// be held when several fit).
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = isNode
    ? factory(require('./cube.js'), require('./describe.js'), require('./vision.js'), require('./validate.js'))
    : factory(root.CubeModel, root.CubeDescribe, root.CubeVision, root.CubeValidate);
  if (isNode) module.exports = api;
  else root.CubeScan = api;
})(typeof self !== 'undefined' ? self : this, function (M, D, V, Val) {
  'use strict';

  // One quarter turn (clockwise as seen) of a face's 9 stickers, row by row: new[i] = old[QUARTER[i]].
  const QUARTER = [6, 3, 0, 7, 4, 1, 8, 5, 2];
  function turnFace(nine, k) {
    let a = nine.slice();
    for (let n = ((k % 4) + 4) % 4; n > 0; n--) a = QUARTER.map(j => a[j]);
    return a;
  }

  const FACE_OF_COLOR = {};
  M.FACES.forEach(f => { FACE_OF_COLOR[M.centerColor(M.SOLVED, f)] = f; });
  const name = f => D.NAMES[M.centerColor(M.SOLVED, f)];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const faceForCenter = samples => FACE_OF_COLOR[V.colorLetter(samples[4].lab)];

  // Holds are whole-cube rotations (move lists) from white on top, green facing the camera.
  const TO_FRONT = { F: '', R: 'y', L: "y'", B: 'y2', U: "x'", D: 'x' };
  const withMove = (hold, move) => (move ? hold.concat([move]) : hold.slice());
  const slotOf = (hold, face) => {
    const held = M.applyMoves(M.SOLVED, hold), color = M.centerColor(M.SOLVED, face);
    return M.FACES.find(g => M.centerColor(held, g) === color);
  };
  const turnToFront = (hold, face) => TO_FRONT[slotOf(hold, face)];
  const shortest = hold => M.ROTATIONS.find(r => M.centerKey(M.applyMoves(M.SOLVED, r)) === M.centerKey(M.applyMoves(M.SOLVED, hold)));
  const INDEX = [...Array(54).keys()];
  // How the photo of `face`, held as `hold` (face toward the camera), is turned from the net.
  function photoTurns(hold, face) {
    const photo = M.applyMoves(INDEX, hold).slice(18, 27), fi = M.FACES.indexOf(face);
    const net = INDEX.slice(fi * 9, fi * 9 + 9);
    for (let k = 0; k < 4; k++) if (turnFace(net, k).every((v, i) => v === photo[i])) return k;
    return null;
  }

  // photos: 54 letters, each face's 9 as photographed. expected: quarter turns that put each photo
  // the net's way round if the cube was held as the guide said (a missing face has no preference).
  const NINE = [0, 1, 2, 3].map(k => turnFace([...Array(9).keys()], k));
  // The search gives faces their turn from the back face down to the top, so whole combinations come
  // in the order of counting 0…4095 (top face fastest). Each edge and corner is judged as soon as
  // all its faces have their turn: DONE_AT[d] lists the pieces completed at depth d.
  const PIECES = M.EDGES.concat(M.CORNERS); // slots 0-11 edges, 12-19 corners
  const DEPTH_FACE = [5, 4, 3, 2, 1, 0];
  const DONE_AT = DEPTH_FACE.map((fi, d) => {
    const set = new Set(DEPTH_FACE.slice(0, d + 1));
    return PIECES.map((p, j) => j).filter(j => PIECES[j].every(i => set.has(Math.floor(i / 9))) && PIECES[j].some(i => Math.floor(i / 9) === fi));
  });
  // Permutation parity, as validate works it out.
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
  function orient(photos, uncertain = [], expected = {}) {
    const turned = M.FACES.map((f, fi) => NINE.map(map => map.map(p => photos[fi * 9 + p])));
    const exp = M.FACES.map(f => (Number.isInteger(expected[f]) ? expected[f] : null));
    // What each color string a real piece can show says, judged just as validate judges it, from the
    // centers (which no face turn moves): which edge and whether flipped (either way round), or which
    // corner and how twisted (any of its three turns, never mirrored).
    const home = i => photos[Math.floor(i / 9) * 9 + 4];
    const look = new Map();
    M.EDGES.forEach((e, k) => { const [a, b] = e.map(home); look.set(a + b, { piece: k, turn: 0 }); look.set(b + a, { piece: k, turn: 1 }); });
    M.CORNERS.forEach((c, k) => {
      const [a, b, x] = c.map(home);
      look.set(a + b + x, { piece: k, turn: 0 }); look.set(x + a + b, { piece: k, turn: 1 }); look.set(b + x + a, { piece: k, turn: 2 });
    });
    // Counting from the pieces gives validate's errors exactly once validate gets that far (all
    // stickers known, six different centers, nine of each color); otherwise every combination is
    // checked by validate itself.
    const counts = {};
    photos.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    const sane = M.COLORS.every(c => counts[c] === 9) && new Set(M.FACES.map((f, fi) => photos[fi * 9 + 4])).size === 6;
    const valid = new Map(), state = new Array(54), ks = [0, 0, 0, 0, 0, 0], pieceAt = new Array(PIECES.length);
    let bad = null;
    // validate's error count for the finished combination: bad pieces plus pieces seen twice, or if
    // there are none, a twisted corner, a flipped edge and swapped pieces.
    const errorCount = broken => {
      const twice = [new Array(12).fill(0), new Array(8).fill(0)];
      let dup = 0;
      pieceAt.forEach((info, j) => { if (info && ++twice[j < 12 ? 0 : 1][info.piece] === 2) dup++; });
      if (broken + dup) return broken + dup;
      const edges = pieceAt.slice(0, 12), corners = pieceAt.slice(12);
      const flip = edges.reduce((s, e) => s + e.turn, 0) % 2, twist = corners.reduce((s, c) => s + c.turn, 0) % 3;
      return (twist ? 1 : 0) + (flip ? 1 : 0) + (parity(edges.map(e => e.piece)) !== parity(corners.map(c => c.piece)) ? 1 : 0);
    };
    // Two combinations make the same cube exactly when every face shows the same stickers, so a
    // combination's key is which distinct version of each face it uses (faces with a symmetric
    // pattern look the same after some turns). A cube met again needs no second look.
    const version = turned.map(four => four.map((t, k) => four.findIndex(u => u.every((c, i) => c === t[i]))));
    const keyOf = () => ks.reduce((key, k, fi) => key + version[fi][k] * 4 ** fi, 0);
    const known = new Map(); // key → validate's error count, for cubes that aren't real
    const keep = (key, errors, off) => {
      if (!errors) {
        const seen = valid.get(key);
        if (seen) { if (off < seen.off) Object.assign(seen, { ks: ks.slice(), off }); }
        else valid.set(key, { ks: ks.slice(), off, state: state.slice() });
      } else if (!valid.size && (!bad || errors < bad.errors.length || (errors === bad.errors.length && off < bad.off))) {
        bad = { ks: ks.slice(), off, state: state.slice(), errors: Val.validate(state).errors }; // the messages, only when kept
      }
    };
    const leaf = (broken, off) => {
      const key = keyOf();
      if (sane) {
        if (valid.has(key)) { keep(key, 0, off); return; }
        if (!known.has(key)) known.set(key, errorCount(broken));
        keep(key, known.get(key), off);
        return;
      }
      const seen = valid.get(key);
      if (seen) { if (off < seen.off) Object.assign(seen, { ks: ks.slice(), off }); return; }
      const v = Val.validate(state);
      if (v.ok) valid.set(key, { ks: ks.slice(), off, state: state.slice() });
      else if (!bad || v.errors.length < bad.errors.length || (v.errors.length === bad.errors.length && off < bad.off)) bad = { ks: ks.slice(), off, state: state.slice(), errors: v.errors };
    };
    const visit = (d, broken, offSoFar) => {
      if (d === 6) { leaf(broken, offSoFar); return; }
      const fi = DEPTH_FACE[d];
      for (let k = 0; k < 4; k++) {
        const t = turned[fi][k];
        for (let i = 0; i < 9; i++) state[fi * 9 + i] = t[i];
        ks[fi] = k;
        const off = offSoFar + (exp[fi] !== null && k !== exp[fi] ? 1 : 0);
        let b = broken;
        if (sane) {
          for (const j of DONE_AT[d]) {
            const p = PIECES[j];
            pieceAt[j] = look.get(p.length === 2 ? state[p[0]] + state[p[1]] : state[p[0]] + state[p[1]] + state[p[2]]);
            if (!pieceAt[j]) b++;
          }
          // Every bad piece is one of validate's errors, so skip what can't be a real cube once one is
          // known, and what can't beat the closest non-cube so far (fewer errors, then fewer off-guide).
          if (b > 0 && valid.size) continue;
          if (bad && (b > bad.errors.length || (b === bad.errors.length && off >= bad.off))) continue;
        }
        visit(d + 1, b, off);
      }
    };
    visit(0, 0, 0);
    const unc = new Set(uncertain);
    const follow = ks => {
      const out = [];
      ks.forEach((k, fi) => NINE[k].forEach((p, i) => { if (unc.has(fi * 9 + p)) out.push(fi * 9 + i); }));
      return out.sort((a, b) => a - b);
    };
    const turnsOf = ks => Object.fromEntries(M.FACES.map((f, i) => [f, ks[i]]));
    if (valid.size) {
      // The guide's holds pick the answer, but if the cube was held some other way any other real
      // cube could be the true one: every sticker where one differs gets flagged.
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
    // Not a real cube whichever way the faces are turned: keep the closest, and name the faces most
    // likely misread (stickers in the errors that were also close calls count most).
    const u = follow(bad.ks), close = new Set(u), wrong = new Set(bad.errors.flatMap(e => e.cells));
    const score = M.FACES.map((f, fi) => {
      let s = 0;
      for (let i = fi * 9; i < fi * 9 + 9; i++) s += (wrong.has(i) && close.has(i) ? 3 : 0) + (wrong.has(i) ? 1 : 0) + (close.has(i) ? 1 : 0);
      return s;
    });
    const suspects = M.FACES.map((f, fi) => ({ f, s: score[fi] })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2).map(x => x.f);
    return { ok: false, state: bad.state, turns: turnsOf(bad.ks), uncertain: u, errors: bad.errors, suspects, ambiguous: [], ambiguousCells: [] };
  }

  function createScan() {
    const faces = {};
    // picked: the face to scan next if set (else the suggestion); tapped: the user chose it, so the
    // camera seeing another face doesn't take over until that other face has left the view.
    let hold = [], last = null, picked = null, tapped = false, sawOther = false;
    const PREFER = ['', 'y', "y'", "x'", 'x', 'y2']; // quarter turns first, turning over last
    const suggest = () => {
      let best = null, rank = Infinity;
      M.FACES.forEach(f => {
        if (faces[f]) return;
        const r = PREFER.indexOf(turnToFront(hold, f));
        if (r < rank) { rank = r; best = f; }
      });
      return best;
    };
    const target = () => picked || suggest();
    return {
      faces,
      suggest,
      target,
      pick(face, byUser = false) { picked = face; tapped = !!byUser; sawOther = false; },
      count: () => Object.keys(faces).length,
      done: () => M.FACES.every(f => faces[f]),
      // How to bring the target face to the camera from the hold the guide last showed.
      guide() {
        const t = target();
        if (!t) return { target: null, hold: hold.slice(), move: '', from: last, hint: '' };
        const move = turnToFront(hold, t);
        return { target: t, hold: hold.slice(), move, from: last, hint: D.nextFaceHint(last, t, slotOfTop(withMove(hold, move))) };
      },
      // The live camera sees `face` (from its center, or null): may it be captured, and what to say.
      seen(face) {
        const t = target();
        if (!face) {
          if (sawOther) tapped = sawOther = false;
          return { capture: false, face: null, message: t ? `Show the ${name(t)} face, flat to the camera and filling most of the view.` : 'All six faces are scanned. Tap a face to scan it again.' };
        }
        if (tapped && face !== t) {
          sawOther = true;
          return { capture: false, face, message: `I see the ${name(face)} face. Show the ${name(t)} face, or tap ${name(face)} to scan that one.` };
        }
        if (face === t || !faces[face]) return { capture: true, face, message: `✓ ${cap(name(face))} face found. Hold still…` };
        return {
          capture: false, face,
          message: t ? `${cap(name(face))} is already scanned. Show the ${name(t)} face, or press Capture if this is it.` : `${cap(name(face))} is already scanned. Tap it to scan it again.`,
        };
      },
      // A face shown to the camera: assume the cube was turned the one way the guide shows.
      setFace(face, samples) {
        const next = withMove(hold, turnToFront(hold, face));
        faces[face] = { samples, expected: (4 - photoTurns(next, face)) % 4 };
        hold = shortest(next);
        last = face;
        if (picked === face) { picked = null; tapped = false; }
      },
      // The guide cube: centers, plus each scanned face's colors put the net's way round.
      guideState() {
        const g = M.SOLVED.map((c, i) => (i % 9 === 4 ? c : 'x'));
        M.FACES.forEach((f, fi) => {
          const e = faces[f];
          if (!e) return;
          turnFace(e.samples.map(s => V.colorLetter(s.lab)), e.expected).forEach((c, i) => { if (i !== 4) g[fi * 9 + i] = c; });
        });
        return g;
      },
      // All six faces: name the centers together (so one misread center can't clash), sort the
      // colors, then turn each face the way that makes a real cube.
      // Renamed faces are stored under their real names, so scanning one again replaces the right one.
      check() {
        const names = V.nameCenters(M.FACES.map(f => faces[f].samples[4].lab));
        const real = f => FACE_OF_COLOR[names[M.FACES.indexOf(f)]];
        const renamed = M.FACES.filter(f => real(f) !== f);
        if (renamed.length) {
          const moved = M.FACES.map(f => [real(f), faces[f]]);
          M.FACES.forEach(f => { delete faces[f]; });
          moved.forEach(([g, e]) => { faces[g] = e; });
          if (last) last = real(last);
        }
        const keyed = {}, expected = {};
        M.FACES.forEach(f => { keyed[f] = faces[f].samples; expected[f] = faces[f].expected; });
        const { colors, uncertain } = V.classify(keyed);
        return Object.assign(orient(colors, uncertain, expected), { renamed });
      },
    };
  }
  const slotOfTop = hold => FACE_OF_COLOR[M.centerColor(M.applyMoves(M.SOLVED, hold), 'U')];

  // Live camera: capture once the same face has been found in about the same place for `needed`
  // frames in a row. A fallback detection, no capturable face, another face or movement of more than
  // `tolerance` (fraction of the face size) starts the count again.
  function createSteadiness({ needed = 6, tolerance = 0.06 } = {}) {
    let last = null, count = 0, face = null;
    const reset = () => { last = null; count = 0; face = null; };
    return {
      push(found, f) {
        if (!found || found.method !== 'grid' || !f) { reset(); return false; }
        if (f !== face) { reset(); face = f; }
        const [a, b] = found.corners;
        const size = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const moved = last ? Math.max(...found.corners.map((p, k) => Math.hypot(p[0] - last[k][0], p[1] - last[k][1]))) / size : Infinity;
        count = moved <= tolerance ? count + 1 : 1;
        last = found.corners.map(p => p.slice());
        return count >= needed;
      },
      reset,
      progress: () => Math.min(1, count / needed),
    };
  }

  return { QUARTER, turnFace, faceForCenter, turnToFront, photoTurns, orient, createScan, createSteadiness };
});
