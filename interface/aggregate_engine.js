/* Pure numerical engine: raw thresholds, 8-connectivity, full-mask geometry.
   Coordinates represent unit pixel squares [x,x+1] × [y,y+1]; XY calibration
   converts their shortest edge gap to µm. No image or label array is changed. */
'use strict';
(function(root){
 const defaults={largePixels:20,minArea:120,smallLimit:10,globalMarkers:4,largeGap:10};
 function validCutoff(c){return c&&Number.isFinite(c.value)&&c.value>0&&['>=','>'].includes(c.operator);}
 function validRules(r){return r&&Number.isInteger(r.largePixels)&&r.largePixels>=1&&Number.isFinite(r.minArea)&&r.minArea>=0&&Number.isInteger(r.smallLimit)&&r.smallLimit>=0&&Number.isInteger(r.globalMarkers)&&r.globalMarkers>=1&&Number.isFinite(r.largeGap)&&r.largeGap>=0;}
 function components(raw,w,h,cutoff){
  if(!validCutoff(cutoff)||raw.length!==w*h)throw Error('Invalid cutoff or image dimensions.');
  const ids=new Uint32Array(raw.length),queue=new Uint32Array(raw.length),hot=v=>cutoff.operator==='>='?v>=cutoff.value:v>cutoff.value;const result=[];
  for(let start=0;start<raw.length;start++){
   if(ids[start]||!hot(raw[start]))continue;
   const id=result.length+1;let read=0,write=1;queue[0]=start;ids[start]=id;let total=0,max=-Infinity,peak=start,minX=w,minY=h,maxX=-1,maxY=-1;
   while(read<write){const i=queue[read++],x=i%w,y=Math.floor(i/w),v=raw[i];total+=v;if(v>max||v===max&&i<peak){max=v;peak=i;}minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const j=yy*w+xx;if(!ids[j]&&hot(raw[j])){ids[j]=id;queue[write++]=j;}}
   }
   const pixels=queue.slice(0,write),edge=[];for(const i of pixels){const x=i%w,y=Math.floor(i/w);if(!x||!y||x===w-1||y===h-1||ids[i-1]!==id||ids[i+1]!==id||ids[i-w]!==id||ids[i+w]!==id)edge.push(i);}
   result.push({id,anchor:start,pixels,edge,count:write,total,maximum:max,mean:total/write,peak,bbox:[minX,minY,maxX,maxY],cx:(minX+maxX+1)/2,cy:(minY+maxY+1)/2});
  }
  result.sort((a,b)=>b.count-a.count||a.anchor-b.anchor);result.forEach((c,i)=>c.rank=i+1);return {ids,components:result};
 }
 function cellGeometry(labels,w,h,metadata){const cells=new Map(metadata.map(c=>[c.label,{...c,pixels:[],edge:[],bbox:[w,h,-1,-1]}]));
  for(let i=0;i<labels.length;i++){const lab=labels[i];if(!lab)continue;const c=cells.get(lab);if(!c)throw Error('Label missing from cell metadata.');const x=i%w,y=Math.floor(i/w);c.pixels.push(i);c.bbox[0]=Math.min(c.bbox[0],x);c.bbox[1]=Math.min(c.bbox[1],y);c.bbox[2]=Math.max(c.bbox[2],x);c.bbox[3]=Math.max(c.bbox[3],y);if(!x||!y||x===w-1||y===h-1||labels[i-1]!==lab||labels[i+1]!==lab||labels[i-w]!==lab||labels[i+w]!==lab)c.edge.push(i);}
  return cells;
 }
 function counts(parts,labels,largePixels){const small=new Map(),hot=new Map();for(const c of parts)for(const i of c.pixels){const lab=labels[i];if(!lab)continue;hot.set(lab,(hot.get(lab)||0)+1);if(c.count<largePixels)small.set(lab,(small.get(lab)||0)+1);}return {small,hot};}
 function boxGap(a,b,sx,sy){return Math.hypot(Math.max(a[0]-b[2]-1,b[0]-a[2]-1,0)*sx,Math.max(a[1]-b[3]-1,b[1]-a[3]-1,0)*sy);}
 function tree(points,w,depth=0){const box=[Infinity,Infinity,-Infinity,-Infinity];for(const i of points){const x=i%w,y=Math.floor(i/w);box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);}if(points.length<=16)return {box,points};const axis=depth%2;points.sort((a,b)=>axis?Math.floor(a/w)-Math.floor(b/w):a%w-b%w);const m=Math.floor(points.length/2);return {box,left:tree(points.slice(0,m),w,depth+1),right:tree(points.slice(m),w,depth+1)};}
 function exactGap(a,b,w,sx,sy){if(!a.tree)a.tree=tree([...a.edge],w);let best=Infinity,pair;
  function query(node,x,y,other){if(boxGap(node.box,[x,y,x,y],sx,sy)>best)return;
   if(node.points){for(const i of node.points){const xx=i%w,yy=Math.floor(i/w),d=Math.hypot(Math.max(Math.abs(xx-x)-1,0)*sx,Math.max(Math.abs(yy-y)-1,0)*sy);if(d<best){best=d;pair=[i,other];}}return;}
   const dl=boxGap(node.left.box,[x,y,x,y],sx,sy),dr=boxGap(node.right.box,[x,y,x,y],sx,sy);if(dl<=dr){query(node.left,x,y,other);if(best>0)query(node.right,x,y,other);}else{query(node.right,x,y,other);if(best>0)query(node.left,x,y,other);}
  }
  for(const i of b.edge){query(a.tree,i%w,Math.floor(i/w),i);if(best===0)break;}
  const [ia,ib]=pair,pa=[ia%w,Math.floor(ia/w)],pb=[ib%w,Math.floor(ib/w)],cellPoint=[],aggregatePoint=[];
  for(let k=0;k<2;k++){if(pa[k]+1<pb[k]){cellPoint.push(pa[k]+1);aggregatePoint.push(pb[k]);}else if(pb[k]+1<pa[k]){cellPoint.push(pa[k]);aggregatePoint.push(pb[k]+1);}else{const mid=(Math.max(pa[k],pb[k])+Math.min(pa[k]+1,pb[k]+1))/2;cellPoint.push(mid);aggregatePoint.push(mid);}}
  return {gap:best,cellPoint,aggregatePoint};
 }
 function flags(c,r,crossComplete){if(!c.include)return [];const f=[];if(c.area_um2<r.minArea)f.push('area');if(c.small_hot_pixels>r.smallLimit)f.push('small-hot');if(c.hot_marker_count>=r.globalMarkers)f.push('cross-marker');if(c.large_aggregate_near)f.push('large-gap');if(c.remaining_pixels===0)f.push('no-pixels');if(!crossComplete&&c.hot_marker_count<r.globalMarkers)f.push('cross-marker-pending');return f;}
 function inspect(current,labels,w,h,sx,sy,metadata,rules,radius,crossCounts=new Map(),crossComplete=false,progress=()=>{}){
  if(!validRules(rules)||!Number.isFinite(radius)||radius<0||!(sx>0&&sy>0))throw Error('Invalid analysis rules or calibration.');
  const cells=cellGeometry(labels,w,h,metadata),ct=counts(current.components,labels,rules.largePixels);
  for(const c of cells.values()){c.hot_pixels=ct.hot.get(c.label)||0;c.small_hot_pixels=ct.small.get(c.label)||0;c.remaining_pixels=c.pixels.length-c.hot_pixels;c.remaining_area=c.remaining_pixels*sx*sy;c.hot_marker_count=crossCounts.get(c.label)||0;c.large_aggregate_near=false;}
  const limit=Math.max(radius,rules.largeGap);
  for(let n=0;n<current.components.length;n++){const comp=current.components[n],overlap=new Map();for(const i of comp.pixels){const lab=labels[i];if(lab){const o=overlap.get(lab)||{n:0,pixel:i};o.n++;overlap.set(lab,o);}}comp.nearby=[];
   for(const c of cells.values()){if(boxGap(c.bbox,comp.bbox,sx,sy)>limit)continue;const o=overlap.get(c.label);const d=o?{gap:0,cellPoint:[o.pixel%w+.5,Math.floor(o.pixel/w)+.5],aggregatePoint:[o.pixel%w+.5,Math.floor(o.pixel/w)+.5]}:exactGap(c,comp,w,sx,sy);if(comp.count>=rules.largePixels&&d.gap<rules.largeGap)c.large_aggregate_near=true;if(d.gap<=radius+1e-10)comp.nearby.push({label:c.label,gap_um:d.gap,relation:o?'overlap':d.gap===0?'touching':'separated',overlap_hot_pixels:o?.n||0,cell_point:d.cellPoint,aggregate_point:d.aggregatePoint});}
   comp.nearby.sort((a,b)=>a.gap_um-b.gap_um||(a.relation==='overlap'?-1:b.relation==='overlap'?1:0)||a.label-b.label);if(n%25===0)progress(n,current.components.length);
  }
  const resultCells=[...cells.values()].map(c=>{const {pixels,edge,tree,...rest}=c;return {...rest,pixels:pixels.length,flags:flags(c,rules,crossComplete)};});return {cells:resultCells,components:current.components,componentLabels:current.ids};
 }
 const api={defaults,validCutoff,validRules,components,cellGeometry,counts,boxGap,exactGap,flags,inspect};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AggregateEngine=api;
})(typeof self!=='undefined'?self:globalThis);
