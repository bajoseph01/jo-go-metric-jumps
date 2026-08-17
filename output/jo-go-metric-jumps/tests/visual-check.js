#!/usr/bin/env node
/**
 * visual-check.js — deterministic PIXEL verification for Jo⚡Go Metric Master.
 *
 * The interactive Preview screenshot compositor can be unavailable or stale;
 * this harness never depends on it. It drives the REAL app in a headless
 * Edge/Chrome via the DevTools Protocol (Node's built-in WebSocket — zero
 * npm dependencies), captures actual PNG screenshots, decodes them with a
 * tiny built-in PNG parser, and asserts on the pixels themselves.
 *
 * Coverage: home, Read the Scales (arrow-above-ruler geometry, mm ruler),
 * the game (hint gating, re-hide per question), How It Works (teaching
 * cards + ladder), the worksheet pack (scale sheets, answer key), the
 * timed challenge (AC-001 double-tap), and the Tick⚡Tock clock app (hands
 * paint, non-degenerate at cardinal angles, answerable end-to-end) — the
 * clock app runs in a second browser session over a tiny static server.
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
const http = require('http');

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
  let red = 0, dark = 0, yellow = 0, rulerYellow = 0, paper = 0, blue = 0;
  const distinct = new Set();
  let redMinY = Infinity, redMaxY = -1, redMinX = Infinity, redMaxX = -1;
  const yellowPerRow = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      distinct.add((r >> 3) * 64 + (g >> 3) * 8 + (b >> 3));
      if (matches([r, g, b], 230, 57, 70, 14)) { red++; if (y < redMinY) redMinY = y; if (y > redMaxY) redMaxY = y; if (x < redMinX) redMinX = x; if (x > redMaxX) redMaxX = x; }
      else if (matches([r, g, b], 45, 45, 45, 24)) dark++;
      if (matches([r, g, b], 255, 196, 31, 18)) yellow++;
      if (matches([r, g, b], 247, 201, 72, 16)) { rulerYellow++; yellowPerRow[y]++; }
      if (matches([r, g, b], 253, 249, 240, 6)) paper++;
      if (matches([r, g, b], 47, 107, 255, 26)) blue++;
    }
  }
  // The ruler's top edge is the FIRST SOLID yellow row (>= 60 px), not a
  // stray anti-aliased pixel that happens to match the tolerance.
  let rulerMinY = Infinity;
  for (let y = 0; y < height; y++) { if (yellowPerRow[y] >= 60) { rulerMinY = y; break; } }
  return {
    red, dark, yellow, rulerYellow, paper, blue, distinct: distinct.size,
    redMinY, redMaxY, redMinX, redMaxX,
    redWidth: redMaxX > -1 ? redMaxX - redMinX + 1 : 0,
    redHeight: redMaxY > -1 ? redMaxY - redMinY + 1 : 0,
    rulerMinY
  };
}

// ------------------------------------------------------------------
// 2b. Tiny zero-dependency static server (for the clock app, which the
// preview server does not serve). Serves one directory over http.
// ------------------------------------------------------------------
function serveDir(root) {
  return new Promise((resolve) => {
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(root, p);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': (mime[path.extname(file).toLowerCase()] || 'application/octet-stream') + '; charset=utf-8' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => srv.close() }));
  });
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

    // ---- Screen 4: HOW IT WORKS — the embossed teaching cards + ladder ----
    // Return home from the game, open How It Works, and confirm the
    // teaching surface actually renders: four cards, the unit ladder with
    // its factor pills, the golden rule, and a real painted page.
    await evalJs(cdp, "(() => { const sc = document.querySelector('.screen--active'); const b = Array.from(sc.querySelectorAll('button')).find(x => x.textContent.trim() === '\\u2302' || x.textContent.trim() === 'Home'); if (b) { b.click(); return true; } return false; })()");
    await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 8000);
    await evalJs(cdp, "document.getElementById('btn-how').click(); true");
    await waitForJs(cdp, "document.getElementById('screen-how').classList.contains('screen--active')", 6000);
    await sleep(400);
    const how = await evalJs(cdp, "(() => { const cards = document.querySelectorAll('#screen-how .how-card'); const ladder = document.getElementById('how-ladder'); const first = cards[0]; const cs = first ? getComputedStyle(first) : null; return { cards: cards.length, rungs: ladder ? ladder.querySelectorAll('.rung').length : 0, pills: ladder ? ladder.querySelectorAll('.ladder-gap-f').length : 0, golden: document.body.textContent.includes('The Golden Rule'), reality: document.body.textContent.includes('Check It Makes Sense'), embossed: cs ? cs.borderTopStyle === 'solid' && parseFloat(cs.borderTopWidth) > 0 && cs.boxShadow !== 'none' : false }; })()");
    check(how.cards === 4, 'how: the four teaching cards render');
    check(how.rungs >= 4 && how.pills >= 3, 'how: the conversion ladder renders with rungs and factor pills');
    check(how.golden && how.reality, 'how: golden-rule and reality-check guidance present');
    check(how.embossed, 'how: the cards carry a real embossed border (not flat white)');
    const howFile = await capture(cdp, 'how');
    const howImg = decodePng(fs.readFileSync(howFile));
    const hws = colorStats(howImg);
    console.log('  how shot ' + howImg.width + 'x' + howImg.height + ' — distinct ' + hws.distinct + ', paper ' + Math.round(100 * hws.paper / (howImg.width * howImg.height)) + '%');
    check(hws.distinct > 30, 'how: page paints with real content (not blank)');
    // the how page is card-heavy — paper shows in the margins, not half the
    // screen, so a small-but-present floor is the honest assertion
    check(hws.paper / (howImg.width * howImg.height) > 0.05, 'how: the warm paper backdrop frames the cards');
    // back to home for the worksheets/challenge leg
    await evalJs(cdp, "(() => { const b = Array.from(document.querySelectorAll('#screen-how button')).find(x => x.getAttribute('data-back') === 'screen-home'); if (b) { b.click(); return true; } return false; })()");
    await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 6000);

    // ---- Screen 5: WORKSHEETS — on-screen scale sheets + answer key ----
    // (Reached through teacher mode; the challenge section below shares the
    // same first leg, so the worksheet assertions live in the middle of it.)
    await evalJs(cdp, "(() => { const sc = document.querySelector('.screen--active'); const b = Array.from(sc.querySelectorAll('button')).find(x => x.textContent.trim() === '\\u2302' || x.textContent.trim() === 'Home'); if (b) { b.click(); return true; } return false; })()");
    await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 8000);
    // unlock teacher mode (T key + PIN 5241)
    await evalJs(cdp, "window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' })); true");
    await sleep(300);
    await evalJs(cdp, "(() => { const ov = document.querySelector('.overlay--show'); if (!ov) return false; const press = t => Array.from(ov.querySelectorAll('button')).find(b => b.textContent.trim() === t).click(); ['5','2','4','1'].forEach(press); return true; })()");
    await waitForJs(cdp, "(() => { const p = document.getElementById('teacher-panel'); return !!p && getComputedStyle(p.closest('.overlay')).display !== 'none'; })()", 6000);
    await evalJs(cdp, "(() => { const p = document.getElementById('teacher-panel'); Array.from(p.querySelectorAll('button')).find(x => x.textContent.includes('Worksheet pack')).click(); return true; })()");
    await waitForJs(cdp, "(document.querySelector('.screen--active') || {}).id === 'screen-worksheets'", 6000);
    // scales mode + class set + timed challenge
    await evalJs(cdp, "(() => { const tab = Array.from(document.querySelectorAll('.ws-mode-tab')).find(x => x.textContent.includes('Read the Scales')); if (tab) { tab.click(); return true; } return false; })()");
    await sleep(300);
    await evalJs(cdp, "document.getElementById('ws-class-on').click(); true");
    await sleep(400);
    // The class-set scale sheets render automatically: one per learner,
    // all three instruments, each with a type-in box for on-screen marking.
    const wsDom = await evalJs(cdp, "(() => { const sheets = document.querySelectorAll('.ws-sheet[data-learner]'); const items = document.querySelectorAll('.ws-scale-item'); const inputs = document.querySelectorAll('.ws-scale-input'); const labels = Array.from(document.querySelectorAll('.ws-scale-item svg')).map(s => s.getAttribute('aria-label') || ''); return { sheets: sheets.length, items: items.length, inputs: inputs.length, labels: labels }; })()");
    check(wsDom.sheets >= 1 && wsDom.items >= 3 && wsDom.inputs === wsDom.items, 'worksheets: class-set scale sheets render with one answer input per item');
    check(wsDom.labels.some(l => /ruler/i.test(l)) && wsDom.labels.some(l => /kitchen/i.test(l)) && wsDom.labels.some(l => /jug/i.test(l)), 'worksheets: ruler, kitchen and jug scales all present');
    // answer key — it defaults ON; ensure it is checked, then assert every
    // item has a real answer on the key
    await evalJs(cdp, "(() => { const cb = document.getElementById('ws-key-on'); if (cb && !cb.checked) cb.click(); return true; })()");
    await waitForJs(cdp, "!!document.querySelector('.ws-answers .ws-key-list')", 6000);
    const wsKey = await evalJs(cdp, "(() => { const lis = Array.from(document.querySelectorAll('.ws-answers .ws-key-list li')); return { count: lis.length, filled: lis.filter(li => li.textContent.trim().length > 0).length }; })()");
    check(wsKey.count >= 3 && wsKey.filled === wsKey.count, 'worksheets: answer key shows a real answer for every item');
    const wsFile = await capture(cdp, 'worksheets');
    const wsImg = decodePng(fs.readFileSync(wsFile));
    const wss = colorStats(wsImg);
    console.log('  worksheets shot ' + wsImg.width + 'x' + wsImg.height + ' — distinct ' + wss.distinct + ', paper ' + Math.round(100 * wss.paper / (wsImg.width * wsImg.height)) + '%');
    check(wss.distinct > 30, 'worksheets: the sheet pack paints with real content');
    // restore the key toggle so the challenge flow below runs as before
    await evalJs(cdp, "(() => { const cb = document.getElementById('ws-key-on'); if (cb && cb.checked) cb.click(); return true; })()");
    await sleep(300);
    await evalJs(cdp, "(() => { const b = document.getElementById('btn-ws-challenge'); if (b) { b.click(); return true; } return false; })()");
    await waitForJs(cdp, "!!document.querySelector('[data-chal-learner]')", 6000);
    // ---- Screen 6: TIMED CHALLENGE — one intro dialog per learner (AC-001) ----
    // The regression this section exists for: a rapid double-tap on a
    // learner card used to stack two intro dialogs and leave one behind
    // whose button could restart the race. It must now yield exactly ONE
    // visible dialog, and starting the race must leave ZERO behind.
    // the double-tap that used to stack two dialogs
    await evalJs(cdp, "(() => { const l = document.querySelector('[data-chal-learner]'); if (l) { l.click(); l.click(); return true; } return false; })()");
    await sleep(700);
    const introState = await evalJs(cdp, "(() => { const intros = Array.from(document.querySelectorAll('.chal-intro-overlay')); const shown = intros.filter(o => o.classList.contains('overlay--show')); return { count: intros.length, shown: shown.length, display: intros.length ? getComputedStyle(intros[0]).display : 'none' }; })()");
    console.log('  challenge: ' + JSON.stringify(introState));
    check(introState.count === 1 && introState.shown === 1 && introState.display === 'flex', 'challenge: double-tap shows exactly ONE visible intro dialog');
    await evalJs(cdp, "(() => { const g = Array.from(document.querySelectorAll('.chal-intro-overlay')).find(o => o.classList.contains('overlay--show')); if (g) g.querySelector('.chal-intro-go').click(); return true; })()");
    await waitForJs(cdp, "!!document.getElementById('chal-clock')", 6000);
    await sleep(300);
    const afterGo = await evalJs(cdp, "(() => ({ clock: !!document.getElementById('chal-clock'), input: !!document.getElementById('chal-input'), overlaysLeft: document.querySelectorAll('.chal-intro-overlay').length }))()");
    check(afterGo.clock && afterGo.input && afterGo.overlaysLeft === 0, 'challenge: race starts with ZERO intro dialogs left behind');

    // ---- Screen 7: IPAD FIT — the page must never scroll; content scrolls ----
    // Regression this exists for: screens used min-height:100dvh, so tall
    // screens grew past the viewport and the WHOLE PAGE scrolled (How It
    // Works was 1505px tall — ~685px of page scrolling on an iPad in
    // landscape). Every screen must now be exactly one viewport tall
    // (pageExcess 0) at both iPad portrait and landscape, with overflow
    // contained inside the screen's own scrollable body.
    async function measureFit(cdp, label) {
      const expr = "(() => { const act = document.querySelector('.screen--active'); if (!act) return { label: '" + label + "', err: 'no active screen' }; const page = document.scrollingElement || document.documentElement; let innerExcess = 0, innerSel = null; for (const el of act.querySelectorAll('*')) { const cs = getComputedStyle(el); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) { const ex = el.scrollHeight - el.clientHeight; if (ex > innerExcess) { innerExcess = ex; innerSel = el.id || el.className || el.tagName; } } } return { label: '" + label + "', activeId: act.id, pageExcess: page.scrollHeight - page.clientHeight, innerExcess: innerExcess, innerSel: innerSel ? String(innerSel).slice(0, 30) : null }; })()";
      return evalJs(cdp, expr);
    }
    async function goHomeForFit(cdp) {
      await evalJs(cdp, "(() => { const b = document.querySelector('#btn-home') || document.querySelector('[data-back]'); if (b) { b.click(); return true; } return false; })()");
      await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 8000);
      await sleep(250);
    }
    // Teacher-mode leg shared by the worksheets measurement: 5 brand taps + PIN.
    async function openTeacherForFit(cdp) {
      await evalJs(cdp, "(() => { const b = document.querySelector('.brand-title'); if (b) { for (let i = 0; i < 5; i++) b.click(); return true; } return false; })()");
      await sleep(350);
      await evalJs(cdp, "(() => { const keys = Array.from(document.querySelectorAll('button')); let t = 0; for (const ch of '5241') { const k = keys.find(x => x.textContent.trim() === ch); if (k) { k.click(); t++; } } return t; })()");
      await sleep(350);
      await evalJs(cdp, "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Unlock|Enter|Go|OK/i.test(x.textContent.trim())); if (b && !/PLAY|Play/i.test(b.textContent)) { b.click(); return true; } return false; })()");
      await sleep(600);
    }
    const IPAD_VIEWPORTS = [
      { w: 810, h: 1080, label: 'iPad 9th portrait' },
      { w: 1180, h: 820, label: 'iPad 10th landscape' }
    ];
    for (const vp of IPAD_VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      await sleep(500);
      console.log('  ipad-fit @ ' + vp.label + ' ' + vp.w + 'x' + vp.h);

      // home
      await goHomeForFit(cdp);
      let fit = await measureFit(cdp, 'home');
      check(fit.pageExcess === 0, 'ipad-fit: home never scrolls the page (' + vp.label + ')');
      // how it works
      await goHomeForFit(cdp);
      await evalJs(cdp, "document.getElementById('btn-how').click(); true");
      await waitForJs(cdp, "document.getElementById('screen-how').classList.contains('screen--active')", 6000);
      await sleep(300);
      fit = await measureFit(cdp, 'how');
      check(fit.pageExcess === 0, 'ipad-fit: How It Works never scrolls the page (' + vp.label + ')');
      // my progress
      await goHomeForFit(cdp);
      await evalJs(cdp, "document.getElementById('btn-progress').click(); true");
      await waitForJs(cdp, "document.getElementById('screen-progress').classList.contains('screen--active')", 6000);
      await sleep(300);
      fit = await measureFit(cdp, 'progress');
      check(fit.pageExcess === 0, 'ipad-fit: My Progress never scrolls the page (' + vp.label + ')');
      // practice
      await goHomeForFit(cdp);
      await evalJs(cdp, "document.getElementById('btn-practice').click(); true");
      await waitForJs(cdp, "document.getElementById('screen-practice').classList.contains('screen--active')", 6000);
      await sleep(300);
      fit = await measureFit(cdp, 'practice');
      check(fit.pageExcess === 0, 'ipad-fit: Practice never scrolls the page (' + vp.label + ')');
      // game (question one)
      await goHomeForFit(cdp);
      await evalJs(cdp, "document.getElementById('btn-play').click(); true");
      await waitForJs(cdp, "document.getElementById('screen-game').classList.contains('screen--active') && !!document.querySelector('[data-role=\"ladder\"]')", 8000);
      await sleep(300);
      fit = await measureFit(cdp, 'game');
      check(fit.pageExcess === 0, 'ipad-fit: the game never scrolls the page (' + vp.label + ')');
      // scales lab
      await goHomeForFit(cdp);
      await evalJs(cdp, "document.getElementById('btn-scales').click(); true");
      await waitForJs(cdp, "document.getElementById('screen-scales').classList.contains('screen--active')", 6000);
      await sleep(300);
      fit = await measureFit(cdp, 'scales');
      check(fit.pageExcess === 0, 'ipad-fit: Read the Scales never scrolls the page (' + vp.label + ')');
      // worksheets (through teacher mode)
      await goHomeForFit(cdp);
      await openTeacherForFit(cdp);
      await evalJs(cdp, "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Worksheet/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()");
      await waitForJs(cdp, "document.getElementById('screen-worksheets').classList.contains('screen--active') && !!document.querySelector('.ws-sheet')", 8000);
      await sleep(300);
      fit = await measureFit(cdp, 'worksheets');
      check(fit.pageExcess === 0, 'ipad-fit: worksheets never scroll the page (' + vp.label + ')');
    }
    // restore the default viewport for the clock session below
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(400);

    // ------------------------------------------------------------------
    // CLOCK APP (Tick⚡Tock) — second browser session over a tiny static
    // server (the preview server only serves the main app). Same real-
    // pixel rules: vivid red minute hand must PAINT and never collapse to
    // a zero-area sliver at cardinal angles, dark hour hand must paint,
    // and a question must be answerable end-to-end with Next pacing.
    // ------------------------------------------------------------------
    const clockDir = path.join(__dirname, '..', '..', 'clock-go');
    const srv = await serveDir(clockDir);
    const port2 = await getFreePort();
    const profile2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jogo-vc-clock-'));
    const child2 = spawn(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--window-size=768,1024',
      '--remote-debugging-port=' + port2, '--user-data-dir=' + profile2,
      'about:blank'
    ], { stdio: 'ignore' });
    let cdp2 = null;
    try {
      const clockUrl = 'http://127.0.0.1:' + srv.port + '/index.html';
      console.log('clock:  ' + clockUrl);
      await waitFor('http://127.0.0.1:' + port2 + '/json/version', 15000);
      const tabRes2 = await fetch('http://127.0.0.1:' + port2 + '/json/new?' + encodeURIComponent(clockUrl), { method: 'PUT' });
      const tab2 = await tabRes2.json();
      cdp2 = await cdpConnect(tab2.webSocketDebuggerUrl);
      await cdp2.send('Page.enable');
      await cdp2.send('Runtime.enable');
      await sleep(900);

      // ---- Clock home: brand, level pills, preview clock, blue theme ----
      // A fresh device opens the learner sheet first — add one learner so
      // the child can actually play (never silently default).
      await waitForJs(cdp2, "document.readyState === 'complete' && !!document.getElementById('home-clock')", 10000);
      const added = await evalJs(cdp2, "(() => { const i = document.getElementById('learner-name-input'); if (!i) return false; i.value = 'Tess'; document.getElementById('learner-form').dispatchEvent(new Event('submit', { cancelable: true })); return true; })()");
      if (!added) throw new Error('clock: could not open the learner form');
      await waitForJs(cdp2, "!document.getElementById('learners-backdrop').classList.contains('overlay--show') && document.getElementById('learner-chip-name').textContent === 'Tess'", 6000);
      const clockHome = await evalJs(cdp2, "(() => ({ brand: document.getElementById('home-title').textContent, pills: document.querySelectorAll('#level-pills button').length, clock: !!document.querySelector('#home-clock svg') }))()");
      check(clockHome.brand.indexOf('Tick') > -1 && clockHome.clock, 'clock: home renders the brand and the preview clock');
      check(clockHome.pills === 3, 'clock: all three levels are offered');
      const chFile = await capture(cdp2, 'clock-home');
      const chImg = decodePng(fs.readFileSync(chFile));
      const chs = colorStats(chImg);
      console.log('  clock home shot ' + chImg.width + 'x' + chImg.height + ' — distinct ' + chs.distinct + ', blue ' + chs.blue);
      check(chs.distinct > 30, 'clock: home paints with real content (not blank)');
      check(chs.blue > 100, 'clock: the vivid blue theme paints (' + chs.blue + ' px)');

      // ---- Clock How It Works: the teaching clock paints its RED hand ----
      await evalJs(cdp2, "document.getElementById('btn-how').click(); true");
      await waitForJs(cdp2, "document.getElementById('screen-how').classList.contains('screen--active') && !!document.querySelector('#how-clock svg')", 6000);
      await sleep(400);
      const how2File = await capture(cdp2, 'clock-how');
      const how2Img = decodePng(fs.readFileSync(how2File));
      const how2s = colorStats(how2Img);
      console.log('  clock how shot — red ' + how2s.red + ', dark ' + how2s.dark);
      check(how2s.red > 50, 'clock how: the teaching clock paints its RED minute hand (' + how2s.red + ' px)');
      check(how2s.dark > 200, 'clock how: the dark hour hand and ticks paint (' + how2s.dark + ' px)');
      await evalJs(cdp2, "(() => { const b = Array.from(document.querySelectorAll('#screen-how button')).find(x => x.getAttribute('data-back')); if (b) { b.click(); return true; } return false; })()");
      await waitForJs(cdp2, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 6000);

      // ---- Clock game: first-play intro, hands paint, question answered ----
      await evalJs(cdp2, "document.getElementById('btn-play').click(); true");
      await waitForJs(cdp2, "!!document.getElementById('intro-backdrop') && document.getElementById('intro-backdrop').classList.contains('overlay--show')", 6000);
      check(true, 'clock: first play shows the teaching intro overlay');
      await evalJs(cdp2, "document.getElementById('intro-go').click(); true");
      await waitForJs(cdp2, "!!document.getElementById('screen-game') && document.getElementById('screen-game').classList.contains('screen--active') && !!document.querySelector('#clock-stage svg')", 6000);
      await sleep(400);
      const gFile = await capture(cdp2, 'clock-game');
      const gImg = decodePng(fs.readFileSync(gFile));
      const gs = colorStats(gImg);
      console.log('  clock game shot — red ' + gs.red + ', dark ' + gs.dark + ', redBox ' + gs.redWidth + 'x' + gs.redHeight);
      // THE regression this exists for: hands must paint (vivid red minute
      // hand) and NEVER degenerate to a zero-area sliver at cardinal angles.
      check(gs.red > 50, 'clock game: the RED minute hand paints (' + gs.red + ' px)');
      check(gs.dark > 200, 'clock game: the dark hour hand and dial paint (' + gs.dark + ' px)');
      check(gs.redWidth > 5 && gs.redHeight > 5, 'clock game: minute hand is not a zero-area degenerate line (' + gs.redWidth + 'x' + gs.redHeight + ')');

      // Read the hands off the SVG (minute = angle/6, hour from the hour-
      // hand angle minus the minute fraction) and type it on the keypad.
      const ans = await evalJs(cdp2, "(() => { const svg = document.querySelector('#clock-stage svg'); if (!svg) return null; const lines = Array.from(svg.querySelectorAll('line')); const ml = lines.find(l => l.getAttribute('stroke') === '#E64545'); const hl = lines.find(l => l.getAttribute('stroke') === '#1A1A1F'); if (!ml || !hl) return null; const ang = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y1 - y2; let d = Math.atan2(dx, dy) * 180 / Math.PI; if (d < 0) d += 360; return d; }; const ma = ang(+ml.getAttribute('x1'), +ml.getAttribute('y1'), +ml.getAttribute('x2'), +ml.getAttribute('y2')); const ha = ang(+hl.getAttribute('x1'), +hl.getAttribute('y1'), +hl.getAttribute('x2'), +hl.getAttribute('y2')); const m = Math.round(ma / 6) % 60; let h = Math.round(ha / 30 - m / 60) % 12; if (h === 0) h = 12; return { h: h, m: m }; })()");
      check(ans && ans.h >= 1 && ans.h <= 12 && ans.m >= 0 && ans.m <= 59, 'clock game: hand angles parse to a valid time');
      const typed = await evalJs(cdp2, "(() => { const a = " + JSON.stringify(ans) + "; const keys = Array.from(document.querySelectorAll('#keypad [data-key]')); const press = k => { const b = keys.find(x => x.getAttribute('data-key') === String(k)); if (b) b.click(); }; const hh = String(a.h); const mm = String(a.m).padStart(2, '0'); (hh + ':' + mm).split('').forEach(press); press('check'); return hh + ':' + mm; })()");
      console.log('  clock: typed ' + typed);
      try {
        await waitForJs(cdp2, "!!document.querySelector('#keypad [data-key=\"next\"]')", 8000);
      } catch (e) {
        const diag = await evalJs(cdp2, "(() => ({ fb: (document.getElementById('feedback') || {}).textContent || null, ok: (document.getElementById('feedback') || {}).classList.contains('feedback--ok'), display: (document.getElementById('key-display') || {}).textContent, stage: !!document.querySelector('#clock-stage svg') }))()");
        const shot = await capture(cdp2, 'clock-fail');
        throw new Error('clock: next button never appeared after typing ' + typed + '; diag: ' + JSON.stringify(diag) + '; shot: ' + shot);
      }
      const fb = await evalJs(cdp2, "(() => { const f = document.getElementById('feedback'); return f ? { ok: f.classList.contains('feedback--ok'), text: f.textContent } : null; })()");
      check(fb && fb.ok && fb.text.indexOf('Yes!') === 0 && fb.text.indexOf(typed) > -1, 'clock: typed time judged correct, echoed in the feedback');
      check(true, 'clock: correct answer shows a Next button (no auto-advance)');
      // advance and confirm question 2 paints its hands too (every random
      // time, including cardinal angles, must render non-degenerate)
      await evalJs(cdp2, "document.querySelector('#keypad [data-key=\"next\"]').click(); true");
      await waitForJs(cdp2, "!!document.querySelector('#keypad [data-key=\"check\"]') && !!document.querySelector('#clock-stage svg')", 6000);
      await sleep(400);
      const g2File = await capture(cdp2, 'clock-game-2');
      const g2Img = decodePng(fs.readFileSync(g2File));
      const g2s = colorStats(g2Img);
      console.log('  clock game 2 shot — red ' + g2s.red + ', dark ' + g2s.dark + ', redBox ' + g2s.redWidth + 'x' + g2s.redHeight);
      check(g2s.red > 50 && g2s.redWidth > 5 && g2s.redHeight > 5, 'clock game: question 2 repaints a non-degenerate RED hand (' + g2s.red + ' px, ' + g2s.redWidth + 'x' + g2s.redHeight + ')');
      check(g2s.dark > 200, 'clock game: question 2 paints the dark hour hand (' + g2s.dark + ' px)');

      cdp2.close();
      child2.kill();
    } finally {
      try { srv.close(); } catch (e2) { /* ignore */ }
      await sleep(400); // let Edge release the profile dir before deleting it
      try { fs.rmSync(profile2, { recursive: true, force: true }); } catch (e2) { /* Windows can hold it briefly — not a test failure */ }
    }

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
