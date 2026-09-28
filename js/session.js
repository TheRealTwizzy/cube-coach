// App state that is easy to get wrong, kept out of the DOM code so it can be tested:
// how playback relabels My Cube, and the debounced route finder.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = isNode ? factory(require('./patterns.js')) : factory(root.CubePatterns);
  if (isNode) module.exports = api;
  else root.CubeSession = api;
})(typeof self !== 'undefined' ? self : this, function (Pat) {
  'use strict';

  // Label for My Cube at a playback position, or null when playback must not claim the
  // real cube (a preview that starts from a solved cube the user may not be holding).
  function trackPlayback({ pos, total, kind, name, custom, startIsPhysical }) {
    if (pos === 0 && !startIsPhysical) return null;
    const what = kind !== 'pattern' ? 'your solve' : custom ? name.charAt(0).toLowerCase() + name.slice(1) : name;
    if (pos === 0) return kind === 'pattern' ? `Start of ${what}` : 'Your checked cube';
    if (pos >= total) return `End of ${what}`;
    return `After turn ${pos} of ${total} · ${what}`;
  }

  // Finds routes one at a time. Repeated requests for the same route never cancel it; a reply
  // for an older request is dropped. States: waiting (solver not ready), queued, loading, ready, error.
  function createRouteRequester({ getStatus, solve, onChange, debounceMs = 150, schedule, cancel }) {
    schedule = schedule || ((fn, ms) => setTimeout(fn, ms));
    cancel = cancel || (id => clearTimeout(id));
    let state = null, seq = 0, timer = null;
    const set = s => { state = s; onChange(state); };
    const inFlight = key => state && state.key === key && ['queued', 'loading', 'ready'].includes(state.status);

    function request(from, picture) {
      const key = from.join('') + '|' + picture.join('');
      if (inFlight(key)) return;
      if (timer !== null) { cancel(timer); timer = null; }
      const mine = ++seq;
      if (getStatus() !== 'ready') { set({ key, status: 'waiting' }); return; }
      let plan;
      try {
        plan = Pat.planRoute(from, picture);
      } catch (err) {
        set({ key, status: 'error', message: err.message });
        return;
      }
      set({ key, status: 'queued', plan, from });
      timer = schedule(async () => {
        timer = null;
        if (mine !== seq) return;
        set({ key, status: 'loading', plan, from });
        try {
          const moves = await solve(plan.input);
          if (mine !== seq) return;
          if (!Pat.checkRoute(from, plan, moves)) throw new Error('the route did not reach the pattern');
          set({ key, status: 'ready', plan, from, moves });
        } catch (err) {
          if (mine !== seq) return;
          set({ key, status: 'error', message: err.message, code: err.code });
        }
      }, debounceMs);
    }
    return { request, get: () => state };
  }

  return { trackPlayback, createRouteRequester };
});
