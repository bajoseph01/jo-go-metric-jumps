# Jo⚡Go Metric Jumps — Project Report

## What was built

A complete, classroom-ready browser game that teaches Grade 4 learners to convert
metric units across **three dimensions** — length (km, m, cm, mm), mass (kg, g,
mg) and volume (kL, L, mL) — by moving the decimal comma, and to **read physical
scales** (ruler, kitchen scale, measuring jug). The app is built with semantic
HTML, modern CSS and vanilla JavaScript (no frameworks, no server, no accounts,
no paid APIs) and is ready for GitHub Pages.

The signature interaction is the **place-value comma track**: the digits of the
source number are shown as blocks, the comma is a draggable badge sitting at the
base of the blocks, and as the learner drags it the comma hops across clearly
visible landing positions. Empty positions appear as ghost zeroes that turn solid
as the comma crosses them, so learners see *why* 2,5 ×100 becomes 250 instead of
memorising a trick. All arithmetic uses exact integer/rational math (no floating
point), so no conversion can ever be off by 0,0000001.

## Learning design

The progression follows evidence-informed practice:

1. **Understanding** — every step is a decision (choose the operation, count the
   jumps) before any animation reveals the answer.
2. **Modelling** — stage 3 guides the full op → jumps → drag pipeline with landing
   markers and a live readout.
3. **Guided practice** — stage 4 removes the markers: predict, then move.
4. **Retrieval** — stages 5–8 require typing generated answers; no multiple choice.
5. **Immediate corrective feedback** — every wrong answer gets targeted teaching
   ("We are changing from metres to the smaller centimetres. We need MORE
   centimetres, so the number must get bigger."), never just "wrong".
6. **Reattempt** — after feedback the learner retries the same question.
7. **Scaffold fading** — options → markers → prediction → typed answers.
8. **Mixed practice** — stage 6 mixes all six conversions, both directions,
   decimals and whole numbers.
9. **Transfer** — stage 8 presents short Grade 4 word problems.
10. **Delayed retrieval** — progress persists in localStorage; mastery weights
    make the generator re-ask weak conversion pairs on later sessions.

**Conceptual safety**: stage 7 and the embedded sanity checks repeatedly ask
"Does this make sense?" — e.g. judging whether 2,5 m = 0,025 cm — so learners
internalise "smaller unit → bigger number; the length never changes."

## Game modes

- **Play** — the 8-stage campaign (see README). Unlocks progressively, with a
  separate unlock track per dimension (Length / Mass / Volume chosen on the home
  screen).
- **Read the Scales** — the Scales Lab: read live-rendered physical scales — a
  250 mm ruler (mm), a 0-1 kg kitchen dial (g) and a 0-1 L measuring jug (mL).
  Readings always land on exact marks; wrong answers show the correct reading;
  per-instrument progress feeds the teacher report.
- **Practice** — free practice on any unlocked stage (menu on the home screen).
- **My Progress** — mastery per category, streaks, and session counts.
- **Learner profiles** — each child gets a named profile (name + avatar) with
  fully separate mastery, unlocks, streaks and totals on a shared device.
  Pick or add a learner from the home-screen chip or the game HUD; the app
  asks who is playing on first launch, and PLAY/Practice/Progress open the
  picker whenever no learner is selected (never a silent default). The **✎**
  on a learner card renames or re-avatars them without losing progress.
  Device settings stay global.
- **How It Works** — in-app explanation of the ×/÷ ladder rule.
- **Teacher mode (PIN 5241)** — discreet (long-press the logo, 5 taps, or press
  T): mastery percentages per category, attempts, weak conversion pairs, reset,
  and **Practice all levels** — every stage including locked ones, for teacher-
  led demonstration. Also prints or downloads a **per-learner report** (mastery
  by category and by conversion pair, learner switcher, print-optimised
  layout) and generates a **Worksheet pack**: one sheet per selected learner
  drilling their weakest conversion pairs plus word problems, with an answer
  key — printable or exported as a single PDF. The pack has a
  **Conversions | Read the Scales** toggle: the Scales mode renders each
  learner's ruler/kitchen-dial/measuring-jug graphics with blank answer lines
  and a matching answer key, printable or PDF-exported too. **Class set**
  swaps the pack to one identical sheet for everyone with a single shared key
  (both modes), so the whole class can be marked together. Scale sheets are
  interactive on screen: learners type readings, **Check my answers** marks
  each one with ✓/✗, reveals the correct reading on misses, and records the
  results into each learner's per-instrument scale progress. Reports and PDFs
  are produced entirely in-browser by a bundled dependency-free PDF writer
  (no network, works offline). Stays unlocked for the session; "Lock" re-arms
  the PIN.
- **Sound toggle** — persistent preference; app is fully usable silent.

## Architecture

```
index.html            static shell for every screen
css/styles.css        single stylesheet, CSS variables, responsive breakpoints
js/math.js            exact conversion engine + comma-track builder (unit-testable)
js/formatting.js      SA formatting: decimal comma, 2 500 spacing, answer parsing
js/questions.js       stages, generators, adaptive pair weighting (3 dimensions)
js/worksheets.js      per-learner worksheet generation (weakest-pair weighting)
js/scales.js          Scales Lab + scale worksheets: question gen, SVG + PDF
                      vector builders for ruler/dial/jug
js/storage.js         per-learner profiles, localStorage persistence, mastery model
js/pdf.js             tiny dependency-free PDF writer (reports + worksheet
                      pack; deterministic object layout — Kids + font refs
                      computed for any page count)
js/input.js           keypad (pointer + keyboard) and comma track (pointer drag,
                      tap targets, keyboard arrows, focus ring)
js/ui.js              render layer: questions, feedback, results, screens, modals
js/game.js            session state machine, targeted feedback copy, re-entry lock
js/app.js             boot, wiring, sound, teacher trigger, service worker
js/audio.js           WebAudio blips (correct/wrong/jump/pop/unlock) — optional
assets/               SVG favicon + generated PNG app icon
tools/serve.js        dependency-free static server (dev only)
tools/make-icon.js    PNG icon generator (no image libraries)
tests/run-tests.js    automated suite
manifest.webmanifest  PWA manifest
sw.js                 offline service worker (network-first, cache fallback)
```

## Input support

- **Touch** — Pointer Events everywhere; large targets; page scrolling is
  prevented while manipulating the comma (`touch-action: none`).
- **Apple Pencil** — Pointer Events handle it naturally; no separate system.
- **Mouse** — full gameplay works with a mouse (drag or click landing spots).
- **Keyboard** — numeric answers accept comma or point (normalised internally,
  displayed SA-style with a comma); arrow keys move the comma; Enter submits;
  all buttons are focusable with clear focus states.
- **On-screen keypad** — big 0–9 + comma + ⌫ + C + Check, sized for Grade 4.

## Testing performed

**Automated (Node, no dependencies)** — `node tests/run-tests.js`:
6058 checks, 0 failures, covering:
- the six canonical conversions (direction, factor, jumps, exact values);
- all mission error cases (0,5 m → cm; 0,05 m → cm; 5 m → mm; 5 000 mm → m;
  250 cm → m; 25 cm → m; 2,5 km → m; 0,003 km → m; 450 cm → m; 4 500 mm → m;
  1,2 cm → mm; 120 mm → cm) computed exactly;
- comma-track construction + normalisation (ghost zeroes solid/dashed rules);
- SA formatting, typed-answer parsing (comma, point, spaces, malformed input);
- 8000 generated questions audited for math exactness and bounds;
- adaptive weighting, storage round-trips, mastery levels;
- deliberate stress: repeated + malformed inputs.

**Interactive QA (real browser, accessibility-tree driven + DOM geometry):**
- full campaign run: all 8 stages completed through the real UI with
  independently recomputed answers — zero mismatches;
- wrong-answer feedback verified in stages 1, 2, 5 and 7 (targeted copy, then
  reattempt works);
- real pointer drag of the comma (wrong landing → gentle bounce-back feedback;
  correct landing → settles and advances);
- keypad entry, keyboard entry with decimal point (3.52 accepted as 3,52);
- sanity-judge flow (judge wrong equation, then fix it);
- stage-5 comma feedback animation after typed answers;
- sound toggle + persistence across reload; teacher panel data + reset;
- progress persistence across reload;
- double-tap regression: three rapid submits count exactly once (re-entry lock);
- learner rename via ✎ (name + avatar, progress preserved), pick-before-PLAY
  (no silent default learner), per-learner printable report with learner
  switcher and working Print button (verified end-to-end in the browser);
- worksheet pack (per-learner weakest-pair drilling + word problems + answer
  key, learner checkboxes, regenerate) rendered and exercised in the browser;
- both PDF exports (report + worksheet pack) validated structurally in the
  browser (header, xref offsets, trailer, page counts) and rendered by the
  webview's built-in PDF viewer;
- **three dimensions** exercised live: mass ladder (kg→g→mg, ×1000) and volume
  ladder (kL→L→mL, ×1000) render and play through the real UI, mass/volume
  word problems verified exact and realistic;
- Scales Lab end-to-end: ruler/kitchen/jug SVG instruments rendered and
  read via the real keypad flow (wrong → targeted feedback → correct → next),
  per-instrument progress recorded and shown in the teacher report;
- scale worksheets: Conversions | Read the Scales mode toggle, 10-item sheets
  (4 rulers, 3 kitchen, 3 jugs) with blank answer lines and no answer leaking
  into the sheet, answer key matching the items, and the scale-pack PDF
  (2-column layout, 2 sheet pages + key page) validated structurally in the
  browser across five regenerations;
- class set: identical sheets across learners (byte-identical SVGs in the
  browser), single shared answer key, and 5-page class-set scale PDF (2
  learners × 2 sheet pages + key) — this surfaced and fixed a latent PDF bug
  where Kids-array patching and hardcoded font refs (6/7) broke past 4 pages;
  font and Kids refs are now computed for any page count (regression tests
  cover 1, 2, 3, 5 and 10 pages);
- interactive scale sheets: typed answers marked per learner with ✓/✗,
  correct reading revealed on misses, blanks counted separately, results
  recorded per instrument via recordScaleFor (non-active learners' progress
  untouched), verified end-to-end in the browser for all-wrong and
  all-correct runs.

**Viewport checks** — the live preview viewport was 439×867 (phone/tablet
portrait), exercising the small-screen media query end-to-end. Desktop
(1366×768 and 1920×1080) and iPad landscape use the wider breakpoints
(cell sizes scale via clamp/vw/vh); these were layout-audited in CSS and by
DOM geometry but were **not** screenshot-verified on actual iPad hardware in
this environment.

## Known limitations

- Visual QA was done via accessibility-tree snapshots and DOM geometry, not
  screenshots on physical iPads — the webview in this environment could not
  produce screenshot frames. Fine-tuning of the doodle styling on real iPad
  hardware is recommended before rollout.
- Audio uses WebAudio (no bundled sound files) — simple, but not music.
- localStorage persistence is per-browser; a classroom that clears browser
  data loses progress (by design — no accounts).
- The service worker is network-first, so offline play requires a first
  online visit to populate the cache.
- The teacher PIN (5241) is a light classroom lock in client-side code, not
  real security — anyone with the source can read it. It is not stored in
  localStorage; the session unlock lasts until "Lock" or reload.
- Out-of-range conversions (km↔cm, km↔mm) are deliberately excluded from the
  game: the six ladder-adjacent relationships are the Grade 4 target.

## Future improvements

- Real iPad/desktop screenshot pass and styling polish.
- A "challenge" mode with optional streaks/timed rounds once accuracy is solid
  (accuracy first by design — timers deliberately absent during learning).
- Audio files (short royalty-free jingles) replacing WebAudio blips.
- Print-ready worksheets generated from the same question engine.
- Localisation of feedback copy into other South African languages.

## Run instructions

```bash
cd output/jo-go-metric-jumps
node tools/serve.js          # http://localhost:4173
# or simply open index.html directly in a browser
node tests/run-tests.js      # run the automated suite
```

No build step, no install, no network needed.

## GitHub Pages readiness

**Yes.** The project is fully static (HTML/CSS/JS, no server-side code) and
sits at the repository root's `output/jo-go-metric-jumps/`. To deploy on
GitHub Pages, either publish the repo root and open the folder path, or copy
the folder contents to the Pages root (or a `docs/` folder). The PWA manifest
and service worker use relative paths, so they work under any base path.
