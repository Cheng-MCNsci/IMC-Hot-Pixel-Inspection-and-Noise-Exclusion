// Maintainer check: independent synthetic pixels and unequal XY calibration.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const catalog={schema_version:1,dataset_name:'Independent anisotropic fixture',dataset_id:'fixture-only',intensity_provenance:'Synthetic known pixels',mask_semantics:'Sparse handwritten IDs',context_marker_id:null,channels:[{marker_id:'A',marker:'Marker A',channel:'X1'}],rois:[{roi:'R1',width:4,height:2,pixel_size_x_um:.5,pixel_size_y_um:2,label_asset:'fixture_labels.gz',cells:[{label:7,cell_id:'R1:7',pixels:3,area_um2:3,cx:2,cy:0,include:true},{label:4000000000,cell_id:'R1:4000000000',pixels:2,area_um2:2,cx:1.5,cy:1,include:true}],channels:{A:{asset:'fixture_raw.gz',preview_max:8,measurements:[{mask_label:7,raw_mean:4,raw_sum:12,raw_max:6},{mask_label:4000000000,raw_mean:1.5,raw_sum:3,raw_max:3}]}}}]};
 await ctx.route('**/catalog.json',r=>r.fulfill({json:catalog}));
 await ctx.route('**/fixture_raw.gz',r=>r.fulfill({body:zlib.gzipSync(Buffer.from(new Float64Array([0,1,5,6,2,3,0,8]).buffer))}));
 await ctx.route('**/fixture_labels.gz',r=>r.fulfill({body:zlib.gzipSync(Buffer.from(new Uint32Array([0,7,7,7,0,4000000000,4000000000,0]).buffer))}));
 await page.goto('http://127.0.0.1:8788/example/review/');await page.waitForFunction(()=>window.neuronReview&&!neuronReview.getState().loading);
 for(const [i,v] of ['1','3','5'].entries())await page.fill('#bin'+(i+1),v);await page.fill('#threshold','5');await page.click('#apply-settings');
 const row=page.locator('#neuron-list .neuron-row').first();assert.match(await row.locator('[data-role="context-title"]').textContent(),/No context channel/);
 const values=await row.locator('[data-role="bin-table"] tr').evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));assert.equal(values[5][4],'4');assert.equal(values[6][1],'1');assert.equal(values[6][4],'2');
 await page.locator('.tutorial-notes summary').click();await page.selectOption('#crop','30');await row.locator('[data-role="zoom"]').selectOption('4');await row.scrollIntoViewIfNeeded();
 const can=row.locator('[data-panel="plain"]');const b=await can.boundingBox(),before=(await page.evaluate(()=>neuronReview.getState())).rows[0].center;
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+30,b.y+b.height/2+30);await page.mouse.up();
 const after=(await page.evaluate(()=>neuronReview.getState())).rows[0].center;assert(Math.abs(after.x-before.x+30/b.width*15)<1e-6);assert(Math.abs(after.y-before.y+30/b.height*3.75)<1e-6);
 await row.locator('[data-role="peak"]').click();assert.deepEqual((await page.evaluate(()=>neuronReview.getState())).rows[0].center,{x:3.5,y:.5});
 await page.selectOption('#queue','all');assert.equal(await page.locator('#neuron-list .neuron-row').count(),2);assert.equal(await page.locator('#neuron-list .neuron-row').nth(1).getAttribute('data-cell-id'),'R1:4000000000');
 assert.deepEqual(errors,[]);
 const result=JSON.parse(fs.readFileSync(path.join(root,'validation/browser_checks.json')));result.checks.push('independent anisotropic fixture: no context, sparse uint32 labels, zero-inclusive means, strict threshold and calibrated pan/peak');fs.writeFileSync(path.join(root,'validation/browser_checks.json'),JSON.stringify(result,null,2));
 console.log('Independent portable-data fixture passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
