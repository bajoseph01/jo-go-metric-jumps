/**
 * pdf.js — Jo⚡Go Metric Master
 * A tiny, dependency-free PDF writer (Helvetica, WinAnsi encoding).
 *
 * Enough for the teacher-facing documents: per-learner reports and the
 * class worksheet pack. No libraries, no network — every byte is produced
 * locally, so export works offline on a classroom device.
 *
 * Emoji and other non-Latin-1 characters are dropped from output text
 * (Helvetica cannot encode them); arrows and dashes are mapped to ASCII.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------
  // Helvetica AFM widths (units of 1/1000 em) for WinAnsi codes 32..255.
  // ASCII values are the standard AFM widths; Latin-1 accented letters use
  // the width of their base letter (close enough for text wrapping).
  // ------------------------------------------------------------------

  var ASCII = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

  // WinAnsi 160..255 — approximations by base glyph.
  var LATIN1 = [278,333,556,556,556,260,556,333,1000,333,333,556,584,333,1000,333,
    400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,
    667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,
    722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
    556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,
    556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];

  var WIDTHS = ASCII.concat(LATIN1);

  function charWidth(code) {
    if (code >= 32 && code < 32 + WIDTHS.length) return WIDTHS[code - 32];
    return 556; // fallback average
  }

  // ------------------------------------------------------------------
  // Text sanitising + PDF string escaping
  // ------------------------------------------------------------------

  var GLYPH_MAP = {
    '\u2192': '->',  // →
    '\u2014': '-',   // —
    '\u2013': '-',   // –
    '\u2026': '...', // …
    '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"'
  };

  /** Convert a JS string to safe PDF text (WinAnsi + ASCII substitutes). */
  function toPdfText(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var code = s.charCodeAt(i);
      if (GLYPH_MAP[ch]) { out += GLYPH_MAP[ch]; continue; }
      if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
        out += ch;
      }
      // anything else (emoji, CJK, surrogates) is dropped
    }
    return out;
  }

  function esc(s) {
    return s.replace(/[\\()]/g, function (c) { return '\\' + c; });
  }

  /** '#f7c948' → '0.969 0.788 0.282'; passes through numeric strings. */
  function colorToRGB(c) {
    if (typeof c === 'string' && c.charAt(0) === '#') {
      var hex = c.slice(1);
      if (hex.length === 3) hex = hex.split('').map(function (h) { return h + h; }).join('');
      var n = parseInt(hex, 16);
      return ((n >> 16) & 255) / 255 + ' ' + ((n >> 8) & 255) / 255 + ' ' + (n & 255) / 255;
    }
    return c;
  }

  function textWidth(str, size) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += charWidth(str.charCodeAt(i));
    return (w / 1000) * size;
  }

  /** Greedy word wrap; returns array of lines fitting maxWidth at `size`. */
  function wrap(str, size, maxWidth) {
    str = toPdfText(str);
    var words = str.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var cand = line ? line + ' ' + words[i] : words[i];
      if (textWidth(cand, size) <= maxWidth || !line) {
        line = cand;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  // ------------------------------------------------------------------
  // Document builder
  // ------------------------------------------------------------------

  var DEFAULT_PAGE_W = 595.28;  // A4 portrait
  var DEFAULT_PAGE_H = 841.89;

  function createDoc(opts) {
    opts = opts || {};
    var pageW = opts.pageW || DEFAULT_PAGE_W;
    var pageH = opts.pageH || DEFAULT_PAGE_H;
    var margin = opts.margin || 48;
    var usable = pageW - margin * 2;
    var pages = [];
    var cur = null;

    function addPage() {
      cur = { ops: [], y: margin };
      pages.push(cur);
      return cur;
    }
    addPage();

    /** Draw text at (x from-left, y from-top) — advances nothing. */
    function drawText(x, yFromTop, str, size, bold, color) {
      var font = bold ? 'F2' : 'F1';
      var pdfY = pageH - yFromTop;
      cur.ops.push('q ' + color + ' rg BT /' + font + ' ' + size.toFixed(2) +
        ' Tf ' + x.toFixed(2) + ' ' + pdfY.toFixed(2) + ' Td (' + esc(str) + ') Tj ET Q');
    }

    function lineY(y) { return pageH - y; }

    function hline(x1, x2, y, color, width) {
      cur.ops.push('q ' + color + ' RG ' + (width || 0.8).toFixed(2) + ' w ' +
        x1.toFixed(2) + ' ' + lineY(y).toFixed(2) + ' m ' + x2.toFixed(2) + ' ' +
        lineY(y).toFixed(2) + ' l S Q');
    }

    function fillRect(x, y, w, h, color) {
      cur.ops.push('q ' + color + ' rg ' + x.toFixed(2) + ' ' + lineY(y + h).toFixed(2) +
        ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f Q');
    }

    // ------------------------------------------------------------------
    // High-level helpers (all advance cur.y)
    // ------------------------------------------------------------------

    function title(str) {
      var lines = wrap(str, 19, usable);
      for (var i = 0; i < lines.length; i++) {
        drawText(margin, cur.y, lines[i], 19, true, '0.13');
        cur.y += 24;
      }
      hline(margin, pageW - margin, cur.y, '0.72', 1);
      cur.y += 12;
    }

    function subtitle(str) {
      var lines = wrap(str, 10.5, usable);
      for (var i = 0; i < lines.length; i++) {
        drawText(margin, cur.y, lines[i], 10.5, false, '0.42');
        cur.y += 15;
      }
      cur.y += 2;
    }

    function section(str) {
      cur.y += 6;
      var lines = wrap(str, 13, usable);
      for (var i = 0; i < lines.length; i++) {
        drawText(margin, cur.y, lines[i], 13, true, '0.13');
        cur.y += 18;
      }
      cur.y += 4;
    }

    /** Paragraph of wrapped text; advances cur.y. */
    function para(str, o) {
      o = o || {};
      var size = o.size || 10.5;
      var indent = o.indent || 0;
      var gap = o.gap !== undefined ? o.gap : 6;
      var color = o.color || '0.2';
      var bold = !!o.bold;
      var maxW = usable - indent;
      var lines = wrap(str, size, maxW);
      for (var i = 0; i < lines.length; i++) {
        drawText(margin + indent, cur.y, lines[i], size, bold, color);
        cur.y += size * 1.35;
      }
      cur.y += gap;
      return lines.length;
    }

    function blankLine(h) { cur.y += (h || 10); }

    /**
     * Table: cols = [{ label, w }], rows = array of cell-string arrays.
     * Wraps cell text; handles page breaks; header row shaded.
     */
    function table(cols, rows, o) {
      o = o || {};
      var size = o.size || 9.5;
      var lineH = size * 1.35;
      var pad = 5;
      var totalW = 0;
      for (var c = 0; c < cols.length; c++) totalW += cols[c].w;
      var x0 = margin + (usable - totalW) / 2;

      function cellLines(cell, width) { return wrap(cell, size, width - pad * 2); }

      function drawHeader(y) {
        fillRect(x0, y, totalW, lineH + pad * 2, '0.92');
        var x = x0;
        for (var c = 0; c < cols.length; c++) {
          drawText(x + pad, y + pad, cols[c].label, size, true, '0.13');
          x += cols[c].w;
        }
      }

      var y = cur.y;
      drawHeader(y);
      y += lineH + pad * 2;

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var maxLines = 1;
        for (var c2 = 0; c2 < cols.length; c2++) {
          maxLines = Math.max(maxLines, cellLines(String(row[c2]), cols[c2].w).length);
        }
        var rowH = maxLines * lineH + pad * 2;
        if (y + rowH > pageH - margin) {
          hline(x0, x0 + totalW, y, '0.55', 0.7);
          addPage();
          y = cur.y;
          drawHeader(y);
          y += lineH + pad * 2;
        }
        var x = x0;
        for (var c3 = 0; c3 < cols.length; c3++) {
          var lines = cellLines(String(row[c3]), cols[c3].w);
          var ty = y + pad;
          for (var li = 0; li < lines.length; li++) {
            drawText(x + pad, ty, lines[li], size, false, '0.2');
            ty += lineH;
          }
          x += cols[c3].w;
        }
        y += rowH;
        hline(x0, x0 + totalW, y, '0.55', 0.7);
      }
      cur.y = y + 10;
    }

    /** Force the next content onto a fresh page. */
    function pageBreak() { addPage(); }

    // ------------------------------------------------------------------
    // Low-level primitives (absolute positions, no y advance)
    // ------------------------------------------------------------------

    function textAt(x, yFromTop, str, size, bold, color, anchor) {
      var txt = toPdfText(str);
      if (anchor === 'middle') x -= textWidth(txt, size) / 2;
      else if (anchor === 'end') x -= textWidth(txt, size);
      drawText(x, yFromTop, txt, size, bold, colorToRGB(color || '0.2'));
    }

    function line(x1, y1, x2, y2, o) {
      o = o || {};
      cur.ops.push('q ' + colorToRGB(o.color || '0.2') + ' RG ' + (o.width || 0.8).toFixed(2) + ' w ' +
        x1.toFixed(2) + ' ' + lineY(y1).toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + lineY(y2).toFixed(2) + ' l S Q');
    }

    function rect(x, y, w, h, o) {
      o = o || {};
      if (o.fill) fillRect(x, y, w, h, colorToRGB(o.fill));
      if (o.stroke) {
        var sw = o.sw || 1;
        line(x, y, x + w, y, { color: o.stroke, width: sw });
        line(x + w, y, x + w, y + h, { color: o.stroke, width: sw });
        line(x + w, y + h, x, y + h, { color: o.stroke, width: sw });
        line(x, y + h, x, y, { color: o.stroke, width: sw });
      }
    }

    function circlePath(cx, cy, r) {
      var k = r * 0.5523;
      var y1 = lineY(cy);
      var s = (cx + r).toFixed(2) + ' ' + y1.toFixed(2) + ' m ';
      s += (cx + r).toFixed(2) + ' ' + (y1 + k).toFixed(2) + ' ' + (cx + k).toFixed(2) + ' ' + (y1 + r).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + (y1 + r).toFixed(2) + ' c ';
      s += (cx - k).toFixed(2) + ' ' + (y1 + r).toFixed(2) + ' ' + (cx - r).toFixed(2) + ' ' + (y1 + k).toFixed(2) + ' ' + (cx - r).toFixed(2) + ' ' + y1.toFixed(2) + ' c ';
      s += (cx - r).toFixed(2) + ' ' + (y1 - k).toFixed(2) + ' ' + (cx - k).toFixed(2) + ' ' + (y1 - r).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + (y1 - r).toFixed(2) + ' c ';
      s += (cx + k).toFixed(2) + ' ' + (y1 - r).toFixed(2) + ' ' + (cx + r).toFixed(2) + ' ' + (y1 - k).toFixed(2) + ' ' + (cx + r).toFixed(2) + ' ' + y1.toFixed(2) + ' c ';
      return s;
    }

    function circle(cx, cy, r, o) {
      o = o || {};
      if (o.fill) cur.ops.push('q ' + colorToRGB(o.fill) + ' rg ' + circlePath(cx, cy, r) + 'f Q');
      if (o.stroke) {
        cur.ops.push('q ' + colorToRGB(o.stroke) + ' RG ' + (o.sw || 1).toFixed(2) + ' w ' + circlePath(cx, cy, r) + 'S Q');
      }
    }

    function poly(pts, fill) {
      var op = 'q ' + colorToRGB(fill || '0.2') + ' rg ';
      for (var i = 0; i < pts.length; i++) {
        op += pts[i][0].toFixed(2) + ' ' + lineY(pts[i][1]).toFixed(2) + (i === 0 ? ' m ' : ' l ');
      }
      op += 'h f Q';
      cur.ops.push(op);
    }

    function getY() { return cur.y; }
    function setY(y) { cur.y = y; }

    return {
      title: title,
      subtitle: subtitle,
      section: section,
      para: para,
      blankLine: blankLine,
      table: table,
      pageBreak: pageBreak,
      textAt: textAt,
      line: line,
      rect: rect,
      circle: circle,
      poly: poly,
      getY: getY,
      setY: setY,
      build: build,
      buildBytes: buildBytes
    };

    // ------------------------------------------------------------------
    // Assembly
    // ------------------------------------------------------------------

    function buildBytes() {
      var n = pages.length;
      var dateStr = new Date().toLocaleDateString();
      for (var p = 0; p < n; p++) {
        var pg = pages[p];
        var footY = pageH - 26;
        pg.ops.push('q 0.45 rg BT /F1 8 Tf ' + margin.toFixed(2) + ' ' + footY.toFixed(2) +
          ' Td (' + esc('Jo⚡Go Metric Master · ' + dateStr) + ') Tj ET Q');
        var right = 'Page ' + (p + 1) + ' of ' + n;
        pg.ops.push('q 0.45 rg BT /F1 8 Tf ' + (pageW - margin - textWidth(right, 8)).toFixed(2) +
          ' ' + footY.toFixed(2) + ' Td (' + esc(right) + ') Tj ET Q');
      }

      var out = [];
      var offsets = [0];
      function push(s) { out.push(s); }
      function byteLength() {
        var len = 0;
        for (var i = 0; i < out.length; i++) len += out[i].length;
        return len;
      }

      push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

      var objId = 0;
      var pagesObjId = 0;

      function beginObj() {
        objId++;
        offsets.push(byteLength());
        push(objId + ' 0 obj\n');
        return objId;
      }

      // object 1: catalog
      beginObj();
      push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

      // object 2: pages tree — page ids are deterministic (3, 5, 7, ...), so
      // the Kids array is written in its final form directly (no patching,
      // which breaks once multi-digit ids change the byte length).
      pagesObjId = beginObj();
      var kidsList = '';
      for (var k = 0; k < n; k++) kidsList += (3 + 2 * k) + ' 0 R ';
      push('<< /Type /Pages /Kids [' + kidsList + '] /Count ' + n + ' >>\nendobj\n');

      // one Page + one Contents stream per page, then the two font objects.
      // Font ids are 3+2n / 4+2n (the page loop creates exactly 2n objects).
      var f1Id = 3 + 2 * n;
      var f2Id = 4 + 2 * n;
      for (var pi = 0; pi < n; pi++) {
        beginObj();
        push('<< /Type /Page /Parent ' + pagesObjId + ' 0 R /MediaBox [0 0 ' +
          pageW + ' ' + pageH + '] /Resources << /Font << /F1 ' + f1Id + ' 0 R /F2 ' + f2Id + ' 0 R >> >> ' +
          '/Contents ' + (objId + 1) + ' 0 R >>\nendobj\n');
        beginObj();
        var body = pages[pi].ops.join('\n') + '\n';
        push('<< /Length ' + body.length + ' >>\nstream\n' + body + 'endstream\nendobj\n');
      }

      beginObj();
      push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
      beginObj();
      push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');

      var xrefPos = byteLength();
      push('xref\n0 ' + (objId + 1) + '\n');
      push('0000000000 65535 f \n');
      for (var oi = 1; oi <= objId; oi++) {
        push(('0000000000' + offsets[oi]).slice(-10) + ' 00000 n \n');
      }
      push('trailer\n<< /Size ' + (objId + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');

      var str = out.join('');
      var bytes = new Uint8Array(str.length);
      for (var bi = 0; bi < str.length; bi++) bytes[bi] = str.charCodeAt(bi) & 0xFF;
      return bytes;
    }

    function build() {
      if (typeof Blob !== 'undefined') {
        return new Blob([buildBytes()], { type: 'application/pdf' });
      }
      return buildBytes();
    }
  }

  /** Trigger a browser download of a Blob. */
  function download(blob, filename) {
    if (typeof URL === 'undefined' || typeof document === 'undefined') return;
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  var PDF = {
    createDoc: createDoc,
    download: download,
    toPdfText: toPdfText,
    textWidth: textWidth,
    wrap: wrap
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = PDF; }
  root.JOGO = root.JOGO || {};
  root.JOGO.PDF = PDF;
})(typeof window !== 'undefined' ? window : globalThis);
