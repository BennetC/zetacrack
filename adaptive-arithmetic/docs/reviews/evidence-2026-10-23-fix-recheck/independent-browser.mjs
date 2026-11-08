// New review cases. Own servers, database, profile, and evidence only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import net from 'node:net';
import path from 'node:path';
const root=process.cwd(),puppeteer=createRequire(path.join(root,'web/package.json'))('puppeteer-core');
const evidence=path.join(root,'docs/reviews/evidence-2026-10-23-fix-recheck/independent-ui');await mkdir(evidence,{recursive:true});
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const apiPort=await port(),sitePort=await port(),apiURL=`http://127.0.0.1:${apiPort}`,siteURL=`http://127.0.0.1:${sitePort}`;
const children=[spawn(path.join(root,'.venv/Scripts/python.exe'),['-m','uvicorn','server.app:app','--host','127.0.0.1','--port',String(apiPort)],{cwd:root,env:{...process.env,ARITHMETIC_DB:path.join(root,'data',`independent-ui-${Date.now()}.sqlite3`)},windowsHide:true}),spawn(process.execPath,[path.join(root,'web/node_modules/vite/bin/vite.js'),'--port',String(sitePort),'--strictPort'],{cwd:path.join(root,'web'),env:{...process.env,ARITHMETIC_API_URL:apiURL},windowsHide:true})];
let errors='',browser;for(const c of children)c.stderr.on('data',d=>errors+=d);
const checks=[],pageErrors=[],details={};
async function until(fn,label){for(let i=0;i<220;i++){if(await fn())return;await new Promise(r=>setTimeout(r,80));}throw Error('Timeout: '+label+' '+errors);}
async function api(route,method='GET',body){const r=await fetch(apiURL+route,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});assert(r.ok,await r.clone().text());return r.json();}
async function button(p,label){for(const b of await p.$$('button'))if(await b.evaluate((e,t)=>e.textContent.trim()===t,label)){await b.click();return;}throw Error('No button '+label);}
async function input(p,selector,value){await p.focus(selector);await p.keyboard.down('Control');await p.keyboard.press('KeyA');await p.keyboard.up('Control');await p.keyboard.press('Backspace');if(value)await p.keyboard.type(value);}
async function ready(p){await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>['Start practice','Start standard run'].includes(b.textContent.trim())&&!b.disabled));}
async function shot(p,name){await p.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}
function note(t){checks.push(t);console.log('Passed: '+t);}
const memory={version:1,operations:[{id:'addition',version:1,share:'100',groups:[{id:'review-memory',version:1,name:'Remembered independent setup',share:'100',first:{min:'33',max:'44',decimalPlaces:0},second:{min:'1',max:'2',decimalPlaces:0},allowNegative:false}]}],session:{format:'timed',durationSeconds:'77',countdown:true}};
try{
 await Promise.all([apiURL+'/api/setup',siteURL].map(url=>until(async()=>{try{return(await fetch(url)).ok;}catch{return false;}},'servers')));
 await api('/api/last-config','PUT',memory);
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking','--disable-background-timer-throttling'],defaultViewport:{width:1487,height:1058}});
 const p=await browser.newPage();p.on('pageerror',e=>pageErrors.push(e.message));await p.bringToFront();
 let holdSetup=true,failSetup=false,holdCorrective=false;const held=[],corrective=[],requests=[];
 await p.setRequestInterception(true);p.on('request',r=>{requests.push({url:r.url(),method:r.method()});if(r.url().endsWith('/api/setup')){if(holdSetup){held.push(r);return;}if(failSetup){void r.respond({status:503,contentType:'application/json',body:'{"detail":"Independent unavailable"}'});return;}}
 if(holdCorrective&&r.url().includes('/api/sessions?')&&new URL(r.url()).searchParams.get('offset')==='0'){corrective.push(r);return;}void r.continue();});
 await p.goto(siteURL+'?view=custom',{waitUntil:'domcontentloaded'});await until(()=>held.length>=2,'setup duplicate');
 await button(p,'History');
 const obsolete=structuredClone(memory);obsolete.operations[0].groups[0].name='Obsolete StrictMode response';holdSetup=false;
 await held[1].respond({status:200,contentType:'application/json',body:JSON.stringify({presets:[],lastConfig:memory})});
 await held[0].respond({status:200,contentType:'application/json',body:JSON.stringify({presets:[],lastConfig:obsolete})});
 await button(p,'Custom practice');await ready(p);
 assert.equal(await p.$eval('.group-name',e=>e.value),memory.operations[0].groups[0].name);
 assert.equal(requests.filter(r=>r.method==='PUT'&&r.url.endsWith('/api/last-config')).length,0);
 assert.deepEqual((await api('/api/setup')).lastConfig,memory);await shot(p,'01-untouched-restored');
 note('Untouched editor restores the newest live setup response after reversed StrictMode reads and navigation, without autosaving loaded controls');

 held.length=0;holdSetup=true;await p.reload({waitUntil:'domcontentloaded'});await until(()=>held.length>=2,'second setup duplicate');
 await input(p,'.group-name','New invalid edit retained');await input(p,'input[aria-label$="left operand minimum"]','100');await input(p,'input[aria-label$="left operand maximum"]','10');
 await button(p,'Graphs');holdSetup=false;for(const r of [...held].reverse())await r.respond({status:200,contentType:'application/json',body:JSON.stringify({presets:[],lastConfig:memory})});
 await button(p,'Custom practice');await p.waitForFunction(()=>document.body.innerText.includes('Minimum must be less than or equal to maximum'));
 assert.equal(await p.$eval('.group-name',e=>e.value),'New invalid edit retained');
 assert(await p.$$eval('button',bs=>bs.some(b=>b.textContent.trim()==='Start practice'&&b.disabled)));
 assert.deepEqual((await api('/api/setup')).lastConfig,memory);await shot(p,'02-invalid-edits-retained');
 await input(p,'input[aria-label$="left operand maximum"]','101');await button(p,'History');
 await until(async()=>{const c=(await api('/api/setup')).lastConfig;return c.operations[0].groups[0].name==='New invalid edit retained'&&c.operations[0].groups[0].first.max==='101';},'repaired custom edit persists on read view');
 note('Invalid deliberate edits survive delayed initialization/navigation without overwriting stored memory; repair persists while History is open');

 failSetup=true;await p.goto(siteURL+'?view=custom');await p.waitForFunction(()=>document.body.innerText.includes('Independent unavailable'));
 failSetup=false;await button(p,'Retry connection');await ready(p);
 assert.equal(await p.$eval('.group-name',e=>e.value),'New invalid edit retained');await shot(p,'03-untouched-retry-restores');
 note('Untouched editor after initial connection failure restores remembered settings on in-place retry');

 const ids=[];const cfg=structuredClone(memory);cfg.operations[0].groups[0].name='Scoped History';cfg.session.countdown=false;
 for(let i=0;i<25;i++){
  const {id}=await api('/api/sessions','POST',{config:cfg,seed:'independent-pagination-'+i,generatorVersion:'exact-grid-v1',policyVersion:'hierarchical-shares-v1',measurementVersion:'response-timing-v1',mode:'custom',contentVersion:'custom-grid-v1'});
  await api(`/api/sessions/${id}/observations`,'POST',{events:[{sequence:0,type:'session-started',elapsedMs:0,payload:{}},{sequence:1,type:'session-ended',elapsedMs:0,payload:{reason:'manual-end',endTimeKnown:true}}]});ids.push(id);
 }
 const other=await browser.newPage();other.on('pageerror',e=>pageErrors.push(e.message));await other.goto(siteURL+'?view=history');await p.bringToFront();
 await p.goto(siteURL+'?view=history');await p.select('.filter-row select','custom');await input(p,'input[type="search"]','Scoped History');
 await p.waitForFunction(()=>document.querySelector('.pagination')?.innerText.includes('1–20 of 25'));await button(p,'Next page');await p.waitForFunction(()=>document.querySelector('.pagination')?.innerText.includes('21–25 of 25'));
 const deleted=await other.evaluate(async ids=>{const r=await fetch('/api/sessions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionIds:ids})});return r.status;},ids.slice(5));assert.equal(deleted,200);
 await p.evaluate(()=>{
  window.recheckDom=[],window.recheckPaint=[];
  const sample=()=>({text:document.querySelector('.saved-page')?.innerText,rows:document.querySelectorAll('.history-row').length});
  window.recheckObserver=new MutationObserver(()=>window.recheckDom.push(sample()));window.recheckObserver.observe(document.querySelector('#root'),{childList:true,subtree:true,characterData:true});
  window.recheckTick=()=>{window.recheckPaint.push(sample());window.recheckFrame=requestAnimationFrame(window.recheckTick);};window.recheckFrame=requestAnimationFrame(window.recheckTick);
 });
 holdCorrective=true;await button(p,'Refresh history');await until(()=>corrective.length===1,'corrective read held');
 await new Promise(r=>setTimeout(r,200));await shot(p,'04-history-corrective-loading');
 const during=await p.evaluate(()=>({text:document.querySelector('.saved-page')?.innerText,paint:window.recheckPaint,dom:window.recheckDom}));
 assert(during.text.includes('Loading saved data'));
 assert(!during.paint.some(s=>s.text?.includes('No saved sessions match')||s.text?.includes('21–5 of 5')));
 holdCorrective=false;const r=corrective.shift(),result=await api(new URL(r.url()).pathname+new URL(r.url()).search);await r.respond({status:200,contentType:'application/json',body:JSON.stringify(result)});
 await p.waitForFunction(()=>document.querySelector('.pagination')?.innerText.includes('1–5 of 5')&&document.querySelectorAll('.history-row').length===5);
 assert.equal(await p.$eval('input[type="search"]',e=>e.value),'Scoped History');assert.equal(await p.$eval('.filter-row select',e=>e.value),'custom');
 details.pageCorrection={during,finalRows:5,finalRange:'1–5 of 5'};await shot(p,'05-history-filtered-survivors');
 note('Cross-tab 25-to-5 shrink preserves mode/text filters; a held corrective fetch renders loading with no false empty/impossible range on observed animation frames');

 // A response for the former filter arrives after the user's newer filter response.
 holdCorrective=true;await button(p,'Refresh history');await until(()=>corrective.length===1,'held stale filtered read');
 await input(p,'input[type="search"]','No matching config');await until(()=>corrective.length>=2,'new filter read held');
 const fresh=corrective.pop(),freshResult=await api(new URL(fresh.url()).pathname+new URL(fresh.url()).search);holdCorrective=false;
 await fresh.respond({status:200,contentType:'application/json',body:JSON.stringify(freshResult)});
 await p.waitForFunction(()=>document.querySelector('.pagination')?.innerText.includes('0 sessions'));
 const stale=corrective.shift();await stale.respond({status:200,contentType:'application/json',body:JSON.stringify(result)});await new Promise(r=>setTimeout(r,150));
 assert.equal(await p.$eval('input[type="search"]',e=>e.value),'No matching config');assert.equal(await p.$$eval('.history-row',rows=>rows.length),0);
 assert(await p.$eval('.pagination',e=>e.innerText.includes('0 sessions')));await shot(p,'06-stale-filter-response-ignored');
 await p.evaluate(()=>{cancelAnimationFrame(window.recheckFrame);window.recheckObserver.disconnect();});await other.close();
 note('A stale History response completing after a new text filter cannot restore former rows or pagination');
 assert.deepEqual(pageErrors,[]);
 details.historyRequests=requests.filter(r=>r.url.includes('/api/sessions?'));
 await writeFile(path.join(evidence,'report.json'),JSON.stringify({synthetic:true,apiPort,sitePort,checks,pageErrors,details},null,2));console.log(JSON.stringify({checks:checks.length,pageErrors}));
}finally{
 if(browser)await browser.close();
 for(const c of children)if(c.pid&&c.exitCode===null)await new Promise(done=>{const killer=spawn('taskkill',['/pid',String(c.pid),'/t','/f'],{windowsHide:true});killer.once('exit',done);});
}
