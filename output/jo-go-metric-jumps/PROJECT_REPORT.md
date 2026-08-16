# Jo⚡Go Metric Jumps — Project Report

## What was built

A complete, classroom-ready browser game that teaches Grade 4 learners to convert
metric length units (km, m, cm, mm) by moving the decimal comma. The app is built
with semantic HTML, modern CSS and vanilla JavaScript (no frameworks, no server,
no accounts, no paid APIs) and is ready for GitHub Pages.

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

- **Play** — the 8-stage campaign (see README). Unlocks progressively.
- **Practice** — free practice on any unlocked stage (menu on the home screen).
- **My Progress** — mastery per category, streaks, and session counts.
- **How It Works** — in-app explanation of the ×/÷ ladder rule.
- **Teacher panel** — discreet (long-press the logo or press T): mastery
  percentages per category, attempts, weak conversion pairs, reset progress.
- **Sound toggle** — persistent preference; app is fully usable silent.

## Architecture

```
index.html            static shell for every screen
css/styles.css        single stylesheet, CSS variables, responsive breakpoints
js/math.js            exact conversion engine + comma-track builder (unit-testable)
js/formatting.js      SA formatting: decimal comma, 2 500 spacing, answer parsing
js/questions.js       stages, generators, adaptive pair weighting
js/storage.js         localStorage persistence + mastery model + mutators
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
3150 checks, 0 failures, covering:
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
- double-tap regression: three rapid submits count exactly once (re-entry lock).

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
- Teacher panel is intentionally local and unauthenticated (a classroom helper,
  not an admin system).
- Out-of-range conversions (km↔cm, km↔mm) are deliberately excluded from the
  game: the six ladder-adjacent relationships are the Grade 4 target.

## Future improvements

- Real iPad/desktop screenshot pass and styling polish.
- A "challenge" mode with optional streaks/timed rounds once accuracy is solid
  (accuracy first by design — timers deliberately absent during learning).
- Audio files (short royalty-free jingles) replacing WebAudio blips.
- Print-ready worksheets generated from the same question engine.
- Multi-learner profiles for classrooms sharing one device.
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
