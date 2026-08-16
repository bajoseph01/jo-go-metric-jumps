#!/usr/bin/env node
/**
 * run-tests.js — Tick⚡Tock (mini-app experiment)
 * Executable acceptance criteria, written FIRST per the playbook's process
 * contract. Run: node tests/run-tests.js
 *
 * Covers: deterministic clock generation per level, exact hand angles,
 * tolerant time parsing, worksheet determinism, per-learner storage
 * isolation/migration/unlocks, and PDF structural integrity (the
 * deterministic page/font-id lesson from the catalog).
 */
'use strict';

if (typeof global !== 'undefined') { global.self = global; }

const C = require('../js/clock.js');
const Store = require('../js/storage.js');
const PDF = require('../js/pdf.js');
const fs = require('fs');
const path = require('path');
const R = require('./rasterize.js');

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; failures.push(name); console.log('  ✗ ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (' + JSON.stringify(a) + ' !== ' + JSON.stringify(b) + ')'); }
function section(title) { console.log('\n== ' + title + ' =='); }

function makeRng(seed) { return C.makeRng(seed); }

// ------------------------------------------------------------------
section('1. Clock generation');
// ------------------------------------------------------------------
const whole = C.levelByKey('whole');
const five = C.levelByKey('five');
const one = C.levelByKey('one');
eq(C.LEVELS.length, 3, 'three levels defined');

// validity: every generated time lands on the level's granularity, in range
for (let i = 0; i < 500; i++) {
  const q = C.generate(whole, Math.random);
  ok(q.h >= 1 && q.h <= 12 && [0, 15, 30, 45].indexOf(q.m) >= 0, 'whole level valid: ' + JSON.stringify(q));
}
for (let i = 0; i < 500; i++) {
  const q = C.generate(five, Math.random);
  ok(q.h >= 1 && q.h <= 12 && q.m >= 0 && q.m <= 55 && q.m % 5 === 0, 'five level valid: ' + JSON.stringify(q));
}
for (let i = 0; i < 500; i++) {
  const q = C.generate(one, Math.random);
  ok(q.h >= 1 && q.h <= 12 && q.m >= 0 && q.m <= 59, 'one level valid: ' + JSON.stringify(q));
}

// determinism with a seeded rng
eq(JSON.stringify(C.generate(whole, makeRng(7))), JSON.stringify(C.generate(whole, makeRng(7))), 'whole deterministic per seed');
eq(JSON.stringify(C.generate(one, makeRng(99))), JSON.stringify(C.generate(one, makeRng(99))), 'one deterministic per seed');
ok(JSON.stringify(C.generate(whole, makeRng(7))) !== JSON.stringify(C.generate(whole, makeRng(8))), 'different seeds differ');

// ------------------------------------------------------------------
section('2. Hand angles (exact)');
// ------------------------------------------------------------------
let h = C.handsFor(3, 0);
eq(h.hour, 90, '3:00 hour hand at 90deg');
eq(h.minute, 0, '3:00 minute hand at 0deg');
h = C.handsFor(3, 45);
eq(h.hour, 112.5, '3:45 hour hand halfway between 3 and 4 (112.5deg)');
eq(h.minute, 270, '3:45 minute hand at 270deg');
h = C.handsFor(12, 30);
eq(h.hour, 15, '12:30 hour hand at 15deg');
eq(h.minute, 180, '12:30 minute hand at 180deg');

// ------------------------------------------------------------------
section('3. Time parsing + correctness');
// ------------------------------------------------------------------
eq(JSON.stringify(C.parseTime('3:45')), '{"h":3,"m":45}', '3:45 parsed');
eq(JSON.stringify(C.parseTime('3.45')), '{"h":3,"m":45}', '3.45 parsed');
eq(JSON.stringify(C.parseTime('345')), '{"h":3,"m":45}', '345 parsed as 3:45');
eq(JSON.stringify(C.parseTime('12')), '{"h":12,"m":0}', '12 parsed as 12:00');
eq(JSON.stringify(C.parseTime('9')), '{"h":9,"m":0}', '9 parsed as 9:00');
eq(JSON.stringify(C.parseTime(' 3 : 45 ')), '{"h":3,"m":45}', 'spaces tolerated');
eq(JSON.stringify(C.parseTime('3:5')), '{"h":3,"m":5}', '3:5 equals 3:05');
ok(C.parseTime('13:00') === null, '13:00 rejected (hours 1-12)');
ok(C.parseTime('3:99') === null, '3:99 rejected');
ok(C.parseTime('abc') === null, 'garbage rejected');
ok(C.parseTime('') === null, 'empty rejected');

const q345 = { h: 3, m: 45 };
ok(C.isCorrect(q345, C.parseTime('3:45')), '3:45 correct');
ok(C.isCorrect(q345, C.parseTime('345')), '345 correct too');
ok(!C.isCorrect(q345, C.parseTime('3:30')), '3:30 wrong');
const q305 = { h: 3, m: 5 };
ok(C.isCorrect(q305, C.parseTime('3:05')), 'leading zero accepted');
ok(C.isCorrect(q305, C.parseTime('3:5')), 'no leading zero accepted');

// presentation is PART of the lesson: right time without ':' or the zero
// pad is so-close ('format-*'), never counted correct.
eq(C.judge(q345, '3:45'), 'correct', '3:45 with colon is correct');
eq(C.judge(q345, ' 3 : 45 '), 'correct', 'spaced colon input is correct');
eq(C.judge(q345, '03:45'), 'correct', '03:45 (leading hour zero) is correct');
eq(C.judge(q345, '345'), 'format-colon', '345 (no colon) is so-close format');
eq(C.judge(q345, '3.45'), 'format-colon', '3.45 (dot, no colon) is so-close format');
eq(C.judge({ h: 12, m: 0 }, '12'), 'format-colon', '12 for 12:00 is so-close format');
eq(C.judge({ h: 12, m: 0 }, '12:00'), 'correct', '12:00 with colon is correct');
eq(C.judge({ h: 3, m: 5 }, '3:05'), 'correct', '3:05 with zero pad is correct');
eq(C.judge({ h: 3, m: 5 }, '3:5'), 'format-pad', '3:5 for 3:05 is so-close pad format');
eq(C.judge({ h: 12, m: 0 }, '12:0'), 'format-pad', '12:0 for 12:00 is so-close pad format');
eq(C.judge(q345, '3:045'), 'format-pad', '3:045 for 3:45 is so-close pad format');
eq(C.judge(q345, '3:30'), 'wrong', '3:30 is wrong');
eq(C.judge(q345, 'abc'), 'invalid', 'garbage is invalid');
eq(C.judge(q345, ''), 'invalid', 'empty is invalid');

// feedback is kid language and always mentions the correct time
ok(C.feedback({ h: 3, m: 0 }).indexOf('3 o') >= 0, '3:00 feedback says 3 o\u2019clock');
ok(C.feedback({ h: 3, m: 45 }).indexOf('quarter to 4') >= 0, '3:45 feedback says quarter to 4');
ok(C.feedback({ h: 7, m: 20 }).indexOf('20 minutes past 7') >= 0, '7:20 feedback says 20 past 7');
ok(C.feedback({ h: 11, m: 50 }).indexOf('10 minutes to 12') >= 0, '11:50 feedback says 10 to 12');

// ------------------------------------------------------------------
section('4. Worksheets (deterministic)');
// ------------------------------------------------------------------
const wsA = C.worksheet(whole, 6, 42);
const wsB = C.worksheet(whole, 6, 42);
eq(wsA.items.length, 6, 'six clocks per sheet');
eq(JSON.stringify(wsA.items), JSON.stringify(wsB.items), 'same seed -> same sheet');
ok(JSON.stringify(wsA.items) !== JSON.stringify(C.worksheet(whole, 6, 43).items), 'different seed -> different sheet');
ok(wsA.items.every(q => q.m % 5 === 0 || [0, 15, 30, 45].indexOf(q.m) >= 0), 'worksheet items on whole-level marks');

// ------------------------------------------------------------------
section('5. Storage: isolation, migration, unlocks');
// ------------------------------------------------------------------
function mem() { let m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; }

const st = Store.createStore(mem());
const ada = st.addLearner('Ada', '🦊');
const ben = st.addLearner('Ben', '🐼');
ok(st.learners().length === 2, 'two learners added');
ok(ada.id !== ben.id, 'distinct ids');
ok(ada.color.indexOf('#') === 0 && Store.COLORS.indexOf(ada.color) >= 0, 'Ada has a palette colour');
ok(ben.color.indexOf('#') === 0 && Store.COLORS.indexOf(ben.color) >= 0, 'Ben has a palette colour');

// record targets a learner id, never the active learner
st.setActive(ben.id);
st.record(ada.id, 'whole', true);
st.record(ada.id, 'whole', false);
eq(st.progressOf(ada.id).whole.attempts, 2, 'Ada recorded (targeted by id)');
eq(st.progressOf(ada.id).whole.firstTry, 1, 'Ada first-try counted');
eq(st.progressOf(ben.id).whole.attempts, 0, 'Ben untouched while active');

// unlocks
eq(st.unlockedLevels(ada.id).whole, true, 'whole always unlocked');
eq(st.unlockedLevels(ada.id).five, false, 'five locked until whole mastered');
for (let i = 0; i < 5; i++) st.record(ada.id, 'whole', true);
eq(st.unlockedLevels(ada.id).five, true, 'five unlocks after 5 whole first-tries');
eq(st.unlockedLevels(ada.id).one, false, 'one still locked');
for (let i = 0; i < 5; i++) st.record(ada.id, 'five', true);
eq(st.unlockedLevels(ada.id).one, true, 'one unlocks after 5 five first-tries');

// rename keeps progress and can change colour
st.renameLearner(ada.id, 'Ada-May', '🦊', Store.COLORS[3]);
eq(st.learners()[0].name, 'Ada-May', 'rename applied');
eq(st.learners()[0].color, Store.COLORS[3], 'colour changed via rename');
eq(st.progressOf(ada.id).whole.firstTry, 6, 'progress kept through rename');

// PIN
eq(st.verifyPin('5241'), true, 'correct PIN accepted');
eq(st.verifyPin('0000'), false, 'wrong PIN rejected');

// migration: colour derived stably for a pre-colour record
const st2 = Store.createStore(mem());
const old = st2.addLearner('Old', '🦊');
const raw = { learners: [{ id: old.id, name: 'Old', emoji: '🦊', progress: {} }], activeId: old.id, sound: true };
const m2 = mem(); m2.setItem('ticktock-v1', JSON.stringify(raw));
const st3 = Store.createStore(m2);
const migrated = st3.learners()[0];
ok(migrated.color.indexOf('#') === 0, 'missing colour derived on load');
eq(migrated.color, migrated.color, 'derived colour stable (same object)');
const st4 = Store.createStore(m2);
eq(st3.learners()[0].color, st4.learners()[0].color, 'derived colour stable across reloads');

// sanitize: corrupt data falls back to defaults
const st5 = Store.createStore({ getItem: () => '{not json', setItem: () => {} });
eq(st5.learners().length, 0, 'corrupt store -> empty roster, no crash');

// ------------------------------------------------------------------
section('6. PDF structural integrity (deterministic ids for any page count)');
// ------------------------------------------------------------------
function pdfText(n) {
  const doc = PDF.createDoc({ margin: 40 });
  doc.title('Test document');
  for (let i = 0; i < n; i++) {
    doc.para('Page ' + (i + 1) + ' content');
    if (i < n - 1) doc.pageBreak();
  }
  const bytes = doc.buildBytes();
  return String.fromCharCode.apply(null, bytes);
}

for (const n of [1, 2, 3, 5]) {
  const t = pdfText(n);
  const kidsMatch = t.match(/\/Kids \[([^\]]*)\]/);
  const refs = kidsMatch ? kidsMatch[1].trim().replace(/\s+/g, ' ') : '';
  const expect = Array.from({ length: n }, (_, k) => (3 + 2 * k) + ' 0 R').join(' ');
  ok(refs === expect, n + ' page(s): Kids array has exactly ' + n + ' page refs');
  ok(t.indexOf('/F1 ' + (3 + 2 * n) + ' 0 R') >= 0, n + ' page(s): F1 resolves to computed font id');
  ok(t.indexOf('/F2 ' + (4 + 2 * n) + ' 0 R') >= 0, n + ' page(s): F2 resolves to computed font id');
  ok(t.indexOf('startxref') > -1 && t.indexOf('%%EOF') > -1, n + ' page(s): xref trailer present');
  ok(/\/Count \d+/.test(t), n + ' page(s): pages tree has a Count');
}

// ------------------------------------------------------------------
section('7. Teaching hints (method, never the answer) + intro flag');
// ------------------------------------------------------------------
// Level rules teach HOW to read the clock; they must never look like a time.
ok(C.hint('whole').indexOf('quarter past') >= 0, 'whole hint teaches quarters');
ok(C.hint('five').indexOf('5 minutes') >= 0, 'five hint teaches count-by-5s');
ok(C.hint('one').indexOf('tick') >= 0, 'one hint teaches minute ticks');
for (const key of ['whole', 'five', 'one']) {
  const h = C.hint(key);
  ok(h.indexOf(':') < 0, key + ' hint contains no colon (cannot leak a time)');
  ok(h.length > 20, key + ' hint is a real explanation, not a one-liner');
  ok(h.indexOf('RED') >= 0, key + ' hint names the RED minute hand');
}
ok(C.feedback({ h: 9, m: 45 }).indexOf('RED hand') >= 0, 'feedback names the RED minute hand');

// intro flag is per learner, survives reloads, ignores unknowns
const stI = Store.createStore(mem());
const iA = stI.addLearner('Ada', '🦊');
const iB = stI.addLearner('Ben', '🐼');
eq(stI.seenIntro(iA.id), false, 'intro unseen by default');
ok(stI.markIntro(iA.id), 'markIntro returns true for a real learner');
eq(stI.seenIntro(iA.id), true, 'intro marked seen for Ada');
eq(stI.seenIntro(iB.id), false, 'other learner unaffected');
ok(!stI.markIntro('nope'), 'unknown learner ignored');

// Static helper text must never look like a time (catalog #15/#16):
// no colon, no digits that could read as an answer. The rule itself is
// injected at ask() time, so the markup fallback must stay generic.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sub = html.match(/id="q-sub"[^>]*>([^<]*)</);
ok(sub && sub[1].indexOf(':') < 0 && !/\d/.test(sub[1]), 'static q-sub fallback is generic (no colon, no digits)');

// ------------------------------------------------------------------
section('8. Teacher guide (the first five minutes)');
// ------------------------------------------------------------------
// The teacher panel must offer the guide, and the guide must walk through
// exactly what a child sees: the intro steps, the levels, worksheets.
ok(html.indexOf('data-action="guide"') > -1, 'teacher panel has a guide action');
ok(html.indexOf('guide-backdrop') > -1, 'guide overlay present in markup');
ok(html.indexOf('The first five minutes') > -1, 'guide titled for the teacher');
ok(html.indexOf('First play') > -1 && html.indexOf('teaching intro') > -1, 'guide covers the first-play intro');
ok(html.indexOf('Whole &amp; Half') > -1 && html.indexOf('Five minutes') > -1 && html.indexOf('One minute') > -1, 'guide covers all three levels');
ok(html.indexOf('Worksheets') > -1 && html.indexOf('answer key') > -1, 'guide covers worksheets + answer key');
ok(html.indexOf('5241') > -1, 'guide states the PIN for every device');

// ------------------------------------------------------------------
section('9. Clock hands render at every angle (no degenerate polygons)');
// ------------------------------------------------------------------
// The Whole & Half level only uses minutes 0/15/30/45 — cardinal angles
// where perpendicular-offset POLYGON hands degenerate to zero area and
// vanish. Hands must be thick round-capped strokes (SVG) and thick lines
// (PDF) so they paint at ANY angle, near-black hour + red minute.
require('../js/audio.js');
require('../js/ui.js');
const UI = global.JOGO.UI;
ok(!!UI.clockSvg, 'clockSvg exported for geometry testing');

function handLines(svg) {
  const out = [];
  let m;
  const re = /<line ([^>]*stroke="#(?:1A1A1F|E64545)"[^>]*)\/>/g;
  while ((m = re.exec(svg)) !== null) {
    const attrs = m[1];
    const get = (n) => Number(attrs.match(new RegExp(n + '="([-\\d.]+)"'))[1]);
    out.push({ x1: get('x1'), y1: get('y1'), x2: get('x2'), y2: get('y2'), stroke: attrs.match(/stroke="(#[0-9A-F]+)"/)[1], width: get('stroke-width'), cap: /stroke-linecap="round"/.test(attrs) });
  }
  return out;
}

let allHandsRender = true;
let allRoundCapped = true;
for (let h = 1; h <= 12; h++) {
  for (const m of [0, 15, 30, 45]) {
    const svg = UI.clockSvg({ h, m }, 120);
    const lines = handLines(svg);
    if (lines.length !== 2) { allHandsRender = false; continue; }
    const hh = lines.find((l) => l.stroke === '#1A1A1F');
    const mh = lines.find((l) => l.stroke === '#E64545');
    // The cardinal-angle bug: endpoints must differ (real length) and the
    // stroke must be round-capped so the renderer paints real thickness.
    const hLen = hh && (Math.abs(hh.x2 - hh.x1) > 0.5 || Math.abs(hh.y2 - hh.y1) > 0.5);
    const mLen = mh && (Math.abs(mh.x2 - mh.x1) > 0.5 || Math.abs(mh.y2 - mh.y1) > 0.5);
    if (!(hLen && mLen)) { allHandsRender = false; }
    if (!(hh && hh.cap && mh && mh.cap)) { allRoundCapped = false; }
    if (svg.indexOf('<polygon') > -1) { allHandsRender = false; }
  }
}
ok(allHandsRender, 'both hands render for ALL 48 whole&half times (no degenerate polygons)');
ok(allRoundCapped, 'both hands are round-capped strokes at every whole&half time');

// PIXEL CHECK (playbook item 19: rasterize, don't just assert attributes).
// Render every whole&half clock to a real pixel buffer and count colour
// families — the red minute hand must paint pixels at EVERY angle,
// including the cardinal ones that used to vanish.
{
  let allRed = true, allDark = true;
  for (let h = 1; h <= 12; h++) {
    for (const m of [0, 15, 30, 45]) {
      const px = R.rasterize(UI.clockSvg({ h, m }, 120), 2);
      if (px.red < 80) allRed = false;
      if (px.dark < 300) allDark = false;
    }
  }
  ok(allRed, 'PIXELS: red minute hand paints at all 48 whole&half times');
  ok(allDark, 'PIXELS: hour hand + face paint at all 48 whole&half times');
  const px12 = R.rasterize(UI.clockSvg({ h: 12, m: 0 }, 120), 2);   // both hands vertical
  const px315 = R.rasterize(UI.clockSvg({ h: 3, m: 15 }, 120), 2);  // minute horizontal
  ok(px12.red > 200, 'PIXELS: 12:00 vertical minute hand paints red (' + px12.red + ')');
  ok(px315.red > 200, 'PIXELS: 3:15 horizontal minute hand paints red (' + px315.red + ')');
}

const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
ok(uiSrc.indexOf('stroke="#1A1A1F"') > -1, 'svg hour hand is near-black');
ok(uiSrc.indexOf('stroke="#E64545"') > -1, 'svg minute hand is vivid red');
eq(uiSrc.indexOf('fill="#1E4ED8"'), -1, 'old faded blue minute hand removed from svg');
ok(uiSrc.indexOf('handPoly') === -1, 'degenerate polygon hands removed entirely');
ok(uiSrc.indexOf('0.902 0.271 0.271') > -1, 'pdf minute hand red, not grey');

// Colon is taught, and correct answers advance on the child's OWN tap:
// no auto-advance timer may live inside submitAnswer.
ok(uiSrc.indexOf('function nextQuestion') > -1, 'a nextQuestion() step exists');
ok(uiSrc.indexOf('data-key="next"') > -1, 'the Next button is built in ui.js');
ok(uiSrc.indexOf('So close! That is the right time') > -1, 'format feedback says so-close, not wrong');
ok(uiSrc.indexOf('the minutes need two digits') > -1, 'zero-pad feedback names the missing digits');
{
  const sub = uiSrc.slice(uiSrc.indexOf('function submitAnswer'), uiSrc.indexOf('function showFeedback'));
  ok(sub.indexOf('setTimeout') === -1, 'submitAnswer never auto-advances (no setTimeout)');
  ok(sub.indexOf('C.judge') > -1, 'submitAnswer judges via C.judge (colon rule)');
  ok(sub.indexOf('showNext()') > -1, 'correct answers hand control to a Next button');
}
{
  const ak = uiSrc.slice(uiSrc.indexOf('function ask'), uiSrc.indexOf('function sample'));
  ok(ak.indexOf('buildKeypad') > -1, 'ask() rebuilds the digit keypad after Next');
}

// The colon lesson is in the learner-facing copy (intro + guide + how-it-works).
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
ok((htmlSrc.match(/little colon :/g) || []).length >= 3, 'colon taught in intro, guide and how-it-works copy');
ok(htmlSrc.indexOf('3:05') > -1, 'zero-pad example (3:05) taught in the copy');

// PDF: a 12:00 clock (BOTH hands vertical — the old degeneracy) must emit
// two thick stroked lines with the red + near-black colors.
{
  const doc = PDF.createDoc({ margin: 40 });
  UI.clockPdf(doc, 150, 150, 90, { h: 12, m: 0 });
  const t = String.fromCharCode.apply(null, doc.buildBytes());
  ok(t.indexOf('0.902 0.271 0.271 RG') > -1, 'pdf 12:00 minute hand is red stroked line');
  ok(t.indexOf('0.04 RG') > -1, 'pdf 12:00 hour hand is near-black stroked line');
  const wides = (t.match(/\d+\.\d+ w /g) || []).map((s) => Number(s.replace(' w ', '')));
  ok(wides.some((w) => w >= 8), 'pdf hands have real stroke thickness (>=8pt)');
  ok(t.indexOf('0.24 RG') === -1, 'faded-grey pdf minute hand removed');
}

// ------------------------------------------------------------------
// Summary
// ------------------------------------------------------------------
console.log('\n========================================');
console.log('PASSED: ' + passed + '   FAILED: ' + failed);
console.log('========================================');
if (failed > 0) {
  console.log('Failures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('All tests passed ✓');
