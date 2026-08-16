/**
 * formatting.js — Jo⚡Go Metric Jumps
 * South African number formatting (decimal comma, space thousands) and
 * robust parsing of typed answers (accepts both ',' and '.' as decimal).
 */
(function (root) {
  'use strict';

  /** Group an integer string with SA space thousands: "2500" -> "2 500". */
  function groupThousands(intStr) {
    return String(intStr).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /**
   * Format a reduced rational { num, den } as an SA decimal string.
   * 250/1 -> "250" ; 45/10 -> "4,5" ; 25/100 -> "0,25" ; 5000/1 -> "5 000"
   */
  function rationalToSA(num, den) {
    if (den === 0) throw new Error('Division by zero in rationalToSA');
    if (den < 0) { num = -num; den = -den; }
    var sign = num < 0 ? '-' : '';
    var abs = Math.abs(num);
    var intPart = Math.floor(abs / den);
    var rem = abs % den;
    var frac = '';
    var guard = 0;
    while (rem !== 0 && guard < 24) {
      rem *= 10;
      frac += String(Math.floor(rem / den));
      rem = rem % den;
      guard++;
    }
    frac = frac.replace(/0+$/, '');
    var grouped = groupThousands(intPart);
    return frac ? sign + grouped + ',' + frac : sign + grouped;
  }

  /** Format a scaled value { scaled, scale } as an SA string. */
  function scaledToSA(scaled, scale) {
    return rationalToSA(scaled, scale);
  }

  /**
   * Normalise an SA number string: strip leading zeros (keep one), strip
   * trailing fraction zeros and a dangling comma. "007,50" -> "7,5".
   */
  function normaliseSA(s) {
    if (typeof s !== 'string') return null;
    var neg = false;
    var t = s.trim();
    if (t[0] === '-') { neg = true; t = t.slice(1); }
    var parts = t.split(',');
    if (parts.length > 2) return null;
    var i = parts[0] || '';
    if (!/^\d*$/.test(i)) return null;
    i = i.replace(/^0+(?=\d)/, '');
    if (i === '') i = '0';
    var out = (neg ? '-' : '') + i;
    if (parts.length === 2) {
      var f = parts[1];
      if (!/^\d*$/.test(f)) return null;
      f = f.replace(/0+$/, '');
      if (f) out += ',' + f;
    }
    return out;
  }

  /**
   * Parse a learner-typed answer into a normalised SA string.
   * Accepts '2.5', '2,5', '2 500', '2500', '0.25', '2,5'.
   * Returns the normalised string (with ',') or null if invalid.
   */
  function parseAnswer(input) {
    if (typeof input !== 'string') return null;
    var t = input.trim();
    if (!t) return null;
    // remove SA thousands spaces
    t = t.replace(/ /g, '');
    // normalise decimal separator: accept both '.' and ',', never both kinds
    var dots = (t.match(/\./g) || []).length;
    var commas = (t.match(/,/g) || []).length;
    if (dots > 1 || commas > 1) return null;
    if (dots === 1 && commas === 1) return null;
    t = t.replace(/\./g, ',');
    if (!/^-?\d+(,\d*)?$/.test(t)) return null;
    return normaliseSA(t);
  }

  /** Convert a normalised SA string to a reduced rational { num, den }. */
  function saToRational(s) {
    var n = normaliseSA(s);
    if (n === null) return null;
    var neg = n[0] === '-';
    if (neg) n = n.slice(1);
    var parts = n.split(',');
    var i = parts[0] || '0';
    var f = parts.length === 2 ? parts[1] : '';
    var digits = i + f;
    if (digits === '') digits = '0';
    var num = parseInt(digits, 10);
    var den = Math.pow(10, f.length);
    if (neg) num = -num;
    return { num: num, den: den };
  }

  /** Compare two rationals exactly. */
  function rationalEquals(a, b) {
    return a.num * b.den === b.num * a.den;
  }

  /**
   * Does a typed answer equal the expected rational?
   * Accepts '2.5' or '2,5' etc. Returns { ok, parsed } where parsed is the
   * normalised string (null if invalid input).
   */
  function checkAnswer(expected, typed) {
    var parsed = parseAnswer(typed);
    if (parsed === null) return { ok: false, parsed: null, invalid: true };
    var rat = saToRational(parsed);
    return { ok: rationalEquals(expected, rat), parsed: parsed, invalid: false };
  }

  /** Human-readable SA display of a comma-track value (ghosts ignored). */
  function trackValueSA(track, gap) {
    return groupThousands(root.JOGO.Math.normaliseTrack(track, gap));
  }

  var Fmt = {
    groupThousands: groupThousands,
    rationalToSA: rationalToSA,
    scaledToSA: scaledToSA,
    normaliseSA: normaliseSA,
    parseAnswer: parseAnswer,
    saToRational: saToRational,
    rationalEquals: rationalEquals,
    checkAnswer: checkAnswer,
    trackValueSA: trackValueSA
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Fmt; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Fmt = Fmt;
})(typeof self !== 'undefined' ? self : this);
