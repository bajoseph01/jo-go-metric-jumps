/**
 * clock.js — Tick⚡Tock (mini-app experiment)
 * Core clock-reading domain. A "level" is just a config (like a dimension
 * ladder in Jo⚡Go Metric Jumps): the engine is level-agnostic from the
 * start, so adding a new level never requires a refactor.
 *
 * All generation is deterministic (seeded RNG) so questions and worksheets
 * are reproducible in tests. All arithmetic is integer-exact.
 */
(function (root) {
  'use strict';

  // The three levels, taught in order. step = minute granularity.
  var LEVELS = [
    { key: 'whole', name: 'Whole & Half',  step: 30 },
    { key: 'five',  name: 'Five minutes', step: 5 },
    { key: 'one',   name: 'One minute',   step: 1 }
  ];
  var LEVEL_KEYS = LEVELS.map(function (l) { return l.key; });

  function levelByKey(key) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === key) return LEVELS[i];
    return LEVELS[0];
  }

  /** Seeded LCG — deterministic, good enough for generation + tests. */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1103515245 + 12345) >>> 0;
      return s / 4294967296;
    };
  }

  /** A valid minute for a level's granularity (never shows 60). */
  function minutesFromStep(step, rng) {
    if (step === 30) return [0, 15, 30, 45][Math.floor(rng() * 4)];
    var count = Math.floor(60 / step);
    return Math.floor(rng() * count) * step;
  }

  /** Generate a clock question: hour 1-12, minute on the level's step. */
  function generate(level, rng) {
    rng = rng || Math.random;
    return { h: 1 + Math.floor(rng() * 12), m: minutesFromStep(level.step, rng), level: level.key };
  }

  /** Hand angles in degrees clockwise from 12. Exact — no floats drift. */
  function handsFor(h, m) {
    return {
      hour: ((h % 12) + m / 60) * 30,
      minute: m * 6
    };
  }

  /** Tolerant parsing: "3:45" | "3.45" | "345" | "15" (= 1:30? no: 15 => 1:05? no) */
  function parseTime(input) {
    var s = String(input).trim().replace(/\s+/g, '');
    if (!s) return null;
    var h, m;
    if (s.indexOf(':') >= 0 || s.indexOf('.') >= 0) {
      var parts = s.split(/[:.]/);
      h = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
    } else if (/^\d{4}$/.test(s)) {
      h = parseInt(s.slice(0, 2), 10);
      m = parseInt(s.slice(2), 10);
    } else if (/^\d{3}$/.test(s)) {
      // "345" -> 3:45 (hours are 1-12, so one digit hour + two digit minutes)
      h = parseInt(s.slice(0, 1), 10);
      m = parseInt(s.slice(1), 10);
    } else if (/^\d{1,2}$/.test(s)) {
      h = parseInt(s, 10);
      m = 0;
    } else {
      return null;
    }
    if (!isFinite(h) || !isFinite(m)) return null;
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    return { h: h, m: m };
  }

  function answerText(q) {
    return q.h + ':' + (q.m < 10 ? '0' + q.m : q.m);
  }

  /** Exact match on (h, m); "1:5" parses to m=5 so it equals "1:05". */
  function isCorrect(q, parsed) {
    return !!parsed && parsed.h === q.h && parsed.m === q.m;
  }

  /**
   * Judge an answer submission. The colon is PART of the lesson: a time
   * that matches (h, m) but was typed without ":" is 'format' (so close —
   * teach the presentation, don't count it), not 'correct'.
   * Returns 'correct' | 'format' | 'wrong' | 'invalid'.
   */
  function judge(q, raw) {
    var parsed = parseTime(raw);
    if (!parsed) return 'invalid';
    if (parsed.h !== q.h || parsed.m !== q.m) return 'wrong';
    return String(raw).indexOf(':') >= 0 ? 'correct' : 'format';
  }

  /** The number the minute hand points at ("the minute hand is on the 9"). */
  function minuteMark(m) {
    var n = Math.round(m / 5);
    if (n === 0 || n === 12) return '12';
    return n;
  }

  /** Kid-language teaching message — never just "wrong". */
  function feedback(q) {
    var m = q.m;
    var words;
    if (m === 0) words = q.h + ' o\u2019clock';
    else if (m === 15) words = 'quarter past ' + q.h;
    else if (m === 30) words = 'half past ' + q.h;
    else if (m === 45) words = 'quarter to ' + (q.h % 12 + 1);
    else if (m < 30) words = m + ' minutes past ' + q.h;
    else words = (60 - m) + ' minutes to ' + (q.h % 12 + 1);
    return 'The RED hand is on the ' + minuteMark(m) + ', and the dark hour hand sits just after ' +
      q.h + '. So the time is ' + words + '.';
  }

  /**
   * Per-level "how to read the clock" rule, in Grade-3 language. These are
   * METHOD hints — they teach the reading steps and can never contain a
   * time (no ':'), so they can't leak the answer of a live question.
   */
  var HINTS = {
    whole: 'The RED big hand counts the minutes — on 12 = o\u2019clock · 3 = quarter past · 6 = half past · 9 = quarter to',
    five:  'The RED big hand counts by 5s — each number on the clock is worth 5 minutes',
    one:   'The RED big hand counts each little tick as 1 minute — count on from the last number'
  };

  function hint(levelKey) {
    return HINTS[levelKey] || HINTS.whole;
  }

  /**
   * A worksheet: `count` deterministic clock questions for a level.
   * Returns { level, items: [{h, m}], seed }.
   */
  function worksheet(level, count, seed) {
    seed = (seed >>> 0) || 1;
    var rng = makeRng(seed);
    var items = [];
    for (var i = 0; i < count; i++) items.push(generate(level, rng));
    return { level: level.key, items: items, seed: seed };
  }

  var Clock = {
    LEVELS: LEVELS,
    LEVEL_KEYS: LEVEL_KEYS,
    levelByKey: levelByKey,
    makeRng: makeRng,
    generate: generate,
    handsFor: handsFor,
    parseTime: parseTime,
    answerText: answerText,
    isCorrect: isCorrect,
    judge: judge,
    minuteMark: minuteMark,
    feedback: feedback,
    hint: hint,
    worksheet: worksheet
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Clock; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Clock = Clock;
})(typeof self !== 'undefined' ? self : this);
