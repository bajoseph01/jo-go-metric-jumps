# Jo⚡Go Metric Jumps

**Master the comma. Master metric measurement.**

A touch-first, classroom-ready learning game for Grade 4 learners that teaches
metric conversion across **three dimensions** — length (km · m · cm · mm),
mass (kg · g · mg) and volume (kL · L · mL) — by making the decimal comma a
thing you can see, predict, and drag, plus a **Scales Lab** for reading
physical scales (ruler, kitchen scale, measuring jug).

> **× = RIGHT · ÷ = LEFT · ZEROES = JUMPS**

## Play

Open `index.html` in any modern browser (Chrome, Safari, Edge, Firefox) — no
server, no install, no login. On an iPad, add it to the Home Screen for a
full-screen experience; it works offline after the first visit.

Pick a dimension with the **Length · Mass · Volume** pills on the home screen.
Each dimension runs its own 8-stage campaign with its own ladder and its own
unlock progression, and word problems are grounded in real objects (bags of
sugar, rain tanks, pencils). **Read the Scales** opens the Scales Lab: read
live-rendered rulers (mm), kitchen dials (g) and measuring jugs (mL).

## How it teaches

Every conversion follows the same four-step mental model:

1. **Which operation?** — going to a smaller unit means × (the number gets bigger);
   going to a bigger unit means ÷ (the number gets smaller).
2. **How many jumps?** — the zeroes in the factor (10, 100, 1000) tell you how many
   places the comma moves.
3. **Move the comma** — a place-value track shows the digits as blocks, the comma as
   a draggable badge, and ghost zeroes appear as the comma crosses empty positions.
4. **Does it make sense?** — reasonableness checks ("Does this answer make sense?")
   stop learners from blindly moving commas without checking the size.

Learners **predict before the animation reveals the answer**; scaffolds fade from
guided choices (stages 1–3) to prediction (stage 4) to independent typing (stages
5–8), with mixed practice, spot-the-mistake challenges, and word-problem transfer.

## Stages

| # | Stage | Focus |
|---|-------|-------|
| 1 | Which Operation? | direction: × vs ÷ and the correct factor |
| 2 | How Many Jumps? | zeroes ↔ comma jumps |
| 3 | Guided Comma Move | full pipeline with landing markers |
| 4 | Predict Then Move | pipeline with markers removed |
| 5 | Independent Conversion | type answers; comma animation as feedback |
| 6 | Mixed Metric Challenge | all units, both directions, decimals + whole numbers |
| 7 | Spot the Mistake | judge a conversion, then fix it |
| 8 | Transfer Challenge | short Grade 4 word problems |

## Input

- **Touch / Apple Pencil / mouse** — Pointer Events; drag the comma or tap a
  landing spot
- **Keyboard** — type answers (comma or point accepted), arrow keys move the comma,
  Enter submits
- **On-screen keypad** — big Grade 4-friendly keypad with , ⌫ C and Check

## Project layout

```
index.html            app shell + screens
css/styles.css        all styling (hand-drawn doodle look, clean layouts)
js/math.js            exact integer math for the six conversions
js/formatting.js      SA formatting (decimal comma, 2 500 thousands spaces)
js/questions.js       stage definitions + question generator
js/storage.js         localStorage mastery model + adaptive weights
js/input.js           keypad + place-value comma track (pointer + keyboard)
js/ui.js              rendering, feedback, done/practice/progress/teacher
js/game.js            session flow, targeted feedback, reattempts, locking
js/app.js             boot, wiring, sound toggle, teacher access
js/audio.js           tiny WebAudio sounds (mutable, optional)
assets/               icons
tools/                dev helpers (static server, icon generator)
tests/run-tests.js    automated test suite (node tests/run-tests.js)
manifest.webmanifest  PWA manifest
sw.js                 offline service worker
```

## Development

```bash
node tools/serve.js        # starts a local static server on http://localhost:4173
node tests/run-tests.js    # runs the automated suite (6077 checks)
```

## Progress & teacher panel

Each child gets their own profile: tap the learner chip on the home screen (or
in the game HUD) to pick who is playing or add a new learner (name + avatar).
When no learner is selected, PLAY (and Practice/Progress) open the "Who's
playing?" picker first instead of silently defaulting to Learner 1. Tap the
**✎** on a learner card to rename them or change their avatar — progress is
kept. Mastery, unlocks, streaks and totals are tracked per learner, while
sound and motion settings stay device-wide. Everything is saved in
`localStorage` — no accounts, no data leaves the device. On the home screen,
long-press the Jo⚡Go logo (or press **T**) to open **teacher mode** (PIN: 5241):
mastery percentages, weak conversion pairs, reset, **Practice all levels** —
every stage including locked ones — a **per-learner printable report**
(mastery by category and conversion pair, with a learner switcher, Print and
**Download PDF** buttons), and a **Worksheet pack**: one printable or
PDF-exportable worksheet per selected learner that drills their weakest
conversion pairs plus two word problems, with an answer key. The pack has a
**Conversions | Read the Scales** toggle — the Scales mode prints one sheet
per learner with 10 rendered instrument graphics (ruler, kitchen dial,
measuring jug) and blank answer lines, with a matching answer key and PDF
export. **Class set** switches the pack to one identical sheet for everyone
(single shared answer key) so the whole class can be marked together, in both
modes. Scale sheets are also interactive: learners type their readings on
screen, press **Check my answers**, get ✓/✗ feedback with the correct reading
revealed on misses, and the results are recorded into each learner's
per-instrument scale progress. With **Class set** on, a **⚡ Start timed
challenge** button opens a countdown challenge: one shared sheet, 60/90/120
seconds on the clock, one attempt per reading (first-try counts), then the
next learner takes the device. Runs are recorded per learner and the session
closes with a **leaderboard ranked by first-try accuracy**, then items
answered, then time. The clock pulses red in the final 10 seconds and each
score card ends with a tier emoji (🌟 perfect, 🎉 great, 👍 solid, 💪 keep
going). Adding a learner auto-suggests an animal avatar nobody else has yet,
and every learner gets their own name colour from a palette — so even two
kids who pick the same animal are told apart instantly, everywhere their
name appears (home chip, learner cards, challenge picker, leaderboard). In
the add-learner form each child can **pick their own name colour** from the
palette; if they don't choose one, the first unused colour is suggested. The
first time each learner opens the challenge, a short overlay explains the
rules in kid language ("Read, type, one try each, climb the board!").

The **Practice** screen now shows a status badge per stage (Mastered /
Getting there / Needs practice / New) with a mastery bar, and locked stages
render as dashed cards so "not unlocked yet" is instantly visible. The
**Report** screen uses the learner's colour in the header, the switcher
chips and the progress dots, and colour-codes every stage's status badge so
a scan down the table tells you at a glance who needs help where.
Everything is generated locally — no network, no data leaves the device.

Made for Merrifield Prep & College — Jo⚡Go edition. ⚡
