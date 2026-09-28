// Pattern library and routes. Patterns are move sequences from a solved cube; a route takes
// any cube straight to a pattern by relabeling pieces so the pattern counts as "solved" and
// handing that to the shortest solver. Browser-free; tested in Node.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = isNode ? factory(require('./cube.js'), require('./describe.js')) : factory(root.CubeModel, root.CubeDescribe);
  if (isNode) module.exports = api;
  else root.CubePatterns = api;
})(typeof self !== 'undefined' ? self : this, function (M, D) {
  'use strict';

  const SOURCE = { label: 'ruwix.com', url: 'https://ruwix.com/the-rubiks-cube/rubiks-cube-patterns-algorithms/' };
  // [name, algorithm, aliases?] in the order of the ruwix.com pattern gallery (both pages).
  const LIBRARY = [
    ["The Superflip", "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"],
    ["The easy checkerboard", "M2 E2 S2"],
    ["SpeedSolving", "R' L' U2 F2 D2 F2 R L B2 U2 B2 U2"],
    ["3 sides solved", "U2 D R' D B' L2 B D' R L2 U2 B2 L2 B2 D R2 L2 D R2"],
    ["All flags & crests", "B2 U' B2 L2 U B2 U R2 B2 U' L' R' B D U' L2 F2 R'"],
    ["Wire", "R L F B R L F B R L F B R2 B2 L2 R2 B2 L2"],
    ["Checkerboard in the cube", "B D F' B' D L2 U L U' B D' R B R D' R L' F U2 D"],
    ["Perfect Scramble", "U F' L' U' R2 F' R2 B' U' R F' U F D' L2 F2 L2 U'"],
    ["( ! )", "U' F2 R' L' U' B R2 D B U' R2 L B2 D' B2 U F2 B2 U' L2 B2 L2"],
    ["Minority cross", "L2 D' B2 L2 B2 D' F2 D U' B2 L B2 F' L B' F U' F' U L2"],
    ["Perpendicular lines", "R2 U2 L2 R2 U2 L2 M2"],
    ["Flipped tips", "U B D' F2 D B' U' R2 D F2 D' R2 D F2 D' R2"],
    ["Plus minus", "U2 R2 L2 U2 R2 L2"],
    ["Tablecloth", "R L U2 F' U2 D2 R2 L2 F' D2 F2 D R2 L2 F2 B2 D B2 L2"],
    ["Deckerboard", "U D R L' F' B U D' R2 U R2 L2 D2 F2 B2 D"],
    ["Spiral pattern", "L' B' D U R U' R' D2 R2 D L D' L' R' F U"],
    ["Fruit bowl", "B2 L2 F2 R2 F2 R2 D U B2 U2 B' F' L' R' D' U'"],
    ["Flower", "R2 D2 R2 U2 R2 F2 U2 D2 F2 U2"],
    ["Vertical stripes", "F U F R L2 B D' R D2 L D' B R2 L F U F"],
    ["Gift box", "U B2 R2 B2 L2 F2 R2 D' F2 L2 B F' L F2 D U' R2 F' L' R'"],
    ["Opposite corners", "R L U2 F2 D2 F2 R L F2 D2 B2 D2"],
    ["Cross", "R2 L' D F2 R' D' R' L U' D R D B2 R' U D2"],
    ["4 crosses", "U2 R2 L2 F2 B2 D2 L2 R2 F2 B2"],
    ["Union Jack", "U F B' L2 U2 L2 F' B U2 L2 U"],
    ["Cube in the cube", "F L F U' R U F2 L2 U' L' B D' B' L2 U"],
    ["Cube in a cube in a cube", "U' L' U' F' R2 B' R F U B2 U B' L U' F U R F'"],
    ["Anaconda", "L U B' U' R L' B R' F B' D R D' F'"],
    ["Python", "F2 R' B' U R' L F' L F' B D' R B L2"],
    ["Black mamba", "R D L F' R L' D R' U D' B U' R' D'"],
    ["Green mamba", "R D R F R' F' B D R' U' B' U D2"],
    ["Tangled", "F B U D F B U D F B U D F2 B2"],
    ["Four spots", "F2 B2 U D' R2 L2 U D'"],
    ["Six spots", "U D' R L' F B' U D'"],
    ["Twister", "F R' U L F' L' F U' R U L' U' L F'"],
    ["Kilt (Scottish skirt)", "U' R2 L2 F2 B2 U' R L F B' U F2 D2 R2 L2 F2 U2 F2 U' F2"],
    ["Tetris", "L R F B U' D' L' R'", ["Yan Ying"]],
    ["Don't cross line", "F2 L2 R2 B2 E2"],
    ["Hi", "M2 U2 M2 U2"],
    ["Hi all around", "U2 R2 F2 U2 D2 F2 L2 U2"],
    ["Displaced Motif", "L2 B2 D' B2 D L2 U R2 D R2 B U R' F2 R U' B' U'"],
    ["Are you high?", "L R' U2 D2 L' R U2 D2 R2 L2"],
    ["C U around", "U' B2 U L2 D L2 R2 D' B' R D' L R' B2 U2 F' L' U'"],
    ["Order in chaos", "B L2 B' U2 B F2 U L U B U' R U' B F U' R D R B' U'"],
    ["Evenly distributed", "D' B2 D' L2 R2 D B2 L2 D' B2 L R' F' L2 D U' F2 R' D' U'"],
    ["The hole", "R L' F' B D U'"],
    ["No entry", "U' L' B R L' D' L B' U F2 R2 B2 D2 B2 R2 B2 D B2"],
    ["Plus", "B2 F2 R2 U2 B2 F2 R2 U2 R2 U2"],
    ["3C3W", "D L B' L L F L' B' U D' R L' F B D L'"],
    ["Pong", "U R2 F2 B2 L2 U2 D R2 F2 B2 L2"],
    ["Spun T's", "U' L2 F2 L2 F2 D' L2 F' L2 F' D U2 L' B L B' U'"],
    ["Wifi Downstairs", "R U' R F2 R' U R F2 U' B2 U D R2 U' L2 D' L2"],
    ["Opposite pillars", "R2 F2 L2 R2 F2 L2"],
    ["Viaduct", "R2 U2 L2 D B2 L2 B2 R2 D' U L' D F' U' R2 F' U B2 U2 R'"],
    ["Solved in scrambled", "U2 L' U2 L' U2 F2 D L F' L F R2 D' B2 D' L2 D' L2 F2 R2"],
    ["Hi Ohio", "U2 F2 L2 R2 F2 U2"],
    ["Staircase", "L2 F2 D' L2 B2 D' U' R2 B2 U' L' B2 L D L B' D L' U"],
    ["Wrapped 2x2", "D' B2 F2 L2 U' F2 R2 D F2 U2 L' B R' U' L' F D' F L D2"],
    ["Antipodal chaos", "U2 L2 U2 L2 U2 F2 R2 F2 U2 F2"],
    ["Flower field", "M S M' S' R2 L2 U2 D2 F2 B2"],
    ["C spirals", "B' F' L2 D2 B' F U2 R2 F2"],
    ["Worms", "U' F2 L2 U D2 F2 B2 U F2 L2 D"],
    ["Glider", "D2 R2 F2 R2 U2 B2 D2 F2 L2 U2 R2 U2"],
    ["Quote", "U2 F2 D2 B2 R2 U2 B2 R2 U2 R2"],
    ["Matching pictures", "R' D2 R L D2 L'"],
    ["Loose strap", "F2 U2 B2 U2 F2 U2"],
    ["Doubler", "R L U2 R L' D2 R2 F2 U2 F2 U2 L2 F2 U2 L2"],
    ["3T", "B U2 L2 F2 R2 F D2 F2 R2 F' R2 U2"],
    ["4 T", "F2 D2 F' L2 D2 U2 R2 B' U2 F2"],
    ["6 T", "F2 R2 U2 F' B D2 L2 F B"],
    ["ZZ-Line", "R L U2 R L' U2 F2 R2 U2 F2 D2 B2 L2 U2 L2"],
    ["Checker zigzag", "R2 L2 F2 B2 U F2 B2 U2 F2 B2 U"],
    ["Exchanged duck feet", "U F R2 F' D' R U B2 U2 F' R2 F D B2 R B'"],
    ["Stripe dot solved", "D U B2 F2 D' U'"],
    ["Picnic", "D2 R2 L2 F2 B2"],
    ["Percent sign %", "R L U2 R L' U2 F2 L2 U2 F2 U2 F2 R2 U2 R2"],
    ["Mirror", "U D F2 B2 U' D' R2 L2 B2"],
    ["Plus minus check", "U D R2 L2 U D R2 L2"],
    ["Facing checkerboards", "U2 F2 U2 F2 B2 U2 F2 D2"],
    ["Hi again", "U2 D2 L2 U2 D2 R2 F2 B2 L2 F2 B2 R2 U2 D2 F2 U2 D2 B2"],
    ["4 plus 2 dots", "F U2 D2 R L U' D F B R U2 R2 U2 F2 L2 U2 F2 L2 B2"],
    ["Rockets", "U R2 F2 R2 U' D F2 R2 F2 D"],
    ["Slash", "R L F B R L F B R L F B"],
    ["The pillars", "L2 R2 B2 F2"],
    ["Twisted duck feet", "F R' B R U F' L' F' U2 L' U' D2 B D' F B' U2"],
    ["Ron's cube in a cube", "F D' F' R D F' R' D R D L' F L D R' F D'"],
    ["Headlights", "U2 F2 U2 D2 B2 D2"],
    ["Crossing snake", "R L U2 R L' U2 F2 R2 D2 B2 D2 B2 L2 D2 R2"],
    ["Cage", "L U F2 R L' U2 B' U D B2 L F B' R' L F' R"],
    ["4 crosses II", "F2 B2 R F2 B2 R F2 B2 R F2 B2 R F2 B2 R F2 B2 R"],
    ["Pyraminx", "D L' U R' B' R B U2 D B D' B' L U D'"],
    ["Edge triangle", "U B2 U' F' U' D L' D2 L U D' F D' L2 B2 D'"],
    ["Twisted rings", "F D F' D2 L' B' U L D R U L' F' U L U2"],
    ["Exchanged rings", "B' U' B' L' D B U D2 B U L D' L' U' L2 D"],
    ["Twisted chicken feet", "F L' D F' U' B U F U' F R' F2 L U' R' D2"],
    ["Exchanged chicken feet", "F L' D' B' L F U F' D' F L2 B' R' U L2 D' F"],
    ["Twin Peaks", "U L2 B2 R2 U R2 D' U L F' U L' D B' U L B' L R' U'"],
    ["Corner pyramid", "U' D B R' F R B' L' F' B L F R' B' R F' U' D"],
    ["Twisted peaks", "F B' U F U F U L B L2 B' U F' L U L' B"],
    ["Exchanged peaks", "F U2 L F L' B L U B' R' L' U R' D' F' B R2"],
    ["Megatron", "U L D R' F D2 R2 F2 R' F D2 B L2 U2 D' R2 U R2 B2 L2"],
    ["Six-two-one", "U B2 D2 L B' L' U' L' B D2 B2"],
    ["Yin Yang", "R L B F R L U' D' F' B' U D"],
    ["Henry's snake", "R2 F2 U' D' B2 L2 F2 L2 U D R2 F2"],
    ["Snake eyes", "R2 U2 R2 U2 R2 U2"],
    ["Glitch", "F' L' B' R' U' R B L F U"],
    ["Weirdo", "R' F' U F2 U' F R' F2 D2 F2 D2 F2 D F2 R2 U2"],
    ["Twisted corners", "F U D R2 F2 U' B U B U R2 B' U L2 U B2 U2 F2 L2 U'"],
    ["Quick maths 1+1", "R L F2 U2 R' L' F2 U2 R2 F2 U R2 L2 F2 B2 D'"],
    ["Scrambled 2x2s", "U2 B' R U' L F B2 U F' U F2 L2 U D B2 L2 B2 L2"],
  ].map(([name, alg, aliases]) => ({ name, alg, aliases: aliases || [] }));

  const START_NOTE = 'Start from a solved cube, white on top, green facing you.';
  const SOLVED_KEY = M.centerKey(M.SOLVED);

  // Same pattern however the cube is held: turn it to the standard hold first.
  function canonicalKey(state) {
    const r = M.rotationTo(state, SOLVED_KEY);
    return (r ? M.applyMoves(state, r) : state).join('');
  }

  let cache = null;
  function entries() {
    if (!cache) {
      cache = LIBRARY.map((e, index) => {
        const { moves, error } = M.parseAlgorithm(e.alg);
        if (error) throw new Error(`${e.name}: ${error}`);
        const state = M.applyMoves(M.SOLVED, moves);
        return { index, name: e.name, aliases: e.aliases, alg: moves.join(' '), moves, state, key: canonicalKey(state) };
      });
    }
    return cache;
  }
  const findByKey = key => entries().find(e => e.key === key) || null;

  function fromAlgorithm(text) {
    const parsed = M.parseAlgorithm(text);
    if (parsed.error) return { error: parsed.error };
    return { moves: parsed.moves, state: M.applyMoves(M.SOLVED, parsed.moves) };
  }

  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  function matches(entry, query) {
    const hay = normalize([entry.name].concat(entry.aliases || []).join(' '));
    return normalize(query).split(' ').filter(Boolean).every(t => hay.includes(t));
  }

  // For each sticker, the index where it belongs on a solved cube with the same centers.
  function homes(state) {
    const home = i => M.centerColor(state, M.FACELETS[i].face);
    const h = new Array(54);
    M.FACES.forEach((f, fi) => { h[fi * 9 + 4] = fi * 9 + 4; });
    for (const slots of [M.EDGES, M.CORNERS]) {
      for (const slot of slots) {
        const cols = slot.map(i => state[i]), n = slot.length;
        const ref = slots.find(r => {
          const want = r.map(home), t = cols.indexOf(want[0]);
          return t >= 0 && want.every((c, m) => cols[(t + m) % n] === c);
        });
        if (!ref) return null;
        const t = cols.indexOf(home(ref[0]));
        ref.forEach((j, m) => { h[slot[(t + m) % n]] = j; });
      }
    }
    return h;
  }

  // Route from a cube to a picture: target = the picture turned to match the cube's centers
  // (or repainted in the cube's colors for a non-standard color scheme); input = the cube with
  // pieces renamed so the target reads as solved. Solving input gives the route.
  function planRoute(from, picture) {
    let rotation = M.rotationTo(picture, M.centerKey(from)), target, relabeled = false;
    if (rotation) {
      target = M.applyMoves(picture, rotation);
    } else {
      const standard = M.applyMoves(picture, M.rotationTo(picture, SOLVED_KEY) || []);
      target = standard.map(c => M.centerColor(from, M.FACES[M.COLORS.indexOf(c)]));
      relabeled = true;
    }
    const hFrom = homes(from), hTarget = homes(target);
    if (!hFrom || !hTarget) throw new Error('That cube cannot be routed: a piece was not recognized.');
    const where = new Array(54);
    hTarget.forEach((j, i) => { where[j] = i; });
    const solvedColor = i => M.centerColor(from, M.FACELETS[i].face);
    const input = from.map((_, i) => solvedColor(where[hFrom[i]]));
    return { input, target, rotation, relabeled };
  }
  const checkRoute = (from, plan, moves) => M.applyMoves(from, moves).join('') === plan.target.join('');

  // What to tell the user when a pattern playback ends.
  function endMessage({ final, picture, relabeled }) {
    if (M.isSolved(picture)) return 'This sequence brings the cube back to solved.';
    if (relabeled) return "Keep holding the cube as it is. Its colors differ from the picture's, so the pattern shows in your cube's own colors.";
    return D.pictureHint(final, picture) || 'Your cube now shows the pattern.';
  }

  function patternSteps({ name, start, moves, kind }) {
    const states = [start.slice()];
    moves.forEach((m, k) => states.push(M.applyMove(states[k], m)));
    const algName = kind === 'route' ? `Route to ${name}` : name;
    const steps = moves.map((move, k) => {
      const note = [k === 0 && kind === 'solved' ? START_NOTE : '', D.centerChange(states[k], states[k + 1])].filter(Boolean).join(' ');
      return { move, stage: 1, stageName: name, algName, alg: moves.join(' '), algPos: k, algLen: moves.length, note };
    });
    return { states, steps };
  }

  // Isometric picture of the top, front and right faces, drawn from the sticker geometry.
  const round = v => Math.round(v * 1000) / 1000;
  const project = p => [round((p[0] - p[2]) * 0.866), round((p[0] + p[2]) / 2 - p[1])];
  function quad(center, n, half) {
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].filter(a => Math.abs(a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) < 0.5);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      .map(([s, t]) => center.map((c, k) => c + half * (s * axes[0][k] + t * axes[1][k])))
      .map(p => project(p).join(',')).join(' ');
  }
  function thumbnailSvg(state) {
    const shown = ['U', 'F', 'R'];
    const body = shown.map(f => `<polygon class="s-body" points="${quad(M.NORMALS[f].map(v => v * 1.5), M.NORMALS[f], 1.5)}"/>`);
    const stickers = M.FACELETS.filter(f => shown.includes(f.face)).map(f => {
      const center = f.pos.map((v, k) => v + 0.5 * f.normal[k]);
      return `<polygon data-i="${f.index}" class="s-${state[f.index]}" points="${quad(center, f.normal, 0.42)}"/>`;
    });
    return `<svg class="thumb" viewBox="-2.7 -3.1 5.4 6.2" aria-hidden="true">${body.join('')}${stickers.join('')}</svg>`;
  }

  return { SOURCE, LIBRARY, entries, findByKey, fromAlgorithm, canonicalKey, matches, homes, planRoute, checkRoute, endMessage, patternSteps, thumbnailSvg };
});
