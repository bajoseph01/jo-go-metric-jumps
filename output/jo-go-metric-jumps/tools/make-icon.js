/**
 * make-icon.js — generates assets/icon-180.png with zero dependencies.
 * Draws the Jo⚡Go bolt on a yellow disc with an ink ring.
 * Run: node tools/make-icon.js
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 180;

// ---- minimal PNG encoder ----
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- drawing ----
const px = Buffer.alloc(SIZE * SIZE * 4);
const INK = [43, 42, 51, 255];
const YELLOW = [255, 196, 31, 255];

function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
}

function inDisc(x, y, cx, cy, r) {
  const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= r * r;
}

// bolt polygon (even-odd fill)
const BOLT = [[58, 22], [26, 62], [46, 62], [38, 94], [76, 44], [52, 44]];

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// scale bolt coords to size
function boltAt(s) {
  return BOLT.map(([x, y]) => [x * s / 100, y * s / 100]);
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (inDisc(x, y, 90, 90, 86)) {
      if (inDisc(x, y, 90, 90, 78)) setPx(x, y, YELLOW);
      else setPx(x, y, INK);
      if (pointInPoly(x + 0.5, y + 0.5, boltAt(SIZE))) setPx(x, y, INK);
    }
  }
}

const out = path.join(__dirname, '..', 'assets', 'icon-180.png');
fs.writeFileSync(out, encodePNG(SIZE, SIZE, px));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
