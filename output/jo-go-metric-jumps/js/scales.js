/**
 * scales.js — Jo⚡Go Metric Jumps
 * Pure logic for the Scales Lab: reading physical scales.
 *
 * Three instruments: a 250 mm ruler (numbered in cm), a 0-1 kg kitchen
 * dial, and a 0-1 L measuring jug. Readings always land exactly on a
 * minor tick so marking is unambiguous. SVG builders are pure string
 * functions, so everything here is unit-testable in Node.
 */
(function (root) {
  'use strict';

  var SCALE_SPECS = {
    ruler:   { label: 'Ruler',         unit: 'mm',  ask: 'millimetres', min: 30, max: 250, major: 10, minor: 1 },
    kitchen: { label: 'Kitchen scale', unit: 'g',   ask: 'grams',       min: 80, max: 980, major: 100, minor: 20 },
    jug:     { label: 'Measuring jug', unit: 'mL',  ask: 'millilitres', min: 100, max: 900, major: 100, minor: 25 }
  };

  /** Random reading that always lands exactly on a minor tick. */
  function question(instrument, rng) {
    rng = rng || Math.random;
    var spec = SCALE_SPECS[instrument];
    var slots = Math.round((spec.max - spec.min) / spec.minor);
    var value = spec.min + Math.floor(rng() * (slots + 1)) * spec.minor;
    return { instrument: instrument, answer: value, unit: spec.unit };
  }

  /** Parse a typed scale reading; returns rounded integer or null. */
  function parseInput(str) {
    var clean = String(str).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(clean)) return null;
    return Math.round(parseFloat(clean));
  }

  /** A 250 mm ruler numbered in cm, with a red pointer at `mm`. */
  function rulerSVG(mm) {
    var px = 1.7;
    var x0 = 30;
    var w = x0 + 250 * px + 10;
    var html = '<svg viewBox="0 0 ' + w + ' 96" class="scale-svg" role="img" aria-label="Ruler with arrow at ' + mm + ' millimetres">' +
      '<rect x="' + x0 + '" y="30" width="' + (250 * px) + '" height="36" rx="4" fill="#f7c948" stroke="#2d2d2d" stroke-width="2"/>';
    for (var m = 0; m <= 250; m++) {
      var x = x0 + m * px;
      var isMajor = m % 10 === 0;
      var isHalf = m % 5 === 0;
      var th = isMajor ? 16 : (isHalf ? 11 : 7);
      html += '<line x1="' + x.toFixed(1) + '" y1="30" x2="' + x.toFixed(1) + '" y2="' + (30 + th) + '" stroke="#2d2d2d" stroke-width="' + (isMajor ? 1.6 : 0.8) + '"/>';
      if (isMajor) {
        html += '<text x="' + x.toFixed(1) + '" y="80" text-anchor="middle" font-size="9" font-weight="700">' + (m / 10) + '</text>';
      }
    }
    var px2 = x0 + mm * px;
    html += '<g stroke="#e63946" fill="#e63946">' +
      '<line x1="' + px2.toFixed(1) + '" y1="6" x2="' + px2.toFixed(1) + '" y2="28" stroke-width="3"/>' +
      '<polygon points="' + (px2 - 7).toFixed(1) + ',26 ' + (px2 + 7).toFixed(1) + ',26 ' + px2.toFixed(1) + ',38"/>' +
      '</g>' +
      '<text x="' + (w - 8) + '" y="26" text-anchor="end" font-size="10" font-weight="700">cm</text>' +
      '</svg>';
    return html;
  }

  /** A 0-1 kg kitchen dial (270°) with the needle at `grams`. */
  function kitchenSVG(grams) {
    var cx = 190, cy = 190, r = 150;
    var html = '<svg viewBox="0 0 380 380" class="scale-svg" role="img" aria-label="Kitchen scale with needle at ' + grams + ' grams">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff" stroke="#2d2d2d" stroke-width="3"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="#2d2d2d"/>';
    function pt(v, rad) {
      var a = (135 + (v / 1000) * 270) * Math.PI / 180;
      return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    }
    for (var g = 0; g <= 1000; g += 20) {
      var isMajor = g % 100 === 0;
      var p1 = pt(g, isMajor ? r - 17 : r - 9);
      var p2 = pt(g, r - 3);
      html += '<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" stroke="#2d2d2d" stroke-width="' + (isMajor ? 2.2 : 1) + '"/>';
      if (isMajor) {
        var pl = pt(g, r - 34);
        html += '<text x="' + pl[0].toFixed(1) + '" y="' + (pl[1] + 3.5).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700">' + (g === 1000 ? '1 kg' : g) + '</text>';
      }
    }
    var n1 = pt(grams, r - 42);
    var n2 = pt(grams, 14);
    html += '<line x1="' + n1[0].toFixed(1) + '" y1="' + n1[1].toFixed(1) + '" x2="' + n2[0].toFixed(1) + '" y2="' + n2[1].toFixed(1) + '" stroke="#e63946" stroke-width="4"/>' +
      '</svg>';
    return html;
  }

  /** A 0-1 L measuring jug with the meniscus at `mL`. */
  function jugSVG(mL) {
    var bx = 110, bw = 92;
    var topY = 60, botY = 332;
    var html = '<svg viewBox="0 0 260 360" class="scale-svg" role="img" aria-label="Measuring jug with liquid at ' + mL + ' millilitres">' +
      '<path d="M ' + bx + ' ' + topY + ' l -16 -14 l 34 0" fill="none" stroke="#2d2d2d" stroke-width="3"/>' +
      '<rect x="' + bx + '" y="' + topY + '" width="' + bw + '" height="' + (botY - topY) + '" rx="6" fill="#cfe8ff" stroke="#2d2d2d" stroke-width="3"/>';
    function yFor(v) { return botY - (v / 1000) * (botY - topY); }
    for (var v = 0; v <= 1000; v += 25) {
      var isMajor = v % 100 === 0;
      var y = yFor(v);
      var x2 = bx + (isMajor ? -16 : -9);
      html += '<line x1="' + bx + '" y1="' + y.toFixed(1) + '" x2="' + x2 + '" y2="' + y.toFixed(1) + '" stroke="#2d2d2d" stroke-width="' + (isMajor ? 2 : 1) + '"/>';
      if (isMajor) {
        html += '<text x="' + (x2 - 4) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" font-weight="700">' + v + '</text>';
      }
    }
    var my = yFor(mL);
    html += '<rect x="' + (bx + 2) + '" y="' + my.toFixed(1) + '" width="' + (bw - 4) + '" height="' + (botY - my - 2).toFixed(1) + '" fill="#8ec5ff"/>' +
      '<line x1="' + (bx - 20) + '" y1="' + my.toFixed(1) + '" x2="' + (bx + bw + 20) + '" y2="' + my.toFixed(1) + '" stroke="#e63946" stroke-width="3"/>' +
      '<text x="' + (bx + bw / 2) + '" y="' + (topY - 24) + '" text-anchor="middle" font-size="11" font-weight="700">mL</text>' +
      '</svg>';
    return html;
  }

  var Scales = {
    SCALE_SPECS: SCALE_SPECS,
    question: question,
    parseInput: parseInput,
    rulerSVG: rulerSVG,
    kitchenSVG: kitchenSVG,
    jugSVG: jugSVG
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = Scales; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Scales = Scales;
})(typeof window !== 'undefined' ? window : globalThis);
