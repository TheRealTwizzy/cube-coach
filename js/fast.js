// Shortest solver: Kociemba two-phase via cubejs (https://github.com/ldez/cubejs, MIT).
// In the browser the ~4 s table build runs in a worker; if workers are unavailable it
// falls back to the main thread using the page's own cubejs script tags.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./cube.js') : root.CubeModel, root);
  if (isNode) module.exports = api;
  else root.FastSolver = api;
})(typeof self !== 'undefined' ? self : this, function (M, root) {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/';
  const STAGE_NAME = 'Shortest solution';

  function toSteps(solution) {
    const moves = String(solution || '').trim().split(/\s+/).filter(Boolean);
    return moves.map((move, k) => ({ move, stage: 1, stageName: STAGE_NAME, algName: '', alg: '', algPos: k, algLen: moves.length, note: '' }));
  }
  function solveWith(CubeLib, state) {
    if (M.isSolved(state)) return [];
    return toSteps(CubeLib.fromString(M.toFaceletString(state)).solve());
  }

  let status = 'idle', worker = null, nextId = 1;
  const pending = new Map(), listeners = [];
  const setStatus = s => { status = s; listeners.forEach(fn => fn(s)); };
  const onStatus = fn => { listeners.push(fn); fn(status); };
  const getStatus = () => status;

  const WORKER_SRC = [
    `importScripts('${CDN}cube.js', '${CDN}solve.js');`,
    'Cube.initSolver();',
    "postMessage({ type: 'ready' });",
    'onmessage = function (e) {',
    '  var d = e.data;',
    "  try { postMessage({ type: 'solution', id: d.id, solution: Cube.fromString(d.facelets).solve() }); }",
    "  catch (err) { postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) }); }",
    '};',
  ].join('\n');

  function initMainThread() {
    if (!root.Cube || !root.Cube.initSolver) { setStatus('failed'); return; }
    setStatus('loading');
    setTimeout(() => {
      try { root.Cube.initSolver(); setStatus('ready'); } catch (e) { setStatus('failed'); }
    }, 50);
  }

  function init() {
    if (status !== 'idle') return;
    setStatus('loading');
    try {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
      worker.onmessage = e => {
        const d = e.data;
        if (d.type === 'ready') { setStatus('ready'); return; }
        const p = pending.get(d.id);
        if (!p) return;
        pending.delete(d.id);
        if (d.type === 'solution') p.resolve(toSteps(d.solution));
        else p.reject(new Error(d.message));
      };
      worker.onerror = e => {
        if (e && e.preventDefault) e.preventDefault();
        worker.terminate();
        worker = null;
        pending.forEach(p => p.reject(new Error('Solver worker stopped')));
        pending.clear();
        initMainThread();
      };
    } catch (e) {
      worker = null;
      initMainThread();
    }
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
    try { return Promise.resolve(solveWith(root.Cube, state)); } catch (e) { return Promise.reject(e); }
  }

  return { toSteps, solveWith, init, solve, onStatus, getStatus };
});
