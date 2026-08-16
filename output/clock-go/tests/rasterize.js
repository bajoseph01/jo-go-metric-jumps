#!/usr/bin/env node
/**
 * rasterize.js — a tiny deterministic software rasterizer for the SVG subset
 * both apps emit (circle / line / rect / polygon), so the test suites can
 * pixel-check that graphics actually PAINT.
 *
 * Playbook catalog item 19: asserting DOM attributes (fills, points) is not
 * enough — the clock hands had valid attributes yet rendered zero pixels at
 * cardinal angles. This rasterizer turns the same SVG string into a pixel
 * buffer and counts colour-family pixels, exactly like a headless canvas.
 */
'use strict';

function parseHex(hex) {
  hex = String(hex || '').trim();
  if (hex.charAt(0) === '#') hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map(function (h) { return h + h; }).join('');
  var n = parseInt(hex, 16);
  if (isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Colour family a pixel counts as. */
function bucket(hex) {
  var c = parseHex(hex);
  if (!c) return 'other';
  if (c.r > 150 && c.g < 120 && c.b < 120) return 'red';
  if (c.r < 95 && c.g < 95 && c.b < 105) return 'dark';
  if (c.b > 150 && c.r < 165) return 'blue';
  if (c.r > 235 && c.g > 235 && c.b > 235) return 'white';
  return 'other';
}

function attr(attrs, name) {
  var m = attrs.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
}
function num(attrs, name) {
  var v = attr(attrs, name);
  return v === null ? null : Number(v);
}

function parseShapes(svg) {
  var shapes = [];
  var re, m;
  // `<g ...>` groups can carry a fill that children inherit (the scale
  // pointers do this). Remember the innermost inherited fill per position.
  var groups = [];
  var gRe = /<g\s+([^>]*)>/g;
  while ((m = gRe.exec(svg)) !== null) {
    groups.push({ pos: m.index, fill: attr(m[1], 'fill'), stroke: attr(m[1], 'stroke') });
  }
  function inherited(pos, name) {
    for (var gi = groups.length - 1; gi >= 0; gi--) {
      if (groups[gi].pos < pos && groups[gi][name]) return groups[gi][name];
    }
    return null;
  }
  re = /<circle\s+([^>]*?)\/?>/g;
  while ((m = re.exec(svg)) !== null) {
    var a = m[1];
    shapes.push({ t: 'circle', cx: num(a, 'cx'), cy: num(a, 'cy'), r: num(a, 'r'), fill: attr(a, 'fill') || inherited(m.index, 'fill') });
  }
  re = /<line\s+([^>]*?)\/?>/g;
  while ((m = re.exec(svg)) !== null) {
    a = m[1];
    shapes.push({
      t: 'line', x1: num(a, 'x1'), y1: num(a, 'y1'), x2: num(a, 'x2'), y2: num(a, 'y2'),
      stroke: attr(a, 'stroke') || inherited(m.index, 'stroke'), w: num(a, 'stroke-width') || 1,
      round: /stroke-linecap="round"/.test(a)
    });
  }
  re = /<rect\s+([^>]*?)\/?>/g;
  while ((m = re.exec(svg)) !== null) {
    a = m[1];
    shapes.push({ t: 'rect', x: num(a, 'x'), y: num(a, 'y'), w: num(a, 'width'), h: num(a, 'height'), fill: attr(a, 'fill') || inherited(m.index, 'fill') });
  }
  re = /<polygon\s+([^>]*?)\/?>/g;
  while ((m = re.exec(svg)) !== null) {
    a = m[1];
    var pts = (attr(a, 'points') || '').trim().split(/\s+/).map(function (p) {
      var xy = p.split(',');
      return [Number(xy[0]), Number(xy[1])];
    });
    shapes.push({ t: 'poly', pts: pts, fill: attr(a, 'fill') || inherited(m.index, 'fill') });
  }
  return shapes;
}

/** Distance from point (x,y) to the segment p1-p2. */
function segDist(x, y, x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1;
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
  var t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  var px = x1 + t * dx, py = y1 + t * dy;
  return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
}

/** Even-odd point-in-polygon. */
function inPoly(x, y, pts) {
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/**
 * Rasterize an SVG string into a pixel buffer at `scale` times its viewBox.
 * Returns per-colour-family pixel counts. `<text>` is ignored (small, and
 * never the target of a degeneracy check).
 */
function rasterize(svg, scale) {
  scale = scale || 1;
  var vbm = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  var vw = vbm ? Number(vbm[1]) : 200;
  var vh = vbm ? Number(vbm[2]) : 200;
  var W = Math.max(8, Math.round(vw * scale));
  var H = Math.max(8, Math.round(vh * scale));
  var shapes = parseShapes(svg);
  var counts = { red: 0, dark: 0, blue: 0, white: 0, other: 0, total: W * H };

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var ux = (x + 0.5) / scale;
      var uy = (y + 0.5) / scale;
      var colour = '#ffffff'; // transparent background → white family
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        if (s.t === 'circle') {
          var dx = ux - s.cx, dy = uy - s.cy;
          if (dx * dx + dy * dy <= s.r * s.r && s.fill) colour = s.fill;
        } else if (s.t === 'line') {
          if (segDist(ux, uy, s.x1, s.y1, s.x2, s.y2) <= s.w / 2 && s.stroke) colour = s.stroke;
        } else if (s.t === 'rect') {
          if (ux >= s.x && ux <= s.x + s.w && uy >= s.y && uy <= s.y + s.h && s.fill) colour = s.fill;
        } else if (s.t === 'poly') {
          if (inPoly(ux, uy, s.pts) && s.fill) colour = s.fill;
        }
      }
      var b = bucket(colour);
      counts[b] = (counts[b] || 0) + 1;
    }
  }
  return counts;
}

module.exports = { rasterize: rasterize, bucket: bucket, parseHex: parseHex };
