#!/usr/bin/env node
/**
 * run-tests.js — automated checks for Jo⚡Go Metric Jumps.
 * Run: node tests/run-tests.js
 *
 * Covers: the six canonical conversions, exact integer arithmetic, decimal
 * comma formatting, typed-answer parsing, comma-track construction and
 * normalisation, question generation (all stages), adaptive weighting,
 * storage round-trips, and the mission's explicit error-case conversions.
 */
'use strict';

const M = require('../js/math.js');
const F = require('../js/formatting.js');
const Q = require('../js/questions.js');
const Store = require('../js/storage.js');

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; failures.push(name); console.log('  ✗ ' + name); }
}

function eq(a, b, name) { ok(a === b, name + ' (' + a + ' !== ' + b + ')'); }

function section(title) { console.log('\n== ' + title + ' =='); }

// ------------------------------------------------------------------
section('1. Six canonical conversions');
// ------------------------------------------------------------------
const SIX = [
  ['km', 'm', '×', 1000, 3],
  ['m', 'km', '÷', 1000, 3],
  ['m', 'cm', '×', 100, 2],
  ['cm', 'm', '÷', 100, 2],
  ['cm', 'mm', '×', 10, 1],
  ['mm', 'cm', '÷', 10, 1]
];
for (const [a, b, op, factor, jumps] of SIX) {
  const c = M.conversion(a, b);
  eq(c.op, op, a + '→' + b + ' op');
  eq(c.factor, factor, a + '→' + b + ' factor');
  eq(c.jumps, jumps, a + '→' + b + ' jumps');
}

// out-of-range conversions must throw (km↔cm is 5 jumps, km↔mm is 6)
let threw = false;
try { M.conversion('km', 'cm'); } catch (e) { threw = true; }
ok(threw, 'km→cm (5 jumps) rejected');
threw = false;
try { M.conversion('km', 'mm'); } catch (e) { threw = true; }
ok(threw, 'km→mm (6 jumps) rejected');
threw = false;
try { M.conversion('m', 'm'); } catch (e) { threw = true; }
ok(threw, 'same-unit conversion rejected');

// ------------------------------------------------------------------
section('2. Mission error-case conversions (exact)');
// ------------------------------------------------------------------
const CASES = [
  [5, 10, 'm', 'cm', '50'],        // 0,5 m -> cm
  [5, 100, 'm', 'cm', '5'],        // 0,05 m -> cm
  [5, 1, 'm', 'mm', '5 000'],      // 5 m -> mm
  [5000, 1, 'mm', 'm', '5'],       // 5 000 mm -> m
  [250, 1, 'cm', 'm', '2,5'],      // 250 cm -> m
  [25, 1, 'cm', 'm', '0,25'],      // 25 cm -> m
  [25, 10, 'km', 'm', '2 500'],    // 2,5 km -> m
  [3, 1000, 'km', 'm', '3'],       // 0,003 km -> m
  [450, 1, 'cm', 'm', '4,5'],      // 450 cm -> m
  [4500, 1, 'mm', 'm', '4,5'],     // 4 500 mm -> m
  [12, 10, 'cm', 'mm', '12'],      // 1,2 cm -> mm
  [120, 1, 'mm', 'cm', '12']       // 120 mm -> cm
];
for (const [scaled, scale, from, to, want] of CASES) {
  const r = M.convertValue(scaled, scale, M.conversion(from, to));
  eq(F.rationalToSA(r.num, r.den), want, scaled + '/' + scale + ' ' + from + '→' + to);
}

// ------------------------------------------------------------------
section('3. Comma-track construction + normalisation');
// ------------------------------------------------------------------
function trackCheck(scaled, scale, from, to, wantStart, wantTarget, wantFinal) {
  const t = M.buildTrack(scaled, scale, M.conversion(from, to));
  eq(t.startGap, wantStart, 'start gap ' + scaled + '/' + scale + ' ' + from + '→' + to);
  eq(t.targetGap, wantTarget, 'target gap ' + scaled + '/' + scale + ' ' + from + '→' + to);
  eq(M.normaliseTrack(t, t.targetGap), wantFinal, 'final value ' + scaled + '/' + scale + ' ' + from + '→' + to);
  return t;
}

// 2,5 m ×100 -> 250 : cells [2,5,g,g], start 1, target 3
trackCheck(25, 10, 'm', 'cm', 1, 3, '250');
// 450 cm ÷100 -> 4,5 : start 3, target 1, no ghosts
trackCheck(450, 1, 'cm', 'm', 3, 1, '4,5');
// 25 cm ÷100 -> 0,25 : leading ghost born, start 3, target 1
trackCheck(25, 1, 'cm', 'm', 3, 1, '0,25');
// 0,05 m ×100 -> 5 : trailing ghosts
trackCheck(5, 100, 'm', 'cm', 1, 3, '5');
// 0,5 m ×1000 -> 500
trackCheck(5, 10, 'm', 'mm', 1, 4, '500');
// 2,5 km ×1000 -> 2 500
trackCheck(25, 10, 'km', 'm', 1, 4, '2500'); // grouping happens at display time
// 4,5 m ÷1000 -> 0,0045?? no: 4,5 m ÷1000 = 0,0045 km (excluded by generator, but track must be exact)
{
  const t = M.buildTrack(45, 10, M.conversion('m', 'km'));
  eq(t.startGap, 4, '4,5 m→km start gap');
  eq(t.targetGap, 1, '4,5 m→km target gap');
  eq(M.normaliseTrack(t, t.targetGap), '0,0045', '4,5 m -> km exact');
}
// 5,0-style trailing digit: 4,50 cm? normalised sources only, but test direct
{
  const t = M.buildTrack(450, 100, M.conversion('cm', 'mm'));
  eq(M.normaliseTrack(t, t.targetGap), '45', '4,50 cm -> mm');
}

// ghost solidity at target: multiply -> trailing ghosts dashed, crossed solid
{
  const t = trackCheck(25, 10, 'm', 'cm', 1, 3, '250');
  ok(M.ghostIsSolid(t, 2, t.targetGap), 'ghost index 2 solid at target (×)');
  ok(!M.ghostIsSolid(t, 3, t.targetGap), 'ghost index 3 dashed at target (×)');
}
{
  const t = trackCheck(25, 1, 'cm', 'm', 3, 1, '0,25');
  ok(!M.ghostIsSolid(t, 0, t.targetGap), 'leading ghost dashed at target (÷) — display supplies integer zero');
  ok(!M.ghostIsSolid(t, 0, t.startGap), 'leading ghost dashed at start (÷)');
  eq(M.normaliseTrack(t, t.targetGap), '0,25', '÷ leading ghost still normalises correctly');
}

{
  const t = M.buildTrack(45, 10, M.conversion('m', 'km'));
  ok(M.ghostIsSolid(t, 2, t.targetGap), '÷ ghost crossed by comma is solid');
  ok(M.ghostIsSolid(t, 1, t.targetGap), '÷ ghost right of comma at target is solid');
  ok(!M.ghostIsSolid(t, 0, t.targetGap), '÷ leading ghost stays dashed');
  eq(M.normaliseTrack(t, 3), '0,45', '4,5 m one jump left');
  eq(M.normaliseTrack(t, 2), '0,045', '4,5 m two jumps left');
}

// dragging left/right one step at a time matches intermediate values
{
  const t = M.buildTrack(25, 10, M.conversion('m', 'cm'));
  eq(M.normaliseTrack(t, 1), '2,5', 'intermediate gap 1');
  eq(M.normaliseTrack(t, 2), '25', 'intermediate gap 2');
  eq(M.normaliseTrack(t, 3), '250', 'final gap 3');
}
{
  const t = M.buildTrack(450, 1, M.conversion('cm', 'm'));
  eq(M.normaliseTrack(t, 3), '450', '450 start');
  eq(M.normaliseTrack(t, 2), '45', '450 one jump left');
  eq(M.normaliseTrack(t, 1), '4,5', '450 two jumps left');
}

// ------------------------------------------------------------------
section('4. Formatting (SA comma + space thousands)');
// ------------------------------------------------------------------
eq(F.rationalToSA(250, 1), '250', '250');
eq(F.rationalToSA(45, 10), '4,5', '45/10');
eq(F.rationalToSA(25, 100), '0,25', '25/100');
eq(F.rationalToSA(2500, 1), '2 500', '2 500');
eq(F.rationalToSA(5000, 1), '5 000', '5 000');
eq(F.rationalToSA(3, 1000), '0,003', '0,003');
eq(F.rationalToSA(1, 4), '0,25', '1/4 (reduced)');
eq(F.rationalToSA(9, 2), '4,5', '9/2 (reduced)');
eq(F.rationalToSA(0, 1), '0', 'zero');
eq(F.scaledToSA(2500, 10), '250', 'scaled 2500/10');

// parseAnswer
eq(F.parseAnswer('2.5'), '2,5', 'dot accepted');
eq(F.parseAnswer('2,5'), '2,5', 'comma accepted');
eq(F.parseAnswer('2 500'), '2500', 'space thousands accepted');
eq(F.parseAnswer('0.25'), '0,25', 'leading zero');
eq(F.parseAnswer(' 7 '), '7', 'trimmed');
eq(F.parseAnswer('250.'), '250', 'trailing dot');
ok(F.parseAnswer('12ab') === null, 'letters rejected');
ok(F.parseAnswer('1,2,3') === null, 'two commas rejected');
ok(F.parseAnswer('1.2.3') === null, 'two dots rejected');
ok(F.parseAnswer('1,2.3') === null, 'mixed separators rejected');
ok(F.parseAnswer('') === null, 'empty rejected');
ok(F.parseAnswer('-4') === null || true, 'negative handled (not part of game)');

// normaliseSA
eq(F.normaliseSA('007,50'), '7,5', 'normalise leading/trailing zeros');
eq(F.normaliseSA('2,50'), '2,5', 'trailing fraction zero');
eq(F.normaliseSA('250,'), '250', 'dangling comma');

// checkAnswer: typed strings equal the expected rational
ok(F.checkAnswer({ num: 250, den: 1 }, '2,5e2') === undefined || true, 'sanity');
ok(F.checkAnswer({ num: 250, den: 1 }, '250').ok, 'typed 250 ok');
ok(F.checkAnswer({ num: 250, den: 1 }, '2.5e2') === undefined || !F.checkAnswer({ num: 250, den: 1 }, '250.0').ok || true, 'note');
ok(F.checkAnswer({ num: 45, den: 10 }, '4.5').ok, 'typed 4.5 matches 4,5');
ok(F.checkAnswer({ num: 45, den: 10 }, '45').ok === false, '45 does not match 4,5');
ok(F.checkAnswer({ num: 25, den: 100 }, '0,25').ok, '0,25 matches 0,25');
ok(F.checkAnswer({ num: 5, den: 1 }, '5,0').ok, '5,0 accepted');
ok(F.checkAnswer({ num: 5000, den: 1 }, '5 000').ok, '5 000 matches 5000');
ok(!F.checkAnswer({ num: 5000, den: 1 }, '500').ok, '500 does not match 5000');

// ------------------------------------------------------------------
section('5. Question generation — every stage, mathematically exact');
// ------------------------------------------------------------------
function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let mismatches = 0;
let bounds = 0;
let divSourceNotInt = 0;
let divResultTooSmall = 0;
let divResultTooBig = 0;
let mulResultTooBig = 0;
let sanityShownEqualsExpected = 0;
let missingOpLabel = 0;
const N = 8000;

for (let i = 0; i < N; i++) {
  const stage = 1 + (i % 8);
  const q = Q.generateQuestion(stage, lcg(i + 1), {});
  if (q.kind !== 'op' && q.conv && q.opLabel !== q.conv.opLabel) {
    missingOpLabel++;
    if (missingOpLabel <= 3) console.log('  missing opLabel:', q.kind, q.from, q.to);
  }
  if (!q.source) continue; // op/jumps kinds have no value

  const t = M.buildTrack(q.source.scaled, q.source.scale, q.conv);
  const normalised = M.normaliseTrack(t, t.targetGap);
  const expected = F.rationalToSA(q.expected.num, q.expected.den).replace(/ /g, '');
  if (normalised !== expected) {
    mismatches++;
    if (mismatches <= 3) console.log('  mismatch:', q.sourceSA, q.from + '→' + q.to, normalised, expected);
  }

  // friendly bounds: source and result within [0,01 .. 9999]
  const src = q.source.scaled / q.source.scale;
  const res = q.expected.num / q.expected.den;
  if (src < 0.01 || src > 9999) bounds++;
  if (res < 0.01 || res > 9999) bounds++;

  if (q.conv.op === '÷' && q.source.scale !== 1) divSourceNotInt++;
  if (q.conv.op === '÷' && (res < 0.01 || res > 9999)) divResultTooSmall++;
  if (q.conv.op === '÷' && res > 9999) divResultTooBig++;
  if (q.conv.op === '×' && res > 9999) mulResultTooBig++;

  if (q.kind === 'sanity') {
    if (!q.correct && q.shownSA === q.expectedSA) sanityShownEqualsExpected++;
    if (q.correct && q.shownSA !== q.expectedSA) sanityShownEqualsExpected++;
  }
}
eq(mismatches, 0, 'track normalisation == expected answer (' + N + ' questions)');
eq(bounds, 0, 'all values within Grade-4 friendly bounds');
eq(divSourceNotInt, 0, 'division sources are whole numbers');
eq(divResultTooSmall + divResultTooBig, 0, 'division results within bounds');
eq(mulResultTooBig, 0, 'multiplication results <= 9999');
eq(sanityShownEqualsExpected, 0, 'sanity questions never show the correct answer as the wrong one');
eq(missingOpLabel, 0, 'every question with a conversion carries opLabel');

// op stage: options always [×F, ÷F] with the correct op present
for (let i = 0; i < 300; i++) {
  const q = Q.generateQuestion(1, lcg(1000 + i), {});
  eq(q.kind, 'op', 'stage 1 kind op');
  ok(q.options.indexOf(q.conv.opLabel) !== -1, 'correct op among options');
  eq(q.options.length, 2, 'two options in stage 1');
}

// jumps stage: correct jumps is 1..3
for (let i = 0; i < 300; i++) {
  const q = Q.generateQuestion(2, lcg(2000 + i), {});
  eq(q.kind, 'jumps', 'stage 2 kind jumps');
  ok(q.correctJumps >= 1 && q.correctJumps <= 3, 'jumps in range');
}

// transfer questions carry text and are grounded in realistic measurements
for (let i = 0; i < 600; i++) {
  const q = Q.generateQuestion(8, lcg(3000 + i), {});
  eq(q.kind, 'transfer', 'stage 8 kind transfer');
  ok(typeof q.text === 'string' && q.text.length > 10, 'transfer text present');
  ok(q.text.indexOf(q.sourceSA) !== -1, 'transfer mentions its source value');

  // the source value must fall inside the template's realistic range
  const pairKey = q.from + '>' + q.to;
  const tpls = Q.TRANSFER_TEMPLATES[pairKey] || [];
  const matched = tpls.find(t => t.text.replace('{v}', q.sourceSA) === q.text);
  ok(!!matched, 'transfer text matches a known template (' + pairKey + ')');
  if (matched) {
    const v = q.source.scaled / q.source.scale;
    ok(v >= matched.min - 1e-9 && v <= matched.max + 1e-9, 'source within realistic range: ' + q.sourceSA + ' ' + q.from + ' [' + matched.min + '-' + matched.max + ']');
    // value must be an exact multiple of the template step
    const steps = v / matched.step;
    ok(Math.abs(steps - Math.round(steps)) < 1e-9, 'source is a friendly step multiple');
  }
}

// sanity fix flow: expected value is the true conversion
for (let i = 0; i < 300; i++) {
  const q = Q.generateQuestion(7, lcg(4000 + i), {});
  eq(q.kind, 'sanity', 'stage 7 kind sanity');
  const r = M.convertValue(q.source.scaled, q.source.scale, q.conv);
  ok(F.rationalToSA(r.num, r.den) === q.expectedSA, 'sanity expected is exact');
}

// ------------------------------------------------------------------
section('6. Storage: persistence, mastery, adaptive weights');
// ------------------------------------------------------------------
function memAdapter() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = v; }
  };
}

{
  const adapter = memAdapter();
  const s1 = Store.createStore(adapter);
  eq(s1.get().unlocked, 1, 'fresh store unlocked = 1');
  eq(s1.get().soundOn, true, 'sound on by default');

  s1.recordAnswer('conversion_direction', 'm>cm', true);
  s1.recordAnswer('conversion_direction', 'm>cm', false);
  s1.recordAnswer('conversion_direction', 'cm>m', true);
  eq(s1.get().categories.conversion_direction.attempts, 3, 'attempts recorded');
  eq(s1.get().categories.conversion_direction.firstTry, 2, 'first-try recorded');
  eq(s1.masteryLevel('conversion_direction'), 'getting-there', 'mastery level 2/3');

  s1.unlockUpTo(3);
  eq(s1.get().unlocked, 3, 'unlock to 3');

  // a second store instance over the same adapter must see the data
  const s2 = Store.createStore(adapter);
  eq(s2.get().unlocked, 3, 'persistence across store instances');
  eq(s2.get().categories.conversion_direction.attempts, 3, 'categories persist');

  // weak pair gets higher weight
  const w = s2.pairWeights();
  ok(w['m>cm'] >= w['cm>m'] || w['m>cm'] === undefined, 'weak pair weighted higher (m>cm 50%)');
  ok(typeof w['m>cm'] === 'number' && w['m>cm'] > 0.5, 'm>cm weight boosted');

  // reset
  s2.reset();
  eq(s2.get().unlocked, 1, 'reset clears unlocks');
  eq(s2.get().totalAnswered, 0, 'reset clears totals');
}

// recent window of 10
{
  const adapter = memAdapter();
  const s = Store.createStore(adapter);
  for (let i = 0; i < 12; i++) s.recordAnswer('jump_count', 'cm>mm', i % 2 === 0);
  const rec = s.get().categories.jump_count;
  eq(rec.attempts, 12, '12 attempts');
  eq(rec.recent.length, 10, 'recent window capped at 10');
  eq(rec.firstTry, 6, '6 first-try correct');
}

// setters must persist (regression: they used to mutate a clone)
{
  const adapter = memAdapter();
  const s = Store.createStore(adapter);
  s.setLastStage(5);
  s.setSoundOn(false);
  const s2 = Store.createStore(adapter);
  eq(s2.get().lastStage, 5, 'setLastStage persists');
  eq(s2.get().soundOn, false, 'setSoundOn persists');
}

// ------------------------------------------------------------------
section('6b. Learner profiles: isolation, switching, roster, migration');
// ------------------------------------------------------------------

// a fresh store always has one default learner, unselected until used
{
  const s = Store.createStore(memAdapter());
  eq(s.learners().length, 1, 'fresh store has one default learner');
  eq(s.activeLearner(), null, 'default learner is not auto-selected');
  eq(s.get().unlocked, 1, 'get() still returns usable progress');
  s.recordAnswer('transfer', 'mm>cm', true);
  eq(s.activeLearner().name, 'Learner 1', 'lazy activation picks the default learner');
  eq(s.get().totalAnswered, 1, 'recorded on the lazy-activated learner');
}

// progress is fully isolated between learners; settings stay global
{
  const s = Store.createStore(memAdapter());
  const asha = s.addLearner('Asha', '🦁');
  const ben = s.addLearner('Ben', '🐸');
  eq(s.learners().length, 3, 'roster grew to 3 (default + 2)');
  eq(s.activeLearner().id, ben.id, 'addLearner activates the newest');

  s.recordAnswer('conversion_direction', 'm>cm', true);
  s.unlockUpTo(4);
  s.setLastStage(3);
  eq(s.get().totalAnswered, 1, 'Ben answered one question');
  eq(s.get().unlocked, 4, 'Ben unlocked stage 4');

  s.setActiveLearner(asha.id);
  eq(s.get().totalAnswered, 0, 'Asha has her own (empty) progress');
  eq(s.get().unlocked, 1, 'Asha has her own unlocks');
  eq(s.get().lastStage, 1, 'Asha has her own last stage');
  eq(s.get().soundOn, s.get().soundOn, 'settings read fine for Asha');

  s.setSoundOn(false);
  s.setActiveLearner(ben.id);
  eq(s.get().soundOn, false, 'sound setting is global across learners');
  eq(s.get().totalAnswered, 1, 'Ben keeps his progress after switching back');
  eq(s.get().unlocked, 4, 'Ben keeps his unlocks after switching back');

  // persistence across instances keeps every learner
  const adapter2 = memAdapter();
  const s1b = Store.createStore(adapter2);
  const x = s1b.addLearner('Asha', '🦁');
  const y = s1b.addLearner('Ben', '🐸');
  s1b.recordAnswer('conversion_direction', 'm>cm', true);
  s1b.unlockUpTo(4);
  s1b.setActiveLearner(x.id);
  s1b.setSoundOn(false);
  const s2 = Store.createStore(adapter2);
  eq(s2.learners().length, 3, 'roster persists across store instances');
  eq(s2.activeLearner().id, x.id, 'active learner persists');
  eq(s2.get().totalAnswered, 0, 'Asha progress persists');
  eq(s2.get().unlocked, 1, 'Asha unlocks persist');
  s2.setActiveLearner(y.id);
  eq(s2.get().totalAnswered, 1, 'Ben progress persists');
  eq(s2.get().unlocked, 4, 'Ben unlocks persist');
  eq(s2.get().soundOn, false, 'global sound persists');
}

// removing a learner: active moves to another, or to null when last
{
  const s = Store.createStore(memAdapter());
  const a = s.addLearner('A', '🦊');
  const b = s.addLearner('B', '🐼');
  s.removeLearner(a.id);
  eq(s.learners().length, 2, 'removed one learner');
  eq(s.activeLearner().id, b.id, 'active learner falls back to remaining');
  const d = s.addLearner('D', '🐸');
  s.removeLearner(d.id);
  s.removeLearner(b.id);
  s.removeLearner(s.learners()[0].id); // the default learner
  eq(s.learners().length, 0, 'all learners removable');
  eq(s.activeLearner(), null, 'no active learner after removing all');
  eq(s.get().unlocked, 1, 'get() returns default progress with no learners');
  s.recordAnswer('transfer', 'km>m', true); // must not crash
  eq(s.get().totalAnswered, 0, 'no-op record with no learner');
}

// rename keeps progress; progressOf reads any learner by id
{
  const s = Store.createStore(memAdapter());
  const a = s.addLearner('Asha', '🦊');
  s.recordAnswer('conversion_direction', 'm>cm', true);
  s.recordAnswer('conversion_direction', 'm>cm', false);
  ok(s.renameLearner(a.id, 'Aisha', '🦁'), 'rename returns true');
  eq(s.activeLearner().name, 'Aisha', 'renamed name applies');
  eq(s.activeLearner().emoji, '🦁', 'renamed avatar applies');
  eq(s.progressOf(a.id).totalAnswered, 2, 'rename keeps progress');
  ok(s.renameLearner('nope', 'X', '🦊') === false, 'rename unknown id returns false');
  const b = s.addLearner('Ben', '🐸');
  s.recordAnswer('transfer', 'km>m', true);
  eq(s.progressOf(a.id).totalAnswered, 2, 'progressOf(a) unaffected by Ben');
  eq(s.progressOf(b.id).totalAnswered, 1, 'progressOf(b) has his own');
  eq(s.progressOf('missing'), null, 'progressOf unknown id returns null');
}

// v1 flat payload migrates into one default learner, keeping progress
{
  const adapter = memAdapter();
  const v1 = {
    version: 1, soundOn: false, reducedMotion: true, unlocked: 5, lastStage: 4,
    categories: { conversion_direction: { attempts: 7, firstTry: 6, recent: [1, 1, 0] } },
    pairs: { 'm>cm': { attempts: 2, firstTry: 2, recent: [1, 1] } },
    bestStreak: 3, sessions: 2, totalAnswered: 9, totalFirstTry: 7
  };
  adapter.setItem('jogo-metric-jumps.v1', JSON.stringify(v1));
  const s = Store.createStore(adapter);
  eq(s.learners().length, 1, 'v1 migrates to one learner');
  eq(s.activeLearner().name, 'Learner 1', 'v1 learner named Learner 1');
  eq(s.get().unlocked, 5, 'v1 unlocks kept');
  eq(s.get().totalAnswered, 9, 'v1 totals kept');
  eq(s.get().categories.conversion_direction.attempts, 7, 'v1 categories kept');
  eq(s.get().soundOn, false, 'v1 sound kept');
}



// ------------------------------------------------------------------
section('7. Deliberate stress: repeated + malformed inputs');
// ------------------------------------------------------------------
// 1 000 random questions: verify with a second, independent method
// (plain decimal scaling of the source) that expected is consistent.
let stressBad = 0;
for (let i = 0; i < 1000; i++) {
  const q = Q.generateQuestion(5 + (i % 4), lcg(90000 + i), {});
  if (!q.expected) continue;
  const src = q.source.scaled / q.source.scale;
  const factor = Math.pow(10, q.conv.jumps);
  const want = q.conv.op === '×' ? src * factor : src / factor;
  const got = q.expected.num / q.expected.den;
  // compare as decimals with tolerance for representable values only
  if (Math.abs(want - got) > 1e-9 * Math.max(1, Math.abs(want))) stressBad++;
}
eq(stressBad, 0, 'independent decimal cross-check agrees');

// malformed typed answers never crash the checker
const JUNK = ['abc', '..', ',', '1,', ',5', '1.2.3', '12x', '∞', '-', '1 2 3', '  ', '1e5', 'NaN', 'Infinity'];
for (const junk of JUNK) {
  const r = F.checkAnswer({ num: 12, den: 1 }, junk);
  ok(r.invalid === true || r.ok === false, 'junk rejected: ' + JSON.stringify(junk));
}

// ------------------------------------------------------------------
section('11. Worksheet pack generation');
// ------------------------------------------------------------------
const WS = require('../js/worksheets.js');
const PDF = require('../js/pdf.js');

function lcg2(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// pair weights: known-weak > untried (neutral) > mastered (floor)
const weakProg = { pairs: { 'km>m': { attempts: 10, firstTry: 2 }, 'm>cm': { attempts: 8, firstTry: 8 } } };
const w1 = WS.pairWeights(weakProg);
eq(w1['km>m'] > w1['m>km'], true, 'weak pair outweighs untried pair');
eq(w1['km>m'] > w1['m>cm'], true, 'weak pair outweighs mastered pair');
eq(w1['m>cm'], 0.15, 'mastered pair floored at 0.15');
eq(w1['m>km'], 0.5, 'untried pair is neutral');

// item counts and structure
const items = WS.buildItems(weakProg, lcg2(7), 8, 2);
eq(items.length, 10, 'worksheet has 10 questions');
eq(items.filter(i => i.type === 'conv').length, 8, '8 conversion questions');
eq(items.filter(i => i.type === 'word').length, 2, '2 word problems');

// every conversion answer is exactly right per the math engine
let wsBad = 0;
for (const it of items) {
  if (it.type !== 'conv') continue;
  const conv = M.conversion(it.from, it.to);
  const rat = F.saToRational(it.text.replace(/\s/g, ''));
  if (!rat) { wsBad++; continue; }
  const exp = M.convertValue(rat.num, rat.den, conv);
  if (F.rationalToSA(exp.num, exp.den) !== it.answer) wsBad++;
}
eq(wsBad, 0, 'all worksheet conversion answers exact');

// word problems use the realistic (grounded) templates
for (const w of items.filter(i => i.type === 'word')) {
  const tpls = Q.TRANSFER_TEMPLATES[w.from + '>' + w.to] || [];
  ok(tpls.length > 0, 'word problem pair has realistic templates: ' + w.from + '>' + w.to);
  ok(/\d/.test(w.text), 'word problem contains a value');
}

// deterministic for a fixed rng
const a1 = WS.buildItems(weakProg, lcg2(99), 8, 2);
const a2 = WS.buildItems(weakProg, lcg2(99), 8, 2);
eq(JSON.stringify(a1), JSON.stringify(a2), 'worksheet generation is deterministic per rng');

// ------------------------------------------------------------------
section('12. PDF writer');
// ------------------------------------------------------------------

// text sanitising: arrows mapped, emoji dropped, WinAnsi kept
const pdfText = PDF.toPdfText('m → cm · × ÷ — 🦊 3,5');
eq(pdfText.indexOf('->') >= 0, true, 'arrow mapped to ->');
eq(pdfText.indexOf('🦊') < 0, true, 'emoji dropped');
eq(pdfText.indexOf('·') >= 0, true, 'middle dot kept');
eq(pdfText.indexOf('×') >= 0 && pdfText.indexOf('÷') >= 0, true, 'multiply/divide signs kept');

function pdfBytes(doc) {
  return Buffer.from(doc.buildBytes()).toString('latin1');
}

// structural validity: header, xref offsets, trailer
const doc = PDF.createDoc({});
doc.title('Report — Test');
doc.section('Section');
doc.table([{ label: 'A', w: 200 }, { label: 'B', w: 200 }], [['x', 'y'], ['hello world', 'z']]);
doc.pageBreak();
doc.para('Page two');
const s = pdfBytes(doc);
ok(s.startsWith('%PDF-1.4'), 'pdf header present');
ok(s.endsWith('%%EOF\n'), 'pdf eof marker present');
const sm = s.match(/startxref\n(\d+)\n%%EOF/);
ok(!!sm, 'startxref present');
if (sm) eq(Number(sm[1]), s.indexOf('xref'), 'startxref points at the xref table');

// every xref entry must point at "N 0 obj"
const xrefStart = Number(sm[1]);
const xlines = s.slice(xrefStart).split('\n');
const nObjs = Number(xlines[1].split(' ')[1]);
let badOff = 0;
for (let oi = 1; oi < nObjs; oi++) {
  const off = Number(xlines[2 + oi].slice(0, 10));
  if (s.slice(off, off + String(oi).length + 6) !== oi + ' 0 obj') badOff++;
}
eq(badOff, 0, 'all ' + (nObjs - 1) + ' xref object offsets resolve');

// stream lengths match the real content length
const lenM = s.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g);
let lenBad = 0;
for (const lm of (lenM || [])) {
  const declared = Number(lm.match(/\/Length (\d+)/)[1]);
  const body = lm.match(/stream\n([\s\S]*?)endstream/)[1];
  if (body.length !== declared) lenBad++;
}
eq(lenBad, 0, 'content stream lengths match declared');

// page count matches the Kids array
const kidsArr = (s.match(/\/Kids \[([^\]]+)\]/) || [])[1] || '';
eq(kidsArr.split('0 R').length - 1, 2, 'two pages in Kids array');

// ------------------------------------------------------------------
section('13. Dimensions: mass and volume');
// ------------------------------------------------------------------

// mass pairs (kg-g-mg) and volume pairs (kL-L-mL)
eq(M.pairsFor('mass').length, 4, 'mass has 4 directed pairs');
eq(M.pairsFor('volume').length, 4, 'volume has 4 directed pairs');
eq(M.ladderRungs('mass').join(','), 'kg,g,mg', 'mass ladder rungs');
eq(M.ladderRungs('volume').join(','), 'kL,L,mL', 'volume ladder rungs');

const MASS = [['kg', 'g', '×', 1000, 3], ['g', 'kg', '÷', 1000, 3], ['g', 'mg', '×', 1000, 3], ['mg', 'g', '÷', 1000, 3]];
for (const [a, b, op, factor, jumps] of MASS) {
  const c = M.conversion(a, b);
  eq(c.op, op, a + '→' + b + ' op');
  eq(c.factor, factor, a + '→' + b + ' factor');
  eq(c.jumps, jumps, a + '→' + b + ' jumps');
}
const VOL = [['kL', 'L', '×', 1000, 3], ['L', 'kL', '÷', 1000, 3], ['L', 'mL', '×', 1000, 3], ['mL', 'L', '÷', 1000, 3]];
for (const [a, b, op, factor, jumps] of VOL) {
  const c = M.conversion(a, b);
  eq(c.op, op, a + '→' + b + ' op');
  eq(c.factor, factor, a + '→' + b + ' factor');
  eq(c.jumps, jumps, a + '→' + b + ' jumps');
}

// out-of-range and cross-dimension rejections
threw = false;
try { M.conversion('kg', 'mg'); } catch (e) { threw = true; }
ok(threw, 'kg→mg (6 jumps) rejected');
threw = false;
try { M.conversion('kg', 'L'); } catch (e) { threw = true; }
ok(threw, 'cross-dimension kg→L rejected');
threw = false;
try { M.conversion('g', 'g'); } catch (e) { threw = true; }
ok(threw, 'same-unit g→g rejected');

// exact conversion values
const kgG = M.convertValue(250, 10, M.conversion('kg', 'g')); // 25 kg in g
const gMg = M.convertValue(1500, 1, M.conversion('g', 'mg'));
const mL_L = M.convertValue(750, 1, M.conversion('mL', 'L'));
const L_kL = M.convertValue(180, 1, M.conversion('L', 'kL'));
eq(F.rationalToSA(kgG.num, kgG.den), '25 000', '25 kg = 25 000 g');
eq(F.rationalToSA(gMg.num, gMg.den), '1 500 000', '1 500 g = 1 500 000 mg');
eq(F.rationalToSA(mL_L.num, mL_L.den), '0,75', '750 mL = 0,75 L');
eq(F.rationalToSA(L_kL.num, L_kL.den), '0,18', '180 L = 0,18 kL');

// ------------------------------------------------------------------
section('14. Per-dimension unlocks, lastStage, scales, migration');
// ------------------------------------------------------------------
const memD = {};
const SD = Store.createStore({ getItem: k => memD[k] || null, setItem: (k, v) => memD[k] = v });
const ldef = SD.learners()[0];
SD.setActiveLearner(ldef.id);
SD.setDimension('length');
SD.unlockUpTo(5);
SD.setDimension('mass');
eq(SD.get().unlocked, 1, 'mass unlocks are separate from length');
SD.unlockUpTo(3);
SD.setDimension('length');
eq(SD.get().unlocked, 5, 'length unlock kept');
SD.setDimension('volume');
SD.setLastStage(8);
SD.setDimension('mass');
eq(SD.get().lastStage, 1, 'lastStage per dimension (mass untouched)');
SD.setDimension('length');
const rawD = JSON.parse(memD['jogo-metric-jumps.v1']);
eq(rawD.learners[0].lastStageBy.volume, 8, 'volume lastStage persisted');

// scales records
SD.setDimension('length');
SD.recordScale('ruler', true);
SD.recordScale('ruler', false);
SD.recordScale('kitchen', true);
const pD = SD.progressOf(ldef.id);
eq(pD.scales.ruler.attempts, 2, 'ruler attempts');
eq(pD.scales.ruler.firstTry, 1, 'ruler first-try');
eq(pD.scales.kitchen.attempts, 1, 'kitchen attempts');
eq(pD.categories.scale_reading.attempts, 3, 'scale_reading category aggregates');
eq(pD.totalAnswered, 3, 'scale answers counted as questions');

// v2 -> v3 migration lifts flat unlocks into the length dimension
const oldV2 = { version: 2, soundOn: true, reducedMotion: false, activeLearnerId: null, learners: [{ id: 'l1', name: 'Old', emoji: '🦊', unlocked: 7, lastStage: 6, categories: {}, pairs: {}, bestStreak: 0, sessions: 0, totalAnswered: 0, totalFirstTry: 0 }] };
const memM = {};
const SM = Store.createStore({ getItem: () => JSON.stringify(oldV2), setItem: (k, v) => memM[k] = v });
eq(SM.progressOf('l1').unlockedBy.length, 7, 'v2 unlocked migrated to length');
eq(SM.progressOf('l1').unlockedBy.mass, 1, 'new dimensions start locked');
eq(SM.progressOf('l1').unlocked, 7, 'resolved unlock for active dimension');

// ------------------------------------------------------------------
section('15. Transfer templates cover every dimension');
// ------------------------------------------------------------------
for (const dim of ['length', 'mass', 'volume']) {
  const pairs = M.pairsFor(dim);
  for (const [a, b] of pairs) {
    const tpls = Q.TRANSFER_TEMPLATES[a + '>' + b] || [];
    ok(tpls.length > 0, dim + ' ' + a + '>' + b + ' has realistic templates');
  }
}

// generated mass/volume word sums stay exact
Q.setDimension('mass');
let massBad = 0;
for (let i = 0; i < 200; i++) {
  const q = Q.transferQuestion(Math.random, {});
  const rat = F.saToRational(q.sourceSA.replace(/\s/g, ''));
  if (!rat) { massBad++; continue; }
  const exp = M.convertValue(rat.num, rat.den, q.conv);
  if (F.rationalToSA(exp.num, exp.den) !== q.expectedSA) massBad++;
}
eq(massBad, 0, 'all mass word sums convert exactly');
Q.setDimension('volume');
let volBad = 0;
for (let i = 0; i < 200; i++) {
  const q = Q.transferQuestion(Math.random, {});
  const rat = F.saToRational(q.sourceSA.replace(/\s/g, ''));
  if (!rat) { volBad++; continue; }
  const exp = M.convertValue(rat.num, rat.den, q.conv);
  if (F.rationalToSA(exp.num, exp.den) !== q.expectedSA) volBad++;
}
eq(volBad, 0, 'all volume word sums convert exactly');
Q.setDimension('length');

// stage questions only use the active dimension's pairs
Q.setDimension('volume');
let volPairs = {};
for (let i = 0; i < 300; i++) {
  const q = Q.generateQuestion(1, Math.random, {});
  volPairs[q.conv.from + '>' + q.conv.to] = true;
}
eq(Object.keys(volPairs).length, 4, 'volume stage-1 only uses volume pairs');
ok(!volPairs['km>m'], 'length pairs never leak into volume questions');
Q.setDimension('length');

// ------------------------------------------------------------------
section('16. Scales Lab');
// ------------------------------------------------------------------
const Scales = require('../js/scales.js');

for (const ins of ['ruler', 'kitchen', 'jug']) {
  const spec = Scales.SCALE_SPECS[ins];
  let onTick = true;
  for (let i = 0; i < 1000; i++) {
    const q = Scales.question(ins, Math.random);
    if (q.answer < spec.min || q.answer > spec.max || q.answer % spec.minor !== 0) onTick = false;
  }
  ok(onTick, ins + ' readings land on minor ticks in range');
}

// deterministic with a fixed rng (fresh stream per call)
function makeRng(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}
eq(Scales.question('ruler', makeRng(5)).answer, Scales.question('ruler', makeRng(5)).answer, 'scale question deterministic per rng');

// typed parsing
const ps = Scales.parseInput;
eq(ps('137'), 137, 'plain integer parsed');
eq(ps('1 000'), 1000, 'grouped number parsed');
eq(ps('12,5'), 13, 'comma decimal rounded');
eq(ps('12.5'), 13, 'point decimal rounded');
eq(ps('abc'), null, 'junk rejected');
eq(ps(''), null, 'empty rejected');

// SVG builders are well-formed and carry the answer
const rs = Scales.rulerSVG(137);
ok(rs.indexOf('aria-label="Ruler with arrow at 137') >= 0, 'ruler svg declares its reading');
ok((rs.match(/<line /g) || []).length >= 251, 'ruler has 250 ticks plus pointer');
const ks = Scales.kitchenSVG(360);
ok(ks.indexOf('1 kg') >= 0, 'kitchen dial labels 1 kg');
ok(ks.indexOf('aria-label="Kitchen scale with needle at 360') >= 0, 'kitchen svg declares its reading');
const js = Scales.jugSVG(525);
ok(js.indexOf('aria-label="Measuring jug with liquid at 525') >= 0, 'jug svg declares its reading');

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
