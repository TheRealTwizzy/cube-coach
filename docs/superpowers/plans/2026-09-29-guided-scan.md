# Cube Coach: Guided scan

## Context
The live camera scan works on the user's phone, but it is hard to follow. What they struggled with:
- "What face am I scanning? How do I rotate the cube for the next scan?"
- In their words, the problem is "not 'which way is up'… more like 'Which face am I scanning?'"

So the face being scanned must be unmistakable at every moment:
- the headline
- the chip for that face
- the camera saying which face it sees
- the guide cube showing that face toward you

Orientation is a separate concern, and the app handles it silently.

What they want:
- A guided flow that follows them step by step until the physical cube is completely and accurately scanned.
- Picking which face to scan, both by tapping it and by the camera recognizing it from its center color.
- Orientation handled by **auto-fix only**: no rotate buttons.

**Evidence** (read-only probes):
- For 200 random scrambles with every face randomly rotated, trying all 4⁶ face rotations gave exactly one valid cube 199 times. That took about 83 ms per cube in Node.
- Near-solved and patterned cubes are often ambiguous: 1-move scrambles 30/30, 71 of the 109 library patterns. So the orientation the guide asked for is used as a tie-break, and any face that is still ambiguous gets flagged.
- With one swapped sticker pair, the lowest validate-error count found the right rotations in 39 of 40 cubes, and the misread face was among the flagged faces in 39 of 40.

Project: `D:\Projects\rubiks-solver`, currently on `main` at 2c4d1a8 (clean, 104 tests).
- Work on branch `feature/guided-scan`.
- TDD per unit, native inline execution, one fresh reviewer (Opus) at the end.
- Save this plan to `docs/superpowers/plans/2026-09-29-guided-scan.md` as the record.

## Flow the user sees
1. **Scan my cube** → the camera opens straight away.
   - Header: "Face 1 of 6", then a big **"Scanning: GREEN face"** with a large color dot. It is always visible, including during review.
   - A one-line hint, e.g. "Hold green toward the camera, white on top. Any face works; any way up is fine."
   - Live status names what the camera sees: "✓ Green face found. Hold still…", or "I see the blue face…". The grid outline over the video uses the target color, so a glance confirms the face.
2. **Face chips:** a row of 6 chips (white, yellow, green, blue, red, orange). They show progress (✓ when done) and are the picker: tap one to scan it, or to scan it again.
   - The camera also recognizes the face by its center. Showing any unscanned face makes it the target, and it auto-captures once steady.
   - Showing a face already done shows "Blue is already scanned. Show another face, or tap blue to scan it again." It does not capture.
   - A misread center is handled: the status hints "If this is the orange face, tap orange, then Capture". Capture always uses the current target.
3. **Guide cube (3D viewer):** shows how to turn the cube to the next face.
   - Centers are colored, scanned faces are filled, the rest is grey.
   - It is held as the guide expects, and animates the single whole-cube turn to the suggested next face (quarter turn, tip, or turn over). A "Show me again" button replays it.
   - After the turn, the face being scanned faces the viewer.
   - Hint wording has no direction words: "Red is next to green: give the cube a quarter turn so red faces the camera." or "Blue is opposite green: turn the cube over."
4. **Review after each capture:** the same as today (grid, drag corners, read swatches, Retake / Looks right).
   - It is headed "This is the RED face", with "Wrong face? Tap its color." to relabel.
   - Replacing a face already scanned asks first.
5. **After the 6th face:** "Checking your cube…".
   - The app works out each face's turn, then goes into My Cube with a note. The existing confirm flow follows.
   - Uncertain stickers and any still-ambiguous stickers get dashed outlines, with a note saying which faces to check.
   - If the stickers can't form a real cube, a **fix step** names the top 2 suspect faces ("Scan red again"), then re-checks. There is also **Fix by painting**, which goes into My Cube with the validate errors shown.
6. **Phones (≤860px):** `body.is-scanning` makes the viewer sticky and compact (about 24vh) and caps the camera at about 38vh, so the guide, camera and chips fit without scrolling.

## Design (files)

### `js/scan.js` (all new logic, browser-free, tested)
- `QUARTER = [6,3,0,7,4,1,8,5,2]` and `turnFace(nine, k)`: `new[i] = old[QUARTER[i]]`, applied k times (one quarter equals the `z` photo).
- `faceForCenter(samples)` → the face whose standard center (`M.SOLVED`) matches `V.colorLetter(samples[4].lab)`.
- `turnToFront(hold, face)` → one move from a 5-entry table, keyed by where `face`'s center sits in `applyMoves(SOLVED, hold)`:
  - R → `y`
  - L → `y'`
  - B → `y2`
  - U → `x'`
  - D → `x`
  - F → `''`
- `photoTurns(hold, face)` → k such that the photo (front 9 of `applyMoves(index state, hold)`) equals `turnFace(net indices of face, k)`.
- `orient(colors, uncertain, expected)` → `{ ok, state, turns:{U..B}, uncertain, errors, suspects:[face], ambiguous:[face], ambiguousCells }`.
  - Classify once, then try all 4⁶ turns, rotating each face's colors and its uncertain indices together.
  - Dedupe valid states by string. Pick the one with the fewest faces differing from `expected`.
  - Ambiguous cells are the cells where the other valid states differ from the chosen one.
  - If nothing is valid, pick the lowest `errors.length`, then apply the same tie-break.
  - Suspects are ranked by 3×(error cells that are also uncertain) + error cells + uncertain, top 2.
  - Errors with no cells fall back to uncertain stickers only.
- `createScan()` → `{ faces, hold(), target(), pick(face), suggest(), seen(face) → {capture, message}, setFace(face, samples), guideState(), done(), count(), check() }`.
  - `faces[f] = { samples, expected }`. `setFace` stores `photoTurns(hold, face)` and then advances `hold` with `turnToFront`.
  - `suggest()` picks the next unscanned face by the move needed from the current hold, in the order `y`, `y'`, `x'`, `x`, `y2`. From the start this gives F R B L U D, with moves `y y y x' y2`.
  - `check()` renames the six centers with `V.nameCenters` (keeping `expected` with each face), then runs `V.classify`, then `orient`.
  - `guideState()` returns centers plus scanned faces as `colorLetter` guesses, un-turned by `expected`, for the 3D guide.
- `createSteadiness().push(found, face)`: the count resets whenever the detected face changes (flicker never captures).
- Remove `step`, `redo` and `checkCenter`. `ORDER` stays as a constant only if something still needs it.

### `js/vision.js`
- Export `nameCenters(labs)`: a 6×6 Hungarian match of the six center colors against the canonical colors, giving six distinct letters. It reuses the existing `hungarian` and canonical colors.

### `js/describe.js` (all user-facing hold/turn wording)
- `nextFaceHint(from, to)`: wording for the first face, "next to" (adjacent via `NORMALS`) and "opposite". No left/right words.

### `js/app.js` (UI wiring only)
- **Add:**
  - `renderChips`, `pickFace`
  - `guideTo(face)`: queued animations with a `guideSeq` guard; `animateMove` can't overlap
  - `replayGuide`, `checkScan` (shows "Checking…" via the existing `later()`), `showFix`, `rescanFace`, `paintInstead`
- **Change:**
  - `startScan` / `endScan`: the `is-scanning` class; restore `app.view.setState(app.cube)` on end.
  - `renderScan`: no auto-finish inside it (re-entrancy). Finish explicitly from accept.
  - `showShot` / `resample`: recompute `shot.face` after a corner drag.
  - `acceptPhoto`: confirm before replacing, then `checkScan` or the next face.
  - `liveTick`: uses `scan.seen()` and the keyed steadiness.
  - `captureLive`: captures as the target.
  - `cancelScan`: "Discard N faces?".
  - `showPanel`: toggles `is-scanning` while the scan persists across sections.
  - `renderCube` / `enterCube`: don't overwrite the guide while scanning, and don't restart the camera in the fix step.
  - The `visibilitychange` handler follows the same rules.
- **Remove:** `retakeFace`, `scanCells`, the `#scan-net` wiring, and the "Use it anyway" path.
- **Accessibility:** `#scan-cam-status` stays non-live; step and face changes are announced once through `#scan-live`. Hide the header `#hold` chip while scanning.
- **Reuse:** the live camera (`startLive`, `stopLive`, `liveFrame`, `drawLiveOverlay`), the photo path (`onPhoto`, `loadImage`), the review (`showShot`, `drawShot`, `buildHandles`), `setCube`, `app.check` dashed outlines, `validate` error display, and `M.applyMoves`.

### `index.html`
- `#scan-step` becomes a headline with a color dot. Add `#scan-replay`.
- `#scan-faces` (role=group): 6 chips of at least 44px, with `aria-pressed` for the target and ✓ for done.
- `#scan-shot-face` label in the review.
- `#scan-fix` containing `#scan-fix-msg`, `#scan-fix-faces` and `#scan-paint`.
- Drop `#scan-net`, its tip, and `#scan-anyway`.
- Phone CSS for `.is-scanning` (sticky compact viewer, hide `.view-note`, camera `calc(38vh * var(--ar))`).

### Docs
- README "My Cube" line.
- CLAUDE.md scan bullets: any order, any way up, auto orientation, guide cube.

## Tests (Node, written first; `test/scan.test.js` plus `test/vision.test.js`, `test/describe.test.js`)
1. `faceForCenter` never misnames a face across the existing 50×6 lighting loop.
2. `nameCenters` gets warm white vs yellow and red vs orange right, and always returns 6 distinct letters.
3. `turnFace` applied 4 times is the identity; one quarter equals the `z` photo.
4. Photos taken any way up rebuild 50 scrambles.
5. Uncertain stickers follow their face's rotation.
6. Solved and checkerboard cubes come back ok and not ambiguous.
7. A 1-move scramble with the correct expected turns returns the true cube and flags `ambiguous` only where real.
8. Photos taken in the guide's holds need no correction (`turns` all equal `expected`).
9. A swapped sticker pair gives ok:false, the other faces' turns stay right, and the misread face ranks among the suspects (fixed seeds).
10. Errors with no cells take their suspects from uncertain stickers.
11. `turnToFront` over all 24 holds × 5 slots brings the face to the front.
12. `suggest` gives F R B L U D, with moves `y y y x' y2`.
13. `seen()`: an unscanned face captures; a scanned one doesn't unless it is the tapped target; the messages are right.
14. Steadiness: alternating faces never capture; the existing steadiness tests are adapted.
15. Rescanning a face after a failed check replaces it, and the re-check recovers the cube.
16. `nextFaceHint`: first face, next to, opposite; the named neighbors match the geometry.
17. `orient` runs in under 300 ms in Node.

## Verification (browser: `python -m http.server 8765 --bind 127.0.0.1`, http://127.0.0.1:8765/)
1. Stub `getUserMedia` with `canvas.captureStream`, drawing generated faces at random quarter turns in any order.
2. Scan 6 faces out of order. Check:
   - the chips and the header face name
   - single-move guide animations and "Show me again"
   - "Green is already scanned" (no capture)
   - a tapped rescan
   - "Checking…" then My Cube equal to the scrambled cube (read the `#net` cell colors)
3. Swap two stickers in the feed: the fix step names the suspect, and "Scan red again" recovers the cube.
4. Scan a 1-move cube and the Superflip following the guide holds: correct result, and dashed outlines plus a note only where the cube is truly ambiguous.
5. Photo path: set files via `DataTransfer` on `#scan-file`; relabel via "Wrong face? Tap its color"; the replace prompt appears.
6. Phone sizes 360×640 and 375×812: guide, camera and chips fit without scrolling and nothing overflows; check light and dark themes.
7. Cancel mid-animation, switch sections and back, hide the tab: the camera track ends and the view shows My Cube afterwards; no console errors.
8. Time `CubeScan` orient in the page (`performance.now`); target under 250 ms.
9. `npm test` all green.
10. Fresh review (Opus): fix Critical/Important with a failing test first. Minors too, per the user's habit.
11. Update CLAUDE.md and README.
12. Merge to `main` locally, run `npm test` on the merged result, delete the branch, and push (standing approval). Then verify the Pages deploy and the live site, and republish the claude.ai Artifact: `index.html` + `js/app.js`, `js/scan.js`, `js/vision.js`, `js/describe.js`.
