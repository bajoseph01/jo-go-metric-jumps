# APP_CHECKER report

## Verdict

**Status:** PASS WITH RISKS
**App:** Jo⚡Go Metric Jumps (Grade 4 metric-conversion game + Scales Lab + teacher tools)
**Version / commit:** v=41 · commit 51c4a91 (main)
**URL:** http://localhost:4174/index.html (verified) · prod https://bajoseph01.github.io/jo-go-metric-jumps/ (serves v=41, HTTP 200)
**Run mode:** full
**Checked:** 2026-08-16

No confirmed BLOCKER or HIGH finding. All critical journeys completed end-to-end and every hard gate passed. Three MEDIUM findings (one double-activation bug in the timed-challenge intro, one unguarded post-completion crash path, one screen-reader gap on scale worksheets/challenges) and two LOW findings are reported below; none blocks release, but each is worth a fix before term.

## Scope and quality bar

Required journeys (educational app, touch-first, classroom iPads):
1. First launch → learner picker → add a learner with avatar + colour → home.
2. Play a stage: hint gating, correct/wrong feedback, streak + Next-button pacing, stage completion, unlock.
3. Read the Scales lab: ruler (mm beginner level), kitchen dial, measuring jug — correct, wrong, and invalid answers.
4. Teacher mode: PIN gate (wrong + correct), teacher panel, practice-all-levels.
5. Worksheets: per-learner conversion pack, class-set identical sheets, answer key, scale sheets with on-screen auto-marking and per-learner recording.
6. Timed class-set challenge: pick learner, intro, countdown, completion card, leaderboard.
7. Reports + PDF download; per-learner separation; persistence across reload.

Hard gates: node tests/run-tests.js (main app), node tests/visual-check.js (real-pixel, headless Edge), clock app suite (adjacent surface). Release-blocking bar: any BLOCKER/HIGH, a failed gate, or a critical journey that cannot be completed.

### Exclusions and limitations
- **Clock app (Tick⚡Tock)** in the same repo: full journey not re-driven this pass; its hard gate passed (1,649 checks). Adjacent-surface coverage only.
- **Physical iPad/Safari** not tested (no device here); verified in real headless Edge/Chrome at 768×1024 and 390×844, plus the interactive preview webview.
- **PDF exports**: generation is unit-validated (pdfBytes structure checks) and the Download button fires without console errors; the rendered bytes were not visually inspected.
- **Print dialogs** and **browser downloads** cannot complete inside the preview webview; verified only as click-without-error.
- **Screen-reader automation** not run (no tooling on this machine); accessibility was assessed via semantics, focus styles, keyboard reachability, and contrast math.
- **Manifest validator**: no app-checker.json/jogo-swarm.json exists in the repo (contract inferred per skill step 3); validate_manifest.py not runnable (no Python on this machine) — nothing to validate.
- **Live speech / audio** not testable headlessly (Audio layer is feature-flagged).

## Verification summary

| Lane | Result | Evidence |
| --- | --- | --- |
| Build / static checks | PASS | No build step (vanilla static site); all 14 assets 200; zero console errors in normal flows |
| Automated tests | PASS | Main: 6,244 checks / 0 failed; Visual: 55/55 real-pixel (main app + clock app); Clock (adjacent): 1,649 / 0 failed |
| Critical journeys | PASS | Boot/pick/add, play-stage, scales lab, teacher PIN/panel, worksheets (conv + scales + marking), timed challenge + leaderboard, reports, persistence all driven end-to-end |
| Device / input matrix | PASS WITH RISKS | Pointer + keyboard + touch (pointer-events design); iPad 768×1024 and phone 390×844 no horizontal overflow; see matrix |
| Visual inspection | PASS | 55/55 pixel assertions (main app + clock app); 9 evidence screenshots; embossed cards, mm/cm ruler levels, streak pill, Next-button flow all render |
| Accessibility | PASS WITH RISKS | Focus-visible styles, keyboard comma-track (arrow keys), labelled keypad; gaps: AC-003 (SR on scale sheets/challenge), AC-004 (unnamed colour radios) |
| Performance / resilience | PASS WITH RISKS | SW offline cache registered; refresh mid-game recovers cleanly; invalid input handled; AC-002 crash path unguarded |
| Educational evaluation | PASS WITH RISKS | Teaching overlay, per-question kid rules, recovery hints, no answer leak, grounded word problems; see section below |
| Trust / safety | PASS | PIN gate (client-side, honestly documented as light lock); destructive reset requires explicit confirm; Cancel preserves data; local-only storage |
## Findings

### AC-001 — Timed-challenge learner tap can stack intro dialogs; a leftover dialog can restart a running challenge
- **Severity:** MEDIUM
- **Type:** SOFTWARE BUG
- **Confidence:** high
- **Journey:** Timed class-set challenge → Who is playing → tap a learner card
- **Environment:** Real headless Edge, 768×1024, fresh profile, class-set challenge
- **Preconditions:** First-time learner (challenge intro not yet seen)
- **Frequency:** 2/2 probe runs with a rapid double-tap (single taps work correctly)
- **Expected:** One intro dialog; starting the challenge removes it.
- **Actual:** `chalStart` has no re-entrancy guard. Two rapid clicks on a learner card append **two** `.chal-intro-overlay` dialogs (both visible). Clicking one "Got it — let's go!" starts the challenge but leaves the **second dialog in the DOM**; its button can call `chalBegin` again mid-run.
- **Evidence:** `qa-results/challenge-intro-probe.js` — double-tap run: `REAL BROWSER RESULT: {"overlays":2,"shown":2,…}`; `AFTER GO: {"clock":true,"input":true,"overlaysLeft":1}`; `DOUBLE-TAP OVERLAY COUNT: 1`
- **Impact:** On a shared classroom iPad, a quick double-tap by an eager child can stack dialogs and, after starting, leave a phantom overlay that can silently restart the race.
- **Suggested next action:** Guard `chalStart` (ignore if an intro is already open or `chalState.learnerId` set), and remove any leftover intro overlays before `chalBegin`.

### AC-002 — Answer handlers crash if activated after a stage completes (`session` is null)
- **Severity:** MEDIUM
- **Type:** SOFTWARE BUG
- **Confidence:** medium
- **Journey:** Game → op/jump/drag question → correct answer → stage-complete transition
- **Environment:** Any context where a click reaches an answer button after completion
- **Preconditions:** Stage finished (`session = null`); a click reaches a `.btn--op`/`.btn--jump` handler (tap racing the stage→done change, or scripted activation of the hidden game DOM)
- **Frequency:** Reproduced 2× via scripted clicks after stageComplete; uncaught
- **Expected:** Stale activations are ignored.
- **Actual:** `TypeError: Cannot read properties of null (reading 'locked')` at `game.js:93` (`handleOpChoice`), uncaught; identical null-guard gap in the sibling handlers.
- **Evidence:** Console exceptions during the assessment (`preview_logs`), e.g. `TypeError … at Object.handleOpChoice (game.js?v=41:93:17)`; user-visible stage flow unaffected (done card already shown)
- **Impact:** Low visible impact today (hidden DOM), but any future re-render that keeps handlers alive makes this a hard crash path; noisy in logs.
- **Suggested next action:** Null-guard `session` at the top of `handleOpChoice`/`handleJumpsChoice`/`handleDragSettle` (`if (!session || session.locked) return;`).

### AC-003 — Scale worksheets and the timed challenge give screen-reader users no reading value
- **Severity:** MEDIUM
- **Type:** ACCESSIBILITY
- **Confidence:** high
- **Journey:** Worksheet pack → Read the Scales (on-screen answering); Timed challenge play
- **Environment:** Any; assistive-tech user
- **Preconditions:** Using a screen reader on a scale item
- **Expected:** The user can discover what the instrument reads.
- **Actual:** The worksheet/challenge SVGs carry generic labels (`aria-label="Ruler with arrow"`, `"Kitchen scale with needle"`, `"Measuring jug with liquid"`) with **no reading value**. (The interactive Scales Lab does include the value, e.g. "Ruler with arrow at 137 millimetres"; the worksheet variants deliberately omit it to avoid leaking answers, but that leaves no accessible path at all.)
- **Evidence:** Challenge item SVGs during the timed-challenge drive returned labels `"Kitchen scale with needle"`, `"Ruler with arrow"`, `"Measuring jug with liquid"` with no number; same for `wsScaleSVG` items on scale sheets
- **Impact:** A screen-reader user cannot complete scale-reading tasks on worksheets/challenges — the task is visual-only for them.
- **Suggested next action:** Provide an accessible equivalent that does not leak the answer to sighted users — e.g., a hidden `aria-description` for SR users, or an off-screen "describe the scale" control (major/minor tick counts without the answer); note the answer-in-aria tradeoff is inconsistent between the lab and the sheets.

### AC-004 — "Pick a colour" swatches have no accessible names
- **Severity:** LOW
- **Type:** ACCESSIBILITY
- **Confidence:** high
- **Journey:** Add-learner form (and rename)
- **Environment:** Any; assistive-tech user
- **Preconditions:** Focusing the colour radiogroup
- **Expected:** Each swatch is announced with a name (e.g. "colour 3" or a hex name).
- **Actual:** The radiogroup is labelled "Pick a colour" but every radio is unnamed; only the selected one exposes a "✓" glyph. A screen reader announces bare "radio" buttons, indistinguishable from each other.
- **Evidence:** Preview accessibility snapshot — `radiogroup "Pick a colour"` with 8 `radio "Colour"` children, only one containing text ("✓")
- **Impact:** Colour choice is inaccessible to SR users.
- **Suggested next action:** Give each swatch an `aria-label` ("Name colour — red", etc.) or group with visible names.

### AC-005 — HUD streak tally lingers through a wrong attempt
- **Severity:** LOW
- **Type:** UX FRICTION
- **Confidence:** high
- **Journey:** Game HUD streak
- **Environment:** Any
- **Preconditions:** A streak ≥ 1, then a wrong answer before completing the question
- **Expected:** The 🔥 tally reflects "streak broken" immediately (per the documented "wrong answer resets the streak" behaviour).
- **Actual:** `session.streak` only changes at question completion, so after a wrong attempt the HUD keeps showing the old value (e.g. 🔥 1) until the learner gets the question right — then it drops to 0.
- **Evidence:** Game drive: Q1 correct (🔥 1) → wrong attempt on Q2 (HUD still 🔥 1) → correct completion (🔥 0); the celebration-pill logic itself is correct (wrong-then-correct resets before any next celebration)
- **Impact:** Minor confusion ("I got it wrong but the flame is still on"); the pill/celebration path is unaffected.
- **Suggested next action:** Reset the HUD tally on a wrong attempt (keep the completion-time reset for first-try accounting), or relabel the HUD as "best this round".

## Observations (not defects)

- **O-1 — Show hint reveals the exact answer for op questions.** In stage 1, tapping 💡 Show hint exposes the ladder pills, which for "km → m" literally show `×1000` between the rungs — the correct answer. This matches the teacher's requested design (hint only on demand), but it is a direct answer reveal rather than a scaffold; a teacher who wants the hint to teach direction only (down = ×, not the exact factor) may want a lighter variant.
- **O-2 — Challenge intro visibility depends on `requestAnimationFrame`.** `showChallengeIntro` adds `overlay--show` inside a rAF with no fallback. Verified working in a real browser, but in the Freebuff preview webview rAF never fires (measured: 0 frames over 200 ms), so the overlay never appears there and the learner tap appears to do nothing until reload. A synchronous class add (or a timeout fallback) would make the dialog robust to throttled-frame environments (background tabs, energy-saver iPads).
- **O-3 — Challenge answers are revealed after a wrong try** ("✗ Not quite — it reads X"). Appropriate for the one-try timed mode; flagged so the teacher knows wrong answers still teach.
- **O-4 — SA comma-decimal format** (e.g. "2,5 m") is used consistently; the scales input accepts both "12,5" and "12.5".

## Educational evaluation (learning-design lane)

Evidence of strong scaffolding, judged against the skill's educational overlay:
- **No skill assumed:** every question card carries a kid-language method line; stage 1's rule teaches × vs ÷ *before* asking; the first-play overlay teaches the ladder, direction rule, and comma mechanic with a worked example (`2,5 m = 250 cm`).
- **Recovery feedback:** wrong answers give a specific, recoverable hint ("We are changing from m to the bigger km. We need FEWER km, so the number must get smaller. That means ÷1000."), and correct-after-wrong says "Good work — you got there!" — no shame, no leak of the next answer.
- **Answer format is taught, not assumed:** the kid rules and hint gating keep this discipline in the main game (and the colon/zero-pad rules in the adjacent clock app).
- **Reading load:** copy is short, concrete, and grounded (doors, pencils, bookshelves, sugar bags); no teacher-speak terms like "power of ten".
- **Graded challenge:** the ruler level (mm → cm) is gated by mastery (8+ attempts at 80%+ first-try) with a one-time celebration — progression matches capability.
- **Recommendation:** the one learner-facing risk is O-1 (hint = answer reveal for op questions) — worth a teacher-facing note or a "hint teaches the rule, not the answer" variant, plus real classroom observation for motivation/age-suitability claims (out of scope here).

## Device and input matrix

| Viewport / device | Pointer | Keyboard | Touch | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| iPad 768×1024 (primary) | ✓ | ✓ | ✓ | PASS | Real headless Edge; 55/55 pixel checks (incl. clock app); screenshots |
| Phone 390×844 | ✓ | n/a | ✓ | PASS | No horizontal overflow on home/game/scales/how; screenshots |
| Desktop 1440×900 | ✓ | ✓ | ✓ | PASS | Same code path; keyboard tested via T-trigger, arrow-key comma track, form inputs |

## Seeded behaviour runs

| Policy | Seed | Journey | Result | Evidence |
| --- | ---: | --- | --- | --- |
| Wrong PIN (1234) then correct (5241) | n/a | Teacher mode | PASS — rejected with "Incorrect PIN — try again.", accepted on correct entry | PIN modal drive |
| Rapid triple-tap on a game answer button | n/a | Stage 2 jumps | PASS — exactly one recorded answer (locked guard) | jumpsAttempts 1→2 |
| Rapid double-tap on a challenge learner card | n/a | Timed challenge | FAIL (AC-001) — 2 stacked dialogs, 1 leftover | probe, 2/2 runs |
| Invalid scale input ("abc") | n/a | Scales Lab | PASS — "Type a number, e.g. 137 or 2,5." | live drive |
| Refresh mid-game | n/a | Stage 2 | PASS — clean home, answered question persisted | reload drive |
| Skip first-play intro (Got it) | n/a | Play | PASS — question 1 renders directly | visual-check harness |
| Stale/empty localStorage | n/a | Boot | PASS — fresh "Who's playing?" boot | cleared-storage drive |
| Destructive reset → Cancel | n/a | Teacher panel | PASS — confirmation shown; data preserved (10 answers) | live drive |
| Stale handler activation post-completion | n/a | Game | FAIL (AC-002) — uncaught null-session TypeError | console evidence |

## Top actions

1. Add a re-entrancy guard to `chalStart` and remove leftover intro overlays before `chalBegin` (AC-001).
2. Null-guard `session` in the game answer handlers (AC-002).
3. Give scale worksheets/challenge an accessible reading path for screen readers (AC-003), and name the colour swatches (AC-004).
4. Decide on the HUD-streak timing (AC-005) and consider a lighter hint for op questions (O-1).

## Evidence index

- `qa-results/evidence/home.png`, `scales-ruler.png` — iPad-width, from the real-pixel harness (arrow-above-ruler geometry)
- `qa-results/evidence/phone-{home,game,scales,how}.png` — 390×844 renders, no overflow
- `qa-results/evidence/ipad-{teacher-panel,scale-sheets,challenge-pick}.png` — teacher surfaces at iPad width
- `qa-results/challenge-intro-probe.js` — real-browser proof the intro shows (single tap) and stacks (double tap)
- `qa-results/narrow-viewport-probe.js`, `qa-results/teacher-surfaces-probe.js` — reproducible probes
- App suites: `output/jo-go-metric-jumps/tests/run-tests.js` (6,244 ✓), `tests/visual-check.js` (55/55 ✓ — home, scales, game, How It Works, worksheets, challenge, clock app), clock suite (1,649 ✓)

**Relaunch:** server already running at `http://localhost:4174/index.html` (static server on port 4174, pid 33712). If needed: `node .freebuff/serve-static.js 4174` from the repo root. Production: `https://bajoseph01.github.io/jo-go-metric-jumps/`.

---

## Fix status (follow-up change)

All five findings were fixed and re-verified after this assessment. Shipped as v=42 (commit noted below in git log).

| Finding | Fix | Re-verification evidence |
| --- | --- | --- |
| AC-001 | `chalStart` now ignores repeat taps while an intro is open or a run is active; `chalBegin` removes leftover intro overlays; the intro shows synchronously instead of waiting for an animation frame | Real-browser probe, double-tap: `{"overlays":1,"shown":1,"display":"flex"}`, `AFTER GO: {"overlaysLeft":0}`, second double-tap count 0 (was 2 stacked / 1 leftover) |
| AC-002 | `guardSession()` (`!session || session.locked`) at the top of `handleOpChoice`/`handleJumpsChoice`/`handleDragSettle`/`handleAnswer` | 3 stale hidden-button clicks after stage complete: done card intact, console clean (no TypeError) |
| AC-003 | `Scales.scaleDescription(item)` builds a kid-language pointer-position description (big mark + small marks past it, never the numeric answer); `wsScaleSVG` embeds it as an escaped `<desc>`; unit-tested to derive exactly to every generated answer | Worksheet ruler SVG: `hasDesc:true`, desc "…1 millimetre…", visible label still "Ruler with arrow" |
| AC-004 | Colour swatches use a name map (`COLOR_NAMES`) → `aria-label="Blue colour"` … `"Brown colour"` | Live snapshot: all 8 radios named |
| AC-005 | `breakStreakNow()` resets the streak and re-renders the HUD the moment a genuinely wrong answer lands; invalid-format slips stay lenient | Live: 🔥2 → wrong answer → 🔥0 immediately |
| AC-006 | `.screen--active` locked to `height:100vh; height:100dvh; overflow:hidden` (vh fallback for older iOS Safari) so tall screens scroll INSIDE their `.page-body` instead of scrolling the whole page; landscape tablet query (`min-width:700px; max-height:950px`) reflows How It Works cards and worksheet sheets two-up | Probe: pageExcess 0 on every screen at 810×1080 and 1180×820; negative control (revert to min-height) fails exactly the 9 overflowing screens |

New guards added to `tests/run-tests.js` (suite 6,215 → 6,244 checks, 0 failed); real-pixel harness extended from 41 to 55 checks with 14 new iPad-fit assertions (page must never scroll at iPad portrait 810×1080 and landscape 1180×820 on home, How It Works, progress, practice, game, scales, worksheets) plus the existing clock-hand negative-control proof.
