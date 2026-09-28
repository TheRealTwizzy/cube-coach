// Web Worker for the shortest solver: builds the cubejs tables off the main page, then
// answers { id, facelets } with { type: 'solution', id, solution }.
importScripts('../vendor/cubejs/cube.js', '../vendor/cubejs/solve.js');
Cube.initSolver();
postMessage({ type: 'ready' });

onmessage = function (e) {
  var d = e.data;
  try {
    postMessage({ type: 'solution', id: d.id, solution: Cube.fromString(d.facelets).solve() });
  } catch (err) {
    postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
  }
};
