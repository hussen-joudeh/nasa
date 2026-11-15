// Run against a frontend with the existing MongoDB demo API connected.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const base=process.env.FIELDSHIFT_QA_URL??'http://127.0.0.1:5181/';
const directory='qa/results-redesign';
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={base,sessions:[]};
async function tab(page,id){
 await page.locator('#dashboard-tab-'+id).click();
 assert.equal(await page.locator('#results-screen > [role="tabpanel"]:visible').count(),1);
 assert.equal(await page.locator('.skip').getAttribute('href'),'#results-screen-title');
 assert.equal(await page.locator('#dashboard-context .compact-field bdi[dir="ltr"]').count(),2);
 assert.equal(await page.locator('#dashboard-panel-'+id).isVisible(),true);
 assert.equal(await page.locator('[data-dashboard-tab][aria-selected="true"]').count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow');
}
async function run(page){
 await page.locator('#run-preflight').click();
 await page.locator('#results-screen').waitFor({state:'visible'});
 assert.equal(await page.locator('#dashboard-tab-overview').getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('#results-screen > [role="tabpanel"]:visible').count(),1);
}
async function evidence(page){
 return page.locator('[data-water-plan]').evaluateAll(rows=>rows.map((row,index)=>{
  const store=document.querySelector(`.preflight-check-store[data-rotation="${index}"][data-check-key="water.balance:2"]`);
  return {status:row.querySelector('[data-status]').dataset.status,engineStatus:store.querySelector('[data-status]').dataset.status,inputs:JSON.parse(store.querySelector('pre').textContent)};
 }));
}
async function focusInView(page,id){
 await page.waitForFunction(id=>document.activeElement?.id===id,id);
 assert.ok(await page.locator('#'+id).evaluate(input=>{const box=input.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;}),'Recovery target is outside the viewport');
}
async function capture(page,name){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow');
 await page.screenshot({path:`${directory}/${name}.png`,fullPage:true,animations:'disabled'});
}
try{
 for(const [name,width,height,ar] of [['desktop-en',1440,900,false],['mobile-en',375,812,false],['desktop-ar',1440,900,true],['mobile-ar',375,812,true]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(40000);
  const session={name,errors:[],states:[]};report.sessions.push(session);
  page.on('pageerror',error=>session.errors.push(error.message));
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});
   if(ar)await page.locator('#language').click();
   await page.locator('.cinematic-enter').first().click();
   await page.locator('#demo-select').click();
   await page.waitForFunction(()=>document.querySelector('.area-stored')&&!document.querySelector('#demo-select').disabled);
   await page.locator('#analyze').click();
   await page.locator('#setup-screen').waitFor({state:'visible'});
   const field=await page.locator('#coordinates').inputValue();
   let plans=await page.locator('#rotation-grid select').evaluateAll(inputs=>inputs.map(input=>input.value));
   const preserved=async()=>{
    assert.equal(await page.locator('#coordinates').inputValue(),field);
    assert.deepEqual(await page.locator('#rotation-grid select').evaluateAll(inputs=>inputs.map(input=>input.value)),plans);
   };
   assert.equal(await page.locator('#illustrative-crop-settings').isChecked(),false);
   await run(page);
   assert.match(await page.locator('.decision-first h2').innerText(),ar?/لا يمكن إكمال/:/cannot be completed yet/);
   assert.equal(await page.locator('#season-water-chart').count(),0);
   assert.equal(await page.locator('#enter-irrigation-budget').innerText(),ar?'أدخل ميزانية الري':'Enter irrigation budget');
   session.states.push({budget:'blank',modelInputs:'missing',rows:await evidence(page)});
   await capture(page,name+'-blank');
   await page.locator('#enter-irrigation-budget').click();
   await focusInView(page,'water-budget-amount');await preserved();
   await page.locator('#demo-budget').click();
   await run(page);
   assert.equal(await page.locator('#season-water-chart').count(),0);
   assert.match(await page.locator('#dashboard-budget-confirmation').innerText(),/600 mm/);
   assert.equal(await page.locator('#enter-irrigation-budget').count(),0);
   assert.equal(await page.locator('#result-next-action').innerText(),ar?'راجع مدخلات الموسم':'Review season inputs');
   assert.match(await page.locator('.decision-first h2').innerText(),ar?/لا يمكن إكمال/:/cannot be completed yet/);
   await tab(page,'compare');
   const incomplete=await evidence(page);
   assert.deepEqual(incomplete.map(row=>row.status),['UNKNOWN','UNKNOWN','UNKNOWN']);
   assert.equal(await page.locator('[data-water-plan] td:nth-child(3)').evaluateAll(cells=>cells.every(cell=>cell.textContent.includes('600 mm')||cell.textContent.includes('٦٠٠ mm'))),true);
   session.states.push({budget:'600 mm',modelInputs:'missing',rows:incomplete});
   await tab(page,'checks');
   const shared=page.locator('[data-missing-input="seasonPlantingDate"]');
   assert.equal(await shared.count(),1);assert.match(await shared.innerText(),/A.*B.*C/s);
   await tab(page,'overview');await capture(page,name+'-missing-inputs');
   await page.locator('#result-next-action').click();
   await focusInView(page,'planting-date-2');await preserved();
   assert.equal(await page.locator('.setup-assumptions').getAttribute('open'),'');
   assert.equal(await page.locator('#water-budget-amount').inputValue(),'600');
   assert.equal(await page.locator('#illustrative-crop-settings').isChecked(),false);
   await page.locator('#illustrative-scenario').click();
   assert.equal(await page.locator('#water-budget-amount').inputValue(),'600');
   await run(page);
   const complete=await evidence(page);
   assert.deepEqual(complete.map(row=>row.status),['PASS','WARNING','WARNING']);
   assert.ok(complete.every(row=>row.status===row.engineStatus));
   assert.equal(await page.locator('#season-water-chart').isVisible(),true);
   for(const [index,row] of complete.entries()){
    assert.equal(Number(await page.locator(`[data-chart-plan="${String.fromCharCode(65+index)}"] .chart-requirement`).getAttribute('value')),row.inputs.needMm.max);
   }
   session.states.push({budget:'600 mm',modelInputs:'complete demo',rows:complete});
   await capture(page,name+'-overview');
   // Arrow navigation follows the visual reading direction; Home and End also work.
   await page.locator('#dashboard-tab-overview').focus();
   await page.keyboard.press(ar?'ArrowLeft':'ArrowRight');
   await focusInView(page,'dashboard-tab-compare');
   assert.equal(await page.locator('#dashboard-panel-compare').isVisible(),true);
   await page.keyboard.press('End');await focusInView(page,'dashboard-tab-checks');
   await page.keyboard.press('Home');await focusInView(page,'dashboard-tab-overview');
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement?.id),'dashboard-panel-overview');
   await tab(page,'compare');
   const reasons=page.locator('.season-water-reason');
   await reasons.nth(0).locator('summary').click();
   await reasons.nth(1).locator('summary').click();
   await page.waitForFunction(()=>document.querySelectorAll('.season-water-reason[open]').length===1);
   assert.equal(await reasons.nth(1).getAttribute('open'),'');
   assert.equal(await reasons.nth(1).locator('a').count()>0,true);
   assert.equal(await page.locator('.overall-assessments').isVisible(),true);
   await capture(page,name+'-compare');
   await tab(page,'field-data');
   for(const id of ['map','climate','history','soil','field-evidence']){
    const section=page.locator('#dashboard-'+id);await section.locator(':scope > summary').click();
    if(id==='map'){
     await page.waitForFunction(()=>document.querySelector('#dashboard-map canvas')&&document.querySelector('#map-loading').hidden);
     assert.ok((await section.locator('canvas').boundingBox()).height>200);
    }
    if(id==='climate')assert.match(await section.innerText(),/NASA POWER.*2025|2025.*NASA POWER/s);
    if(id==='history')assert.equal(await section.locator('ol > li').count(),3);
    if(id==='soil')assert.equal(await section.locator('tbody > tr').count(),26);
    if(id==='field-evidence')assert.ok(await section.locator('details').count()>0);
    await capture(page,name+'-field-'+id);
    await section.locator(':scope > summary').click();
   }
   await tab(page,'checks');
   await page.locator('#dashboard-plan-select').selectOption('1');
   await focusInView(page,'dashboard-plan-select');
   assert.deepEqual(await page.locator('.preflight-evaluation').evaluateAll(elements=>elements.map(el=>el.dataset.rotation)),['1']);
   assert.deepEqual(await page.locator('.preflight-check-groups').evaluateAll(elements=>elements.map(el=>el.dataset.rotation)),['1']);
   assert.equal(await page.locator('.preflight-season').count(),3);
   await page.locator('.preflight-check-group[open] .preflight-check-pick').first().click();
   await focusInView(page,'preflight-drawer-close');
   assert.equal(await page.locator('#preflight-drawer-body pre').isVisible(),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#preflight-provenance-drawer').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('preflight-check-pick')),true);
   const methods=page.locator('#dashboard-calculation-output .dashboard-evidence').last();
   await methods.locator('summary').click();
   assert.ok(await methods.locator('a').count()>=3);
   await page.locator('#dashboard-tools > summary').click();
   assert.equal(await page.locator('#export').isVisible(),true);
   assert.equal(await page.locator('#run-climate').isVisible(),true);
   await page.locator('#dashboard-tools > summary').click();
   await capture(page,name+'-checks');
   await page.locator('#edit-comparison').click();
   await focusInView(page,'setup-screen-title');await preserved();
   await page.locator('#water-budget-amount').fill('620');
   await page.locator('#rotation-grid select[data-rotation="0"][data-season="0"]').selectOption('soy');
   plans=await page.locator('#rotation-grid select').evaluateAll(inputs=>inputs.map(input=>input.value));
   assert.equal(await page.locator('[data-screen-link="results"]').isEnabled(),false);
   await run(page);
   assert.deepEqual((await evidence(page)).map(row=>row.status),['PASS','PASS','PASS']);
   assert.equal(await page.locator('#season-water-chart .chart-budget').getAttribute('value'),'620');
   await page.locator('#edit-comparison').click();await preserved();
   assert.equal(await page.locator('#water-budget-amount').inputValue(),'620');
   await page.locator('#water-budget-amount').fill('');await run(page);
   assert.equal(await page.locator('#season-water-chart').isVisible(),true);
   assert.deepEqual((await evidence(page)).map(row=>row.status),['UNKNOWN','UNKNOWN','UNKNOWN']);
   await capture(page,name+'-blank-calculable');
   assert.equal(await page.locator('#season-water-chart .chart-budget-line').count(),0);
   await page.locator('#enter-irrigation-budget').click();await focusInView(page,'water-budget-amount');
   await page.locator('#demo-budget').click();
   await page.locator('#rotation-grid select[data-rotation="2"][data-season="1"]').selectOption('chickpea');
   plans=await page.locator('#rotation-grid select').evaluateAll(inputs=>inputs.map(input=>input.value));
   await run(page);
   assert.equal(await page.locator('#season-water-chart').isVisible(),true);
   const unavailable=page.locator('[data-chart-plan="C"]');
   assert.equal(await unavailable.locator('.chart-bar').count(),0);
   assert.match(await unavailable.locator('.chart-requirement').innerText(),ar?/غير متاح/:/Unavailable/i);
   assert.deepEqual((await evidence(page)).map(row=>row.status),['PASS','WARNING','UNKNOWN']);
   session.partialRequirements='pass';await capture(page,name+'-partly-calculable');
   await page.locator('#edit-comparison').click();await preserved();
   await page.locator('#water-budget-unit').selectOption('m3');
   await page.locator('#water-budget-period').selectOption('wholePlan');
   await run(page);
   assert.match(await page.locator('#dashboard-budget-confirmation').innerText(),/600 m³/);
   assert.match(await page.locator('#dashboard-budget-confirmation').innerText(),ar?/للخطة كاملة/:/for the whole plan/);
   await page.locator('#edit-comparison').click();await preserved();
   assert.equal(await page.locator('#water-budget-amount').inputValue(),'600');
   assert.equal(await page.locator('#water-budget-unit').inputValue(),'m3');
   assert.equal(await page.locator('#water-budget-period').inputValue(),'wholePlan');
   session.editAndRerun='pass';session.keyboardAndFocus='pass';session.details='pass';
   assert.deepEqual(session.errors,[]);
   session.pass=true;
  }catch(error){session.failure=error.stack;await capture(page,name+'-failure');throw error;}
  finally{await context.close();}
 }
}finally{
 await browser.close();await writeFile(`${directory}/browser-results.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify({base,sessions:report.sessions.map(({name,pass})=>({name,pass}))},null,2));
