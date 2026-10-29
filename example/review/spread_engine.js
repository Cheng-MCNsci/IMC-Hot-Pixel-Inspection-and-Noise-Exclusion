/* Pure, deterministic endpoint calculations; no source pixels are changed. */
(function(root){
const quantile=(a,q)=>{const v=[...a].sort((x,y)=>x-y),p=(v.length-1)*q,k=Math.floor(p);return v[k]+(v[Math.min(k+1,v.length-1)]-v[k])*(p-k)};
function classifySequence(rows,cfg,referenceOK=true,ranges=null){
 if(!referenceOK)return {status:'reference_unavailable',endpoint_um:null};
 const near=rows.filter(r=>r.from_um<cfg.seedDistance);
 const n=near.reduce((a,r)=>a+r.n,0),expected=near.reduce((a,r)=>a+r.expected,0);
 if(n<cfg.minPixels||!expected||100*n/expected<cfg.minCoverage)return {status:'insufficient_near_core_pixels',endpoint_um:null};
 const seed={pixels:n,density:100*near.reduce((a,r)=>a+r.positive,0)/n,bright_fraction:100*near.reduce((a,r)=>a+r.bright,0)/n,biological_fraction:100*near.reduce((a,r)=>a+r.biological,0)/n};
 if(seed.bright_fraction<=ranges.bright_fraction.high)return {status:'no_near_core_excess',endpoint_um:null,seed};
 const start=near.find(r=>r.state==='excess')||near[0];
 for(let k=start.band+1;k<=rows.length-cfg.consecutive;k++){
  const run=rows.slice(k,k+cfg.consecutive);
  if(!run.every(r=>r.eligible&&r.state==='compatible'))continue;
  let laterRun=0,laterSustained=false;
  for(const r of rows.slice(k+cfg.consecutive)){laterRun=r.eligible&&r.state==='excess'?laterRun+1:0;if(laterRun>=2)laterSustained=true}
  if(laterSustained)continue;
  const endN=run.reduce((a,r)=>a+r.n,0),endDensity=100*run.reduce((a,r)=>a+r.positive,0)/endN,endBright=100*run.reduce((a,r)=>a+r.bright,0)/endN;
  if(endBright>=seed.bright_fraction)continue;
  return {status:'endpoint_found',endpoint_um:rows[k].from_um,start_band:start.band,seed,confirmation_bands:run.map(r=>r.band),later_excess:rows.slice(k+cfg.consecutive).some(r=>r.state==='excess')};
 }
 return {status:'unresolved',endpoint_um:null,start_band:start.band,seed};
}
function analyze(data,settings,cfg){
 const {raw,valid,core,background,distance,angle,referenceSelected}=data;
 const w=data.width||data.size,sx=data.sx||1,sy=data.sy||1;
 const patch=cfg.patchSize||10,minPatches=cfg.minimumPatches||8;
 const count=settings.sectorCount||16,step=360/count;
 const patchCols=Math.ceil(w*sx/patch),patchId=i=>Math.floor(Math.floor(i/w)*sy/patch)*patchCols+Math.floor((i%w)*sx/patch);
 const direction=i=>Math.floor((((angle[i]-settings.rotation+90)%360)+360)%360/step);
 const refMask=new Uint8Array(raw.length),candidate=new Uint8Array(raw.length),patches=new Map(),unresolved=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++){
  if(!valid[i]||!referenceSelected?.[i])continue;
  refMask[i]=1;const key=patchId(i);
  if(!patches.has(key))patches.set(key,{id:key,n:0,positive:0,bright:0});
  const p=patches.get(key);p.n++;p.positive+=raw[i]>0?1:0;p.bright+=raw[i]>=cfg.brightThreshold?1:0;
 }
 const referencePatches=[...patches.values()].filter(p=>p.n>=cfg.referenceMinPixels).map(p=>({...p,density:100*p.positive/p.n,bright_fraction:100*p.bright/p.n}));
 const accepted=new Set(referencePatches.map(p=>p.id));for(let i=0;i<refMask.length;i++){const key=patchId(i);if(!accepted.has(key))refMask[i]=0}
 const ok=referencePatches.length>=minPatches;
 const ranges=ok?Object.fromEntries(['density','bright_fraction'].map(key=>[key,{low:Math.max(0,quantile(referencePatches.map(p=>p[key]),(100-cfg.centralRange)/200)-cfg.tolerance),high:Math.min(100,quantile(referencePatches.map(p=>p[key]),1-(100-cfg.centralRange)/200)+cfg.tolerance)}])):null;
 const sectors=Array.from({length:count},(_,s)=>({sector:s,center_degrees:(s*step+step/2-90+settings.rotation+360)%360,rows:Array.from({length:Math.ceil(settings.radius/settings.width)},(_,b)=>({band:b,from_um:b*settings.width,to_um:Math.min((b+1)*settings.width,settings.radius),expected:0,acquired:0,n:0,positive:0,bright:0,biological:0}))}));
 for(let i=0;i<raw.length;i++){
  if(core[i]||distance[i]>=settings.radius)continue;
  const r=sectors[direction(i)].rows[Math.floor(distance[i]/settings.width)];r.expected++;
  if(!valid[i])continue;r.acquired++;if(!background[i])r.biological++;
  r.n++;r.positive+=raw[i]>0?1:0;r.bright+=raw[i]>=cfg.brightThreshold?1:0;
 }
 for(const s of sectors){
  for(const r of s.rows){r.coverage=r.expected?100*r.acquired/r.expected:0;r.background_fraction=r.acquired?100*(r.n-r.biological)/r.acquired:0;r.density=r.n?100*r.positive/r.n:null;r.bright_fraction=r.n?100*r.bright/r.n:null;r.eligible=r.n>=cfg.minPixels&&r.coverage>=cfg.minCoverage;
   r.state=!r.eligible?'insufficient':!ok?'reference_unavailable':r.bright_fraction>ranges.bright_fraction.high?'excess':r.bright_fraction>=ranges.bright_fraction.low?'compatible':'below_reference';
  }
  Object.assign(s,classifySequence(s.rows,cfg,ok,ranges));
 }
 for(let i=0;i<raw.length;i++){if(!valid[i]||core[i])continue;const s=sectors[direction(i)];if(s.status==='endpoint_found'&&distance[i]<s.endpoint_um)candidate[i]=1;if(s.status==='unresolved'&&distance[i]<settings.radius)unresolved[i]=1}
 for(const s of sectors){const rows=s.rows.filter(r=>s.endpoint_um===null||r.from_um<s.endpoint_um),n=rows.reduce((a,r)=>a+r.n,0);s.biological_fraction=n?100*rows.reduce((a,r)=>a+r.biological,0)/n:null}
 return {config:cfg,reference:{available:ok,patch_size_um:patch,minimum_patches:minPatches,patches:referencePatches,pixel_count:referencePatches.reduce((n,p)=>n+p.n,0),ranges},sectors,referenceMask:refMask,candidateMask:candidate,unresolvedMask:unresolved};
}
function defaults(cutoff){return {brightThreshold:.75*cutoff,width:5,radius:60,seedDistance:10,consecutive:2,minPixels:15,minCoverage:50,referenceMinPixels:10,patchSize:10,minimumPatches:8,centralRange:90,tolerance:5,sectorCount:16,rotation:0};}
function validConfig(c){return c&&c.sectorCount===16&&c.rotation===0&&Number.isFinite(c.brightThreshold)&&c.brightThreshold>0&&Number.isFinite(c.width)&&c.width>=.25&&c.width<=20&&Number.isFinite(c.radius)&&c.radius>=10&&c.radius<=100&&Number.isFinite(c.seedDistance)&&c.seedDistance>=c.width&&c.seedDistance<=c.radius&&Number.isInteger(c.consecutive)&&c.consecutive>=2&&c.consecutive<=5&&Number.isInteger(c.minPixels)&&c.minPixels>=1&&Number.isInteger(c.referenceMinPixels)&&c.referenceMinPixels>=1&&Number.isInteger(c.minimumPatches)&&c.minimumPatches>=1&&Number.isFinite(c.minCoverage)&&c.minCoverage>0&&c.minCoverage<=100&&Number.isFinite(c.patchSize)&&c.patchSize>0&&[90,95,100].includes(c.centralRange)&&Number.isFinite(c.tolerance)&&c.tolerance>=0&&c.tolerance<=25;}
// Drawings are saved in source-ROI pixel coordinates, not display pixels.
function referenceRaster(polygons,data){const mask=new Uint8Array(data.raw.length),w=data.width,h=data.height;for(const poly of polygons){if(poly.length<3)continue;const xs=poly.map(p=>p[0]-data.ox),ys=poly.map(p=>p[1]-data.oy);for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<Math.min(h,Math.ceil(Math.max(...ys)));y++)for(let x=Math.max(0,Math.floor(Math.min(...xs)));x<Math.min(w,Math.ceil(Math.max(...xs)));x++){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=xs[i],yi=ys[i],xj=xs[j],yj=ys[j];if((yi>y+.5)!==(yj>y+.5)&&x+.5<(xj-xi)*(y+.5-yi)/(yj-yi)+xi)inside=!inside;}if(inside&&data.valid[y*w+x])mask[y*w+x]=1;}}return mask;}
root.EndpointAnalysis={analyze,classifySequence,defaults,validConfig,referenceRaster};if(typeof module!=='undefined')module.exports=root.EndpointAnalysis;
})(typeof window!=='undefined'?window:globalThis);
