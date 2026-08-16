#!/usr/bin/env node
/**
 * visual-check.js — deterministic PIXEL verification for Jo⚡Go Metric Jumps.
 *
 * The interactive Preview screenshot compositor can be unavailable or stale;
 * this harness never depends on it. It drives the REAL app in a headless
 * Edge/Chrome via the DevTools Protocol (Node's built-in WebSocket — zero
 * npm dependencies), captures actual PNG screenshots, decodes them with a
 * tiny built-in PNG parser, and asserts on the pixels themselves.
 *
 * Run:  node tests/visual-check.js [url]
 *       (defaults to http://localhost:4174/index.html — the preview server)
 *
 * Exit code 0 = all pixel assertions pass; 1 = a visual regression.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');

const URL = process.argv[2] || 'http://localhost:4174/index.html';
const SHOTS = path.join(__dirname, '..', '.visual-shots');

// ------------------------------------------------------------------
// 1. Find a headless-capable browser on this machine
// ------------------------------------------------------------------
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];
function findBrowser() {
  for (const p of CANDIDATES) { try { if (fs.statSync(p).isFile()) return p; } catch (e) { /* next */ } }
  return null;
}

// ------------------------------------------------------------------
// 2. Minimal PNG decoder (8-bit RGB/RGBA, filters 0-4) -> RGBA buffer
// ------------------------------------------------------------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : (colorType === 0 ? 1 : 0));
  if (!bpp) throw new Error('unsupported color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 0xff;
      else if (f === 2) cur[x] = (cur[x] + b) & 0xff;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 0xff;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      out[d] = cur[s]; out[d + 1] = colorType === 0 ? cur[s] : cur[s + 1];
      out[d + 2] = colorType === 0 ? cur[s] : cur[s + 2];
      out[d + 3] = colorType === 6 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

function matches(px, r, g, b, tol) {
  return Math.abs(px[0] - r) <= tol && Math.abs(px[1] - g) <= tol && Math.abs(px[2] - b) <= tol;
}
function colorStats(img) {
  const { width, height, data } = img;
  let red = 0, dark = 0, yellow = 0, rulerYellow = 0, paper = 0;
  const distinct = new Set();
  let redMinY = Infinity, redMaxY = -1;
  const yellowPerRow = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      distinct.add((r >> 3) * 64 + (g >> 3) * 8 + (b >> 3));
      if (matches([r, g, b], 230, 57, 70, 14)) { red++; if (y < redMinY) redMinY = y; if (y > redMaxY) redMaxY = y; }
      else if (matches([r, g, b], 45, 45, 45, 24)) dark++;
      if (matches([r, g, b], 255, 196, 31, 18)) yellow++;
      if (matches([r, g, b], 247, 201, 72, 16)) { rulerYellow++; yellowPerRow[y]++; }
      if (matches([r, g, b], 253, 249, 240, 6)) paper++;
    }
  }
  // The ruler's top edge is the FIRST SOLID yellow row (>= 60 px), not a
  // stray anti-aliased pixel that happens to match the tolerance.
  let rulerMinY = Infinity;
  for (let y = 0; y < height; y++) { if (yellowPerRow[y] >= 60) { rulerMinY = y; break; } }
  return { red, dark, yellow, rulerYellow, paper, distinct: distinct.size, redMinY, redMaxY, rulerMinY };
}

// ------------------------------------------------------------------
// 3. Tiny CDP client over Node's built-in WebSocket
// ------------------------------------------------------------------
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    const api = {
      send(method, params) {
        return new Promise((res, rej) => {
          const id = nextId++;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      close() { try { ws.close(); } catch (e) { /* ignore */ } }
    };
    ws.addEventListener('open', () => resolve(api));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      }
    });
    ws.addEventListener('error', () => { reject(new Error('CDP socket error')); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    srv.on('error', reject);
  });
}
async function waitFor(url, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { /* retry */ }
    await sleep(300);
  }
  throw new Error('timed out waiting for ' + url);
}
async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result && r.result.value;
}
async function waitForJs(cdp, expression, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evalJs(cdp, expression)) return;
    await sleep(200);
  }
  throw new Error('timed out waiting for: ' + expression);
}
async function capture(cdp, name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, name + '.png');
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
}

// ------------------------------------------------------------------
// 4. The actual visual checks
// ------------------------------------------------------------------
let passed = 0, failed = 0;
function check(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}

async function run() {
  const browser = findBrowser();
  if (!browser) { console.log('No headless browser found — install Edge/Chrome.'); process.exit(1); }
  const port = await getFreePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jogo-vc-'));
  console.log('browser: ' + path.basename(browser));
  console.log('url:     ' + URL);

  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=768,1024',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitFor('http://127.0.0.1:' + port + '/json/version', 15000);
    const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
    const tab = await tabRes.json();
    const cdp = await cdpConnect(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await sleep(800); // let the app boot and its first-launch screen render

    // ---- Screen 1: first launch -> pick Learner 1 -> HOME ----
    await waitForJs(cdp, "document.readyState === 'complete' && !!document.querySelector('#learners-body')", 10000);
    const picked = await evalJs(cdp, "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Play as'); if (b) { b.click(); return true; } return false; })()");
    if (!picked) throw new Error('could not pick Learner 1 on first launch');
    await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active') && document.querySelectorAll('#home-ladders .ladder-col').length === 3", 10000);
    await sleep(400);
    const homeFile = await capture(cdp, 'home');
    const home = decodePng(fs.readFileSync(homeFile));
    const hs = colorStats(home);
    console.log('  home shot ' + home.width + 'x' + home.height + ' — distinct ' + hs.distinct + ', paper ' + Math.round(100 * hs.paper / (home.width * home.height)) + '%, yellow ' + hs.yellow);
    check(hs.distinct > 30, 'home: page paints with real content (not blank)');
    check(hs.paper / (home.width * home.height) > 0.3, 'home: warm paper background dominates');
    check(hs.yellow > 100, 'home: selected dimension highlight renders (yellow frame)');

    // ---- Screen 2: READ THE SCALES -> ruler with the pointer arrow ----
    const opened = await evalJs(cdp, "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Read the Scales/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()");
    if (!opened) throw new Error('could not open Read the Scales');
    await waitForJs(cdp, "!!document.querySelector('svg[aria-label*=\"Ruler\"]')", 10000);
    await sleep(400);
    const scalesFile = await capture(cdp, 'scales-ruler');
    const scales = decodePng(fs.readFileSync(scalesFile));
    const ss = colorStats(scales);
    console.log('  scales shot ' + scales.width + 'x' + scales.height + ' — red ' + ss.red + ', rulerYellow ' + ss.rulerYellow + ', dark ' + ss.dark);
    check(ss.red > 50, 'scales: red pointer arrow paints (' + ss.red + ' px)');
    check(ss.rulerYellow > 500, 'scales: ruler body paints (' + ss.rulerYellow + ' px)');
    // THE regression this tool exists for: the arrow must sit ABOVE the
    // ruler (every red pixel strictly above the ruler's top edge).
    if (ss.red > 0 && ss.rulerYellow > 0) {
      check(ss.redMaxY < ss.rulerMinY, 'scales: arrow is entirely ABOVE the ruler (arrow bottom ' + ss.redMaxY + ' < ruler top ' + ss.rulerMinY + ')');
    } else {
      check(false, 'scales: arrow/ruler both present for geometry check');
    }
    check(ss.dark > 200, 'scales: tick marks paint inside the ruler (' + ss.dark + ' px)');
    // The ruler must reflect the scale the child can actually read: a
    // fresh learner gets the mm-numbered ruler where the arrow IS the
    // answer (corner label mm, big numbers 10, 20, …), never the
    // cm-numbered one that needs a conversion it has not learned yet.
    const rulerTxt = await evalJs(cdp, "(() => { const svg = document.querySelector('svg[aria-label*=\"Ruler\"]'); if (!svg) return 'no-svg'; return svg.textContent; })()");
    check(rulerTxt.indexOf('mm') > -1 && rulerTxt.indexOf('cm') === -1, 'scales: question one shows the beginner mm ruler (not cm)');

    // ---- Screen 3: GAME — the ladder must not hand the answer away ----
    // Factor pills and the direction arrow stay hidden until Show hint.
    await evalJs(cdp, "document.getElementById('btn-play').click(); true");
    // a fresh learner meets the one-time teaching overlay first
    await waitForJs(cdp, "!document.getElementById('intro-backdrop') || document.getElementById('intro-backdrop').classList.contains('overlay--show') || !!document.querySelector('[data-role=\"ladder\"]')", 10000);
    const introShown = await evalJs(cdp, "document.getElementById('intro-backdrop') && document.getElementById('intro-backdrop').classList.contains('overlay--show')");
    if (introShown) { await evalJs(cdp, "document.getElementById('intro-go').click(); true"); }
    await waitForJs(cdp, "!!document.querySelector('[data-role=\"ladder\"]')", 10000);
    await sleep(300);
    const gated = await evalJs(cdp, "(() => { const wrap = document.querySelector('[data-role=\"ladder\"]'); const pill = wrap.querySelector('.ladder-gap-f'); return { hidden: wrap.classList.contains('ladder-wrap--hint'), pillVis: getComputedStyle(pill).visibility, hasBtn: !!document.getElementById('btn-show-hint') }; })()");
    check(gated.hidden, 'game: ladder starts with hints off (ladder-wrap--hint)');
    check(gated.pillVis === 'hidden', 'game: factor pills are hidden until Show hint');
    check(gated.hasBtn, 'game: a Show hint button is present');
    const revealed = await evalJs(cdp, "(() => { document.getElementById('btn-show-hint').click(); const pill = document.querySelector('[data-role=\"ladder\"] .ladder-gap-f'); const btn = document.getElementById('btn-show-hint'); return { vis: getComputedStyle(pill).visibility, btnHidden: btn ? btn.hidden : true }; })()");
    await sleep(150);
    check(revealed.vis === 'visible', 'game: Show hint reveals the factor pills');
    check(revealed.btnHidden, 'game: Show hint button hides itself after being tapped');

    // Answer this question, advance, and confirm the NEXT question starts
    // with the ladder hidden again (hints are per-question, not sticky).
    // Parse the op from the QUESTION PROMPT only — the body contains hidden
    // screens whose text (e.g. How It Works' "km → m is a 1000-jump") would
    // fool a body-wide regex into answering the wrong pair.
    const answered = await evalJs(cdp, "(() => { const pr = document.querySelector('.question-prompt'); if (!pr) return 'no-prompt'; const parts = pr.textContent.split('\\u2192').map(s => s.trim()); if (parts.length < 2) return 'no-arrow: ' + pr.textContent; const LAD = ['km','m','cm','mm','kg','g','mg','kL','L','mL']; const i = LAD.indexOf(parts[0]), j = LAD.indexOf(parts[1]); if (i < 0 || j < 0) return 'bad-units: ' + parts.join('/'); const op = i < j ? '\\u00d7' : '\\u00f7'; const btns = Array.from(document.querySelectorAll('.btn--op')); if (!btns.length) return 'no-op-btns'; const b = btns.find(x => x.textContent.trim().startsWith(op)); if (!b) return 'no-btn-for-' + op; b.click(); return 'answered ' + parts.join(' \\u2192 ') + ' as ' + op; })()");
    console.log('  game: answered ' + JSON.stringify(answered));
    try {
      await waitForJs(cdp, "!!document.querySelector('#btn-next-question')", 8000);
    } catch (e) {
      const diag = await evalJs(cdp, "(() => { const pr = document.querySelector('.question-prompt'); const fb = document.getElementById('feedback'); const mm = document.body.textContent.match(/(km|m|cm|mm|kg|g|mg|kL|L|mL)\\s*\\u2192\\s*(km|m|cm|mm|kg|g|mg|kL|L|mL)/); return { prompt: pr ? pr.textContent : null, feedback: fb ? fb.textContent : null, matched: mm ? mm[0] : null, screen: (document.querySelector('.screen--active') || {}).id || null, text: document.body.textContent.replace(/\\s+/g, ' ').slice(0, 260) }; })()");
      const shot = await capture(cdp, 'game-fail');
      throw new Error('next button never appeared; diag: ' + JSON.stringify(diag) + '; shot: ' + shot);
    }
    await evalJs(cdp, "document.querySelector('#btn-next-question').click(); true");
    await sleep(400);
    const rehidden = await evalJs(cdp, "(() => { const wrap = document.querySelector('[data-role=\"ladder\"]'); const pill = wrap ? wrap.querySelector('.ladder-gap-f') : null; return { hidden: wrap ? wrap.classList.contains('ladder-wrap--hint') : null, pillVis: pill ? getComputedStyle(pill).visibility : null, hasBtn: !!document.getElementById('btn-show-hint') }; })()");
    check(rehidden.hidden === true && rehidden.pillVis === 'hidden' && rehidden.hasBtn, 'game: next question re-hides the ladder');

    cdp.close();
    child.kill();
    await sleep(400); // let Edge release the profile dir before deleting it
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Windows can hold it briefly — not a test failure */ }
    console.log('\n' + (failed ? 'VISUAL FAILURES: ' + failed : 'All visual checks passed') + ' (' + passed + ' passed' + (failed ? ', ' + failed + ' failed' : '') + ')');
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.log('ERROR: ' + e.message);
    try { child.kill(); } catch (e2) { /* ignore */ }
    process.exit(1);
  }
}

run();
