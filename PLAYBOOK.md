# Jo⚡Go Metric Jumps — Build Playbook

*For future AI builders (and their human teachers). Read this BEFORE reading the code.*

This repo is not just an app — it is a worked example of a **build process**.
This playbook captures how the app actually got built: the request stream, the
process rules that made it work, the bugs that were caught, and the one master
prompt that would have gotten us here faster. The goal: **never reinvent the
wheel.** If you are asked to build something similar, you should inherit all
of this — not rediscover it.

---

## 1. What's in the repo (and what isn't)

| Artifact | What it is | What it's good for |
|---|---|---|
| `git log` (15 commits) | The complete timeline of the build | Shows the order requests arrived and how each landed |
| `output/jo-go-metric-jumps/tests/run-tests.js` | **6,093 executable acceptance checks** (sections 1–20) | Every feature's acceptance criteria, runnable with `node tests/run-tests.js` — the single most valuable artifact |
| `output/jo-go-metric-jumps/PROJECT_REPORT.md` | Build narrative: learning design, what was verified live, known limitations | Understanding *why* the app is shaped this way |
| `output/jo-go-metric-jumps/README.md` | Classroom-facing manual | What the teachers and kids see |
| `output/jo-go-metric-jumps/js/*` | Vanilla JS: math, formatting, questions, worksheets, scales, pdf, storage, audio, input, ui, game, app | The implementation |
| `.github/workflows/pages.yml` | Auto-deploy to GitHub Pages on push | Ops |
| `output/jo-go-metric-jumps/sw.js` | Network-first service worker (offline support) | Offline/update behaviour |
| `tools/` | `make-icon.js`, `serve.js` | Icon generation, local server |

**What is NOT in the repo:** the conversation itself — the requests, the
reasoning, the trade-offs, the critiques. Only compressed fragments survive in
commit messages and the project report. **This playbook is the replacement for
that missing memory.** Read it and you inherit the whole journey.

---

## 2. How this app was actually built

The build was one big mission plus **16 follow-up requests**. Each follow-up
taught a lesson. The order they arrived:

1. Initial build — 8-stage game, comma track, **length only**.
2. Design fix: the comma floated between numbers → anchor it to the base of
   the blocks; circle → rounded rectangle.
3. Content quality: word problems said "doors 48 m tall" → ground every number
   in physical reality.
4. Teacher mode behind PIN 5241 (practice all levels).
5. Per-learner profiles on a shared classroom device.
6. Rename learners, pick-before-PLAY, per-learner printable reports.
7. Class worksheet pack (weak pairs + word problems) with answer keys; PDF export.
8. **Mass (mg–g–kg) and volume (mL–L–kL)** added; kids must read physical
   scales (ruler, kitchen scale, jug).
9. Printable scale-reading worksheets (real instrument graphics, answer keys, PDF).
10. Class-set mode (identical sheets for the whole class) + on-screen typed
    answers with auto-marking, results recorded per learner.
11. Timed class-set challenge: countdown + leaderboard of first-try accuracy.
12. Human-first design pass #1 (challenge picker): identical avatars, cramped
    buttons, stale cached stylesheet on users' devices.
13. Design pass #2 (home + gameplay): PLAY prominence, dimension pills,
    per-learner **name colours**, kid-language intro overlay.
14. Design pass #3 (Report + Practice): status badges, mastery bars, coloured
    report, self-chosen colours.
15. GitHub Pages deployment + auto-deploy workflow.
16. Home screen: all three conversion ladders with memory notes + highlight.

**Read the pattern:** most of the *architectural* cost came from requests
that arrived late (mass/volume, scales, teacher tools, printing). Each one
forced a retrofit: the ladder had to become dimension-aware, the store had to
target learners by id, the PDF writer had to grow real vector graphics. **A
better first prompt anticipates this whole roadmap** (section 3) so the
architecture is built for it from day one.

---

## 3. The master prompt (reverse-engineered)

If we restarted today, this is the prompt that would get to the current state
in a fraction of the turns. It is written as a reusable template — swap the
bracketed bits for any app.

```text
BUILD: [Jo⚡Go Metric Jumps] — a [browser game teaching Grade 4 metric
conversions] for [children aged 9-10 on classroom iPads].

DELIVERABLE: a working, classroom-ready web app. Vanilla HTML/CSS/JS only —
no frameworks, no build step, no accounts, no network calls, no paid APIs.
Data in localStorage. Offline-capable (service worker). Deployable to
GitHub Pages with one push. Maintain ONE authoritative implementation path.

SCOPE — ALL of this is in scope from the start. Do not wait to be asked:
- The core learning loop: [8-stage campaign, drag-the-comma interaction,
  immediate corrective feedback, retry until right].
- Content breadth: [ALL THREE metric dimensions (length/mass/volume) with
  their own unit ladders, PLUS reading physical scales] — not one dimension
  retrofitted later.
- Multi-learner profiles from day one: separate progress/unlocks per child,
  distinct avatar AND name colour (so two kids with the same avatar are
  still identifiable), a picker that never silently defaults.
- Teacher mode behind a PIN: practice-all-levels, per-learner reports,
  worksheet generator, class-wide modes, printable/PDF export of everything.
- Print and PDF as first-class citizens: print-optimised CSS for every
  worksheet/report, and a dependency-free PDF writer with REAL vector
  graphics (not screenshots), correct for ANY page count.

DESIGN PRINCIPLES (non-negotiable, judged on every screen):
- Human-first: how does a 9-year-old see and feel this on first glance?
  Big type, thick ink borders, drop shadows with press physics, tap targets
  >= 44px, no hover dependence, nothing cramped or overlapping.
- Ground everything in reality: every number in a word problem must be
  physically plausible. A door is not 48 m tall. [A pencil is ~15 cm.]
- Kid language everywhere. Never just "wrong" — always teach the why.
- Delight in the details: a comma that sits AT THE BASE of the number
  blocks, a clock that pulses red in the final 10 seconds, tier emojis on
  score cards.

PROCESS CONTRACT — follow on every feature, without being asked:
1. Write the acceptance criteria as an executable Node test suite
   (no browser needed) and keep it green before shipping.
2. Verify in a live preview: drive the real UI end-to-end, check computed
   styles AND take screenshots; fix what looks off. Unit tests passing is
   NOT enough.
3. Cache-bust every asset (?v=N) and check the service worker, so a stale
   build can never reach a user's device.
4. Stress the edge cases: multi-page PDFs, worst-case orderings, timers
   expiring mid-flow, duplicate names/avatars.
5. Commit each finished feature with a message explaining the WHY.
6. Update the README and a project report in the same change.

KNOWN PITFALLS for this domain (from the catalog in section 6): [paste the
bug list so the builder checks for them up front].
```

**The honest caveat:** a better prompt gets you maybe 50–70% faster. It does
NOT eliminate the rest — several bugs only surface under real use, and the
design taste came from iterative critique. Budget for that. The prompt's real
value is that the *architecture* (dimension-agnostic engine, per-learner
store, print/PDF layer, test suite) exists from the start instead of being
retrofitted.

---

## 4. Experiment results: the master prompt, tested

The prompt above was validated in a controlled experiment: **Tick⚡Tock**
(`output/clock-go/`), a Grade 2–3 analogue-clock-reading game with the same
platform, audience and architecture but a different domain — so nothing was
copied from this app, only the genuinely generic inherited wheels (PDF
writer, audio synth, local server, design tokens).

**Numbers from the run:**

- **1,575 executable checks, 0 failed.** Three test-side assertion fixes;
  no app-logic fixes before the suite went green.
- **Zero retrofits.** The architectural surface — multi-learner profiles,
  teacher mode, worksheet generator, vector PDF export, multi-category
  engine, offline service worker, design system — was built in one pass.
  The original journey reached the same surface in 8 feature commits driven
  by 7 separate late requests, plus three real retrofits (dimension-aware
  ladder, per-learner store, real vector PDFs).
- **10 of the 12 original catalog pitfalls pre-empted by construction** —
  deterministic PDF ids, record-by-id store, level-agnostic engine, cache
  discipline, distinct identity, complete badge mapping, and the rest.
- **Two NEW pitfalls found** and added to the catalog (items 13–14): an
  undismissable picker sheet (a live-preview-only bug) and `build()`
  returning a Blob in modern Node.

**Honest caveats:** Tick⚡Tock carries less content depth (3 levels vs 8
stages + scales lab + challenge + leaderboard), and it inherited generic
wheels the original had to invent. The speed-up is on the *architectural*
portion — the part the prompt is designed to compress. Real-use bugs and
design taste still cost turns no prompt removes; the two new bugs are proof.
The app runs at `node tests/run-tests.js` in `output/clock-go/` and is
served on GitHub Pages alongside this game at `/jo-go-metric-jumps/clock-go/`.

---

## 5. Process rules that made this work

1. **Tests = executable acceptance criteria.** Every feature added its checks
   to `tests/run-tests.js`. When someone asks "did it work?", the answer is a
   command, not a memory.
2. **Verify in the browser, not just in Node.** The suite catches logic bugs;
   it cannot catch a 48-px avatar chip squashing a button into a cramped
   circle. Drive the real UI, inspect computed styles, screenshot.
3. **Deterministic generators.** Seeded RNG everywhere (questions, scales,
   worksheets) so tests and regressions are reproducible.
4. **Per-learner 
   state is sacred.** Store APIs target a learner *id*
   (`recordScaleFor(id, …)`), never the "active" learner, so teacher actions
   can't corrupt the wrong child's progress.
5. **Cache discipline.** Versioned assets (`?v=N`), network-first service
   worker, SW cache name bumped when the pre-cache list changes. Stale
   caches are how "we fixed it but the user still sees the old thing".
6. **Print/PDF from the start.** `@media print` rules swap interactive inputs
   for blank lines; the PDF writer is dependency-free and draws real vector
   graphics so exports stay crisp and valid at any page count.
7. **Small, why-message commits.** Each request = one commit = one readable
   diff. The git log is the project's second memory.
8. **Docs in the same change.** README (for users) and PROJECT_REPORT (for
   builders) updated whenever behaviour changes.
9. **Design passes are a standing step, not a reaction.** Instead of waiting
   for "this is ugly", schedule the human-first critique per screen.
10. **Pedagogical review is a standing step too.** "Correct" is not the same
    as "teaches". Before shipping, put a child who *cannot do the skill yet*
    in front of the screen (in your head) and check they can start, learn,
    and self-correct from the screen alone. Every game needs a first-play
    teaching moment, a per-level "how to read it" rule, and a format sample
    that can never be the answer.

---

## 6. Bug & pitfall catalog (concrete, from this project)

Check for these so you don't reinvent them:

1. **The comma floated between digits** instead of sitting at the base of the
   number blocks — a drag-target/visual-anchor mismatch. Anchor the badge to
   the track cells.
2. **Physically absurd word problems** (a door 48 m tall). Add plausibility
   checks to every question generator.
3. **PDF Kids-array length mismatch beyond 4 pages.** The page-tree patch
   only worked when digit-count sums matched the page count. Build page/font
   object ids **deterministically** for any page count.
4. **Hardcoded font object refs (`/F1 6 0 R /F2 7 0 R`)** regardless of page
   count — every multi-page export referenced wrong objects (lenient viewers
   tolerated it; strict ones render garbage). Compute font ids from the real
   object layout.
5. **Final-item tally bug:** clearing state before counting meant a perfect
   run read "10/9 · 111%". Count answered submissions before resetting.
6. **Badge mapper knew 3 of 4 mastery labels** — "Needs practice" silently
   inherited the blue "new" styling. Map ALL enum values.
7. **Store wrote to the active learner** instead of the learner the sheet
   belonged to. Target by id everywhere in teacher flows.
8. **Class conflict:** the 48-px avatar chip class reused as a button class
   → tiny cramped circles. Dedicated markup per component.
9. **Identical avatars for different learners** → kids can't tell who is
   them. Distinct avatar suggestion + name colours from the start.
10. **Stale cached stylesheet on user devices** long after a fix. Network-
    first SW + version bumps + SW cache bump. (Rule 5.)
11. **Length-only assumptions** baked into the ladder/questions. Build the
    engine dimension-agnostic (a ladder = a list of rungs; a gap = ×10/×100/
    ×1000) from day one.
12. **Chrome's default button rendering** when CSS fails to load — an
    unstyled page can look "broken" to users who have a cached old CSS.
    Cache discipline fixes this.
13. **A picker sheet that can't dismiss itself.** The learners sheet in the
    Tick⚡Tock experiment opened on first launch but had no way to close —
    tapping a learner didn't dismiss it and there was no close button.
    Any overlay that opens for selection must close on selection (or offer
    an explicit close). Live-preview-only bug — no unit test catches it.
14. **`build()` returns a Blob in modern Node** (global `Blob` since
    Node 18), so headless PDF tests silently get an empty string when they
    stringify it. Tests must call `buildBytes()`.
15. **Helper text that leaks the answer.** Tick⚡Tock's prompt read
    "Type the time, like 10:15" — where 10:15 was *the current question's
    answer*. The game was trivially solvable by reading the subtext. Any
    format example must be a FIXED sample that can never coincide with a
    live question, and a design pass should assert subtext-vs-answer
    mismatch explicitly.
16. **Pointers that assume the skill the app is meant to teach.**
    Tick⚡Tock's prompt told a new reader "Type the time, like 3:45" — but
    a child who can't read a clock yet can't produce a time at all, so the
    instruction was useless to exactly the kid it needed to help. Scaffold
    from the learner's side: a one-time teaching overlay, a per-level
    kid-language reading rule ("Big hand on 12 = o'clock · 3 = quarter
    past…"), and a placeholder with a FIXED format sample. The checks
    missed it because the suite verifies correctness, not teachability —
    that gap is why process rule 10 exists.
17. **Abstract "golden rule" chips that assume the vocabulary.** Jo⚡Go's
    in-game chip read "× = RIGHT · ÷ = LEFT · ZEROES = JUMPS" — a compact
    cheat-code only meaningful to someone who already understands
    conversions. A first-time child can't decode it. Replaced with a
    per-stage kid-language method line ("Is the new unit SMALLER? Then we
    need MORE of it — the number gets bigger, so ×") rendered on every
    question, plus a first-play "meet the ladder" overlay that teaches the
    comma mechanic before question one. Same fix in the scales lab:
    "Read the scale" now ships with per-instrument how-to (each small
    line = 1 mm / 20 g / 25 mL). Every learner-facing instruction should
    be asserted for kid-language words and for never stating a concrete
    answer.
18. **Faded clock hands — screen/print contrast drift.** Tick⚡Tock's
    on-screen hands were dark ink while the PDF path drew them as light
    grey (0.2/0.24 grayscale fill), and at small sizes even near-black
    polygons antialias into washed-out grey. Fixed with one source of
    truth: a near-black hour hand and a vivid RED minute hand (the
    classic classroom convention — kids can't mix up which hand is
    which) used identically in the SVG and PDF, plus a source-level test
    that bans the faded-grey fill values. When the same graphic exists
    on screen AND in print, its colors must be decided once and asserted
    in both.
19. **Polygon clock hands vanish at cardinal angles.** Tick⚡Tock drew
    its hands as triangles whose "width" offset was perpendicular to the
    hand direction. At 12/3/6/9 o'clock the triangle degenerates to zero
    area and the renderer draws NOTHING. The Whole & Half level only
    uses minutes 0/15/30/45 — so the minute hand was invisible for the
    whole first level, and the hour hand vanished at exact o'clock
    times. Users reported it as a "contrast" problem (one thin grey hand
    on screen); it was actually half the hands missing. Draw hands as
    thick round-capped STROKES (stroke width is applied perpendicular by
    the renderer and can never degenerate) in both SVG and PDF, and test
    EVERY generated angle for non-degenerate geometry. This one lived
    since the app's first build and only surfaced through a user
    complaint — the lesson: rasterize (pixel-count) the actual rendered
    output, don't just assert DOM attributes. Both suites now ship a
    deterministic software rasterizer (tests/rasterize.js) that renders
    the app's real SVG output to a pixel buffer and asserts colour-family
    counts at every generated position/angle. A follow-up audit of every
    other graphic in both apps found no further degeneracies: all other
    rotating elements are strokes and every polygon has a fixed
    non-collinear shape — but the rasterizer now proves it at every
    extreme position, so the class of bug can't silently return.
20. **The answer FORMAT is part of the lesson — and so is the pause after
    it.** Tick⚡Tock accepted "630" as correct for 6:30, silently hiding
    the colon the teacher was trying to teach; and a correct answer
    auto-advanced after 0.9s, so the child never got to sit with the
    feedback. Two fixes, both testable: (1) correctness now REQUIRES the
    literal ':' — a right-time-without-colon gets "So close! … the
    little colon : …" and is not counted (formatting is not
    comprehension, so firstTry is untouched and the child just retypes);
    the judge() pure function makes the rule unit-testable. (2) A
    correct answer hands control to an explicit "Next question →"
    button — no setTimeout in submitAnswer, keypad locked meanwhile —
    so the feedback moment belongs to the child. General lessons: in a
    teaching app, every input convention the teacher cares about must be
    enforced AND taught (in the intro, the guide, and the how-it-works
    copy, not just in the validator), and the "done" moment must never
    race the learner — reading feedback is part of the practice.

---

## 7. The "done" checklist (before you say done)

- [ ] `node tests/run-tests.js` green (all sections, 0 failed)
- [ ] Full flow driven in a live preview: setup → play → teacher PIN →
      reports → worksheets → PDF export → challenge
- [ ] **First-five-minutes test:** a child who can't do the skill yet can
      start, learn, and self-correct from the screen alone (teaching
      overlay, per-level rule, safe format sample)
- [ ] No helper text, example, or placeholder anywhere can equal the live
      answer
- [ ] No result auto-advances: every correct answer awaits the learner's
      own tap (Next button + gentle streak celebration, no timers)
- [ ] Every screen screenshot-checked for cramped/overlapping layout
- [ ] Print layout verified (`@media print`)
- [ ] PDF exports open validly — including multi-page and worst-case ordering
- [ ] Service worker pre-cache includes any new files; SW cache name bumped
- [ ] Asset versions bumped (`?v=N`)
- [ ] Offline reload works after first visit
- [ ] README + PROJECT_REPORT updated
- [ ] Committed with a why-message; pushed (Pages auto-deploys)

---

## 8. Adapting this playbook to a new app

The reusable core is **sections 3–7** — they are app-agnostic. To repurpose:

1. Copy this file beside the new app's repo.
2. Replace the bracketed parts of the master prompt (section 3) with the new
   app's domain, audience, and pitfalls (seed section 6 with your own known
   traps after the first build).
3. Keep the process contract and done-checklist verbatim — they transfer
   unchanged.
4. When the new app ships, append its bug catalog to section 5. The playbook
   is meant to grow: every project you build makes the next one faster.

*Made for Merrifield Prep & College — Jo⚡Go edition.* ⚡
