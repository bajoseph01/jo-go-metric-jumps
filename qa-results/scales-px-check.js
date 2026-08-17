// scales-px-check.js — prove the new look elements actually paint in the
// captured iPad renders: the dial's silver bezel ring (a bright-grey ring
// outside the white face) and the jug's dark handle strokes on its right.
// Usage: node qa-results/scales-px-check.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : (colorType === 0 ? 1 : 0));
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 0xff;
      else if (f === 2) cur[x] = (cur[x] + b) & 0xff;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 0xff;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff; }
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      out[d] = cur[s]; out[d + 1] = colorType === 0 ? cur[s] : cur[s + 1];
      out[d + 2] = colorType === 0 ? cur[s] : cur[s + 2];
      out[d + 3] = colorType === 6 ? cur[s + 3] : 255;
    }
  }
  return { width, height, data: out };
}

const ev = path.join(__dirname, 'evidence');
const dial = decodePng(fs.readFileSync(path.join(ev, 'scales-portrait-dial.png')));
const jug = decodePng(fs.readFileSync(path.join(ev, 'scales-portrait-jug.png')));

// Dial: count silver-bezel pixels (#e8eaef ≈ 232,234,239) vs white face
// pixels; a bezel present means a ring of silver around the face.
let silver = 0, white = 0;
for (let i = 0; i < dial.data.length; i += 4) {
  const r = dial.data[i], g = dial.data[i + 1], b = dial.data[i + 2];
  if (Math.abs(r - 232) <= 10 && Math.abs(g - 234) <= 10 && Math.abs(b - 239) <= 10) silver++;
  else if (r > 240 && g > 240 && b > 240) white++;
}
console.log('dial: silver bezel px = ' + silver + ', white face px = ' + white + ' (bezel paints: ' + (silver > 500) + ')');

// Jug: dark handle strokes on the jug's right side. The jug is centred in
// the 810px viewport; at DPR 2 its body right edge sits near x≈1090 and the
// handle sticks out to ≈1180. Count dark (#2d2d2d) pixels in a vertical
// band just right of the body centre, across the middle half of the height.
const jw = jug.width;
const x0 = Math.floor(jw * 0.66), x1 = Math.floor(jw * 0.74); // ≈1069–1199
const y0 = Math.floor(jug.height * 0.2), y1 = Math.floor(jug.height * 0.8);
let handleDark = 0;
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const i = (y * jw + x) * 4;
    if (jug.data[i] < 100 && jug.data[i + 1] < 100 && jug.data[i + 2] < 110) handleDark++;
  }
}
console.log('jug: dark handle-stroke px right of body = ' + handleDark + ' (handle paints: ' + (handleDark > 200) + ')');
