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
    ruler:   { label: 'Ruler',         unit: 'mm',  ask: 'millimetres', min: 30, max: 250, major: 10, minor: 1,
               howTo: 'Find the nearest big number, then count the small lines on from there. Each small line is 1 mm.' },
    kitchen: { label: 'Kitchen scale', unit: 'g',   ask: 'grams',       min: 80, max: 980, major: 100, minor: 20,
               howTo: 'The big lines are 100 g apart. Each small line is 20 g. Count up from the nearest big line.' },
    jug:     { label: 'Measuring jug', unit: 'mL',  ask: 'millilitres', min: 100, max: 900, major: 100, minor: 25,
               howTo: 'The big lines are 100 mL apart. Each small line is 25 mL. Count up from the nearest big line.' }
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

  /**
   * A printable worksheet's items: `counts` readings per instrument
   * (default ruler 4, kitchen 3, jug 3), shuffled.
   */
  function worksheetItems(rng, counts) {
    rng = rng || Math.random;
    counts = counts || { ruler: 4, kitchen: 3, jug: 3 };
    var items = [];
    ['ruler', 'kitchen', 'jug'].forEach(function (ins) {
      var n = counts[ins] || 0;
      for (var i = 0; i < n; i++) items.push(question(ins, rng));
    });
    for (var j = items.length - 1; j > 0; j--) {
      var k = Math.floor(rng() * (j + 1));
      var tmp = items[j]; items[j] = items[k]; items[k] = tmp;
    }
    return items;
  }

  // ------------------------------------------------------------------
  // PDF drawing commands (same geometry as the SVG builders, in viewBox
  // units). Command types:
  //   { t:'line', x1,y1,x2,y2, w, color }
  //   { t:'rect', x,y,w,h, fill, stroke, sw }
  //   { t:'circle', cx,cy,r, fill, stroke, sw }
  //   { t:'poly', pts:[[x,y]...], fill }
  //   { t:'text', x,y, str, size, bold, color, anchor }
  // ------------------------------------------------------------------

  function rulerPDF(mm) {
    var px = 1.7, x0 = 30, w = x0 + 250 * px + 10;
    var c = [];
    c.push({ t: 'rect', x: x0, y: 30, w: 250 * px, h: 36, fill: '#f7c948', stroke: '#2d2d2d', sw: 2 });
    for (var m = 0; m <= 250; m++) {
      var x = x0 + m * px;
      var isMajor = m % 10 === 0, isHalf = m % 5 === 0;
      var th = isMajor ? 16 : (isHalf ? 11 : 7);
      c.push({ t: 'line', x1: x, y1: 30, x2: x, y2: 30 + th, w: isMajor ? 1.6 : 0.8, color: '#2d2d2d' });
      if (isMajor) c.push({ t: 'text', x: x, y: 80, str: String(m / 10), size: 9, bold: true, color: '#2d2d2d', anchor: 'middle' });
    }
    var px2 = x0 + mm * px;
    c.push({ t: 'line', x1: px2, y1: 6, x2: px2, y2: 28, w: 3, color: '#e63946' });
    c.push({ t: 'poly', pts: [[px2 - 7, 26], [px2 + 7, 26], [px2, 38]], fill: '#e63946' });
    c.push({ t: 'text', x: w - 8, y: 26, str: 'cm', size: 10, bold: true, color: '#2d2d2d', anchor: 'end' });
    return c;
  }

  function kitchenPDF(grams) {
    var cx = 190, cy = 190, r = 150;
    var c = [];
    c.push({ t: 'circle', cx: cx, cy: cy, r: r, fill: '#fff', stroke: '#2d2d2d', sw: 3 });
    c.push({ t: 'circle', cx: cx, cy: cy, r: 10, fill: '#2d2d2d' });
    function pt(v, rad) {
      var a = (135 + (v / 1000) * 270) * Math.PI / 180;
      return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    }
    for (var g = 0; g <= 1000; g += 20) {
      var isMajor = g % 100 === 0;
      var p1 = pt(g, isMajor ? r - 17 : r - 9);
      var p2 = pt(g, r - 3);
      c.push({ t: 'line', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], w: isMajor ? 2.2 : 1, color: '#2d2d2d' });
      if (isMajor) {
        var pl = pt(g, r - 34);
        c.push({ t: 'text', x: pl[0], y: pl[1] + 3.5, str: g === 1000 ? '1 kg' : String(g), size: 10, bold: true, color: '#2d2d2d', anchor: 'middle' });
      }
    }
    var n1 = pt(grams, r - 42), n2 = pt(grams, 14);
    c.push({ t: 'line', x1: n1[0], y1: n1[1], x2: n2[0], y2: n2[1], w: 4, color: '#e63946' });
    return c;
  }

  function jugPDF(mL) {
    var bx = 110, bw = 92, topY = 60, botY = 332;
    var c = [];
    c.push({ t: 'rect', x: bx, y: topY, w: bw, h: botY - topY, fill: '#cfe8ff', stroke: '#2d2d2d', sw: 3 });
    c.push({ t: 'line', x1: bx, y1: topY, x2: bx - 16, y2: topY - 14, w: 3, color: '#2d2d2d' });
    c.push({ t: 'line', x1: bx - 16, y1: topY - 14, x2: bx + 18, y2: topY - 14, w: 3, color: '#2d2d2d' });
    function yFor(v) { return botY - (v / 1000) * (botY - topY); }
    for (var v = 0; v <= 1000; v += 25) {
      var isMajor = v % 100 === 0;
      var y = yFor(v);
      var x2 = bx + (isMajor ? -16 : -9);
      c.push({ t: 'line', x1: bx, y1: y, x2: x2, y2: y, w: isMajor ? 2 : 1, color: '#2d2d2d' });
      if (isMajor) c.push({ t: 'text', x: x2 - 4, y: y + 3.5, str: String(v), size: 10, bold: true, color: '#2d2d2d', anchor: 'end' });
    }
    var my = yFor(mL);
    c.push({ t: 'rect', x: bx + 2, y: my, w: bw - 4, h: botY - my - 2, fill: '#8ec5ff' });
    c.push({ t: 'line', x1: bx - 20, y1: my, x2: bx + bw + 20, y2: my, w: 3, color: '#e63946' });
    c.push({ t: 'text', x: bx + bw / 2, y: topY - 24, str: 'mL', size: 11, bold: true, color: '#2d2d2d', anchor: 'middle' });
    return c;
  }

  /** The SVG builder matching a PDF command set, for previews. */
  function svgFromCommands(cmds, vbW, vbH, aria) {
    var s = '<svg viewBox="0 0 ' + vbW + ' ' + vbH + '" class="scale-svg" role="img" aria-label="' + aria + '">';
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c.t === 'line') {
        s += '<line x1="' + c.x1.toFixed(1) + '" y1="' + c.y1.toFixed(1) + '" x2="' + c.x2.toFixed(1) + '" y2="' + c.y2.toFixed(1) + '" stroke="' + c.color + '" stroke-width="' + (c.w || 1) + '"/>';
      } else if (c.t === 'rect') {
        s += '<rect x="' + c.x + '" y="' + c.y + '" width="' + c.w + '" height="' + c.h + '" rx="' + (c.rx || 4) + '" fill="' + c.fill + '" stroke="' + (c.stroke || 'none') + '" stroke-width="' + (c.sw || 1) + '"/>';
      } else if (c.t === 'circle') {
        s += '<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + c.r + '" fill="' + c.fill + '" stroke="' + (c.stroke || 'none') + '" stroke-width="' + (c.sw || 1) + '"/>';
      } else if (c.t === 'poly') {
        s += '<polygon points="' + c.pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="' + c.fill + '"/>';
      } else if (c.t === 'text') {
        var anchor = c.anchor === 'middle' ? ' text-anchor="middle"' : (c.anchor === 'end' ? ' text-anchor="end"' : '');
        s += '<text x="' + c.x.toFixed(1) + '" y="' + c.y.toFixed(1) + '"' + anchor + ' font-size="' + c.size + '" font-weight="' + (c.bold ? 700 : 400) + '" fill="' + c.color + '">' + c.str + '</text>';
      }
    }
    return s + '</svg>';
  }

  var Scales2 = {
    worksheetItems: worksheetItems,
    rulerPDF: rulerPDF,
    kitchenPDF: kitchenPDF,
    jugPDF: jugPDF,
    svgFromCommands: svgFromCommands
  };

  for (var k2 in Scales2) Scales[k2] = Scales2[k2];

  if (typeof module !== 'undefined' && module.exports) { module.exports = Scales; }
  root.JOGO = root.JOGO || {};
  root.JOGO.Scales = Scales;
})(typeof window !== 'undefined' ? window : globalThis);
