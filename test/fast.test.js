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

// --- warm-up and worker lifecycle, with a fake Worker and a fake cubejs ---
const wait = ms => new Promise(r => setTimeout(r, ms));
const SCRAMBLED = M.applyMoves(M.SOLVED, "R U F'");
class FakeWorker {
  constructor(url) { this.url = url; this.posted = []; this.terminated = false; FakeWorker.last = this; }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage({ data }); }
  crash() { this.onerror({ preventDefault() {} }); }
}
const fakeCube = { initSolver() {}, fromString: () => ({ solve: () => "L2 B'" }) };

test('worker path: loads the worker file, goes ready, solves through the worker', async () => {
  const s = Fast.create({ Worker: FakeWorker, workerUrl: 'js/solver-worker.js', getCube: () => fakeCube });
  s.init();
  assert.equal(s.getStatus(), 'loading');
  assert.equal(FakeWorker.last.url, 'js/solver-worker.js');
  FakeWorker.last.emit({ type: 'ready' });
  assert.equal(s.getStatus(), 'ready');
  const pending = s.solve(SCRAMBLED);
  const msg = FakeWorker.last.posted[0];
  assert.equal(msg.facelets, M.toFaceletString(SCRAMBLED));
  FakeWorker.last.emit({ type: 'solution', id: msg.id, solution: "F U' R'" });
  assert.deepEqual((await pending).map(st => st.move), ['F', "U'", "R'"]);
});

test('a warm-up that never finishes falls back to the main page', async () => {
  const s = Fast.create({ Worker: FakeWorker, workerUrl: 'w.js', getCube: () => fakeCube, timeoutMs: 20 });
  s.init();
  const w = FakeWorker.last;
  await wait(150);
  assert.equal(w.terminated, true);
  assert.equal(s.getStatus(), 'ready');
  assert.deepEqual((await s.solve(SCRAMBLED)).map(st => st.move), ['L2', "B'"]);
});

test('a worker crash after ready rejects with a restart error, then recovers', async () => {
  const s = Fast.create({ Worker: FakeWorker, workerUrl: 'w.js', getCube: () => fakeCube });
  s.init();
  FakeWorker.last.emit({ type: 'ready' });
  const pending = s.solve(SCRAMBLED);
  FakeWorker.last.crash();
  await assert.rejects(pending, err => err.code === 'SOLVER_RESTARTING');
  await wait(150);
  assert.equal(s.getStatus(), 'ready');
  assert.deepEqual((await s.solve(SCRAMBLED)).map(st => st.move), ['L2', "B'"]);
});

test('without workers it warms up on the main page; without cubejs it fails', async () => {
  const s = Fast.create({ getCube: () => fakeCube });
  s.init();
  await wait(150);
  assert.equal(s.getStatus(), 'ready');
  const none = Fast.create({ getCube: () => undefined });
  none.init();
  assert.equal(none.getStatus(), 'failed');
});

test('solves a cube entered in a non-standard hold', () => {
  const start = M.applyMoves(M.SOLVED, "R U F' L2 D B' x y'");
  const steps = Fast.solveWith(Cube, start);
  assert.ok(M.isSolved(M.applyMoves(start, steps.map(s => s.move))));
});
