// Shortest solver: Kociemba two-phase via cubejs (https://github.com/ldez/cubejs, MIT).
// cubejs is served from our own files (vendor/cubejs). Its ~4 s table build runs in
// js/solver-worker.js; if the worker can't start, stalls, or dies, the solver falls back to
// the main page using the page's own cubejs script tags.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel, root);
  if (isNode) module.exports = api;
  else root.FastSolver = api;
})(typeof self !== 'undefined' ? self : this, function (M, root) {
  'use strict';

  const STAGE_NAME = 'Shortest solution';

  function toSteps(solution) {
    const moves = String(solution || '').trim().split(/\s+/).filter(Boolean);
    return moves.map((move, k) => ({ move, stage: 1, stageName: STAGE_NAME, algName: '', alg: '', algPos: k, algLen: moves.length, note: '' }));
  }
  function solveWith(CubeLib, state) {
    if (M.isSolved(state)) return [];
    return toSteps(CubeLib.fromString(M.toFaceletString(state)).solve());
  }

  // env: { Worker, workerUrl, getCube, timeoutMs, schedule, cancel }
  function create(env) {
    const timeoutMs = env.timeoutMs ?? 25000;
    const schedule = env.schedule || ((fn, ms) => setTimeout(fn, ms));
    const cancel = env.cancel || (id => clearTimeout(id));
    let status = 'idle', worker = null, timer = null, nextId = 1;
    const pending = new Map(), listeners = [];
    const setStatus = s => { status = s; listeners.forEach(fn => fn(s)); };
    const onStatus = fn => { listeners.push(fn); fn(status); };
    const getStatus = () => status;

    function restartError() {
      const err = new Error('The shortest solver stopped and is restarting.');
      err.code = 'SOLVER_RESTARTING';
      return err;
    }
    function dropWorker() {
      if (timer !== null) { cancel(timer); timer = null; }
      if (worker) { worker.terminate(); worker = null; }
      pending.forEach(p => p.reject(restartError()));
      pending.clear();
    }
    function initMainThread() {
      const lib = env.getCube && env.getCube();
      if (!lib || !lib.initSolver) { setStatus('failed'); return; }
      setStatus('loading');
      schedule(() => {
        try { lib.initSolver(); setStatus('ready'); } catch (e) { setStatus('failed'); }
      }, 50);
    }

    function init() {
      if (status !== 'idle') return;
      setStatus('loading');
      if (!env.Worker) { initMainThread(); return; }
      try {
        worker = new env.Worker(env.workerUrl);
      } catch (e) {
        worker = null;
        initMainThread();
        return;
      }
      worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'ready') {
          if (timer !== null) { cancel(timer); timer = null; }
          setStatus('ready');
          return;
        }
        const p = pending.get(d.id);
        if (!p) return;
        pending.delete(d.id);
        if (d.type === 'solution') p.resolve(toSteps(d.solution));
        else p.reject(new Error(d.message));
      };
      worker.onerror = e => {
        if (e && e.preventDefault) e.preventDefault();
        dropWorker();
        initMainThread();
      };
      timer = schedule(() => {
        timer = null;
        if (status === 'loading' && worker) { dropWorker(); initMainThread(); }
      }, timeoutMs);
    }

    function solve(state) {
      if (M.isSolved(state)) return Promise.resolve([]);
      if (status !== 'ready') return Promise.reject(new Error('The shortest solver is still loading.'));
      if (worker) {
        return new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, facelets: M.toFaceletString(state) });
        });
      }
      try { return Promise.resolve(solveWith(env.getCube(), state)); } catch (e) { return Promise.reject(e); }
    }

    return { init, solve, onStatus, getStatus };
  }

  const pageEnv = {
    Worker: root && root.Worker,
    workerUrl: 'js/solver-worker.js',
    getCube: () => root && root.Cube,
  };
  return Object.assign({ toSteps, solveWith, create }, create(pageEnv));
});
