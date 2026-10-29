/* Independent geometry and export contracts; no browser or source data writes. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'../interface'),Engine=require(path.join(root,'aggregate_engine.js'));
const messages=[],ctx=vm.createContext({self:{},importScripts(){},AggregateEngine:Engine,postMessage:m=>messages.push(m),Float64Array,Uint32Array,Uint8Array,Math});
vm.runInContext(fs.readFileSync(path.join(root,'spread_worker.js'),'utf8'),ctx);
const w=90,h=35,raw=new Float64Array(w*h),labels=new Uint32Array(w*h);for(let x=0;x<70;x++)raw[5*w+x]=10;for(let y=5;y<15;y++)for(let x=0;x<12;x++)raw[y*w+x]=10;labels[6*w+3]=4000000000;const before=raw.slice(),parts=Engine.components(raw,w,h,{value:10,operator:'>='});
ctx.fixture={roi:{width:w,height:h,pixel_size_x_um:.5,pixel_size_y_um:2},raw,labels,context:null,parts};vm.runInContext('source=fixture',ctx);
(async()=>{await ctx.self.onmessage({data:{type:'crop',request_id:1,anchor:parts.components[0].anchor,radius:10}});const d=messages.at(-1).data;assert(d);assert.equal(d.core.reduce((a,b)=>a+b,0),parts.components[0].count);assert(d.labels.includes(4000000000));assert.deepEqual(raw,before);
for(let i=0;i<d.raw.length;i+=17){const x=i%d.width+d.ox,y=Math.floor(i/d.width)+d.oy;const expect=Math.min(...Array.from(parts.components[0].pixels,j=>Math.hypot(Math.max(Math.abs(j%w-x)-.5,0)*.5,Math.max(Math.abs(Math.floor(j/w)-y)-.5,0)*2)));assert(Math.abs(d.distance[i]-expect)<1e-10);const valid=x>=0&&y>=0&&x<w&&y<h;assert.equal(!!d.valid[i],valid);if(valid)assert.equal(d.raw[i],raw[y*w+x]);}
console.log('PASS: anisotropic distances against brute-force core rectangles, full asymmetric core, ROI padding, uint32 labels, immutable raw arrays.');})().catch(e=>{console.error(e);process.exitCode=1;});
