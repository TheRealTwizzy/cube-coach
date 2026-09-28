# Rubik's Cube Solver — Design

Date: 2026-09-27
Status: approved in chat, pending spec review

## Goal

User enters the 54 stickers of their scrambled 3x3 cube, picks a solving method,
and follows an animated 3D cube one turn at a time until their real cube is solved.

Success: user enters a real scrambled cube, follows the steps, real cube ends solved.

## Decisions

| Topic | Decision |
|---|---|
| Platform | Static web page (no bundler, no server). Published as private claude.ai Artifact; also opens from local disk. |
| Methods | Both, user toggles per solve: **Shortest** (Kociemba via `cubejs`) and **Beginner** (hand-written layer-by-layer). |
| 3D | Three.js r128 classic build from cdnjs (global `THREE`). Own drag-to-rotate, no OrbitControls. |
| Solver lib | `cubejs` classic scripts from jsdelivr (`lib/cube.js`, `lib/solve.js`, global `Cube`). |
| Hold orientation | Input + Shortest: white Up, green Front. Beginner: step 0 is whole-cube `z2` (yellow Up, white Down, green Front). |
| Module format | Plain scripts, UMD-style wrapper: `window.X` in browser, `module.exports` in Node. |

## Files

```
index.html          layout, CSS, script tags, CDN loads
js/cube.js          cube model: stickers, moves, rotations, parsing
js/validate.js      input validation (reachable cube check)
js/fast.js          cubejs wrapper (init in background, solve)
js/beginner.js      layer-by-layer solver
js/view3d.js        Three.js cube, turn animation, drag rotate
js/app.js           UI: input net, palette, playback, step card, mini net
test/*.test.js      node --test suites
package.json        devDependency cubejs (tests only), test script
```

## Cube model (`js/cube.js`)

- State: array of 54 color chars from `w y g b r o`, facelet order **U R F D L B**, 9 per face,
  row-major as standard Kociemba nets:
  - U viewed from above, top row toward B. R viewed from right, top row toward U, left column toward F.
  - F from front, U on top. D viewed from below, top row toward F. L from left, right column toward F.
  - B from back, U on top, left column toward R.
- Geometry: x→R, y→U, z→F. Each facelet index has integer position (each coord in {-1,0,1}) and
  outward normal. Face grid (row r, col c) → position:
  - U `(c-1, 1, r-1)`, F `(c-1, 1-r, 1)`, R `(1, 1-r, 1-c)`, B `(1-c, 1-r, -1)`,
    L `(-1, 1-r, c-1)`, D `(c-1, -1, 1-r)`.
- Face turn X (clockwise looking at face X): rotate every facelet with `pos·n_X > 0.5` by -90° about
  `n_X`. Resulting (pos, normal) maps to a facelet index → permutation. `X2` = twice, `X'` = thrice.
- Whole-cube rotations `x` (as R), `y` (as U), `z` (as F): rotate all facelets.
- API: `SOLVED`, `applyMove(state, move)`, `applyMoves(state, "R U R' U'")`, `invertMove`,
  `isSolved`, `faceOfCenter`, `toFaceletString(state)` (face letters by center color, for cubejs),
  `randomScramble(n)`, facelet geometry lookup for view3d.

## Validation (`js/validate.js`)

`validate(state)` → `{ok, errors: [{message, cells: [facelet indices]}]}`. Checks, in order:
0. No unfilled stickers (`x` = grey/unset, produced by Clear).
1. Six distinct center colors.
2. Exactly 9 of each color (message names over/under counts).
3. Each of 12 edge slots holds a real edge (two colors of adjacent, non-opposite centers); no duplicates.
4. Each of 8 corner slots holds a real corner with correct chirality; no duplicates.
5. Corner twist sum ≡ 0 mod 3 ("one corner twisted").
6. Edge flip sum ≡ 0 mod 2 ("one edge flipped").
7. Corner permutation parity = edge permutation parity ("two pieces swapped").
Messages explain likely cause (misread sticker vs. reassembled cube) and name faces to recheck.

## Shortest solver (`js/fast.js`)

- `FastSolver.init()` builds cubejs tables in a Web Worker (blob URL, `importScripts` from jsDelivr) so the
  page never freezes; if workers are unavailable, falls back to `Cube.initSolver()` on the main thread after
  first paint. Status `idle|loading|ready|failed`.
- `FastSolver.solve(state)` → array of moves in white-Up/green-Front frame via
  `Cube.fromString(toFaceletString(state)).solve()`. Solved input → empty array.
- Each move annotated `{move, stage: null, label: "Shortest solve"}`.

## Beginner solver (`js/beginner.js`)

`BeginnerSolver.solve(state)` → array of steps `{move, stage, stageName, algName}`.
Step 0: `z2` (whole cube). Remaining steps in yellow-Up frame. Stage 1 uses piece-level BFS;
stages 2–6 use BFS over a small macro set (U, U', U2 + named algorithms conjugated to each of 4 fronts
via y-relabeling F→R→B→L), goal predicate = stage target AND all earlier stages intact.
Macros are expanded into individual face turns for playback.

| # | Stage | Method |
|---|---|---|
| 1 | White cross | BFS over the 4 white edges' (position, orientation), 18 face turns. Optimal, ≤8 turns. |
| 2 | White corners | Per corner. Macros: U-turns + `(R U R' U')×k`, k=1..5, at each slot. Depth ≤4. |
| 3 | Middle layer | Per edge. Macros: U-turns + `U R U' R' U' F' U F` (right) / `U' L' U L U F U' F'` (left). Depth ≤4. |
| 4 | Yellow cross | Macros: U-turns + `F R U R' U' F'`. Depth ≤6, no U-turn after U-turn. |
| 5 | Yellow edges | Macros: U-turns + `R U R' U R U2 R' U`. Depth ≤6. |
| 6 | Yellow corners placed | Macros: U-turns + `U R U' L' U R' U' L`. Depth ≤5. |
| 7 | Yellow corners twisted | Deterministic: 4× (repeat `R' D' R D` until UFR yellow up; then `U`), then final U-turn to align. |

If a BFS exceeds its depth, throw (tests must prove this never happens).

## 3D view (`js/view3d.js`)

- 27 cubies (dark plastic) + 54 sticker planes at fixed positions from cube geometry.
- `setState(state)` recolors stickers. `animateMove(move, ms)` → Promise: parent affected cubies to a
  pivot, tween rotation (ease in-out), then reset pivot and recolor from new state (seamless).
- Whole-cube rotations animate all 27 cubies.
- Pointer drag rotates the whole group; default view shows U, F, R.

## UI (`js/app.js`, `index.html`)

**Input mode**
- Cross-shaped net (U top; L F R B middle row; D bottom). Palette of 6 swatches; click/tap sticker to
  paint; keys `w y g b r o` select color. Centers preset to standard scheme, still editable.
- Per-face hint describing how to hold the cube to read that face in net orientation.
- Buttons: Clear (non-centers grey), Reset to solved, Random scramble, method toggle, Solve.
- Invalid → error list, offending stickers outlined.

**Playback mode**
- 3D cube; step card: move notation + plain English ("R' — Right face, counter-clockwise, as you look at
  it"); beginner adds "Stage 3/7 Middle layer · Insert right · move 4 of 8".
- Controls: restart, back, play/pause, next, speed slider; keys ←, →, space. Clickable move chips grouped
  by stage. Live mini 2D net. "Edit cube" back to input.
- Back = animate inverse move.

**Theming/layout**: CSS tokens, light + dark, mobile width (net + 3D stack vertically).

## Error handling

- CDN failure for Three.js or cubejs → visible banner naming which library failed. Shortest disabled if
  cubejs missing; beginner still works (without 3D, mini net only) if Three.js missing.
- Solve pressed while cubejs initializing → button disabled, label "Preparing solver…".
- Unexpected solver exception → message "Solver failed — please report this cube" + facelet string.

## Testing

`node --test` (Node 22):
- `cube.test.js`: every move ×4 = identity; `X X'` = identity; `(R U R' U')×6` = identity; rotations ×4 = identity;
  facelet string of solved = `UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`.
- `validate.test.js`: 500 random scrambles valid; rejects: wrong counts, duplicate center, impossible
  edge, mirrored corner, single twisted corner, single flipped edge, swapped two edges.
- `beginner.test.js`: 500 random scrambles → steps applied = solved; after each stage its predicate and
  all earlier ones hold.
- `fast.test.js`: cubejs from npm, 200 random scrambles → solution applied = solved (verifies facelet
  string mapping).
- Manual/browser: built-in browser; scramble → solve → step both methods; screenshot; mobile width check.

## Out of scope

Camera/photo color capture, 2x2/4x4, move-count optimization for beginner, saving history.
