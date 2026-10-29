'use strict';
const assert=require('node:assert/strict'),E=require('../interface/spread_engine.js');
assert.equal(E.defaults(100).brightThreshold,75);assert.equal(E.defaults(5).brightThreshold,3.75);assert.ok(E.validConfig(E.defaults(5)));assert.ok(!E.validConfig({...E.defaults(5),width:0}));
const cfg={...E.defaults(100),brightThreshold:75},ranges={bright_fraction:{low:0,high:20}};
const rows=bright=>bright.map((v,b)=>({band:b,from_um:b*5,to_um:(b+1)*5,n:100,expected:100,positive:100,bright:v,biological:100,eligible:true,state:v>20?'excess':'compatible'}));
assert.equal(E.classifySequence(rows([80,70,15,10,5,5]),cfg,true,ranges).endpoint_um,10);
assert.equal(E.classifySequence(rows([10,10,5,5]),cfg,true,ranges).status,'no_near_core_excess');
assert.equal(E.classifySequence(rows([80,70,15,10,60,60]),cfg,true,ranges).status,'unresolved');
assert.equal(E.classifySequence(rows([80,70,15,10,60,0]),cfg,true,ranges).later_excess,true);
assert.equal(E.classifySequence(rows([80,70,15,10]),cfg,false,ranges).status,'reference_unavailable');
const poor=rows([80,70,15,10]);poor[2].eligible=false;assert.equal(E.classifySequence(poor,cfg,true,ranges).status,'unresolved');
// All pixels can be nonzero/inside cell masks. Neither observation vetoes a bright-fraction endpoint.
const n=2500,d={width:50,height:50,sx:1,sy:1,ox:0,oy:0,raw:new Float64Array(n).fill(1),valid:new Uint8Array(n).fill(1),core:new Uint8Array(n),background:new Uint8Array(n),distance:new Float64Array(n).fill(99),angle:new Float64Array(n).fill(270),referenceSelected:new Uint8Array(n)};
for(let i=0;i<1000;i++)d.referenceSelected[i]=1;
for(let b=0;b<6;b++)for(let k=0;k<100;k++){const i=1000+b*100+k;d.distance[i]=b*5+1;d.raw[i]=k<[80,70,0,0,0,0][b]?75:1;}
const original=d.raw.slice(),a=E.analyze(d,{...cfg,radius:30},cfg);assert.equal(a.sectors[0].endpoint_um,10);assert.equal(a.candidateMask.reduce((a,b)=>a+b),200);assert.equal(a.reference.ranges.density.high,100);assert.deepEqual(d.raw,original);
// Core and outside-image pixels never enter automatic candidates; missing reference yields no candidate.
d.core[1000]=1;d.valid[1001]=0;const b=E.analyze(d,{...cfg,radius:30},cfg);assert.equal(b.candidateMask[1000],0);assert.equal(b.candidateMask[1001],0);d.referenceSelected.fill(0);assert.equal(E.analyze(d,cfg,cfg).candidateMask.some(Boolean),false);
// Polygon union, zeros, ROI origins, and unequal X/Y physical reference patch dimensions.
const q={width:40,height:10,sx:.5,sy:2,ox:100,oy:200,raw:new Float64Array(400),valid:new Uint8Array(400).fill(1),core:new Uint8Array(400),background:new Uint8Array(400),distance:new Float64Array(400).fill(99),angle:new Float64Array(400)};
q.referenceSelected=E.referenceRaster([[[100,200],[140,200],[140,210],[100,210]],[[100,200],[140,200],[140,210],[100,210]]],q);assert.equal(q.referenceSelected.reduce((a,b)=>a+b),400);
const c=E.analyze(q,cfg,{...cfg,minimumPatches:4});assert.equal(c.reference.patches.length,4);assert.ok(c.reference.patches.every(p=>p.n===100));assert.equal(c.reference.pixel_count,400);assert.equal(c.reference.ranges.bright_fraction.low,0);assert.equal(c.reference.ranges.bright_fraction.high,5);
console.log('PASS: 75% default, bright threshold equality, sustained endpoints, later excess, missing reference/coverage, core/padding exclusion, density independence, immutable raw pixels, polygon union, rectangular anisotropic reference patches.');
