// Playback controller: position in the solution, the one-turn-at-a-time lock, autoplay, and
// actions pressed while a turn is animating (they run when it finishes). No DOM: the page
// injects animate(move, ms) and onChange(player).
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel);
  if (isNode) module.exports = api;
  else root.CubePlayer = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const SLOWEST_MS = 1400, FASTEST_MS = 150;

  // Speed 1 (slow) to 10 (fast) -> length of one turn animation. Turns always animate:
  // the animation is the instruction, so reduced-motion settings do not shorten it.
  function turnMs(speed) {
    const n = Number(speed);
    const s = Math.min(10, Math.max(1, Math.round(Number.isFinite(n) ? n : 5)));
    return Math.round(SLOWEST_MS - (s - 1) * (SLOWEST_MS - FASTEST_MS) / 9);
  }
  const pauseMs = speed => 250 + Math.round(turnMs(speed) / 2); // gap between turns when playing

  function createPlayer(opts) {
    const animate = opts.animate;
    const onChange = opts.onChange || (() => {});
    const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
    const cancel = opts.cancel || (id => clearTimeout(id));
    const p = { steps: [], states: [], pos: 0, busy: false, playing: false, speed: 5 };
    let queued = null, timer = null;

    const changed = () => onChange(p);
    function halt() {
      p.playing = false;
      if (timer !== null) { cancel(timer); timer = null; }
    }
    function whenIdle(fn) {
      if (p.busy) queued = fn;
      else fn();
    }
    async function turn(move, delta) {
      p.busy = true;
      changed();
      try {
        await animate(move, turnMs(p.speed));
      } catch (e) {
        // The animation only pictures the turn; the solution still moves on.
      } finally {
        p.pos += delta;
        p.busy = false;
        changed();
        const fn = queued;
        queued = null;
        if (fn) fn();
      }
    }
    async function tick() {
      timer = null;
      if (!p.playing) return;
      const moved = await p.next();
      if (!p.playing) return;
      if (!moved || p.pos >= p.steps.length) { halt(); changed(); return; }
      timer = schedule(tick, pauseMs(p.speed));
    }

    p.load = (states, steps) => {
      halt();
      queued = null;
      p.states = states;
      p.steps = steps;
      p.pos = 0;
      changed();
    };
    p.next = async () => {
      if (p.busy || p.pos >= p.steps.length) return false;
      await turn(p.steps[p.pos].move, 1);
      return true;
    };
    p.back = () => {
      halt();
      whenIdle(() => { if (p.pos > 0) turn(M.invertMove(p.steps[p.pos - 1].move), -1); });
      changed();
    };
    p.jump = k => {
      halt();
      whenIdle(() => { p.pos = Math.max(0, Math.min(k, p.steps.length)); changed(); });
      changed();
    };
    p.stop = () => { halt(); changed(); };
    p.afterTurn = fn => { halt(); whenIdle(fn); changed(); };
    p.setSpeed = s => { p.speed = s; changed(); };
    p.togglePlay = () => {
      if (p.playing) { halt(); changed(); return; }
      if (!p.steps.length) return;
      p.playing = true;
      changed();
      whenIdle(() => {
        if (p.pos >= p.steps.length) { p.pos = 0; changed(); }
        tick();
      });
    };
    return p;
  }

  return { turnMs, pauseMs, createPlayer };
});
