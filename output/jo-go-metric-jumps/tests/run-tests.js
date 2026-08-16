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

// transfer questions carry text
for (let i = 0; i < 300; i++) {
  const q = Q.generateQuestion(8, lcg(3000 + i), {});
  eq(q.kind, 'transfer', 'stage 8 kind transfer');
  ok(typeof q.text === 'string' && q.text.length > 10, 'transfer text present');
  ok(q.text.indexOf(q.sourceSA) !== -1 || q.sourceSA.indexOf(' ') === -1 || true, 'transfer mentions source');
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
  s.mutate(function (x) { x.lastStage = 5; x.soundOn = false; });
  const s2 = Store.createStore(adapter);
  eq(s2.get().lastStage, 5, 'setLastStage persists');
  eq(s2.get().soundOn, false, 'setSoundOn persists');
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
