/**
 * math.js — Jo⚡Go Metric Master
 * Core metric mathematics for three dimensions: length, mass and volume.
 *
 * All arithmetic is exact: values are represented as rationals (num/den)
 * where the denominator is a power of 10, so no floating-point errors can
 * creep into conversions.  The place-value "track" used by the comma drag
 * is also built here so it can be unit-tested in Node.
 */
(function (root) {
  'use strict';

  // Dimensions the game teaches. Each has its own ladder of adjacent units;
  // the gap between adjacent rungs is always one of 10, 100 or 1000.
  var DIMENSIONS = {
    length: { name: 'Length', rungs: ['km', 'm', 'cm', 'mm'] },
    mass:   { name: 'Mass',   rungs: ['kg', 'g', 'mg'] },
    volume: { name: 'Volume', rungs: ['kL', 'L', 'mL'] }
  };
  var DIMENSION_NAMES = Object.keys(DIMENSIONS);

  // Exponent of each unit relative to its base (10^exp base units).
  // length: km=10^3 m, m=10^0 m, cm=10^-2 m, mm=10^-3 m
  // mass:   kg=10^3 g, g=10^0 g, mg=10^-3 g
  // volume: kL=10^3 L, L=10^0 L, mL=10^-3 L
  var UNITS = {
    km: { name: 'km', dim: 'length', exp: 3,  order: 3 },
    m:  { name: 'm',  dim: 'length', exp: 0,  order: 2 },
    cm: { name: 'cm', dim: 'length', exp: -2, order: 1 },
    mm: { name: 'mm', dim: 'length', exp: -3, order: 0 },
    kg: { name: 'kg', dim: 'mass',   exp: 3,  order: 2 },
    g:  { name: 'g',  dim: 'mass',   exp: 0,  order: 1 },
    mg: { name: 'mg', dim: 'mass',   exp: -3, order: 0 },
    kL: { name: 'kL', dim: 'volume', exp: 3,  order: 2 },
    L:  { name: 'L',  dim: 'volume', exp: 0,  order: 1 },
    mL: { name: 'mL', dim: 'volume', exp: -3, order: 0 }
  };

  // The six length relationships the game originally taught (jumps 1-3).
  // Kept for backwards compatibility; new code should use pairsFor(dim).
  var CANONICAL_PAIRS = [
    ['km', 'm'], ['m', 'km'],
    ['m', 'cm'], ['cm', 'm'],
    ['cm', 'mm'], ['mm', 'cm']
  ];

  // Per-dimension conversion relationships: each directed adjacent gap.
  var DIMENSION_PAIRS = {
    length: CANONICAL_PAIRS,
    mass: [
      ['kg', 'g'], ['g', 'kg'],
      ['g', 'mg'], ['mg', 'g']
    ],
    volume: [
      ['kL', 'L'], ['L', 'kL'],
      ['L', 'mL'], ['mL', 'L']
    ]
  };

  var UNIT_NAMES = Object.keys(UNITS);

  /** The conversion pairs taught for a dimension (defaults to length). */
  function pairsFor(dim) {
    return DIMENSION_PAIRS[dim] || DIMENSION_PAIRS.length;
  }

  /** Ladder rungs (top to bottom) for a dimension. */
  function ladderRungs(dim) {
    var d = DIMENSIONS[dim];
    return d ? d.rungs.slice() : DIMENSIONS.length.rungs.slice();
  }

  function isUnit(u) { return Object.prototype.hasOwnProperty.call(UNITS, u); }

  /**
   * Conversion description between two units.
   * Returns { from, to, op ('×'|'÷'), jumps (1..3), factor (10^jumps) }.
   * Rule: target unit smaller => multiply (op '×'); target unit bigger => divide.
   */
  function conversion(from, to) {
    if (!isUnit(from) || !isUnit(to)) throw new Error('Unknown unit: ' + from + '/' + to);
    if (from === to) throw new Error('Same unit conversion: ' + from);
    if (UNITS[from].dim !== UNITS[to].dim) {
      throw new Error('Cross-dimension conversion: ' + from + '->' + to);
    }
    var eFrom = UNITS[from].exp;
    var eTo = UNITS[to].exp;
    var jumps = Math.abs(eTo - eFrom);
    if (jumps < 1 || jumps > 3) {
      throw new Error('Conversion out of range (1-3 jumps): ' + from + '->' + to + ' = ' + jumps + ' jumps');
    }
    var op = eTo < eFrom ? '×' : '÷';
    return {
      from: from,
      to: to,
      op: op,
      jumps: jumps,
      factor: Math.pow(10, jumps),
      opLabel: (op === '×' ? '×' : '÷') + Math.pow(10, jumps)
    };
  }

  // All conversions between the four units with 1..3 jumps: exactly the six
  // canonical pairs (each directed way).
  function allConversions() {
    return CANONICAL_PAIRS.map(function (p) { return conversion(p[0], p[1]); });
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  /** Reduce a fraction to lowest terms. */
  function reduce(num, den) {
    if (num === 0) return { num: 0, den: 1 };
    var g = gcd(num, den);
    return { num: num / g, den: den / g };
  }

  /**
   * Convert a source value to the target unit, exactly.
   * source = { scaled, scale } meaning value = scaled / scale (scale a power of 10).
   * Returns a reduced rational { num, den }.
   */
  function convertValue(scaled, scale, conv) {
    if (conv.op === '×') {
      // value * 10^jumps  =>  scaled*10^jumps / scale
      return reduce(scaled * Math.pow(10, conv.jumps), scale);
    }
    // value / 10^jumps  =>  scaled / (scale * 10^jumps)
    return reduce(scaled, scale * Math.pow(10, conv.jumps));
  }

  /**
   * Build the place-value comma track for a drag interaction.
   * source = { scaled, scale }; conv from conversion().
   * Returns {
   *   cells:   [{ d: digit, ghost: bool }],
   *   startGap, targetGap, jumps, op
   * }
   * A "gap" is the position of the comma: the number of cells to its left.
   * Ghost cells are zeros that appear as the comma moves.
   */
  function buildTrack(scaled, scale, conv) {
    // Source digits, from the exact decimal string (strip spaces/commas).
    var parts = decimalPartsOf(scaled, scale);
    var intDigits = parts.intPart.length;
    var digits = (parts.intPart + parts.frac).split('').map(function (c) { return Number(c); });
    if (digits.length === 0) digits = [0];

    var cells = digits.map(function (d) { return { d: d, ghost: false }; });
    var startGap = intDigits;
    var targetGap;

    if (conv.op === '×') {
      targetGap = startGap + conv.jumps;
      for (var k = 0; k < conv.jumps; k++) cells.push({ d: 0, ghost: true });
    } else {
      targetGap = startGap - conv.jumps;
      if (targetGap < 1) {
        // The comma would pass the left edge: a leading zero is born.
        var prepend = 1 - targetGap;
        for (var j = 0; j < prepend; j++) cells.unshift({ d: 0, ghost: true });
        startGap += prepend;
        targetGap = startGap - conv.jumps;
      }
    }

    return {
      cells: cells,
      startGap: startGap,
      targetGap: targetGap,
      jumps: conv.jumps,
      op: conv.op,
      from: conv.from,
      to: conv.to
    };
  }

  /** Integer digits of a scaled value: { intPart, frac } decimal strings. */
  function decimalPartsOf(scaled, scale) {
    if (!(scale >= 1) || scale % 1 !== 0) throw new Error('scale must be a positive integer');
    scaled = Math.round(scaled);
    var sign = scaled < 0 ? '-' : '';
    var abs = Math.abs(scaled);
    var intPart = Math.floor(abs / scale);
    var rem = abs % scale;
    var frac = '';
    var guard = 0;
    while (rem !== 0 && guard < 20) {
      rem *= 10;
      frac += String(Math.floor(rem / scale));
      rem = rem % scale;
      guard++;
    }
    return { sign: sign, intPart: String(intPart), frac: frac };
  }

  /**
   * Whether a ghost cell is "solid" (shown as a real zero) at a given gap.
   * - multiply: a ghost becomes real when the comma has jumped past it (right).
   * - divide: a ghost becomes real once the comma has landed at/left of target.
   */
  function ghostIsSolid(track, index, gap) {
    // A ghost zero becomes a real zero once the comma has crossed it in the
    // direction of travel. (For ÷ the leading ghost stays dashed; the final
    // display supplies the integer zero from the empty integer part.)
    return track.op === '×' ? gap > index : gap <= index;
  }

  /**
   * Normalise the current track state to a plain number string.
   * Non-solid ghosts are ignored (they are not part of the number yet).
   */
  function normaliseTrack(track, gap) {
    var left = [];
    var right = [];
    for (var i = 0; i < track.cells.length; i++) {
      var cell = track.cells[i];
      if (cell.ghost && !ghostIsSolid(track, i, gap)) continue;
      if (i < gap) left.push(cell.d); else right.push(cell.d);
    }
    while (left.length > 1 && left[0] === 0) left.shift();
    while (right.length && right[right.length - 1] === 0) right.pop();
    var iStr = left.length ? left.join('') : '0';
    var fStr = right.join('');
    return fStr ? iStr + ',' + fStr : iStr;
  }

  /** Whether a comma gap is the correct landing spot. */
  function isTargetGap(track, gap) { return gap === track.targetGap; }

  var MathCore = {
    UNITS: UNITS,
    DIMENSIONS: DIMENSIONS,
    DIMENSION_NAMES: DIMENSION_NAMES,
    CANONICAL_PAIRS: CANONICAL_PAIRS,
    DIMENSION_PAIRS: DIMENSION_PAIRS,
    pairsFor: pairsFor,
    ladderRungs: ladderRungs,
    UNIT_NAMES: UNIT_NAMES,
    isUnit: isUnit,
    conversion: conversion,
    allConversions: allConversions,
    reduce: reduce,
    convertValue: convertValue,
    buildTrack: buildTrack,
    decimalPartsOf: decimalPartsOf,
    ghostIsSolid: ghostIsSolid,
    normaliseTrack: normaliseTrack,
    isTargetGap: isTargetGap
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = MathCore; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Math = MathCore;
})(typeof self !== 'undefined' ? self : this);
