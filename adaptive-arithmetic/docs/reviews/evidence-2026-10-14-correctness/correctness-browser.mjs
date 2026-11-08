import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const evidence=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.join(root,'web/package.json'));
const puppeteer=require('puppeteer-core');
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const apiPort=await freePort(), sitePort=await freePort();
const apiURL=`http://127.0.0.1:${apiPort}`,siteURL=`http://127.0.0.1:${sitePort}`;
const database=path.join(root,'data/review-2026-10-14-correctness',`browser-${Date.now()}.sqlite3`);
const children=[spawn(path.join(root,'.venv/Scripts/python.exe'),['-m','uvicorn','server.app:app','--host','127.0.0.1','--port',String(apiPort)],{cwd:root,env:{...process.env,ARITHMETIC_DB:database},windowsHide:true}),spawn(process.execPath,[path.join(root,'web/node_modules/vite/bin/vite.js'),'--port',String(sitePort),'--strictPort'],{cwd:path.join(root,'web'),env:{...process.env,ARITHMETIC_API_URL:apiURL},windowsHide:true})];
let browser,serverErrors='';for(const c of children)c.stderr.on('data',d=>serverErrors+=d);
async function until(check,description){for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw new Error(description+' '+serverErrors);}
async function api(route,method='GET',body){const r=await fetch(apiURL+route,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});assert(r.ok,await r.clone().text());return r.json();}
async function button(page,label){for(const b of await page.$$('button'))if(await b.evaluate((e,t)=>e.textContent.trim()===t,label)){await b.click();return;}throw Error('Missing '+label);}
try{
await Promise.all([apiURL+'/api/setup',siteURL].map(url=>until(async()=>{try{return(await fetch(url)).ok;}catch{return false;}},'startup')));
browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-timer-throttling','--disable-background-networking'],defaultViewport:{width:1280,height:1000}});
const page=await browser.newPage();await page.bringToFront();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
await page.evaluateOnNewDocument(()=>{window.reviewAdvance=0;const now=performance.now.bind(performance);Object.defineProperty(performance,'now',{value:()=>now()+window.reviewAdvance});});
await page.goto(siteURL);await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Start standard run'&&!b.disabled));
const created=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await button(page,'Start standard run');const id=(await(await created).json()).id;
await page.waitForSelector('input[aria-label="Your answer"]');let presented;
await until(async()=>{const s=await api('/api/sessions/'+id);presented=s.questions[0];return !!presented;},'presentation');
const input='\ufeff'+presented.expected;
// Clipboard paste is a real browser field change; the BOM is intentionally retained.
const cdp=await page.target().createCDPSession();await cdp.send('Browser.grantPermissions',{origin:siteURL,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
await page.evaluate(value=>navigator.clipboard.writeText(value),input);await page.focus('input[aria-label="Your answer"]');await page.keyboard.down('Control');await page.keyboard.press('KeyV');await page.keyboard.up('Control');
await page.waitForFunction(()=>document.body.innerText.includes('1 completed'));
await page.evaluate(()=>window.reviewAdvance=120001);await button(page,'End session');await page.waitForFunction(()=>document.body.innerText.includes('Session saved to your local database.')&&document.body.innerText.includes('Based on 0 timed correct answers.') );
const saved=await api('/api/sessions/'+id);assert.equal(saved.questions[0].acceptedInput,input);assert.equal(saved.score,1);assert.equal(saved.summary.validCorrectAnswerCount,0);assert.equal(saved.comparisonEligible,false);
const result={synthetic:true,apiPort,sitePort,pageErrors,clientAcceptedBOM:true,rawInputCodePoints:Array.from(input).map(c=>c.codePointAt(0).toString(16)),saved};
assert.deepEqual(pageErrors,[]);await page.screenshot({path:path.join(evidence,'bom-answer-results.png'),fullPage:true});await writeFile(path.join(evidence,'bom-answer-trace.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({BOMAcceptedInBrowser:true,score:saved.score,validCorrectAnswerCount:saved.summary.validCorrectAnswerCount,comparisonEligible:saved.comparisonEligible,warnings:saved.dataQualityWarnings,pageErrors,apiPort,sitePort}));
}finally{if(browser)await browser.close();for(const child of children){if(child.pid&&child.exitCode===null)await new Promise(r=>{const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true});killer.once('exit',r);});}}

