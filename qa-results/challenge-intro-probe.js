// APP_CHECKER evidence probe — does the timed-challenge intro overlay
// become visible in a REAL headless browser (Edge/Chrome via CDP)?
// The interactive preview's webview never fires requestAnimationFrame, so
// the overlay's overlay--show class (added via rAF) never lands there.
// This probe answers: what happens in a real browser?
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const URL = process.argv[2] || 'http://localhost:4174/index.html';
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
const browser = BROWSERS.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!browser) { console.log('no browser found'); process.exit(2); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pend = new Map(); let id = 1;
    const api = {
      send(m, p) {
        return new Promise((res, rej) => {
          const i = id++; pend.set(i, { res, rej });
          ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
        });
      },
      close() { try { ws.close(); } catch (e) { /* ignore */ } }
    };
    ws.addEventListener('open', () => resolve(api));
    ws.addEventListener('message', ev => {
      const m = JSON.parse(String(ev.data));
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id); pend.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      }
    });
    ws.addEventListener('error', () => reject(new Error('socket error')));
  });
}
function getFreePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}
async function evalJs(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result && r.result.value;
}
async function waitJs(cdp, expr, ms, label) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await evalJs(cdp, expr)) { console.log('  wait ok: ' + label); return true; }
    await sleep(150);
  }
  throw new Error('wait timeout: ' + label);
}

(async () => {
  const port = await getFreePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jogo-probe-'));
  console.log('browser: ' + path.basename(browser));
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=768,1024',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  try {
    let up = false;
    for (let i = 0; i < 40; i++) {
      try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) { up = true; break; } } catch (e) { /* retry */ }
      await sleep(250);
    }
    if (!up) throw new Error('cdp not up');
    console.log('cdp up on ' + port);
    const tab = await (await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' })).json();
    const cdp = await cdpConnect(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

    await waitJs(cdp, "document.readyState==='complete' && !!document.querySelector('#learners-body')", 10000, 'boot+learners');
    await evalJs(cdp, "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Play as');if(b){b.click();return true;}return false;})()");
    await waitJs(cdp, "!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')", 8000, 'home');

    // unlock teacher mode via T key, enter PIN 5241
    await evalJs(cdp, "window.dispatchEvent(new KeyboardEvent('keydown',{key:'t'})); true");
    await sleep(300);
    await evalJs(cdp, "(()=>{const ov=document.querySelector('.overlay--show');if(!ov)return false;const press=t=>Array.from(ov.querySelectorAll('button')).find(b=>b.textContent.trim()===t).click();['5','2','4','1'].forEach(press);return true;})()");
    await waitJs(cdp, "(()=>{const p=document.getElementById('teacher-panel');return !!p && getComputedStyle(p.closest('.overlay')).display!=='none';})()", 5000, 'teacher panel');

    // worksheet pack -> Read the Scales tab -> class set -> timed challenge
    await evalJs(cdp, "(()=>{const p=document.getElementById('teacher-panel');Array.from(p.querySelectorAll('button')).find(x=>x.textContent.includes('Worksheet pack')).click();return true;})()");
    await waitJs(cdp, "(document.querySelector('.screen--active')||{}).id==='screen-worksheets'", 5000, 'worksheets');
    await evalJs(cdp, "(()=>{const tab=Array.from(document.querySelectorAll('.ws-mode-tab')).find(x=>x.textContent.includes('Read the Scales'));if(tab){tab.click();return true;}return false;})()");
    await sleep(300);
    await evalJs(cdp, "document.getElementById('ws-class-on').click(); true");
    await sleep(300);
    const chalBtn = await evalJs(cdp, "(()=>{const b=document.getElementById('btn-ws-challenge');if(b){b.click();return 'clicked';}return 'no-btn';})()");
    console.log('  challenge button: ' + chalBtn);
    await waitJs(cdp, "!!document.querySelector('[data-chal-learner]')", 5000, 'challenge pick');

    // tap the first learner card — this is where the intro should appear
    await evalJs(cdp, "(()=>{const l=document.querySelector('[data-chal-learner]');if(l){l.click();l.click();return true;}return false;})()");
    await sleep(800);
    const state = await evalJs(cdp, "(()=>{const intros=Array.from(document.querySelectorAll('.chal-intro-overlay'));const shown=intros.filter(o=>o.classList.contains('overlay--show'));return {overlays:intros.length,shown:shown.length,playActive:!!document.getElementById('chal-clock'),display:intros[0]?getComputedStyle(intros[0]).display:null};})()");
    console.log('REAL BROWSER RESULT: ' + JSON.stringify(state));

    if (state.shown > 0) {
      await evalJs(cdp, "(()=>{const g=Array.from(document.querySelectorAll('.chal-intro-overlay')).find(o=>o.classList.contains('overlay--show'));if(g)g.querySelector('.chal-intro-go').click();return true;})()");
      await sleep(600);
      const after = await evalJs(cdp, "(()=>({clock:!!document.getElementById('chal-clock'),input:!!document.getElementById('chal-input'),overlaysLeft:document.querySelectorAll('.chal-intro-overlay').length}))()");
      console.log('AFTER GO: ' + JSON.stringify(after));
    }
    // double-tap policy: click the learner card twice rapidly and count overlays
    await evalJs(cdp, "(()=>{const l=document.querySelector('[data-chal-learner]');if(l){l.click();l.click();}return true;})()");
    await sleep(700);
    const dbl = await evalJs(cdp, "document.querySelectorAll('.chal-intro-overlay').length");
    console.log('DOUBLE-TAP OVERLAY COUNT: ' + dbl);

    cdp.close(); child.kill();
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Windows may hold it briefly */ }
  } catch (e) {
    console.log('PROBE ERROR: ' + e.message);
    try { child.kill(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
})();
