const test = require('node:test');
const assert = require('node:assert/strict');
const { turnMs, createPlayer } = require('../js/player.js');

const flush = () => new Promise(r => setImmediate(r));
const STEPS = ['R', 'U', "F'", 'D2'].map(move => ({ move }));
const STATES = [0, 1, 2, 3, 4];

// Animations stay "in flight" until the test finishes them.
function harness(opts = {}) {
  const calls = [], inFlight = [];
  const animate = (move, ms) => new Promise((resolve, reject) => {
    calls.push({ move, ms });
    inFlight.push({ resolve, reject });
  });
  const p = createPlayer({ animate, ...opts });
  p.load(STATES, STEPS);
  const finish = async () => { inFlight.shift().resolve(); await flush(); };
  const fail = async () => { inFlight.shift().reject(new Error('WebGL lost')); await flush(); };
  return { p, calls, finish, fail };
}

test('turn time follows the speed setting and is never zero', () => {
  assert.equal(turnMs(1), 1400);
  assert.equal(turnMs(10), 150);
  for (let s = 1; s < 10; s++) assert.ok(turnMs(s) > turnMs(s + 1), `speed ${s}`);
  assert.equal(turnMs(0), turnMs(1));
  assert.equal(turnMs(99), turnMs(10));
  assert.equal(turnMs('abc'), turnMs(5));
});

test('next animates the current move at the chosen speed, then advances', async () => {
  const { p, calls, finish } = harness();
  p.setSpeed(10);
  const done = p.next();
  assert.deepEqual(calls, [{ move: 'R', ms: 150 }]);
  assert.equal(p.busy, true);
  assert.equal(p.pos, 0);
  await finish();
  assert.equal(await done, true);
  assert.equal(p.pos, 1);
  assert.equal(p.busy, false);
  p.setSpeed(1);
  p.next();
  assert.deepEqual(calls[1], { move: 'U', ms: 1400 });
});

test('next is ignored while a turn is animating', async () => {
  const { p, calls, finish } = harness();
  p.next();
  assert.equal(await p.next(), false);
  assert.equal(calls.length, 1);
  await finish();
  assert.equal(p.pos, 1);
});

test('back pressed during a turn runs after it, animating the inverse', async () => {
  const { p, calls, finish } = harness();
  p.next();
  p.back();
  await finish();
  assert.equal(p.pos, 1);
  assert.deepEqual(calls[1].move, "R'");
  await finish();
  assert.equal(p.pos, 0);
});

test('jump pressed during a turn runs after it', async () => {
  const { p, finish } = harness();
  p.next();
  p.jump(3);
  assert.equal(p.pos, 0);
  await finish();
  assert.equal(p.pos, 3);
  p.jump(99);
  assert.equal(p.pos, 4);
});

test('a failed animation still advances and releases the lock', async () => {
  const { p, fail, finish } = harness();
  const done = p.next();
  await fail();
  assert.equal(await done, true);
  assert.equal(p.pos, 1);
  assert.equal(p.busy, false);
  p.next();
  await finish();
  assert.equal(p.pos, 2);
});

test('autoplay plays to the end and stops', async () => {
  const p = createPlayer({ animate: () => Promise.resolve(), schedule: fn => setImmediate(fn), cancel: clearImmediate });
  p.load(STATES, STEPS);
  p.togglePlay();
  assert.equal(p.playing, true);
  for (let i = 0; i < 20 && p.playing; i++) await flush();
  assert.equal(p.playing, false);
  assert.equal(p.pos, STEPS.length);
});

test('back during autoplay stops playback and steps back after the current turn', async () => {
  const { p, calls, finish } = harness({ schedule: fn => setImmediate(fn), cancel: clearImmediate });
  p.togglePlay();
  await flush();
  assert.equal(calls.length, 1);
  p.back();
  assert.equal(p.playing, false);
  await finish();
  assert.equal(calls[1].move, "R'");
  await finish();
  assert.equal(p.pos, 0);
  await flush();
  assert.equal(calls.length, 2, 'no further turns after stopping');
});

test('afterTurn stops playback and waits for the turn to finish', async () => {
  const { p, finish } = harness();
  p.next();
  let ran = false;
  p.afterTurn(() => { ran = true; });
  assert.equal(ran, false);
  await finish();
  assert.equal(ran, true);
});
