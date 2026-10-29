'use strict';
const assert=require('node:assert/strict');
const E=require('../interface/aggregate_engine.js');
// Threshold equality and diagonal 8-connectivity, isolated components and unchanged raw data.
const raw=Float64Array.from([5,0,0,0,6,0,0,0,9]), original=raw.slice();
assert.equal(E.components(raw,3,3,{value:5,operator:'>='}).components[0].count,3);
assert.equal(E.components(raw,3,3,{value:5,operator:'>'}).components[0].count,2);
assert.deepEqual(raw,original);
const r={...E.defaults,largePixels:2,minArea:2,smallLimit:0,globalMarkers:2,largeGap:2};
const labels=Uint32Array.from([7,7,0,0,0,0,0,0,0,0,0,0,4000000000,0,0]);
const a=Float64Array.from([10,10,0,0,10,0,0,0,0,0,0,0,0,0,0]);
const metadata=[{label:7,cell_id:'R:7',include:true,area_um2:2},{label:4000000000,cell_id:'R:4000000000',include:false,area_um2:1}];
const parts=E.components(a,5,3,{value:10,operator:'>='});assert.deepEqual(parts.components.map(c=>c.count),[2,1]);
const out=E.inspect(parts,labels,5,3,1,1,metadata,r,0,new Map(),false);
assert.deepEqual(out.cells[0].flags,['large-gap','no-pixels','cross-marker-pending']);
assert.equal(out.cells[0].small_hot_pixels,0);assert.deepEqual(out.cells[1].flags,[]);
assert.equal(out.components[0].nearby[0].relation,'overlap');
// Distances between pixel squares with unequal calibration, touching corners, and exact strict limit.
for(const [ia,ib,sx,sy,expected] of [[0,1,1,1,0],[0,6,1,1,0],[0,3,2,3,4],[0,12,.5,2,Math.hypot(.5,2)]]){
 const aa={edge:[ia]},bb={edge:[ib]};const d=E.exactGap(aa,bb,5,sx,sy);assert.ok(Math.abs(d.gap-expected)<1e-12);assert.ok(Math.abs(Math.hypot((d.cellPoint[0]-d.aggregatePoint[0])*sx,(d.cellPoint[1]-d.aggregatePoint[1])*sy)-expected)<1e-12);
}
assert.deepEqual(E.flags({include:true,area_um2:120,small_hot_pixels:10,hot_marker_count:3,remaining_pixels:1},E.defaults,true),[]);
assert.deepEqual(E.flags({include:true,area_um2:119,small_hot_pixels:11,hot_marker_count:4,remaining_pixels:0,large_aggregate_near:true},E.defaults,false),['area','small-hot','cross-marker','large-gap','no-pixels']);
// Exact gap == limit is retained, although included in table at radius == limit.
const l=Uint32Array.from([7,0,0,0]),vals=Float64Array.from([0,0,0,10]);
const t=E.inspect(E.components(vals,4,1,{value:10,operator:'>='}),l,4,1,1,1,[{label:7,include:true,area_um2:1}],{...r,largePixels:1},2,new Map(),true);
assert.equal(t.cells[0].large_aggregate_near,false);assert.equal(t.components[0].nearby[0].gap_um,2);
// Independent exhaustive geometry comparison for 200 deterministic random sets.
let seed=197;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
for(let trial=0;trial<200;trial++){const aa={edge:Array.from({length:40},()=>Math.floor(rnd()*400))},bb={edge:Array.from({length:30},()=>Math.floor(rnd()*400))},sx=.3+3*rnd(),sy=.3+3*rnd();let expected=Infinity;for(const i of aa.edge)for(const j of bb.edge)expected=Math.min(expected,Math.hypot(Math.max(Math.abs(i%20-j%20)-1,0)*sx,Math.max(Math.abs(Math.floor(i/20)-Math.floor(j/20))-1,0)*sy));assert.ok(Math.abs(E.exactGap(aa,bb,20,sx,sy).gap-expected)<1e-12);}
console.log('PASS: threshold equality, 8-connectivity, sparse labels, overlap/touch, calibrated gaps, strict flag boundaries, incomplete cross-marker flags, immutable pixels, 200 exhaustive geometry comparisons.');
