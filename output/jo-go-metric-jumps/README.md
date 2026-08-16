# Jo⚡Go Metric Jumps

**Master the comma. Master metric length.**

A touch-first, classroom-ready learning game for Grade 4 learners that teaches
metric length conversion (km · m · cm · mm) by making the decimal comma a thing
you can see, predict, and drag.

> **× = RIGHT · ÷ = LEFT · ZEROES = JUMPS**

## Play

Open `index.html` in any modern browser (Chrome, Safari, Edge, Firefox) — no
server, no install, no login. On an iPad, add it to the Home Screen for a
full-screen experience; it works offline after the first visit.

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
node tests/run-tests.js    # runs the automated suite (5893 checks)
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
every stage including locked ones — and a **per-learner printable report**
(mastery by category and conversion pair, with a learner switcher and a Print
button) for teacher-led demonstration and parent/guardian handouts.

Made for Merrifield Prep & College — Jo⚡Go edition. ⚡
