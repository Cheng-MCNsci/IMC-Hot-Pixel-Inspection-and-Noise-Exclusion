// Run against serve.py in isolated Chrome contexts. Never uses production browser state.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation');
const base=process.env.IMC_REVIEW_URL||'http://127.0.0.1:8788/example/review/';
const expected=JSON.parse(fs.readFileSync(path.join(root,'assets/teaching_case.json')));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'example/review/catalog.json')));
const errors=[];
const ready=page=>page.waitForFunction(()=>window.neuronReview&&!window.neuronReview.getState().loading);
async function choose(page,id,value){await page.selectOption('#'+id,value);await ready(page);}
const rows=page=>page.locator('#neuron-list .neuron-row');
const role=(row,name)=>row.locator(`[data-role="${name}"]`);
const counts=row=>role(row,'bin-table').locator('tr').evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
const num=s=>Number(s.replaceAll(',','').replace('%',''));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await ready(page);
  assert.equal(await page.locator('#marker option').count(),16);assert.equal(await page.locator('#roi option').count(),5);
  for(const id of ['display-max','bin1','bin2','bin3','threshold','cutoff'])assert.equal(await page.locator('#'+id).inputValue(),'');
  assert.equal(await rows(page).count(),13);
  assert.equal(Object.keys(await page.evaluate(()=>window.neuronReview.exportReviews().reviews)).length,0);
  await choose(page,'roi','N_1_02');await choose(page,'marker','p_Akt_S473');assert.equal(await rows(page).count(),42);
  const first=rows(page).first();assert.equal(await first.getAttribute('data-cell-id'),'N_1_02:685');
  await page.fill('#display-max','5');for(const [i,v] of ['1','3','5'].entries())await page.fill('#bin'+(i+1),v);await page.fill('#threshold','5');await page.click('#apply-settings');
  const measurements=await counts(first);assert.equal(measurements.length,7);
  for(let i=0;i<5;i++){assert.equal(num(measurements[i][1]),expected.bins[i].count);assert(Math.abs(num(measurements[i][4])-expected.bins[i].contribution_to_mean)<.000011);}
  assert.equal(num(measurements[5][1]),75);assert.equal(num(measurements[6][1]),5);
  await page.selectOption('#comparison-bin','4');assert.match(await first.locator('[data-range="selected-bin"]').textContent(),/76.0479%/);
  await first.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#neuron-list .neuron-row').dataset.rendered==='true');
  const pixels=()=>first.locator('[data-panel="outline"]').evaluate(c=>c.toDataURL());
  const original=await pixels();await page.uncheck('#outlines');await first.scrollIntoViewIfNeeded();assert.notEqual(await pixels(),original);await page.check('#outlines');await first.scrollIntoViewIfNeeded();assert.equal(await pixels(),original);
  await role(first,'zoom').selectOption('2');assert.equal((await page.evaluate(()=>neuronReview.getState())).rows[0].zoom,2);
  const canvas=first.locator('[data-panel="plain"]');const box=await canvas.boundingBox();const beforePan=(await page.evaluate(()=>neuronReview.getState())).rows[0].center;
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.6);await page.mouse.up();
  assert.notDeepEqual((await page.evaluate(()=>neuronReview.getState())).rows[0].center,beforePan);
  await role(first,'peak').click();assert.match(await role(first,'hover-info').textContent(),/Maximum p-Akt \(S473\): 30.5/);assert.equal((await page.evaluate(()=>neuronReview.getState())).rows[0].peakShown,true);
  assert.deepEqual(await counts(first),measurements);
  await role(first,'reset').click();assert.equal((await page.evaluate(()=>neuronReview.getState())).rows[0].zoom,1);
  await page.selectOption('#zoom','4');assert((await page.evaluate(()=>neuronReview.getState())).rows.every(r=>r.zoom===4));await page.click('#reset-view');
  // Editing autosaves; simply viewing the many gallery rows does not.
  await role(first,'mask-review').selectOption('plausible');await role(first,'bright-review').selectOption('uncertain');await role(first,'notes').fill('ISOLATED AUTOMATED TEST: no biological conclusion.');await role(first,'save').click();
  assert.equal(Object.keys(await page.evaluate(()=>neuronReview.exportReviews().reviews)).length,1);
  await page.fill('#display-max','8');await page.click('#apply-settings');assert.match(await role(first,'notes').inputValue(),/ISOLATED AUTOMATED TEST/);assert.deepEqual(await counts(first),measurements);
  // Invalid/incomplete bins do not overwrite the applied settings.
  await page.fill('#bin2','');await page.click('#apply-settings');assert.match(await page.locator('#error').textContent(),/three positive/);assert.deepEqual(await page.evaluate(()=>neuronReview.exportReviews().markers.p_Akt_S473.settings.bins),[1,3,5]);await page.fill('#bin2','3');await page.click('#apply-settings');
  page.once('dialog',d=>d.accept('6'));await page.click('#display-review');assert.equal(await page.locator('#display-max').inputValue(),'6');
  await page.fill('#cutoff','5');await page.fill('#rationale','ISOLATED AUTOMATED TEST: not a production cutoff.');await page.click('#save-cutoff');
  const downloadPromise=page.waitForEvent('download');await page.click('#export-all-markers');const download=await downloadPromise;const backup=path.join(out,'test_only_review_export.json');await download.saveAs(backup);const doc=JSON.parse(fs.readFileSync(backup));assert.equal(doc.markers.p_Akt_S473.cutoff.value,5);assert.equal(Object.keys(doc.reviews).length,1);assert.equal(doc.markers.TrkA.cutoff,null);
  const onePromise=page.waitForEvent('download');await page.click('#export-reviews');const one=await onePromise;const oneDoc=JSON.parse(fs.readFileSync(await one.path()));assert.deepEqual(Object.keys(oneDoc.markers),['p_Akt_S473']);
  await choose(page,'queue','secondary');assert((await rows(page).count())>0);assert(!(await page.evaluate(()=>neuronReview.getState())).queue.includes('N_1_02:685'));await choose(page,'queue','primary');
  await choose(page,'marker','p75NTR');assert.equal(await page.locator('#bin1').inputValue(),'');await choose(page,'marker','p_Akt_S473');assert.equal(await page.locator('#bin3').inputValue(),'5');
  await page.reload();await ready(page);await choose(page,'roi','N_1_02');await choose(page,'marker','p_Akt_S473');assert.match(await role(rows(page).first(),'notes').inputValue(),/ISOLATED AUTOMATED TEST/);
  // Previous tutorial schema remains usable, both in browser storage and through import.
  const legacy={...doc,markers:structuredClone(doc.markers)};delete legacy.markers.p_Akt_S473.display_presets;
  const second=await browser.newContext({viewport:{width:1440,height:1000}});await second.addInitScript(({key,doc})=>localStorage.setItem(key,JSON.stringify(doc)),{key:catalog.dataset_id+':cell-inspection-v1',doc:legacy});const restored=await second.newPage();restored.on('pageerror',e=>errors.push(e.message));await restored.goto(base);await ready(restored);await choose(restored,'roi','N_1_02');await choose(restored,'marker','p_Akt_S473');assert.equal(await restored.locator('#cutoff').inputValue(),'5');assert.match(await role(rows(restored).first(),'notes').inputValue(),/ISOLATED AUTOMATED TEST/);
  await restored.locator('#import-reviews').setInputFiles(backup);assert.match(await restored.locator('#message').textContent(),/Matching backup imported/);
  await restored.locator('#import-reviews').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...doc,dataset_id:'wrong'}))});await restored.waitForFunction(()=>document.querySelector('#error').textContent.includes('not a matching dataset'));assert.equal(await restored.locator('#cutoff').inputValue(),'5');
  // Clean visual sample with exploration settings only, no test assessments.
  const clean=await browser.newContext({viewport:{width:1600,height:1100}}),preview=await clean.newPage();preview.on('pageerror',e=>errors.push(e.message));await preview.goto(base);await ready(preview);await choose(preview,'roi','N_1_02');await choose(preview,'marker','p_Akt_S473');await preview.fill('#display-max','5');for(const [i,v] of ['1','3','5'].entries())await preview.fill('#bin'+(i+1),v);await preview.fill('#threshold','5');await preview.click('#apply-settings');await preview.evaluate(()=>window.scrollTo(0,0));await preview.screenshot({path:path.join(root,'reviewer_preview.png')});
  await preview.setViewportSize({width:430,height:900});assert(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await preview.screenshot({path:path.join(out,'reviewer_mobile.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser_checks.json'),JSON.stringify({status:'passed',checks:['ordered scrolling gallery and blank defaults','independent raw-pixel bin metrics including equality','bin comparison','outline toggles','synchronized zoom/pan and maximum locator','unchanged full-mask metrics after navigation','autosave and viewing does not mark reviewed','invalid-bin rejection','display shortcuts','marker isolation','cutoff and all/single-marker export','secondary queue','reload and previous tutorial schema compatibility','import and mismatched-dataset rejection','desktop and narrow layout','no page errors'],annotation_scope:'Only isolated temporary browser contexts; production annotations untouched.'},null,2));
  console.log('Gallery browser checks passed. Production browser state untouched.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
