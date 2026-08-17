/**
 * questions.js — Jo⚡Go Metric Master
 * Deliberate question generation for every stage.
 *
 * Values are generated with integer scaling (scaled/scale where scale is a
 * power of 10) so every displayed value and every expected answer is exact —
 * no floating-point drift anywhere.
 */
(function (root) {
  'use strict';

  var M = (typeof module !== 'undefined' && module.exports)
    ? require('./math.js')
    : root.JOGO.Math;
  var F = (typeof module !== 'undefined' && module.exports)
    ? require('./formatting.js')
    : root.JOGO.Fmt;

  // ------------------------------------------------------------------
  // Stage definitions
  // ------------------------------------------------------------------

  var STAGES = [
    { id: 1, key: 'op',          name: 'Which Operation?',        category: 'conversion_direction',     target: 6, kinds: ['op'],        ops: 2, markers: false, ladder: true,  rule: true,  sanityChance: 0,
      kidRule: 'Is the new unit SMALLER? Then we need MORE of it — the number gets bigger, so ×. Bigger unit? Fewer of it — ÷.' },
    { id: 2, key: 'jumps',       name: 'How Many Jumps?',         category: 'jump_count',                target: 6, kinds: ['jumps'],     ops: 0, markers: false, ladder: true,  rule: true,  sanityChance: 0,
      kidRule: 'The zeroes tell you the jumps: ×10 = 1 jump · ×100 = 2 · ×1000 = 3. Count the zeroes!' },
    { id: 3, key: 'guided',      name: 'Guided Comma Move',       category: 'guided_comma',              target: 6, kinds: ['pipeline'],  ops: 6, markers: true,  ladder: true,  rule: true,  sanityChance: 0,
      kidRule: 'Move the comma ONE place for every zero in the × or ÷. Watch the zeroes appear!' },
    { id: 4, key: 'predict',     name: 'Predict Then Move',       category: 'guided_comma',              target: 6, kinds: ['pipeline'],  ops: 6, markers: false, ladder: true,  rule: false, sanityChance: 0,
      kidRule: 'Think first: which way, and how far? Down = × moves the comma RIGHT, up = ÷ moves it LEFT.' },
    { id: 5, key: 'independent', name: 'Independent Conversion',  category: 'independent_conversion',    target: 6, kinds: ['input'],     ops: 0, markers: false, ladder: false, rule: false, sanityChance: 0.2,
      kidRule: 'Big unit → small unit: comma goes RIGHT, number gets bigger. Small → big: comma LEFT, number smaller.' },
    { id: 6, key: 'mixed',       name: 'Mixed Metric Challenge',  category: 'mixed_conversion',          target: 8, kinds: ['input'],     ops: 0, markers: false, ladder: false, rule: false, sanityChance: 0.2,
      kidRule: 'Same amount, new unit! Big → small: comma RIGHT. Small → big: comma LEFT.' },
    { id: 7, key: 'sanity',      name: 'Spot the Mistake',        category: 'reasonableness_check',      target: 6, kinds: ['sanity'],    ops: 0, markers: false, ladder: true,  rule: false, sanityChance: 0,
      kidRule: 'Think of the real thing: a door is about 2 m tall, a pencil about 15 cm — not thousands!' },
    { id: 8, key: 'transfer',    name: 'Transfer Challenge',      category: 'transfer',                  target: 6, kinds: ['transfer'],  ops: 0, markers: false, ladder: false, rule: false, sanityChance: 0,
      kidRule: 'Three steps: 1) Which way are we going? 2) Count the zeroes. 3) Move the comma.' }
  ];

  function stageById(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return STAGES[i];
    return null;
  }

  // The dimension being played (length | mass | volume). Defaults to length.
  var currentDimension = 'length';

  function setDimension(dim) {
    if (M.DIMENSION_NAMES.indexOf(dim) >= 0) currentDimension = dim;
  }

  function getDimension() { return currentDimension; }

  // ------------------------------------------------------------------
  // Random helpers
  // ------------------------------------------------------------------

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  /** Weighted pick of a canonical pair. weights: { 'km>m': number } */
  function weightedPair(rng, weights) {
    var pairs = M.pairsFor(currentDimension);
    var w = [];
    var total = 0;
    for (var i = 0; i < pairs.length; i++) {
      var key = pairs[i][0] + '>' + pairs[i][1];
      var wt = weights && typeof weights[key] === 'number' ? weights[key] : 1;
      if (wt < 0.1) wt = 0.1;
      w.push(wt);
      total += wt;
    }
    var r = rng() * total;
    for (var j = 0; j < pairs.length; j++) {
      r -= w[j];
      if (r <= 0) return pairs[j];
    }
    return pairs[pairs.length - 1];
  }

  // ------------------------------------------------------------------
  // Value generation (exact integer scaling)
  // ------------------------------------------------------------------

  /**
   * Multiplication question: choose a friendly source, result = source * 10^jumps.
   * Source decimal places: 0, 1 or 2. Result capped at 9 999.
   */
  function genMulSource(conv, rng) {
    var r = rng();
    var d = r < 0.34 ? 0 : (r < 0.78 ? 1 : 2);
    var maxScaled = Math.floor(9999 * Math.pow(10, d - conv.jumps)); // result <= 9999
    var cap = Math.min(maxScaled, 9999);
    var scaled;
    if (d === 0) {
      scaled = randInt(rng, 1, Math.max(1, cap));
    } else if (d === 1) {
      scaled = Math.min(cap, Math.max(5, Math.round(randInt(rng, 5, Math.max(5, cap)) / 5) * 5));
    } else {
      scaled = Math.min(cap, Math.max(25, Math.round(randInt(rng, 25, Math.max(25, cap)) / 5) * 5));
      if (scaled % 100 === 0) {
        // keep a real 2-dp flavour (e.g. 1,25 not 1,00) without exceeding the cap
        scaled = scaled + 25 <= cap ? scaled + 25 : scaled - 5;
      }
      if (scaled % 100 === 0 && scaled - 25 >= 25) scaled = scaled - 25;
    }
    return { scaled: scaled, scale: Math.pow(10, d) };
  }

  /**
   * Division question: choose a whole-number source so the result has at most
   * two decimal places and is at least 0,01.
   */
  function genDivSource(conv, rng) {
    var min = Math.max(1, Math.pow(10, conv.jumps - 2)); // result >= 0,01
    var max = 9999;                                       // source <= 9999
    var scaled = randInt(rng, min, max);
    if (conv.jumps === 3) {
      // result would otherwise have 3 decimals: keep it to 2 by forcing
      // sources divisible by 10 (e.g. 5 000 m -> 5 km, not 0,005 km)
      scaled = Math.max(min, Math.round(scaled / 10) * 10);
    }
    // round to 5 for friendly values (450, 475, 120, 25...)
    scaled = Math.max(min, Math.round(scaled / 5) * 5);
    return { scaled: scaled, scale: 1 };
  }

  function genSource(conv, rng) {
    return conv.op === '×' ? genMulSource(conv, rng) : genDivSource(conv, rng);
  }

  // ------------------------------------------------------------------
  // Question building
  // ------------------------------------------------------------------

  function baseQuestion(conv, source, rng) {
    var expected = M.convertValue(source.scaled, source.scale, conv);
    return {
      kind: 'input',
      from: conv.from,
      to: conv.to,
      conv: conv,
      opLabel: conv.opLabel,
      source: source,
      sourceSA: F.scaledToSA(source.scaled, source.scale),
      expected: expected,
      expectedSA: F.rationalToSA(expected.num, expected.den)
    };
  }

  function opQuestion(rng, weights) {
    var pair = weightedPair(rng, weights);
    var conv = M.conversion(pair[0], pair[1]);
    return {
      kind: 'op',
      from: conv.from,
      to: conv.to,
      conv: conv,
      correctOp: conv.opLabel,
      options: ['×' + conv.factor, '÷' + conv.factor]
    };
  }

  function jumpsQuestion(rng, weights) {
    var pair = weightedPair(rng, weights);
    var conv = M.conversion(pair[0], pair[1]);
    return {
      kind: 'jumps',
      from: conv.from,
      to: conv.to,
      conv: conv,
      opLabel: conv.opLabel,
      correctJumps: conv.jumps
    };
  }

  /** Shift the decimal point of a rational by k places (k>0 right). */
  function shiftDecimal(rat, k) {
    if (k >= 0) return M.reduce(rat.num * Math.pow(10, k), rat.den);
    return M.reduce(rat.num, rat.den * Math.pow(10, -k));
  }

  /**
   * Sanity question: show a conversion equation (correct 50% of the time, or
   * corrupted by moving the comma). The learner judges, then fixes if wrong.
   */
  function sanityQuestion(rng, weights) {
    var pair = weightedPair(rng, weights);
    var conv = M.conversion(pair[0], pair[1]);
    var source = genSource(conv, rng);
    var base = baseQuestion(conv, source, rng);

    var correct = rng() < 0.5;
    var shown = base.expected;
    if (!correct) {
      var shift = 0;
      var attempts = 0;
      do {
        shift = randInt(rng, 1, 4) * (rng() < 0.5 ? 1 : -1);
        shown = shiftDecimal(base.expected, shift);
        attempts++;
      } while (attempts < 20 &&
        (F.rationalToSA(shown.num, shown.den) === base.expectedSA ||
         shown.num === 0));
    }
    return {
      kind: 'sanity',
      from: conv.from,
      to: conv.to,
      conv: conv,
      opLabel: conv.opLabel,
      source: source,
      sourceSA: base.sourceSA,
      expected: base.expected,
      expectedSA: base.expectedSA,
      shown: shown,
      shownSA: F.rationalToSA(shown.num, shown.den),
      correct: correct
    };
  }

  /**
   * Transfer word problems. Every value range is grounded in reality so the
   * sums make sense to a Grade 4 learner: doors are about 2 m tall, pencils
   * about 17 cm long, a sports field about 350 m around. `step` keeps the
   * numbers friendly (0, 1 or 2 decimals, exact integer math).
   */
  var TRANSFER_TEMPLATES = {
    'km>m': [
      { text: 'Ben walked {v} km to school. How many metres is that?', min: 0.5, max: 3, step: 0.25 },
      { text: 'Ben walked {v} km in the race. How many metres is that?', min: 0.8, max: 5, step: 0.2 }
    ],
    'm>km': [
      { text: 'A road is {v} m long. How many kilometres is that?', min: 200, max: 5000, step: 50 },
      { text: 'The sports field is {v} m around. How many kilometres is that?', min: 250, max: 450, step: 10 }
    ],
    'm>cm': [
      { text: 'The door is {v} m tall. How many centimetres is that?', min: 1.8, max: 2.2, step: 0.1 },
      { text: 'The table is {v} m long. How many centimetres is that?', min: 1, max: 2.5, step: 0.1 }
    ],
    'cm>m': [
      { text: 'A ribbon is {v} cm long. How many metres is that?', min: 100, max: 500, step: 25 },
      { text: 'The bookshelf is {v} cm tall. How many metres is that?', min: 120, max: 240, step: 10 }
    ],
    'cm>mm': [
      { text: 'A beetle is {v} cm long. How many millimetres is that?', min: 1, max: 8, step: 0.5 },
      { text: 'A key is {v} cm long. How many millimetres is that?', min: 4, max: 8, step: 0.5 }
    ],
    'mm>cm': [
      { text: 'A pencil is {v} mm long. How many centimetres is that?', min: 150, max: 190, step: 5 },
      { text: 'An eraser is {v} mm long. How many centimetres is that?', min: 40, max: 70, step: 5 }
    ],
    // --- mass (grounded in real kitchen/classroom objects) ---
    'kg>g': [
      { text: 'A bag of sugar weighs {v} kg. How many grams is that?', min: 1, max: 5, step: 0.5 },
      { text: 'A bag of flour weighs {v} kg. How many grams is that?', min: 1, max: 2.5, step: 0.25 }
    ],
    'g>kg': [
      { text: 'A loaf of bread weighs {v} g. How many kilograms is that?', min: 400, max: 900, step: 50 },
      { text: 'A bag of apples weighs {v} g. How many kilograms is that?', min: 750, max: 1500, step: 50 }
    ],
    'g>mg': [
      { text: 'A paperclip weighs {v} g. How many milligrams is that?', min: 1, max: 5, step: 0.5 },
      { text: 'A pencil weighs {v} g. How many milligrams is that?', min: 5, max: 10, step: 1 }
    ],
    'mg>g': [
      { text: 'A grain of rice weighs {v} mg. How many grams is that?', min: 20, max: 60, step: 10 },
      { text: 'A raisin weighs {v} mg. How many grams is that?', min: 250, max: 900, step: 50 }
    ],
    // --- volume (grounded in real containers) ---
    'kL>L': [
      { text: 'A swimming pool holds {v} kL of water. How many litres is that?', min: 20, max: 100, step: 10 },
      { text: 'A rain tank holds {v} kL of water. How many litres is that?', min: 2, max: 10, step: 1 }
    ],
    'L>kL': [
      { text: 'A bathtub holds {v} L of water. How many kilolitres is that?', min: 120, max: 300, step: 20 },
      { text: 'A wheelie bin holds {v} L. How many kilolitres is that?', min: 100, max: 240, step: 20 }
    ],
    'L>mL': [
      { text: 'A bottle of water holds {v} L. How many millilitres is that?', min: 0.25, max: 2, step: 0.25 },
      { text: 'A jug of juice holds {v} L. How many millilitres is that?', min: 1, max: 3, step: 0.5 }
    ],
    'mL>L': [
      { text: 'A cup of tea is {v} mL. How many litres is that?', min: 150, max: 350, step: 50 },
      { text: 'A can of fizzy drink holds {v} mL. How many litres is that?', min: 330, max: 500, step: 10 }
    ]
  };

  /**
   * Pick a realistic source value inside [min, max] at `step` granularity,
   * as an exact integer-scaled { scaled, scale } pair (scale = 10^decimals).
   */
  function genRealisticSource(min, max, step, rng) {
    var stepStr = String(step);
    var dec = stepStr.indexOf('.') >= 0 ? stepStr.length - 1 - stepStr.indexOf('.') : 0;
    var den = Math.pow(10, dec);
    var slots = Math.floor((max - min) / step + 0.000001);
    var value = min + randInt(rng, 0, slots) * step;
    var scaled = Math.round(value * den);
    return { scaled: scaled, scale: den };
  }

  function transferQuestion(rng, weights) {
    var pair = weightedPair(rng, weights);
    var conv = M.conversion(pair[0], pair[1]);
    var templates = TRANSFER_TEMPLATES[pair[0] + '>' + pair[1]] || [];
    var tpl = pick(templates, rng);
    var source = genRealisticSource(tpl.min, tpl.max, tpl.step, rng);
    var base = baseQuestion(conv, source, rng);
    return {
      kind: 'transfer',
      from: conv.from,
      to: conv.to,
      conv: conv,
      opLabel: conv.opLabel,
      source: source,
      sourceSA: base.sourceSA,
      expected: base.expected,
      expectedSA: base.expectedSA,
      text: tpl.text.replace('{v}', base.sourceSA)
    };
  }

  // ------------------------------------------------------------------
  // Public generation API
  // ------------------------------------------------------------------

  /** Generate one question for a stage. weights: { 'km>m': number, ... } */
  function generateQuestion(stageId, rng, weights) {
    rng = rng || Math.random;
    weights = weights || {};
    var stage = stageById(stageId);
    if (!stage) throw new Error('Unknown stage ' + stageId);

    // Some stages mix in a sanity check.
    if (stage.sanityChance && rng() < stage.sanityChance) {
      return sanityQuestion(rng, weights);
    }

    var kind = pick(stage.kinds, rng);
    if (kind === 'op') return opQuestion(rng, weights);
    if (kind === 'jumps') return jumpsQuestion(rng, weights);
    if (kind === 'sanity') return sanityQuestion(rng, weights);
    if (kind === 'transfer') return transferQuestion(rng, weights);

    // pipeline / input share the same base
    var pair = weightedPair(rng, weights);
    var conv = M.conversion(pair[0], pair[1]);
    var source = genSource(conv, rng);
    var q = baseQuestion(conv, source, rng);
    q.kind = (kind === 'pipeline') ? 'pipeline' : 'input';
    return q;
  }

  var Questions = {
    STAGES: STAGES,
    stageById: stageById,
    generateQuestion: generateQuestion,
    setDimension: setDimension,
    getDimension: getDimension,
    weightedPair: weightedPair,
    genSource: genSource,
    genMulSource: genMulSource,
    genDivSource: genDivSource,
    baseQuestion: baseQuestion,
    sanityQuestion: sanityQuestion,
    transferQuestion: transferQuestion,
    genRealisticSource: genRealisticSource,
    TRANSFER_TEMPLATES: TRANSFER_TEMPLATES,
    shiftDecimal: shiftDecimal,
    randInt: randInt,
    pick: pick
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Questions; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Q = Questions;
})(typeof self !== 'undefined' ? self : this);
