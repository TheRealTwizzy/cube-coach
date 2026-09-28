const test = require('node:test');
const assert = require('node:assert/strict');
const Cube = require('../vendor/cubejs/cube.js');
require('../vendor/cubejs/solve.js');
const M = require('../js/cube.js');
const Fast = require('../js/fast.js');
const { seededRng } = require('./helpers.js');

test('our move conventions match cubejs', () => {
  const rng = seededRng(3);
  for (let n = 0; n < 50; n++) {
    const alg = M.randomScramble(20, rng);
    const ours = M.toFaceletString(M.applyMoves(M.SOLVED, alg));
    assert.equal(ours, new Cube().move(alg.join(' ')).asString(), alg.join(' '));
  }
});

test('toSteps shapes steps', () => {
  assert.deepEqual(Fast.toSteps(''), []);
  const steps = Fast.toSteps("R U' F2");
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[1], { move: "U'", stage: 1, stageName: 'Shortest solution', algName: '', alg: '', algPos: 1, algLen: 3, note: '' });
});

test('solves random scrambles in at most 22 turns', () => {
  Cube.initSolver();
  assert.deepEqual(Fast.solveWith(Cube, M.SOLVED), []);
  const rng = seededRng(4);
  for (let n = 0; n < 50; n++) {
    const start = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    const steps = Fast.solveWith(Cube, start);
    assert.ok(steps.length <= 22, `${steps.length} turns`);
    assert.ok(M.isSolved(M.applyMoves(start, steps.map(s => s.move))), `scramble ${n}`);
  }
});

test('solves a cube entered in a non-standard hold', () => {
  const start = M.applyMoves(M.SOLVED, "R U F' L2 D B' x y'");
  const steps = Fast.solveWith(Cube, start);
  assert.ok(M.isSolved(M.applyMoves(start, steps.map(s => s.move))));
});
