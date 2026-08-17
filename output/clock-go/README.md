# Tick⚡Tock — the master-prompt experiment

**A Grade 2–3 analogue-clock-reading game** (whole & half → five minutes →
one minute), built as a controlled test of the master prompt in
[`PLAYBOOK.md`](../../PLAYBOOK.md). Same platform, audience and architecture
as Jo⚡Go Metric Master; different domain, so nothing was copy-pasted from the
game itself — only genuinely generic, inherited wheels (the PDF writer,
audio synth, local server, design tokens).

## How the master prompt was instantiated

The template's brackets were filled in as:

- **Core loop**: read the shown clock, type the time (`3:45`), immediate
  kid-language teaching feedback, retry the same question until right.
- **Content breadth**: ALL THREE levels from the start — a level is just a
  config `{ key, name, step }`, so the engine is level-agnostic by
  construction (the playbook's "ladder" lesson, applied to clocks).
- **Multi-learner profiles from day one**: per-child progress/unlocks,
  distinct avatar + name colour, picker never silently defaults, record-by-id
  store API.
- **Teacher mode behind PIN 5241**: practice any level, per-learner report,
  worksheet generator, print + PDF export of everything.
- **Print/PDF first-class**: `@media print` swaps, and the inherited vector
  PDF writer draws the same clock geometry (one source of truth) with
  deterministic page/font ids for any page count.
- **Human-first + reality**: clocks always show valid analogue times; every
  wrong answer teaches; no hover-only controls.

## The experiment's results

- **Full architectural scope in one build pass** — zero retrofits. The
  original app needed 8+ commits to reach the same surface (profiles, teacher
  mode, worksheets, PDF, multi-category engine), each driven by a late
  request.
- **10 of the playbook's 12 catalog pitfalls pre-empted by construction**
  (deterministic PDF ids, per-learner store, level-agnostic engine, cache
  discipline, distinct identity, complete badge mapping…).
- **Two NEW pitfalls found** (both small):
  1. The learners sheet had no way to dismiss itself after picking a
     learner — a UX bug only a live preview catches. Fixed.
  2. `doc.build()` returns a **Blob** in Node 18+ (global `Blob`), so
     headless tests must use `buildBytes()`. Added to the catalog.
- **1,575 executable checks, 0 failed** — generation determinism, exact hand
  angles, tolerant parsing, worksheet determinism, storage isolation/
  migration/unlocks, and PDF structure across 1/2/3/5 pages.
- Verified live: boot → add learner → play (wrong answer teaches, retry
  scores) → T → PIN 5241 → worksheets (6 clocks, no answer leaks, key,
  PDF export with correct font ids) → report (real per-learner data).

## Run it

```bash
node tests/run-tests.js     # 1,575 checks
node tools/serve.js 4174    # play at http://localhost:4174
```

*Made for Merrifield Prep & College — Tick⚡Tock edition.* ⚡
