'use strict';
// iPad-fit probe — reuses the proven zero-dep CDP client from tests/visual-check.js.
// Boots headless Edge, loads the app, and for each viewport size measures how much
// vertical scrolling every screen needs (excess = content height - visible height).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const URL = process.argv[2] || 'http://localhost:4174/index.html';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
function findBrowser() {
  for (const p of CANDIDATES) { try { if (fs.statSync(p).isFile()) return p; } catch (e) {} }
  return null;
}
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
      close() { try { ws.close(); } catch (e) {} }
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
    try { const r = await fetch(url); if (r.ok) return; } catch (e) {}
    await sleep(300);
  }
  throw new Error('timed out waiting for ' + url);
}
async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
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

// Navigate to each screen via its home button, then measure.
const SCREENS = [
  { name: 'home',        goto: `Array.from(document.querySelectorAll('#home-ladders .ladder-col button')).length > 0` },
  { name: 'how-it-works',goto: `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /How It Works/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()` },
  { name: 'play',        goto: `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'PLAY' || x.textContent.trim() === 'Play'); if (b) { b.click(); return true; } return false; })()` },
  { name: 'scales',      goto: `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Read the Scales/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()` },
];

async function measureScreen(cdp, name) {
  // Find the scrollable content area of the active screen.
  const m = await evalJs(cdp, `(() => {
    const act = document.querySelector('.screen--active');
    if (!act) return { name: '${name}', err: 'no active screen' };
    const scrollables = Array.from(act.querySelectorAll('*')).filter(el => {
      const cs = getComputedStyle(el);
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    });
    const vis = act.clientHeight;
    const page = document.scrollingElement || document.documentElement;
    let biggest = 0, biggestSel = null;
    for (const el of scrollables) {
      const excess = el.scrollHeight - el.clientHeight;
      if (excess > biggest) { biggest = excess; biggestSel = el.className || el.id || el.tagName; }
    }
    return {
      name: '${name}',
      innerW: window.innerWidth, innerH: window.innerHeight,
      pageScrollH: page.scrollHeight, pageClientH: page.clientHeight,
      nScrollables: scrollables.length,
      biggestExcess: biggest,
      biggestSel: biggestSel ? String(biggestSel).slice(0, 60) : null,
      vis: vis,
      headerH: (document.querySelector('.top-bar') || document.querySelector('.app-header') || {}).offsetHeight || 0
    };
  })()`);
  console.log(JSON.stringify(m));
  return m;
}

async function run() {
  const browser = findBrowser();
  if (!browser) { console.log('no browser'); process.exit(1); }
  const port = await getFreePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jogo-fit-'));
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=834,1112',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitFor('http://127.0.0.1:' + port + '/json/version', 15000);
    const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
    const tab = await tabRes.json();
    const cdp = await cdpConnect(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await sleep(1000);

    // First launch: pick/add Learner 1
    await waitForJs(cdp, "document.readyState === 'complete' && !!document.querySelector('#learners-body')", 12000);
    await evalJs(cdp, `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Play as'); if (b) { b.click(); return true; } return false; })()`);
    await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 10000);
    await sleep(400);

    // Teaching overlay may appear on first play; dismiss it if present.
    const VIEWPORTS = [
      { w: 768,  h: 1024, label: 'iPad 9.7" portrait' },
      { w: 834,  h: 1112, label: 'iPad 10.5" portrait' },
      { w: 1024, h: 768,  label: 'iPad 9.7" landscape' },
      { w: 700,  h: 1024, label: 'compact cutoff (700w)' }
    ];

    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
      await sleep(600);
      console.log('=== viewport ' + vp.w + 'x' + vp.h + ' (' + vp.label + ') ===');
      for (const s of SCREENS) {
        // go home first (skip for home itself)
        if (s.name !== 'home') {
          await evalJs(cdp, `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Home|Done|Back/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()`);
          await waitForJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 8000);
          await sleep(200);
        }
        const ok = await evalJs(cdp, s.goto);
        await sleep(600);
        await measureScreen(cdp, s.name);
      }
    }
  } finally {
    try { child.kill(); } catch (e) {}
  }
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
