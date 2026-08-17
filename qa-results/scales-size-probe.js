// scales-size-probe.js — measure the RENDERED size of the ruler, kitchen
// dial and measuring jug on the Scales Lab at iPad portrait + landscape,
// plus the question card geometry, so sizing decisions are data-driven.
// Usage: node qa-results/scales-size-probe.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const URL = 'http://localhost:4174/index.html';
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];
function findBrowser() { for (const p of CANDIDATES) { try { if (fs.statSync(p).isFile()) return p; } catch (e) {} } return null; }

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

async function main() {
  const browser = findBrowser();
  if (!browser) { console.log('no browser'); process.exit(1); }
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scales-probe-'));
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  const sleepT = (ms) => new Promise(r => setTimeout(r, ms));
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
    const capture = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(__dirname, 'evidence'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'evidence', 'scales-' + name + '.png'), Buffer.from(r.result.data, 'base64')); };    await send('Page.enable'); await send('Runtime.enable');
    // wait for the app to boot (scripts run, learner screen renders)
    for (let i = 0; i < 50; i++) {
      const ok = await evalJs(`document.readyState === 'complete' && !!document.querySelector('#learners-body') && !!window.JOGO`);
      if (ok) break;
      await sleepT(200);
    }
    console.log('boot state:', await evalJs(`(() => ({ ready: document.readyState, learnersBody: !!document.querySelector('#learners-body'), jogo: !!window.JOGO, errs: (window.__errs || []).length }))()`));
    // fresh profile: no learners yet — add one, then play as it
    const boot1 = await evalJs(`(() => { const inp = document.getElementById('learner-name-input'); const form = document.getElementById('learner-add'); if (inp && form) { inp.value = 'Probe Kid'; inp.dispatchEvent(new Event('input', { bubbles: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return 'added'; } const b = Array.from(document.querySelectorAll('button')).find(x => /Play as/i.test(x.textContent)); if (b) { b.click(); return 'picked'; } return 'no-add:' + (document.querySelector('.screen--active') || {}).id; })()`);
    await sleepT(600);
    console.log('boot add:', boot1, '| learners:', await evalJs(`(() => JSON.stringify((window.JOGO && JOGO.Store ? JOGO.Store.learners() : null)))()`));
    const boot2 = await evalJs(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Play as/i.test(x.textContent)); if (b) { b.click(); return 'picked'; } return 'no-play:' + (document.querySelector('.screen--active') || {}).id + ' btns:' + Array.from(document.querySelectorAll('button')).map(x=>x.textContent.trim()).slice(0,8).join('|'); })()`);
    await sleepT(500);
    console.log('boot play:', boot2, '| active:', await evalJs(`(() => (document.querySelector('.screen--active') || {}).id)()`));
    // dismiss the one-time teaching overlay if it appears on the first game
    await evalJs(`(() => { const go = document.getElementById('intro-go'); if (go) go.click(); return true; })()`);
    await sleepT(300);
    await evalJs(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Read the Scales/i.test(x.textContent)); if (b) { b.click(); return 'opened'; } return 'no-open:' + (document.querySelector('.screen--active') || {}).id; })()`);
    await sleepT(700);

    for (const vp of [{ w: 810, h: 1080, label: 'portrait' }, { w: 1180, h: 820, label: 'landscape' }]) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      await sleepT(500);
      await evalJs(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Read the Scales/i.test(x.textContent)); if (b) b.click(); return true; })()`);
      await sleepT(600);
      for (const ins of ['ruler', 'kitchen', 'jug']) {
        await evalJs(`(() => { const b = document.querySelector('.scales-tab[data-scale="${ins}"]'); if (b) b.click(); return true; })()`);
        await sleepT(500);
        const m = await evalJs(`(() => { const svg = document.querySelector('.scale-svg'); const stage = document.querySelector('.scales-stage'); const body = document.querySelector('.page-body'); if (!svg) return { err: 'no svg', active: (document.querySelector('.screen--active') || {}).id, text: document.body.textContent.replace(/\\s+/g,' ').slice(0,120) }; const s = svg.getBoundingClientRect(); const st = stage.getBoundingClientRect(); const bd = body.getBoundingClientRect(); const form = document.querySelector('.scales-answer'); const fr = form ? form.getBoundingClientRect() : null; const bodyScroll = body.scrollHeight - body.clientHeight; return { w: Math.round(s.width), h: Math.round(s.height), stageW: Math.round(st.width), stageH: Math.round(st.height), bodyH: Math.round(bd.height), bodyScroll: Math.round(bodyScroll), formBottom: fr ? Math.round(fr.bottom) : null, vw: window.innerWidth, vh: window.innerHeight }; })()`);
        console.log(vp.label + ' ' + ins + ': ' + JSON.stringify(m));
        if (ins === 'ruler') await capture(vp.label + '-ruler');
        if (ins === 'kitchen') await capture(vp.label + '-dial');
        if (ins === 'jug') await capture(vp.label + '-jug');
      }
    }
    ws.close();
  } finally {
    child.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
