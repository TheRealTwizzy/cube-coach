# Cube Coach (rubiks-solver)

Static page: paint a 3x3 cube's 54 stickers, solve it (Shortest = Kociemba via cubejs, or Beginner layer-by-layer), follow an animated 3D cube turn by turn.

- Tests: `npm test` (Node 22 `node:test`). No npm dependencies: cubejs 1.3.2 lib files are vendored in `vendor/cubejs/` (the npm package wrongly depends on npm@6) and used by tests, the page and `js/solver-worker.js`. Only three.js comes from a CDN (cdnjs, with an integrity hash).
- Browser-free logic lives in UMD modules with Node tests: `cube.js` (54 moves incl. slices/wide/rotations from one `LAYERS` table, `parseAlgorithm`, 24 `ROTATIONS`), `validate.js`, `describe.js` (all user-facing move/hold wording, checked against geometry), `player.js` (turn timing, lock, autoplay), `fast.js`, `beginner.js`, `patterns.js` (109-pattern library from ruwix.com, `planRoute` direct routes, thumbnails), `session.js` ("my cube now" tracking and the debounced route requester). Keep new logic there, not in `app.js`.
- Patterns mode: "my cube now" (`app.physical`) is the last cube the app knows (checked input or playback position) with a label; routes relabel pieces so the pattern reads as solved, then reuse the shortest solver. Library data was generated from the ruwix gallery's `data-alg` attributes; regenerate rather than hand-edit.
- Turn animations always play (they are the instructions); reduced-motion only turns off decorative motion.
- Run locally: `python -m http.server 8765 --bind 127.0.0.1` (also in `.claude/launch.json`), open http://127.0.0.1:8765/. No build step.
- Published as a claude.ai Artifact: `index.html` + `js/*.js` + `vendor/cubejs/{cube,solve}.js` as supporting files. `index.html` has no doctype/html/head/body tags on purpose (the publisher wraps it); it keeps its own charset/viewport meta and `[hidden]` rule so it also works outside the wrapper.
- Sticker order U R F D L B, 9 each, row-major Kociemba net; geometry conventions live in `js/cube.js`.
- Modules are UMD-style plain scripts (window globals in browser, `module.exports` in Node). No bundler.
- Finishing a branch: always merge back to `main` locally (user's standing choice; no remote). Run `npm test` on the merged result, then delete the branch.
- Spec: `docs/superpowers/specs/2026-09-27-rubiks-solver-design.md`. Plans: `docs/superpowers/plans/2026-09-27-rubiks-solver.md`, `docs/superpowers/plans/2026-09-28-patterns.md`.
