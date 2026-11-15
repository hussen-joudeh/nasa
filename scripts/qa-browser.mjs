// Run after installing the original dev dependencies and permitting local browser QA.
// Requires an existing local server. No deployment, account, or API key.
import { chromium } from 'playwright-core';
import { mkdir,writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const log={startedAt:new Date().toISOString(),console:[],failedRequests:[],checks:[]};
page.on('pageerror',e=>log.console.push(e.message));
page.on('requestfailed',r=>log.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
const check=async(name,fn)=>{try{await fn();log.checks.push({name,result:'pass'});}catch(e){log.checks.push({name,result:'fail',error:e.message});}};
const enterApp=async()=>{await page.locator('.cinematic-enter').first().click();await page.locator('#workspace').waitFor({state:'visible'});};
const laneStats=async(plan)=>page.locator(`.plan-lane[data-plan="${plan}"] .lane-stats dd`).allTextContents();
await mkdir('qa/screenshots',{recursive:true});
try{
 await page.goto((process.env.FIELD_SHIFT_QA_URL??'http://127.0.0.1:'+(process.env.FIELDSHIFT_FRONTEND_PORT??'5179')+'/'),{waitUntil:'domcontentloaded'});
 await check('English shell',async()=>{await page.getByRole('heading',{name:/Know your land/i}).waitFor();await enterApp();});
 await check('Coordinate selection and real area',async()=>{await page.getByText('Enter boundary coordinates',{exact:true}).click();await page.locator('#coordinates').fill('36.780, -119.950\n36.780, -119.940\n36.785, -119.940\n36.785, -119.950');await page.locator('#apply').click();await page.locator('.area-number').waitFor();if(!(await page.locator('#analyze').isEnabled()))throw Error('Analyze remained disabled');});
 await check('Rotation changes',async()=>{await page.locator('#planning').scrollIntoViewIfNeeded();if((await page.locator('.plan-lane').count())<3)throw Error('Expected three plan lanes');const before=await laneStats('A');await page.locator('[data-rotation="0"][data-season="1"]').selectOption('soy');const after=await laneStats('A');if(before.join(',')===after.join(','))throw Error('Counts unchanged '+after.join(','));if(!(await page.locator('.plan-lane[data-plan=A] .lane-change').count()))throw Error('Missing lane-change note');const focus=await page.evaluate(()=>document.activeElement?.id);if(focus!=='rotation-0-1')throw Error('Focus lost on edited select');});
 await check('Save and restore',async()=>{await page.locator('#save').click();await page.locator('#clear').click();await page.locator('#restore').click();await page.locator('.area-number').waitFor();});
 await check('Weather success or honest failure',async()=>{await page.locator('#analyze').click();await page.waitForFunction(()=>!document.querySelector('#analyze').disabled,{},{timeout:35000});if(!(await page.locator('.weather-grid,.environment .error').count()))throw Error('Missing success/error state');});
 await check('Climate success or honest failure',async()=>{await page.locator('#scenario').selectOption('ssp585');await page.locator('#period').selectOption('2080-2099');await page.locator('#run-climate').click();await page.waitForFunction(()=>!document.querySelector('#run-climate').disabled,{},{timeout:35000});if(!(await page.locator('.climate-result,#climate-content .error').count()))throw Error('Missing success/error state');});
 await page.screenshot({path:'qa/screenshots/desktop-en.png',fullPage:true});
 await page.locator('#language').click();
 await check('Arabic direction',async()=>{if(await page.locator('html').getAttribute('dir')!=='rtl')throw Error('No RTL');});
 await page.screenshot({path:'qa/screenshots/desktop-ar.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await check('Mobile document does not overflow',async()=>{if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Horizontal overflow');});
 await check('Mobile rotation lanes reachable',async()=>{await page.locator('[data-view="plan"]').click();await page.locator('.plan-lane[data-plan=B]').waitFor();if(!(await page.locator('[data-rotation="1"][data-season="0"]').isVisible()))throw Error('Plan B season select not visible');});
 await page.screenshot({path:'qa/screenshots/mobile-ar.png',fullPage:true});
 await page.locator('#language').click();await page.screenshot({path:'qa/screenshots/mobile-en.png',fullPage:true});
 // These automated checks do not establish successful DEM rendering or live-data retrieval.
 log.manualRemaining=['Visually inspect screenshots','Draw a polygon with map clicks','Pan/zoom/orbit real terrain','Verify loaded DEM tiles','Inspect network source payloads','Keyboard and screen-reader QA'];
}finally{await writeFile('qa/browser-results.json',JSON.stringify(log,null,2));await browser.close();}
if(log.checks.some(c=>c.result==='fail'))process.exitCode=1;