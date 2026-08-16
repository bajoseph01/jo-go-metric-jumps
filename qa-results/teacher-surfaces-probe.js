// APP_CHECKER evidence probe — iPad-width screenshots of teacher surfaces.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const URL = process.argv[2] || 'http://localhost:4174/index.html';
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const browser = BROWSERS.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function cdpConnect(wsUrl){return new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl);const pend=new Map();let id=1;const api={send(m,p){return new Promise((res,rej)=>{const i=id++;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p||{}}));});},close(){try{ws.close();}catch(e){}}};ws.addEventListener('open',()=>resolve(api));ws.addEventListener('message',ev=>{const m=JSON.parse(String(ev.data));if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});ws.addEventListener('error',()=>reject(new Error('socket error')));});}
function getFreePort(){return new Promise((res,rej)=>{const s=net.createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>res(p));});s.on('error',rej);});}
async function evalJs(cdp,expr){const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('eval failed: '+JSON.stringify(r.exceptionDetails).slice(0,200));return r.result&&r.result.value;}
async function waitJs(cdp,expr,ms,label){const t=Date.now();while(Date.now()-t<ms){if(await evalJs(cdp,expr))return true;await sleep(150);}throw new Error('wait timeout: '+label);}
async function capture(cdp,name,dir){const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(dir,{recursive:true});const f=path.join(dir,name+'.png');fs.writeFileSync(f,Buffer.from(r.data,'base64'));console.log('  shot: '+f);}
(async()=>{
  const port=await getFreePort();
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jogo-ts-'));
  const shots=path.join(__dirname,'evidence');
  const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','--window-size=768,1024','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  try{
    let up=false;for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/json/version');if(r.ok){up=true;break;}}catch(e){}await sleep(250);}
    if(!up)throw new Error('cdp not up');
    const tab=await (await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(URL),{method:'PUT'})).json();
    const cdp=await cdpConnect(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await waitJs(cdp,"document.readyState==='complete' && !!document.querySelector('#learners-body')",10000,'boot');
    await evalJs(cdp,"(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Play as');if(b)b.click();return true;})()");
    await waitJs(cdp,"!!document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('screen--active')",8000,'home');
    await evalJs(cdp,"window.dispatchEvent(new KeyboardEvent('keydown',{key:'t'})); true");
    await sleep(300);
    await evalJs(cdp,"(()=>{const ov=document.querySelector('.overlay--show');if(!ov)return false;const press=t=>Array.from(ov.querySelectorAll('button')).find(b=>b.textContent.trim()===t).click();['5','2','4','1'].forEach(press);return true;})()");
    await waitJs(cdp,"(()=>{const p=document.getElementById('teacher-panel');return !!p && getComputedStyle(p.closest('.overlay')).display!=='none';})()",5000,'teacher panel');
    await capture(cdp,'ipad-teacher-panel',shots);
    await evalJs(cdp,"(()=>{const p=document.getElementById('teacher-panel');Array.from(p.querySelectorAll('button')).find(x=>x.textContent.includes('Worksheet pack')).click();return true;})()");
    await waitJs(cdp,"(document.querySelector('.screen--active')||{}).id==='screen-worksheets'",5000,'worksheets');
    await evalJs(cdp,"(()=>{const tab=Array.from(document.querySelectorAll('.ws-mode-tab')).find(x=>x.textContent.includes('Read the Scales'));if(tab)tab.click();return true;})()");
    await sleep(400);
    await capture(cdp,'ipad-scale-sheets',shots);
    await evalJs(cdp,"document.getElementById('ws-class-on').click(); true");
    await sleep(300);
    await evalJs(cdp,"(()=>{const b=document.getElementById('btn-ws-challenge');if(b)b.click();return true;})()");
    await waitJs(cdp,"!!document.querySelector('[data-chal-learner]')",5000,'chal pick');
    await capture(cdp,'ipad-challenge-pick',shots);
    console.log('TEACHER SURFACES DONE');
    cdp.close(); child.kill();
    await sleep(400);
    try{fs.rmSync(profile,{recursive:true,force:true});}catch(e){}
  }catch(e){console.log('PROBE ERROR: '+e.message);try{child.kill();}catch(_){}process.exit(1);}
})();
