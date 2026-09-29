# Cube Coach

A 3x3 Rubik's cube coach that runs in the browser: set up a digital twin of your real cube, then follow an animated 3D cube one turn at a time to solve it or to make any of 109 classic patterns.

**Live site:** https://therealtwizzy.github.io/cube-coach/

## What it does

- **My Cube**: scan your cube with your phone's camera: show the six faces in any order, any way up, and each is captured by itself; a guide cube shows how to turn to the next face, and the app works out which way round each face was (one photo per face where a live camera isn't available) or paint its stickers, then confirm it. The app checks it is a real, solvable cube.
- **Solve**: *Shortest* (about 20 turns, Kociemba's two-phase algorithm) or *Beginner* (layer by layer, 7 named stages with the algorithms beginners learn).
- **Patterns**: 109 named patterns plus any move sequence you paste (`R U R' U'`, `M2 E2 S2`, `(R U)3`, `Rw`…). From a solved cube it plays the pattern's own moves; from any other cube it finds a direct route of about 20 turns.
- Every turn is animated and described in plain words ("Top face, clockwise: the front row slides to the left"), with a speed control. My Cube follows along as you turn.

## Run it locally

No build step and no dependencies.

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/.

## Tests

```bash
npm test
```

Node 22's built-in test runner. The tests cover the cube model and notation parser, input validation, both solvers, pattern routes, turn wording (checked against the cube's geometry), playback timing, and photo scanning on generated photos.

## Credits

- Shortest solver: [cubejs](https://github.com/ldez/cubejs) by ldez (MIT), vendored in `vendor/cubejs/`.
- 3D view: [three.js](https://threejs.org/) (MIT), loaded from cdnjs.
- Pattern names and move sequences: the [ruwix.com pattern gallery](https://ruwix.com/the-rubiks-cube/rubiks-cube-patterns-algorithms/).
