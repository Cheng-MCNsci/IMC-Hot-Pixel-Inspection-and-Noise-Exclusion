'use strict';
const assert=require('assert/strict'),{measure}=require('./quantify_marker.cjs');
const rules={minArea:0,globalMarkers:4,smallLimit:10,maxSpreadFraction:.2};
const labels=new Uint32Array([4000000000,4000000000,4000000000,4000000000,4000000000]);
const cell={label:4000000000,cell_id:'R:4000000000',include:true,pixels:5,area_um2:5,small_hot_pixels:1,hot_marker_count:0,large_aggregate_near:false};
const raw=new Float64Array([0,2,5,4,0]);const before=raw.slice();let r=measure(raw,labels,[cell],{value:5,operator:'>='},new Uint8Array([0,0,1,0,0]),rules,5)[0];
assert(r.retained);assert.equal(r.removed_union_pixels,1);assert.equal(r.hot_and_spread_overlap_pixels,1);assert.equal(r.spread_overlap_percent,20);assert.equal(r.retained_pixel_count,4);assert.equal(r.retained_zero_pixels,2);assert.equal(r.mean_after_pixel_removal,1.5);assert.equal(r.asinh_after,Math.asinh(1.5/5));assert.deepEqual(raw,before);
r=measure(raw,labels,[cell],{value:5,operator:'>'},new Uint8Array(5),rules,5)[0];assert.equal(r.hot_pixels,0);assert.equal(r.mean_after_pixel_removal,2.2);
r=measure(raw,labels,[cell],{value:5,operator:'>='},new Uint8Array([0,1,0,1,0]),rules,5)[0];assert.equal(r.first_exclusion_reason,'spread-overlap');assert.equal(r.asinh_after,null);assert.equal(r.removed_union_pixels,3);
r=measure(raw,labels,[{...cell,area_um2:120,hot_marker_count:4}],{value:5,operator:'>='},new Uint8Array(5),{...rules,minArea:120},5)[0];assert.equal(r.first_exclusion_reason,'cross-marker');
r=measure(raw,labels,[{...cell,area_um2:119,hot_marker_count:4}],{value:5,operator:'>='},new Uint8Array(5),{...rules,minArea:120},5)[0];assert.equal(r.first_exclusion_reason,'area');
r=measure(raw,labels,[cell],{value:5,operator:'>='},new Uint8Array([1,1,1,1,1]),{...rules,maxSpreadFraction:1},5)[0];assert.equal(r.first_exclusion_reason,'no-pixels');assert.equal(r.mean_after_pixel_removal,null);
console.log('PASS: union counted once, zeros retained, sparse uint32 labels, threshold equality, exactly20% retained, >20% excluded, exact120 area boundary, exclusion hierarchy, zero-denominator handling, raw immutability.');
// Exercise the complete CLI contract when all cells fail eligibility.
const fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),{run}=require('./quantify_marker.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'imc-quantify-contract-'));
try {
 const json=(file,value)=>fs.writeFileSync(path.join(tmp,file),JSON.stringify(value));
 const asset=(file,array)=>{const b=Buffer.from(array.buffer);fs.writeFileSync(path.join(tmp,file),zlib.gzipSync(b));return crypto.createHash('sha256').update(b).digest('hex');};
 const labelHash=asset('labels.gz',new Uint32Array([7,7,7])),rawHash=asset('raw.gz',new Float64Array([0,2,5]));
 const cat={dataset_id:'synthetic-contract',rois:[{roi:'R',condition:'test',sample:'S',width:3,height:1,pixel_size_x_um:1,pixel_size_y_um:1,label_asset:'labels.gz',labels_sha256:labelHash,channels:{A:{asset:'raw.gz',raw_sha256:rawHash}},cells:[{label:7,cell_id:'R:7',include:true,area_um2:3}]}]};
 const cfg={marker_id:'A',required_markers:['A'],cutoffs:{A:{value:5,operator:'>='}},rules:{largePixels:20,minArea:120,smallLimit:10,globalMarkers:4,largeGap:10,maxSpreadFraction:.2},cofactor:5,background_subtraction:false};
 const mask={schema_version:1,export_type:'imc-quantification-spread-union',dataset_id:cat.dataset_id,marker_id:'A',hot_cutoff:{value:5,operator:'>='},review_scope:'Synthetic fixture; explicitly no adopted spread.',masks:[]};
 json('catalog.json',cat);json('config.json',cfg);json('spread.json',mask);
 const args=['catalog.json','config.json','spread.json'].map(f=>path.join(tmp,f)),out=path.join(tmp,'result');
 const result=run(...args,out);assert.equal(result.length,1);assert.equal(result[0].retained,false);
 const retained=fs.readFileSync(path.join(out,'retained_cells.csv'),'utf8');assert.equal(retained.trim().split('\n').length,1);assert(retained.startsWith('roi,condition,'));assert.equal(JSON.parse(fs.readFileSync(path.join(out,'run_manifest.json'))).retained_neurons,0);
 assert.throws(()=>run(...args,out),/Output already exists/);
 json('spread.json',{...mask,dataset_id:'wrong'});assert.throws(()=>run(...args,path.join(tmp,'bad-mask')),/reviewed-mask union/);assert(!fs.existsSync(path.join(tmp,'bad-mask')));json('spread.json',mask);
 json('spread.json',{...mask,hot_cutoff:{value:6,operator:'>='}});assert.throws(()=>run(...args,path.join(tmp,'stale-cutoff')),/same hot cutoff/);json('spread.json',mask);
 json('config.json',{...cfg,cutoffs:{}});assert.throws(()=>run(...args,path.join(tmp,'bad-cutoffs')),/cutoffs/);json('config.json',cfg);
 cat.rois[0].cells[0].include=false;json('catalog.json',cat);assert.throws(()=>run(...args,path.join(tmp,'empty')),/No included cells/);assert(!fs.existsSync(path.join(tmp,'empty')));
 console.log('PASS: all-excluded run writes a header-only retained CSV and complete audit; no-population, mismatched masks, missing cutoffs and overwrite requests fail safely.');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
