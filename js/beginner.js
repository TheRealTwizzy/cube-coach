// Beginner (layer-by-layer) solver. Flips the cube (z2) so the first layer is built on
// the bottom, then solves 7 stages. Stages 2-6 search only over textbook algorithms and
// top-layer turns, so every step is a move a beginner would actually learn.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.BeginnerSolver = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const NAMES = { w: 'white', y: 'yellow', g: 'green', b: 'blue', r: 'red', o: 'orange' };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const faceOf = i => M.FACELETS[i].face;
  const center = (s, f) => M.centerColor(s, f);
  const hasFace = (slot, f) => slot.some(i => faceOf(i) === f);
  const slotSolved = (s, slot) => slot.every(i => s[i] === center(s, faceOf(i)));
  const rightPiece = (s, slot) => {
    const have = slot.map(i => s[i]);
    return slot.every(i => have.includes(center(s, faceOf(i))));
  };

  const D_EDGES = M.EDGES.filter(sl => hasFace(sl, 'D'));
  const D_CORNERS = M.CORNERS.filter(sl => hasFace(sl, 'D'));
  const MID_EDGES = M.EDGES.filter(sl => !hasFace(sl, 'U') && !hasFace(sl, 'D'));
  const U_EDGES = M.EDGES.filter(sl => hasFace(sl, 'U'));
  const U_CORNERS = M.CORNERS.filter(sl => hasFace(sl, 'U'));
  const UFR_TOP = 8; // top sticker of the front-right-top corner
  const TWIST_NOTE = 'The bottom layers will look scrambled while you twist these corners. Keep going: they come back once the last corner is done.';

  function stageDone(s, k) {
    switch (k) {
      case 0: return true;
      case 1: return D_EDGES.every(sl => slotSolved(s, sl));
      case 2: return stageDone(s, 1) && D_CORNERS.every(sl => slotSolved(s, sl));
      case 3: return stageDone(s, 2) && MID_EDGES.every(sl => slotSolved(s, sl));
      case 4: return stageDone(s, 3) && U_EDGES.every(sl => s[sl[0]] === center(s, 'U'));
      case 5: return stageDone(s, 4) && U_EDGES.every(sl => slotSolved(s, sl));
      case 6: return stageDone(s, 5) && U_CORNERS.every(sl => rightPiece(s, sl));
      case 7: return M.isSolved(s);
      default: throw new Error('No stage ' + k);
    }
  }

  // --- Algorithms, relabeled for each of the four side faces acting as "front" ---
  const RIGHT = { F: 'R', R: 'B', B: 'L', L: 'F' };
  const LEFT = { F: 'L', R: 'F', B: 'R', L: 'B' };
  const OPP = { F: 'B', R: 'L', B: 'F', L: 'R' };
  const FRONTS = ['F', 'R', 'B', 'L'];
  function relabel(alg, front) {
    const map = { U: 'U', D: 'D', F: front, R: RIGHT[front], B: OPP[front], L: LEFT[front] };
    return alg.split(' ').map(m => map[m[0]] + m.slice(1)).join(' ');
  }
  function macro(alg, name, isTurn) {
    const moves = alg.split(' ');
    return { name, moves, isTurn: !!isTurn, perm: M.sequencePerm(moves) };
  }
  const repeat = (alg, k) => Array(k).fill(alg).join(' ');
  const TURNS = ['U', 'U2', "U'"].map(m => macro(m, 'Turn the top layer', true));
  const everyFront = (alg, name) => FRONTS.map(f => macro(relabel(alg, f), name));
  const cornerTricks = FRONTS.flatMap(f => {
    const base = relabel("R U R' U'", f);
    return [1, 2, 3, 4, 5].map(k => macro(repeat(base, k), k === 1 ? `Corner trick: ${base}` : `Corner trick: ${base}, ${k} times`));
  });

  const MACROS = {
    2: TURNS.concat(cornerTricks),
    3: TURNS.concat(everyFront("U R U' R' U' F' U F", 'Insert edge to the right'),
      everyFront("U' L' U L U F U' F'", 'Insert edge to the left')),
    4: TURNS.concat(everyFront("F R U R' U' F'", 'Make the top cross')),
    5: TURNS.concat(everyFront("R U R' U R U2 R' U", 'Swap two top edges')),
    6: TURNS.concat(everyFront("U R U' L' U R' U' L", 'Cycle three top corners')),
  };
  const DEPTH = { 2: 4, 3: 4, 4: 6, 5: 6, 6: 5 };

  // Breadth-first search over macros; never two top-layer turns in a row.
  function macroSearch(start, macros, goal, maxDepth) {
    if (goal(start)) return [];
    const seen = new Set([start.join('')]);
    let frontier = [{ s: start, path: [], turn: false }];
    for (let depth = 1; depth <= maxDepth; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const mac of macros) {
          if (mac.isTurn && node.turn) continue;
          const s = M.applyPerm(node.s, mac.perm);
          const key = s.join('');
          if (seen.has(key)) continue;
          seen.add(key);
          const path = node.path.concat([mac]);
          if (goal(s)) return path;
          next.push({ s, path, turn: mac.isTurn });
        }
      }
      frontier = next;
    }
    return null;
  }

  // --- Stage 1: optimal cross by BFS over the 4 bottom edges' sticker positions ---
  const MOVES18 = [];
  M.FACES.forEach(f => MOVES18.push(f, f + '2', f + "'"));
  const EF = M.EDGES.flat(); // 24 edge sticker positions
  const EIDX = new Map(EF.map((f, k) => [f, k]));
  const EMOVE = MOVES18.map(m => EF.map(f => EIDX.get(M.PERMS[m][f])));
  const SIZE = 1 << 20; // 4 positions x 5 bits
  let parent = null, via = null, queue = null;

  function solveCross(s) {
    const bottom = center(s, 'D');
    const starts = [], targets = [];
    FRONTS.forEach(side => {
      const sideColor = center(s, side);
      const home = D_EDGES.find(sl => hasFace(sl, side));
      targets.push(EIDX.get(home.find(i => faceOf(i) === 'D')));
      M.EDGES.forEach(sl => {
        if (s[sl[0]] === bottom && s[sl[1]] === sideColor) starts.push(EIDX.get(sl[0]));
        else if (s[sl[1]] === bottom && s[sl[0]] === sideColor) starts.push(EIDX.get(sl[1]));
      });
    });
    const enc = a => a[0] | (a[1] << 5) | (a[2] << 10) | (a[3] << 15);
    const start = enc(starts), goal = enc(targets);
    if (start === goal) return [];
    if (!parent) { parent = new Int32Array(SIZE); via = new Int8Array(SIZE); queue = new Int32Array(SIZE); }
    parent.fill(-1);
    parent[start] = start;
    let head = 0, tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++];
      const a = cur & 31, b = (cur >> 5) & 31, c = (cur >> 10) & 31, d = (cur >> 15) & 31;
      for (let m = 0; m < 18; m++) {
        const t = EMOVE[m];
        const nxt = t[a] | (t[b] << 5) | (t[c] << 10) | (t[d] << 15);
        if (parent[nxt] !== -1) continue;
        parent[nxt] = cur;
        via[nxt] = m;
        if (nxt === goal) {
          const path = [];
          for (let k = goal; k !== start; k = parent[k]) path.push(MOVES18[via[k]]);
          return path.reverse();
        }
        queue[tail++] = nxt;
      }
    }
    throw new Error('Cross search failed');
  }

  function solve(input) {
    if (M.isSolved(input)) return [];
    const firstColor = NAMES[center(input, 'U')] || 'first'; // ends up on the bottom after z2
    const lastColor = NAMES[center(input, 'D')] || 'last';   // ends up on top
    const stageNames = ['Get ready', cap(`${firstColor} cross`), cap(`${firstColor} corners`), 'Middle layer',
      cap(`${lastColor} cross`), cap(`${lastColor} edges`), cap(`place ${lastColor} corners`), cap(`twist ${lastColor} corners`)];

    const steps = [];
    let s = input.slice();
    const push = (stage, name, moves, note = '') => {
      moves.forEach((move, k) => {
        steps.push({ move, stage, stageName: stageNames[stage], algName: name, alg: moves.join(' '), algPos: k, algLen: moves.length, note });
        s = M.applyMove(s, move);
      });
    };
    const pushPath = (stage, path) => path.forEach(mac => push(stage, mac.name, mac.moves));
    const fail = stage => { throw new Error(`Beginner solver got stuck in stage ${stage} (${stageNames[stage]})`); };

    push(0, 'Flip the whole cube', ['z2']);
    push(1, 'Build the cross', solveCross(s));

    // Stages 2-3: one piece at a time, whichever is quickest next.
    const pieceStage = (k, slots) => {
      for (let guard = 0; guard < 8; guard++) {
        const solved = slots.filter(sl => slotSolved(s, sl));
        if (solved.length === slots.length) return;
        const goal = t => stageDone(t, k - 1) && solved.every(sl => slotSolved(t, sl)) &&
          slots.filter(sl => slotSolved(t, sl)).length > solved.length;
        const path = macroSearch(s, MACROS[k], goal, DEPTH[k]);
        if (!path) fail(k);
        pushPath(k, path);
      }
      fail(k);
    };
    pieceStage(2, D_CORNERS);
    pieceStage(3, MID_EDGES);

    [4, 5, 6].forEach(k => {
      const path = macroSearch(s, MACROS[k], t => stageDone(t, k), DEPTH[k]);
      if (!path) fail(k);
      pushPath(k, path);
    });

    // Stage 7: bring each unsolved top corner to front-right-top, repeat R' D' R D until
    // its top sticker faces up. Only the top layer turns in between.
    const up = center(s, 'U');
    const TURN = ['U', 'U2', "U'"];
    for (let guard = 0; guard < 8; guard++) {
      let k = -1;
      for (let n = 0; n < 4 && k < 0; n++) {
        const t = n ? M.applyMove(s, TURN[n - 1]) : s;
        if (t[UFR_TOP] !== up) k = n;
      }
      if (k < 0) break;
      if (k) push(7, 'Turn the top layer', [TURN[k - 1]]);
      for (let reps = 0; s[UFR_TOP] !== up; reps++) {
        if (reps >= 6) fail(7);
        push(7, "Twist corner: repeat R' D' R D until the top color faces up", ["R'", "D'", 'R', 'D'], TWIST_NOTE);
      }
    }
    if (!M.isSolved(s)) {
      const auf = TURN.find(m => M.isSolved(M.applyMove(s, m)));
      if (!auf) fail(7);
      push(7, 'Line up the top layer', [auf]);
    }
    return steps;
  }

  return { solve, stageDone };
});
