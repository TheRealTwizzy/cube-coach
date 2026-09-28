const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const B = require('../js/beginner.js');
const { seededRng } = require('./helpers.js');

function checkSolve(start, label) {
  const steps = B.solve(start);
  let s = start;
  steps.forEach((st, i) => {
    s = M.applyMove(s, st.move);
    const stageEnds = i === steps.length - 1 || steps[i + 1].stage !== st.stage;
    if (stageEnds) {
      for (let k = 0; k <= st.stage; k++) assert.ok(B.stageDone(s, k), `${label}: stage ${k} broken after stage ${st.stage}`);
    }
  });
  assert.ok(M.isSolved(s), `${label}: not solved`);
  return steps;
}

test('already solved cube needs no steps', () => {
  assert.deepEqual(B.solve(M.SOLVED), []);
});

test('first step flips the cube; steps carry labels', () => {
  const start = M.applyMoves(M.SOLVED, "R U F' L2 D B'");
  const steps = checkSolve(start, 'fixed');
  assert.equal(steps[0].move, 'z2');
  assert.equal(steps[0].stage, 0);
  for (const st of steps) {
    assert.ok(st.stage >= 0 && st.stage <= 7);
    assert.equal(typeof st.stageName, 'string');
    assert.ok(st.algName.length > 0);
    assert.equal(st.alg.split(' ')[st.algPos], st.move);
    assert.equal(st.alg.split(' ').length, st.algLen);
  }
  assert.equal(steps.find(st => st.stage === 1).stageName, 'White cross');
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k].stage >= steps[k - 1].stage, 'stages in order');
});

test('solves 300 random scrambles with every stage intact', () => {
  const rng = seededRng(2024);
  let total = 0;
  for (let n = 0; n < 300; n++) {
    const start = M.applyMoves(M.SOLVED, M.randomScramble(25, rng));
    total += checkSolve(start, `scramble ${n}`).length;
  }
  const avg = total / 300;
  assert.ok(avg < 200, `average ${avg.toFixed(1)} turns`);
});

test('solves a cube entered in a non-standard hold', () => {
  checkSolve(M.applyMoves(M.SOLVED, "R U F' L2 D B' x y'"), 'rotated');
});
