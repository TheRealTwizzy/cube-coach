// Cube model: 54 stickers in U R F D L B order (9 per face, row-major Kociemba net).
// Face turns and whole-cube rotations are derived from 3D geometry, never typed by hand.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const NORMALS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const COLORS = ['w', 'r', 'g', 'y', 'o', 'b']; // standard hold: white top, green front
  const SOLVED = COLORS.flatMap(c => Array(9).fill(c));

  // Grid (row, col) of a face as seen in the net -> cubie position. x = right, y = up, z = front.
  function gridToPos(face, r, c) {
    switch (face) {
      case 'U': return [c - 1, 1, r - 1];
      case 'R': return [1, 1 - r, 1 - c];
      case 'F': return [c - 1, 1 - r, 1];
      case 'D': return [c - 1, -1, 1 - r];
      case 'L': return [-1, 1 - r, c - 1];
      case 'B': return [1 - c, 1 - r, -1];
    }
  }

  const FACELETS = [];
  FACES.forEach((face, fi) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        FACELETS.push({ index: fi * 9 + r * 3 + c, face, row: r, col: c, pos: gridToPos(face, r, c), normal: NORMALS[face].slice() });
      }
    }
  });

  const keyOf = (pos, normal) => pos.join(',') + '|' + normal.join(',');
  const LOOKUP = new Map(FACELETS.map(f => [keyOf(f.pos, f.normal), f.index]));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // Rotate v by -90 degrees about unit axis a: clockwise when looking at the +a side.
  function rotateCW(v, a) {
    const d = dot(a, v), c = cross(a, v);
    return [a[0] * d - c[0], a[1] * d - c[1], a[2] * d - c[2]];
  }

  // perm[i] = index the sticker at i moves to.
  const quarterPerm = (axis, inLayer) => FACELETS.map(f =>
    inLayer(f.pos) ? LOOKUP.get(keyOf(rotateCW(f.pos, axis), rotateCW(f.normal, axis))) : f.index);
  const IDENTITY = FACELETS.map(f => f.index);
  const compose = (p, q) => p.map(d => q[d]); // p, then q

  // Every move's turning axis and layer, used for both the permutations and the animation.
  // Face turns U..B, wide turns u..b (face + middle), slices M E S (turn like L, D, F), rotations x y z.
  const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const LAYERS = {};
  FACES.forEach(f => {
    const n = NORMALS[f];
    LAYERS[f] = { axis: n, inLayer: p => dot(p, n) > 0.5 };
    LAYERS[f.toLowerCase()] = { axis: n, inLayer: p => dot(p, n) > -0.5 };
  });
  LAYERS.M = { axis: NORMALS.L, inLayer: p => Math.abs(p[0]) < 0.5 };
  LAYERS.E = { axis: NORMALS.D, inLayer: p => Math.abs(p[1]) < 0.5 };
  LAYERS.S = { axis: NORMALS.F, inLayer: p => Math.abs(p[2]) < 0.5 };
  Object.keys(AXES).forEach(a => { LAYERS[a] = { axis: AXES[a], inLayer: () => true }; });

  const BASE = {};
  Object.keys(LAYERS).forEach(b => { BASE[b] = quarterPerm(LAYERS[b].axis, LAYERS[b].inLayer); });

  const PERMS = {};
  Object.keys(BASE).forEach(b => {
    const p1 = BASE[b], p2 = compose(p1, p1);
    PERMS[b] = p1;
    PERMS[b + '2'] = p2;
    PERMS[b + "'"] = compose(p2, p1);
  });
  const MOVES = Object.keys(PERMS);

  function parseMoves(moves) {
    const list = Array.isArray(moves) ? moves : String(moves).trim().split(/\s+/).filter(Boolean);
    list.forEach(m => { if (!PERMS[m]) throw new Error('Unknown move: ' + m); });
    return list;
  }
  function applyPerm(state, perm) {
    const out = new Array(54);
    for (let i = 0; i < 54; i++) out[perm[i]] = state[i];
    return out;
  }
  function applyMove(state, move) {
    const p = PERMS[move];
    if (!p) throw new Error('Unknown move: ' + move);
    return applyPerm(state, p);
  }
  const applyMoves = (state, moves) => parseMoves(moves).reduce(applyMove, state);
  const sequencePerm = moves => parseMoves(moves).reduce((p, m) => compose(p, PERMS[m]), IDENTITY);
  const invertMove = m => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : m + "'");
  const invertMoves = moves => parseMoves(moves).slice().reverse().map(invertMove);

  const centerColor = (state, face) => state[FACES.indexOf(face) * 9 + 4];
  function isSolved(state) {
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 9; k++) if (state[f * 9 + k] !== state[f * 9 + 4]) return false;
    }
    return true;
  }
  function toFaceletString(state) {
    const faceOfColor = {};
    FACES.forEach(f => { faceOfColor[centerColor(state, f)] = f; });
    return state.map(c => faceOfColor[c]).join('');
  }

  // Pieces as sticker-index lists. Reference sticker first (U/D, else F/B);
  // corners then follow one fixed chirality so twist is well defined.
  const byPos = new Map();
  FACELETS.forEach(f => {
    const k = f.pos.join(',');
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k).push(f.index);
  });
  const isUD = i => FACELETS[i].face === 'U' || FACELETS[i].face === 'D';
  const isFB = i => FACELETS[i].face === 'F' || FACELETS[i].face === 'B';
  const EDGES = [], CORNERS = [];
  byPos.forEach(ids => {
    if (ids.length === 2) {
      const a = ids.find(isUD) ?? ids.find(isFB);
      EDGES.push([a, ids.find(i => i !== a)]);
    } else if (ids.length === 3) {
      const a = ids.find(isUD), rest = ids.filter(i => i !== a);
      const p = FACELETS[a].pos, n = FACELETS[a].normal;
      const b = rest.find(i => dot(cross(n, FACELETS[i].normal), p) < 0);
      CORNERS.push([a, b, rest.find(i => i !== b)]);
    }
  });

  function randomScramble(length = 25, rng = Math.random) {
    const out = [], suffixes = ['', '2', "'"];
    while (out.length < length) {
      const f = FACES[Math.floor(rng() * 6)];
      if (out.length && out[out.length - 1][0] === f) continue;
      out.push(f + suffixes[Math.floor(rng() * 3)]);
    }
    return out;
  }

  // For animation: rotate the cubies where inLayer(pos) by angle (right-handed) about axis.
  function moveGeometry(move) {
    if (!PERMS[move]) throw new Error('Unknown move: ' + move);
    const layer = LAYERS[move[0]], suffix = move.slice(1);
    const turns = suffix === '2' ? 2 : suffix === "'" ? -1 : 1;
    return { axis: layer.axis.slice(), angle: -turns * Math.PI / 2, inLayer: layer.inLayer };
  }

  // Whole-cube orientations: the 24 ways to hold a cube, as rotation sequences.
  const ROTATIONS = [];
  ['', 'x', 'x2', "x'", 'z', "z'"].forEach(a => ['', 'y', 'y2', "y'"].forEach(b => ROTATIONS.push([a, b].filter(Boolean))));
  const centerKey = state => FACES.map(f => centerColor(state, f)).join('');
  const rotationTo = (state, key) => ROTATIONS.find(r => centerKey(applyMoves(state, r)) === key) || null;

  // Reads move sequences as people paste them: curly quotes, 2', Rw, no spaces, (groups)N.
  function parseAlgorithm(text, opts) {
    const maxMoves = (opts && opts.maxMoves) || 1000;
    const src = String(text || '').replace(/[’‘′´`]/g, "'");
    const stack = [[]];
    let i = 0, moveNo = 0;
    const fail = error => ({ error, at: i });
    const tooLong = () => stack.reduce((n, g) => n + g.length, 0) > maxMoves;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '(') { stack.push([]); i++; continue; }
      if (ch === ')') {
        if (stack.length === 1) return fail("There's a ')' without a matching '('.");
        const group = stack.pop();
        i++;
        const rep = /^[x×*]?(\d+)/.exec(src.slice(i));
        const times = rep ? Number(rep[1]) : 1;
        if (rep) i += rep[0].length;
        if (src[i] === "'") return fail("Inverting a group like (R U)' isn't supported. Write its moves out in reverse instead.");
        const total = stack.reduce((n, g) => n + g.length, 0) + group.length * times;
        if (group.length && total > maxMoves) return fail(`That's more than ${maxMoves} moves.`);
        for (let k = 0; group.length && k < times; k++) stack[stack.length - 1].push(...group);
        continue;
      }
      if (ch === '[' || ch === ']') return fail('Brackets like [R, U] are not supported. Write the moves out in full.');
      moveNo++;
      const rest = src.slice(i);
      const m = /^([URFDLBMESurfdlbxyz])(w?)(2'|'2|2|')?/.exec(rest);
      if (!m || (m[2] && !'URFDLB'.includes(m[1])) || /^\d/.test(rest.slice(m[0].length))) {
        const bad = (/^[^\s()]+/.exec(rest) || [ch])[0];
        const hint = /^[mes]/.test(bad) ? ' Slice moves are written in capitals: M, E, S.' : '';
        return fail(`Unknown move '${bad}' (move ${moveNo}).${hint}`);
      }
      const base = m[2] ? m[1].toLowerCase() : m[1];
      const suffix = m[3] === "2'" || m[3] === "'2" ? '2' : m[3] || '';
      stack[stack.length - 1].push(base + suffix);
      if (tooLong()) return fail(`That's more than ${maxMoves} moves.`);
      i += m[0].length;
    }
    if (stack.length > 1) return fail("A '(' is never closed.");
    if (!stack[0].length) return fail("Enter at least one move, like R U R' U'.");
    return { moves: stack[0] };
  }

  return {
    FACES, NORMALS, COLORS, SOLVED, FACELETS, EDGES, CORNERS, PERMS, MOVES,
    parseMoves, applyPerm, applyMove, applyMoves, sequencePerm, invertMove, invertMoves,
    centerColor, isSolved, toFaceletString, randomScramble, moveGeometry,
    ROTATIONS, centerKey, rotationTo, parseAlgorithm,
  };
});
