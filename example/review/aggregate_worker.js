'use strict';
importScripts('aggregate_engine.js?v=d7ac87f2162c');
async function loadArray(url,Type){const r=await fetch(url);if(!r.ok)throw Error(`Cannot load quantitative array: ${r.status}`);return new Type(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
self.onmessage=async event=>{try{const {roi,markerId,cutoffs,required,rules,radius,base,contextId}=event.data,E=AggregateEngine;const status=text=>postMessage({type:'status',text});
 status('Loading full ROI labels…');const labels=await loadArray(new URL(roi.label_asset,base).href,Uint32Array);if(labels.length!==roi.width*roi.height)throw Error('Label dimensions do not match catalog.');
 const missing=required.filter(id=>!E.validCutoff(cutoffs[id])),active=required.filter(id=>E.validCutoff(cutoffs[id])),ids=[...new Set([markerId,...active])];const crossCounts=new Map();let raw,current;
 for(let n=0;n<ids.length;n++){const id=ids[n];status(`Thresholding ${id} (${n+1}/${ids.length})…`);const a=await loadArray(new URL(roi.channels[id].asset,base).href,Float64Array);if(a.length!==labels.length)throw Error('Marker dimensions do not match labels.');const parts=E.components(a,roi.width,roi.height,cutoffs[id]);if(required.includes(id)){const counts=E.counts(parts.components,labels,rules.largePixels);for(const [label,count] of counts.small)if(count>rules.smallLimit)crossCounts.set(label,(crossCounts.get(label)||0)+1);}if(id===markerId){raw=a;current=parts;}}
 status('Measuring shortest gaps using complete masks…');const result=E.inspect(current,labels,roi.width,roi.height,roi.pixel_size_x_um,roi.pixel_size_y_um,roi.cells,rules,radius,crossCounts,missing.length===0,(n,total)=>status(`Measuring aggregate geometry ${n}/${total}…`));
 const context=contextId?await loadArray(new URL(roi.channels[contextId].asset,base).href,Float64Array):null;
 postMessage({type:'result',result:{...result,raw,labels,context,missing,active,required,crossComplete:missing.length===0}},[raw.buffer,labels.buffer,result.componentLabels.buffer,...(context?[context.buffer]:[])]);
 }catch(e){postMessage({type:'error',text:e.message});}};
