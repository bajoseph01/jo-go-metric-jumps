// scales-chal-probe.js — drive the full Scales Challenge flow end-to-end in
// a real browser: start, answer all 10 by reading each aria-label, confirm
// the done card + summary, then "Another challenge".
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const URL = 'http://localhost:4174/index.html';
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
function findBrowser() { for (const p of CANDIDATES) { try { if (fs.statSync(p).isFile()) return p; } catch (e) {} } return null; }
const sleepT = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = findBrowser();
  const port = 9600 + Math.floor(Math.random() * 200);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chal-probe-'));
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:' + port + '/json/version')).ok) break; } catch (e) {} await sleepT(200); }
    const tabRes = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
    const tab = await tabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pending = {};
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
    const send = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    for (let i = 0; i < 50; i++) {
      if (await evalJs(`document.readyState === 'complete' && !!document.querySelector('#learners-body') && !!window.JOGO`)) break;
      await sleepT(200);
    }
    await evalJs(`(() => { const inp = document.getElementById('learner-name-input'); const form = document.getElementById('learner-add'); if (inp && form) { inp.value = 'Chal Kid'; inp.dispatchEvent(new Event('input', { bubbles: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } const b = Array.from(document.querySelectorAll('button')).find(x => /Play as/i.test(x.textContent)); if (b) b.click(); return true; })()`);
    await sleepT(600);
    await evalJs(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Read the Scales/i.test(x.textContent)); if (b) b.click(); return true; })()`);
    await sleepT(500);
    await evalJs(`(() => { const b = document.querySelector('.scales-tab--challenge'); if (b) { b.click(); return true; } return false; })()`);
    await sleepT(500);
    const first = await evalJs(`(() => { const b = document.querySelector('.scales-chal'); const svg = document.querySelector('.scale-svg'); const m = svg ? svg.getAttribute('aria-label').match(/at (\\d+) (\\w+)/) : null; return { banner: b ? b.textContent : null, answer: m ? m[1] : null }; })()`);
    console.log('first:', JSON.stringify(first));
    // answer all 10 by parsing each fresh aria-label
    let answered = 0, mix = {};
    while (answered < 10) {
      const res = await evalJs(`(() => { const svg = document.querySelector('.scale-svg'); if (!svg) return null; const m = svg.getAttribute('aria-label').match(/at (\\d+) (\\w+)/); if (!m) return 'no-answer'; const ins = svg.classList.contains('scale-svg--dial') ? 'kitchen' : svg.classList.contains('scale-svg--jug') ? 'jug' : 'ruler'; const input = document.getElementById('scales-input'); const form = document.getElementById('scales-form'); input.value = m[1]; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return { ins: ins, ans: m[1] }; })()`);
      if (!res) { console.log('stalled at', answered); break; }
      mix[res.ins] = (mix[res.ins] || 0) + 1;
      // wait for the next question or the done card (1s feedback + render)
      await sleepT(1400);
      const done = await evalJs(`!!document.querySelector('.done-card')`);
      if (done) { answered++; break; }
      answered++;
    }
    const end = await evalJs(`(() => { const card = document.querySelector('.done-card'); const title = card ? card.querySelector('.done-title').textContent : null; const chips = Array.from(document.querySelectorAll('.chal-ins')).map(x => x.textContent); const nudge = document.querySelector('.scales-chal-nudge'); const again = document.getElementById('btn-scales-again'); return { title: title, chips: chips, nudge: nudge ? nudge.textContent : null, again: !!again }; })()`);
    console.log('mix:', JSON.stringify(mix), 'end:', JSON.stringify(end));
    ws.close();
  } finally { child.kill(); }
}
main().catch(e => { console.error(e); process.exit(1); });
