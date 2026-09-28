# Cube Coach (rubiks-solver)

Static page: paint a 3x3 cube's 54 stickers, solve it (Shortest = Kociemba via cubejs, or Beginner layer-by-layer), follow an animated 3D cube turn by turn.

- Tests: `npm test` (Node 22 `node:test`). No npm dependencies: cubejs 1.3.2 lib files are vendored in `vendor/cubejs/` for tests only (the npm package wrongly depends on npm@6). The page loads the same version from jsDelivr.
- Run locally: `python -m http.server 8765 --bind 127.0.0.1` (also in `.claude/launch.json`), open http://127.0.0.1:8765/. No build step.
- Published as a claude.ai Artifact: `index.html` + `js/*.js` as supporting files. `index.html` has no doctype/html/head/body tags on purpose (the publisher wraps it); it keeps its own charset/viewport meta and `[hidden]` rule so it also works outside the wrapper.
- Sticker order U R F D L B, 9 each, row-major Kociemba net; geometry conventions live in `js/cube.js`.
- Modules are UMD-style plain scripts (window globals in browser, `module.exports` in Node). No bundler.
- Spec: `docs/superpowers/specs/2026-09-27-rubiks-solver-design.md`. Plan: `docs/superpowers/plans/2026-09-27-rubiks-solver.md`.
