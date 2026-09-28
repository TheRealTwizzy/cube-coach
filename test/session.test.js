const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/cube.js');
const Pat = require('../js/patterns.js');
const S = require('../js/session.js');
const Fast = require('../js/fast.js');
const Cube = require('../vendor/cubejs/cube.js');
require('../vendor/cubejs/solve.js');
Cube.initSolver();
const answer = input => Fast.solveWith(Cube, input).map(st => st.move);

const flush = () => new Promise(r => setImmediate(r));
const FROM = M.applyMoves(M.SOLVED, "R U F' L2 D B'");
const picture = name => Pat.entries().find(e => e.name === name).state;

// The solver is a stub the test resolves by hand, so timing and stale replies can be controlled.
function harness(status = 'ready') {
  const calls = [], pending = [];
  let st = status;
  const timers = [];
  const r = S.createRouteRequester({
    getStatus: () => st,
    solve: input => new Promise((resolve, reject) => { calls.push(input); pending.push({ resolve, reject }); }),
    onChange: () => {},
    schedule: fn => { timers.push(fn); return timers.length - 1; },
    cancel: id => { timers[id] = null; },
  });
  const fire = async () => { const fns = timers.splice(0); fns.forEach(fn => fn && fn()); await flush(); };
  return { r, calls, pending, fire, setStatus: s => { st = s; } };
}

test('asking twice for the same route within the debounce still solves it once', async () => {
  const h = harness();
  const pic = picture('Cube in the cube');
  h.r.request(FROM, pic);
  h.r.request(FROM, pic); // double click
  assert.equal(h.r.get().status, 'queued');
  await h.fire();
  assert.equal(h.calls.length, 1, 'one solve');
  assert.equal(h.r.get().status, 'loading');
  const plan = h.r.get().plan;
  h.pending[0].resolve(answer(plan.input));
  await flush();
  assert.equal(h.r.get().status, 'ready');
  assert.ok(Pat.checkRoute(FROM, plan, h.r.get().moves));
});

test('a reply for an older request is dropped', async () => {
  const h = harness();
  h.r.request(FROM, picture('Python'));
  await h.fire();
  h.r.request(FROM, picture('Anaconda'));
  await h.fire();
  const newest = h.r.get().plan;
  h.pending[0].resolve(['R']); // late answer for Python
  await flush();
  assert.equal(h.r.get().status, 'loading');
  h.pending[1].resolve(answer(newest.input));
  await flush();
  assert.equal(h.r.get().status, 'ready');
  assert.equal(h.r.get().key, FROM.join('') + '|' + picture('Anaconda').join(''));
});

test('waits while the solver warms up, then runs when asked again', async () => {
  const h = harness('loading');
  h.r.request(FROM, picture('Wire'));
  assert.equal(h.r.get().status, 'waiting');
  h.setStatus('ready');
  h.r.request(FROM, picture('Wire'));
  await h.fire();
  assert.equal(h.calls.length, 1);
});

test('solver errors keep their code for the message', async () => {
  const h = harness();
  h.r.request(FROM, picture('Wire'));
  await h.fire();
  const err = new Error('stopped');
  err.code = 'SOLVER_RESTARTING';
  h.pending[0].reject(err);
  await flush();
  assert.equal(h.r.get().status, 'error');
  assert.equal(h.r.get().code, 'SOLVER_RESTARTING');
});

test('Solve loads "my cube now" only if it changed after the net was last edited', () => {
  const p = S.createPhysical();
  const cube1 = FROM, net = M.applyMoves(M.SOLVED, 'R U'), later = M.SOLVED;
  assert.equal(p.shouldLoadIntoNet(cube1), false, 'nothing known yet');
  p.set(cube1, 'Your checked cube');
  p.netChanged(); // the checked net is the reference
  p.set(later, 'End of your solve'); // playback moved on
  assert.equal(p.shouldLoadIntoNet(cube1), true);
  p.netChanged(); // user paints a new cube
  assert.equal(p.shouldLoadIntoNet(net), false, 'unsaved painting is kept');
  p.set(M.applyMoves(M.SOLVED, 'U'), 'End of Wire');
  assert.equal(p.shouldLoadIntoNet(net), true);
  assert.equal(p.shouldLoadIntoNet(M.applyMoves(M.SOLVED, 'U')), false, 'already the same');
});

test('playback tracks the real cube, except a preview from a solved cube that has not moved yet', () => {
  const label = o => S.trackPlayback(Object.assign({ total: 20, name: 'Superflip' }, o));
  assert.equal(label({ pos: 0, kind: 'pattern', startIsPhysical: false }), null);
  assert.equal(label({ pos: 3, kind: 'pattern', startIsPhysical: false }), 'After turn 3 of 20 · Superflip');
  assert.equal(label({ pos: 0, kind: 'pattern', startIsPhysical: true }), 'Start of Superflip');
  assert.equal(label({ pos: 20, kind: 'pattern', startIsPhysical: true }), 'End of Superflip');
  assert.equal(label({ pos: 0, kind: 'solve', startIsPhysical: true, name: '' }), 'Your checked cube');
  assert.equal(label({ pos: 20, kind: 'solve', startIsPhysical: true, name: '' }), 'End of your solve');
});
