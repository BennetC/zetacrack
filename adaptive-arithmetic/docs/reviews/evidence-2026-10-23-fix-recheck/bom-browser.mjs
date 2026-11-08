// New review cases. Own servers, database, profile, and evidence only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import net from 'node:net';
import path from 'node:path';
const root=process.cwd(),puppeteer=createRequire(path.join(root,'web/package.json'))('puppeteer-core');
const evidence=path.join(root,'docs/reviews/evidence-2026-10-23-fix-recheck/bom-graphs');await mkdir(evidence,{recursive:true});
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
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking','--disable-background-timer-throttling'],defaultViewport:{width:1487,height:1058}});
 const p=await browser.newPage();p.on('pageerror',e=>pageErrors.push(e.message));await p.bringToFront();await p.goto(siteURL);await ready(p);
 await p.evaluate(()=>{window.recheckOffset=0;const original=performance.now.bind(performance);Object.defineProperty(performance,'now',{value:()=>original()+window.recheckOffset});});
 const creation=p.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await button(p,'Start standard run');const {id}=await(await creation).json();
 await p.waitForSelector('input[aria-label="Your answer"]');let q;await until(async()=>{q=(await api('/api/sessions/'+id)).questions[0];return !!q;},'question');
 const raw='\ufeff'+q.expected+'\ufeff';const cdp=await p.target().createCDPSession();await cdp.send('Browser.grantPermissions',{origin:siteURL,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await p.evaluate(raw=>navigator.clipboard.writeText(raw),raw);await p.focus('input[aria-label="Your answer"]');await p.keyboard.down('Control');await p.keyboard.press('KeyV');await p.keyboard.up('Control');
 await p.waitForFunction(()=>document.body.innerText.includes('1 completed'));await p.evaluate(()=>{window.recheckOffset=120001;});
 await p.waitForFunction(()=>document.body.innerText.includes('Session saved to your local database.')&&document.body.innerText.includes('Based on 1 timed correct answer'));
 const saved=await api('/api/sessions/'+id);assert(saved.comparisonEligible);assert.equal(saved.summary.validCorrectAnswerCount,1);assert.equal(saved.questions[0].acceptedInput,raw);assert.equal(saved.questions[0].lastInput,raw);assert.equal(saved.events.find(e=>e.type==='input-changed').payload.inputType,'insertFromPaste');
 assert.deepEqual((await api(`/api/sessions/${id}/export?format=json`)).sessions,[saved]);const csv=await(await fetch(apiURL+`/api/sessions/${id}/export?format=csv`)).text();assert(csv.includes(raw)||csv.includes('\\ufeff'));
 await shot(p,'01-bom-correct-results');await button(p,'View graphs');
 await p.waitForFunction(()=>document.querySelector('.cohort-summary')?.innerText.includes('1 eligible full runs')&&document.body.innerText.includes('1 valid timed correct answers')&&document.body.innerText.includes('Within-session response sequence'));
 assert.equal(await p.$eval('.cohort-select select',e=>e.value),saved.cohortKey);
 assert.equal(await p.$eval('.sequence-selection select',e=>e.value),id);
 const graph=await api('/api/analytics?cohort='+saved.cohortKey);assert.equal(graph.summary.validCorrectAnswerCount,1);assert.equal(graph.trend[0].sessionId,id);assert.equal(graph.trend[0].score,1);assert.equal(graph.histogram.reduce((n,b)=>n+b.count,0),1);
 await shot(p,'02-bom-graphs');const sections=await p.$$('.chart-section');for(let i=0;i<sections.length;i++)await sections[i].screenshot({path:path.join(evidence,`03-section-${i}.png`)});
 assert.deepEqual(pageErrors,[]);await writeFile(path.join(evidence,'report.json'),JSON.stringify({synthetic:true,apiPort,sitePort,saved,graph,csv,rawCodePoints:[...raw].map(c=>c.codePointAt(0)),pageErrors,checks:['Real BOM clipboard paste through live advancement, persistence, results, JSON/CSV and all four graph surfaces']},null,2));
 console.log(JSON.stringify({checks:1,validTimes:1,eligibleFullRuns:1,histogramCount:1,pageErrors}));
}finally{
 if(browser)await browser.close();for(const c of children)if(c.pid&&c.exitCode===null)await new Promise(done=>{const killer=spawn('taskkill',['/pid',String(c.pid),'/t','/f'],{windowsHide:true});killer.once('exit',done);});
}
