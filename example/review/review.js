/* Original-style ordered gallery over portable quantitative TIFF preparations.
   The tutorial's v1 storage identity and review records are retained. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:5}):'Undefined';
  const panels=['plain','th','outline','bins'], palette=['#202020','#0072B2','#56B4E9','#E69F00','#CC79A7'];
  const colors=palette.map(c=>[1,3,5].map(k=>parseInt(c.slice(k,k+2),16)));
  let catalog,store,storageKey,roi,marker,raw,labels,contextRaw,indices,cells=[],queue=[],rows=[],observer,token=0,loading=false,plotPoints=[];
  let comparisonBin=3,globalZoom=1,contextMax=null;
  let maskContours=new Map(),includedLabels=new Set();
  const blank=()=>({settings:{display:null,bins:null,threshold:null},cutoff:null});
  const entry=()=>store.markers[marker.marker_id];
  const key=c=>`${marker.marker_id}::${roi.roi}::${c.label}`;
  const message=t=>{$('message').textContent=t;};
  const fail=e=>{$('error').textContent=e.message||String(e);};
  const clearError=()=>{$('error').textContent='';};
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify(store));$('storage-status').textContent='Saved in this browser at this address. Export JSON for a portable backup.';}catch(e){$('storage-status').textContent='Browser storage is unavailable. Export JSON before leaving this page.';}}
  const settingsValid=s=>s&&(s.display===null||Number.isFinite(s.display)&&s.display>0)&&(s.threshold===null||Number.isFinite(s.threshold)&&s.threshold>=0)&&(s.bins===null||Array.isArray(s.bins)&&s.bins.length===3&&s.bins.every((v,i,a)=>Number.isFinite(v)&&v>0&&(!i||v>a[i-1])));
  const cutoffValid=c=>c===null||c&&Number.isFinite(c.value)&&c.value>0&&['>=','>'].includes(c.operator)&&typeof c.rationale==='string'&&Number.isFinite(Date.parse(c.updated_at));
  function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
  function bind(id,event,fn){$(id).addEventListener(event,async e=>{try{clearError();await fn(e);}catch(err){fail(err);}});}
  async function array(path,Type){const r=await fetch(path);if(!r.ok)throw Error(`Cannot load ${path}: ${r.status}`);return new Type(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
  function restoreControls(){const e=entry();$('display-max').value=e.settings.display??'';[1,2,3].forEach((n,i)=>{$(`bin${n}`).value=e.settings.bins?.[i]??'';});$('threshold').value=e.settings.threshold??'';restoreCutoff();}
  function restoreCutoff(){const c=entry().cutoff;$('cutoff').value=c?.value??'';$('operator').value=c?.operator??'>=';$('rationale').value=c?.rationale??'';$('cutoff-status').textContent=c?`Saved: hot pixels use I ${c.operator} ${fmt(c.value)}. ${c.rationale}`:'No accepted cutoff recorded for this marker.';}
  function stamp(){entry().updated_at=new Date().toISOString();persist();}
  function rangeNames(){const b=entry().settings.bins;return b?['I = 0',`0 < I ≤ ${fmt(b[0])}`,`${fmt(b[0])} < I ≤ ${fmt(b[1])}`,`${fmt(b[1])} < I ≤ ${fmt(b[2])}`,`I > ${fmt(b[2])}`]:[];}
  function binIndex(v){const b=entry().settings.bins;return v===0?0:v<=b[0]?1:v<=b[1]?2:v<=b[2]?3:4;}
  function metrics(c){const b=entry().settings.bins,t=entry().settings.threshold,bins=Array.from({length:5},()=>({count:0,sum:0})),high={count:0,sum:0};
    for(const i of indices.get(c.label)){const v=raw[i];if(b){const x=bins[binIndex(v)];x.count++;x.sum+=v;}if(t!==null&&v>t){high.count++;high.sum+=v;}}
    return {bins,high};
  }
  function updateCount(){const list=Object.values(store.reviews).filter(r=>r.marker_id===marker.marker_id);$('review-count').textContent=`${list.length} cells with saved judgments or notes for this marker · ${list.filter(r=>r.mask_assessment&&r.pixel_assessment).length} with both assessments`;}
  function savedNote(ctx){const r=store.reviews[ctx.key];ctx.role('saved-settings-note').textContent=!r?'':JSON.stringify(r.settings)===JSON.stringify(entry().settings)?`Reviewed with current intensity settings · ${new Date(r.updated_at).toLocaleString()}`:`Saved review used bins ${r.settings.bins?.map(fmt).join(', ')??'not set'}, threshold ${r.settings.threshold===null?'not set':'> '+fmt(r.settings.threshold)}, display ${r.settings.display===null?'auto':fmt(r.settings.display)}. Current settings may differ.`;}
  function saveReview(ctx){const mask=ctx.role('mask-review').value,pixel=ctx.role('bright-review').value,notes=ctx.role('notes').value;
    // Empty fields do not erase an existing assessment implicitly.
    if(!mask&&!pixel&&!notes.trim()){ctx.dirty=false;ctx.role('review-status').textContent=store.reviews[ctx.key]?'Empty edits not saved; previous review retained.':'Not reviewed';return;}
    store.reviews[ctx.key]={marker_id:ctx.marker_id,roi:ctx.roi_id,mask_label:ctx.c.label,cell_id:ctx.c.cell_id,mask_assessment:mask,pixel_assessment:pixel,notes,settings:structuredClone(ctx.draftSettings||entry().settings),updated_at:new Date().toISOString()};
    ctx.dirty=false;ctx.draftSettings=null;persist();ctx.role('review-status').textContent='Saved in this browser.';savedNote(ctx);updateCount();
  }
  function saveDrafts(){for(const ctx of rows)if(ctx.dirty)saveReview(ctx);}
  function renderLegend(){const names=rangeNames();$('legend').replaceChildren();$('comparison-bin').replaceChildren();
    if(!names.length){$('legend').textContent='Set three positive, increasing boundaries to enable intensity bins.';option($('comparison-bin'),'','Set boundaries first');$('comparison-bin').disabled=true;}
    else{names.forEach((name,i)=>{option($('comparison-bin'),i,name);const span=document.createElement('span'),chip=document.createElement('span');chip.className='swatch';chip.style.backgroundColor=palette[i];span.append(chip,document.createTextNode(name));$('legend').append(span);});$('comparison-bin').disabled=false;$('comparison-bin').value=comparisonBin;}
    const cm=catalog.channels.find(c=>c.marker_id===catalog.context_marker_id);
    $('display-note').textContent=`${marker.marker} grayscale: raw 0–${fmt(entry().settings.display??roi.channels[marker.marker_id].preview_max)}${entry().settings.display===null?' (automatic preview)':''}; higher values appear white. ${cm?`${cm.marker}: 0–${fmt(contextMax??roi.channels[cm.marker_id].preview_max)}${contextMax===null?' (automatic preview)':''}. `:''}Yellow outline: ${$('outline-style').value==='visible'?'solid with a dark contrast border':'1 native pixel, 50% opacity'}. Measurements use unchanged raw values.`;
  }
  function metricCard(container,label,value,note){const card=document.createElement('div');card.className='metric';for(const [cl,text] of [['metric-label',label],['metric-value',value],['metric-note',note]]){const el=document.createElement('div');el.className=cl;el.textContent=text;card.append(el);}container.append(card);}
  function contribution(c,r){return [fmt(r.count),fmt(100*r.count/c.pixels)+'%',fmt(r.sum),fmt(r.sum/c.pixels),c.total>0?fmt(100*r.sum/c.total)+'%':'Undefined (zero total)'];}
  function renderMeasurements(ctx){const c=ctx.c,m=metrics(c);ctx.role('metrics').replaceChildren();ctx.role('range-comparison').replaceChildren();ctx.role('bin-table').replaceChildren();
    ctx.role('heading').textContent=`${ctx.rank}. ${c.cell_id} · mean ${fmt(c.mean)} · mean rank ${c.mean_rank} / ${cells.length}`;
    metricCard(ctx.role('metrics'),'Whole-cell mean',fmt(c.mean),'Raw intensity; zeros included');metricCard(ctx.role('metrics'),'Cell area',`${fmt(c.pixels)} pixels`,`${fmt(c.area_um2)} µm²`);metricCard(ctx.role('metrics'),'Maximum pixel',fmt(c.maximum),`x ${c.max_x}, y ${c.max_y}`);
    const ranges=[{kind:'selected-bin',label:entry().settings.bins?`Pixels ${rangeNames()[comparisonBin]}`:'Compare intensity bin · boundaries not set',r:entry().settings.bins?m.bins[comparisonBin]:null},{kind:'above-threshold',label:entry().settings.threshold!==null?`Pixels I > ${fmt(entry().settings.threshold)}`:'High intensity · threshold not set',r:entry().settings.threshold!==null?m.high:null}];
    for(const {kind,label,r} of ranges){const group=document.createElement('section');group.className='range-group';group.dataset.range=kind;const h=document.createElement('h3');h.textContent=label;group.append(h);if(r){const v=contribution(c,r),values=document.createElement('div');values.className='range-values';metricCard(values,'Pixel count',`${v[0]} / ${c.pixels}`,`${v[1]} of cell area`);metricCard(values,'Contribution to mean',v[3],`Of the ${fmt(c.mean)} cell mean`);metricCard(values,'% of total cell signal',v[4],`Range sum ${v[2]} / total ${fmt(c.total)}`);group.append(values);}ctx.role('range-comparison').append(group);}
    function tr(name,r){const row=document.createElement('tr');for(const value of [name,...contribution(c,r)]){const td=document.createElement('td');td.textContent=value;row.append(td);}ctx.role('bin-table').append(row);}
    if(entry().settings.bins)m.bins.forEach((b,i)=>tr(rangeNames()[i],b));tr('Complete cell',{count:c.pixels,sum:c.total});if(entry().settings.threshold!==null)tr(`Exploratory I > ${fmt(entry().settings.threshold)} (overlaps bins)`,m.high);
    ctx.role('formula-note').textContent='All values use the complete original mask, including zero pixels, regardless of crop, zoom or pan. The exploratory range overlaps bins; do not add it to them.';
  }
  function geometry(ctx){const um=Number($('crop').value)/ctx.zoom;return {um,w:um/roi.pixel_size_x_um,h:um/roi.pixel_size_y_um};}
  function boundary(i,lab){const x=i%roi.width,y=Math.floor(i/roi.width);return !x||!y||x===roi.width-1||y===roi.height-1||labels[i-1]!==lab||labels[i+1]!==lab||labels[i-roi.width]!==lab||labels[i+roi.width]!==lab;}
  function maskEdges(lab){
    if(maskContours.has(lab))return maskContours.get(lab);
    const edges=[],w=roi.width,h=roi.height;
    for(const i of indices.get(lab)){const x=i%w,y=Math.floor(i/w);
      if(y===0||labels[i-w]!==lab)edges.push([x,y,x+1,y]);
      if(x===w-1||labels[i+1]!==lab)edges.push([x+1,y,x+1,y+1]);
      if(y===h-1||labels[i+w]!==lab)edges.push([x+1,y+1,x,y+1]);
      if(x===0||labels[i-1]!==lab)edges.push([x,y+1,x,y]);
    }
    maskContours.set(lab,edges);return edges;
  }
  function cropLabels(ctx,g){
    if(!$('all-outlines').checked)return [ctx.c.label];
    const visible=new Set(),left=Math.max(0,Math.floor(ctx.center.x-g.w/2)),right=Math.min(roi.width,Math.ceil(ctx.center.x+g.w/2)),top=Math.max(0,Math.floor(ctx.center.y-g.h/2)),bottom=Math.min(roi.height,Math.ceil(ctx.center.y+g.h/2));
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const lab=labels[y*roi.width+x];if(lab)visible.add(lab);}
    return [...visible];
  }
  function drawMaskContours(ctx,canvas,c,g,visible){
    // Trace the original label edges. Context overlays never alter mask pixels
    // or the population used for the selected cell's measurements.
    const sx=canvas.width/g.w,sy=canvas.height/g.h,left=ctx.center.x-g.w/2,top=ctx.center.y-g.h/2;
    const groups=[{ids:visible.filter(l=>l!==ctx.c.label&&includedLabels.has(l)),color:'#00c8ff',width:1.25},{ids:visible.filter(l=>l!==ctx.c.label&&!includedLabels.has(l)),color:'#ff5ad2',width:1.25},{ids:visible.includes(ctx.c.label)?[ctx.c.label]:[],color:'#ffeb00',width:2}];
    const displayScale=canvas.width/(canvas.getBoundingClientRect().width||canvas.width);
    c.save();c.lineCap='round';c.lineJoin='round';
    for(const group of groups){c.beginPath();for(const lab of group.ids)for(const [x1,y1,x2,y2] of maskEdges(lab)){c.moveTo((x1-left)*sx,(y1-top)*sy);c.lineTo((x2-left)*sx,(y2-top)*sy);}
      c.strokeStyle='#111';c.lineWidth=(group.width+3)*displayScale;c.stroke();c.strokeStyle=group.color;c.lineWidth=group.width*displayScale;c.stroke();
    }
    c.restore();
  }
  function drawImages(ctx){const g=geometry(ctx);ctx.role('crop-note').textContent=`${$('crop').value} × ${$('crop').value} µm base crop · visible ${fmt(g.um)} × ${fmt(g.um)} µm at ${ctx.zoom}× · drag any image to pan all four · checkerboard: outside ROI`;
    if(!ctx.active)return;const size=450,scale=entry().settings.display??roi.channels[marker.marker_id].preview_max,cs=catalog.context_marker_id?(contextMax??roi.channels[catalog.context_marker_id].preview_max):1;
    const images=panels.map(()=>new ImageData(size,size)),visible=cropLabels(ctx,g);
    for(let py=0;py<size;py++)for(let px=0;px<size;px++){
      const x=Math.floor(ctx.center.x-g.w/2+(px+.5)*g.w/size),y=Math.floor(ctx.center.y-g.h/2+(py+.5)*g.h/size),offset=4*(py*size+px),valid=x>=0&&y>=0&&x<roi.width&&y<roi.height,i=y*roi.width+x;
      const v=valid?raw[i]:0,gray=Math.round(255*Math.min(v/scale,1)),own=valid&&labels[i]===ctx.c.label,edge=valid&&labels[i]>0&&(own||$('all-outlines').checked)&&boundary(i,labels[i]),check=(Math.floor(px/10)+Math.floor(py/10))%2?74:92;
      for(let p=0;p<4;p++){let rgb=valid?[gray,gray,gray]:[check,check,check];if(valid&&p===1){const t=Math.round(255*Math.min((contextRaw?.[i]??0)/cs,1));rgb=[t,t,t];}if(valid&&p===3)rgb=own&&entry().settings.bins?colors[binIndex(v)]:[gray*.22,gray*.22,gray*.22];if($('outline-style').value==='subtle'&&edge&&((p===1||p===2)&&$('outlines').checked||p===3&&$('bin-outline').checked))rgb=rgb.map((a,j)=>Math.round(.5*a+.5*(own?[240,228,66]:includedLabels.has(labels[i])?[0,200,255]:[255,90,210])[j]));images[p].data.set([...rgb,255],offset);}
    }
    panels.forEach((name,p)=>{const canvas=ctx.canvas(name);canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.putImageData(images[p],0,0);if($('outline-style').value==='visible'&&((p===1||p===2)&&$('outlines').checked||p===3&&$('bin-outline').checked))drawMaskContours(ctx,canvas,c,g,visible);const bar=g.um/5;c.fillStyle='#fff';c.strokeStyle='#111';c.lineWidth=3;c.font='15px Arial';c.strokeRect(12,size-20,size/5,3);c.fillRect(12,size-20,size/5,3);c.strokeText(`${fmt(bar)} µm`,12,size-27);c.fillText(`${fmt(bar)} µm`,12,size-27);
      if(ctx.peakShown){const x=(ctx.c.max_x+.5-ctx.center.x+g.w/2)/g.w*size,y=(ctx.c.max_y+.5-ctx.center.y+g.h/2)/g.h*size;c.strokeStyle='#00ffff';c.lineWidth=2;c.beginPath();for(const [a,b,d,e] of [[x-13,y,x-4,y],[x+4,y,x+13,y],[x,y-13,x,y-4],[x,y+4,x,y+13]]){c.moveTo(a,b);c.lineTo(d,e);}c.stroke();}
    });ctx.root.dataset.rendered='true';
  }
  function resetRow(ctx,zoom=1){ctx.zoom=zoom;ctx.center={x:ctx.c.cx,y:ctx.c.cy};ctx.peakShown=false;ctx.role('zoom').value=zoom;drawImages(ctx);}
  function deactivate(ctx){ctx.active=false;for(const name of panels){const c=ctx.canvas(name);c.width=c.height=1;}ctx.root.dataset.rendered='false';}
  function createRow(c,i){const root=$('neuron-row-template').content.firstElementChild.cloneNode(true);root.dataset.cellId=c.cell_id;const ctx={root,c,key:key(c),marker_id:marker.marker_id,roi_id:roi.roi,rank:i+1,zoom:globalZoom,center:{x:c.cx,y:c.cy},active:false,peakShown:false,dirty:false,role:name=>root.querySelector(`[data-role="${name}"]`),canvas:name=>root.querySelector(`[data-panel="${name}"]`)};
    const cm=catalog.channels.find(c=>c.marker_id===catalog.context_marker_id);ctx.role('marker-title').textContent=marker.marker;ctx.role('outline-title').textContent=`${marker.marker} + cell outlines`;ctx.role('context-title').textContent=cm?`${cm.marker} + cell outlines`:'No context channel · cell outlines';ctx.role('zoom').value=globalZoom;
    ctx.role('heading').id=`cell-${roi.roi}-${c.label}`;root.setAttribute('aria-labelledby',ctx.role('heading').id);
    const saved=store.reviews[ctx.key];ctx.role('mask-review').value=saved?.mask_assessment??'';ctx.role('bright-review').value=saved?.pixel_assessment??'';ctx.role('notes').value=saved?.notes??'';ctx.role('review-status').textContent=saved?'Saved review loaded.':'Not reviewed';savedNote(ctx);renderMeasurements(ctx);drawImages(ctx);
    ctx.role('zoom').addEventListener('change',()=>{ctx.zoom=Number(ctx.role('zoom').value);drawImages(ctx);});ctx.role('reset').addEventListener('click',()=>resetRow(ctx));ctx.role('peak').addEventListener('click',()=>{ctx.center={x:c.max_x+.5,y:c.max_y+.5};ctx.peakShown=true;drawImages(ctx);ctx.role('hover-info').textContent=`Maximum ${marker.marker}: ${fmt(c.maximum)} at x ${c.max_x}, y ${c.max_y} within this cell (cyan locator).`;});
    for(const name of ['mask-review','bright-review','notes']){const input=ctx.role(name);input.addEventListener('input',()=>{if(!ctx.dirty)ctx.draftSettings=structuredClone(entry().settings);ctx.dirty=true;ctx.role('review-status').textContent='Changes save when you leave this field or select Save review.';});input.addEventListener('change',()=>{ctx.dirty=true;saveReview(ctx);});}
    ctx.role('save').addEventListener('click',()=>saveReview(ctx));
    for(const name of panels){const canvas=ctx.canvas(name);canvas.width=canvas.height=1;let pointer=null;
      canvas.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY,center:{...ctx.center}};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointerup',()=>{pointer=null;});canvas.addEventListener('pointercancel',()=>{pointer=null;});
      canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect(),g=geometry(ctx);if(pointer&&pointer.id===e.pointerId){ctx.center.x=pointer.center.x-(e.clientX-pointer.x)*g.w/rect.width;ctx.center.y=pointer.center.y-(e.clientY-pointer.y)*g.h/rect.height;drawImages(ctx);}const x=Math.floor(ctx.center.x-g.w/2+(e.clientX-rect.left)*g.w/rect.width),y=Math.floor(ctx.center.y-g.h/2+(e.clientY-rect.top)*g.h/rect.height);ctx.role('hover-info').textContent=x<0||y<0||x>=roi.width||y>=roi.height?`x ${x}, y ${y} · outside acquired ROI · no data`:`x ${x}, y ${y} · ${marker.marker} raw ${fmt(raw[y*roi.width+x])} · mask label ${labels[y*roi.width+x]} · ${labels[y*roi.width+x]===c.label?'inside selected cell':'outside selected cell'}`;});
    }return ctx;
  }
  function buildGallery(){observer?.disconnect();for(const ctx of rows)deactivate(ctx);const sorted=[...cells].sort((a,b)=>a.mean_rank-b.mean_rank),top=sorted.slice(0,Math.ceil(.05*sorted.length)),topLabels=new Set(top.map(c=>c.label));
    if($('queue').value==='primary')queue=top;else if($('queue').value==='all')queue=sorted;else queue=sorted.filter(c=>!topLabels.has(c.label)).map(c=>({c,h:metrics(c).high})).filter(x=>x.h.count>0).sort((a,b)=>(b.c.total?b.h.sum/b.c.total:0)-(a.c.total?a.h.sum/a.c.total:0)||a.c.label-b.c.label).map(x=>x.c);
    rows=queue.map(createRow);$('neuron-list').replaceChildren(...rows.map(ctx=>ctx.root));
    $('selection-info').textContent=$('queue').value==='primary'?`All ${queue.length} top-5% cells in ${roi.roi}, shown by decreasing whole-cell mean (${cells.length} selected cells total).`:$('queue').value==='all'?`All ${queue.length} selected cells in ${roi.roi}, shown by decreasing whole-cell mean.`:`${queue.length} additional cells containing pixels I > ${entry().settings.threshold===null?'not set':fmt(entry().settings.threshold)}, ranked by signal contribution; top 5% excluded.`;
    if(!queue.length){const p=document.createElement('p');p.className='empty-gallery';p.textContent='No cells in this list. Set an exploratory high-intensity threshold and apply, or switch review lists.';$('neuron-list').append(p);}
    const map=new Map(rows.map(ctx=>[ctx.root,ctx]));observer=new IntersectionObserver(entries=>{for(const e of entries){const ctx=map.get(e.target);if(!ctx)continue;if(e.isIntersecting){ctx.active=true;drawImages(ctx);}else deactivate(ctx);}},{rootMargin:'350px 0px'});for(const ctx of rows)observer.observe(ctx.root);
    renderLegend();updateCount();drawPlot();
  }
  function repaint(){renderLegend();for(const ctx of rows){renderMeasurements(ctx);drawImages(ctx);savedNote(ctx);}}
  function setBusy(value){loading=value;for(const el of document.querySelectorAll('.controls button,.controls input,.controls select,.controls textarea'))el.disabled=value;if(!value&&marker)$('comparison-bin').disabled=!entry().settings.bins;}
  async function load(){saveDrafts();const mine=++token;setBusy(true);observer?.disconnect();rows=[];$('neuron-list').replaceChildren();message('Loading quantitative pixels…');clearError();
    const r=catalog.rois.find(r=>r.roi===$('roi').value),m=catalog.channels.find(c=>c.marker_id===$('marker').value),context=catalog.context_marker_id;
    try{const a=await Promise.all([array(r.channels[m.marker_id].asset,Float64Array),array(r.label_asset,Uint32Array),context?array(r.channels[context].asset,Float64Array):Promise.resolve(null)]);if(mine!==token)return;
      roi=r;marker=m;[raw,labels,contextRaw]=a;if(raw.length!==r.width*r.height||labels.length!==raw.length||contextRaw&&contextRaw.length!==raw.length)throw Error('Prepared array dimensions are inconsistent. Rebuild this dataset.');
      maskContours=new Map();includedLabels=new Set(r.cells.filter(c=>c.include).map(c=>c.label));indices=new Map(r.cells.map(c=>[c.label,[]]));for(let i=0;i<labels.length;i++)if(labels[i])indices.get(labels[i]).push(i);
      const measured=new Map(r.channels[m.marker_id].measurements.map(c=>[c.mask_label,c]));cells=r.cells.filter(c=>c.include).map(c=>{const p=measured.get(c.label);let peak=indices.get(c.label)[0];for(const i of indices.get(c.label))if(raw[i]>raw[peak])peak=i;return {...c,mean:p.raw_mean,total:p.raw_sum,maximum:p.raw_max,max_x:peak%r.width,max_y:Math.floor(peak/r.width)};}).sort((a,b)=>b.mean-a.mean||a.label-b.label);cells.forEach((c,i)=>{c.mean_rank=i+1;});
      $('page-title').textContent=`Chapter 2 | ${m.marker} cell review`;$('roi-mean-intensity').textContent=`${m.marker} · ${r.roi} · Mean raw intensity: ${fmt(cells.length?cells.reduce((a,c)=>a+c.mean,0)/cells.length:NaN)} · All ${cells.length} selected cells (average of whole-cell means; zero-intensity pixels included).`;
      restoreControls();buildGallery();message(`${r.roi}: ${cells.length} selected cells. Original masks and quantitative pixels retained.`);
    }finally{if(mine===token)setBusy(false);}
  }
  function applySettings(){saveDrafts();const texts=[1,2,3].map(i=>$(`bin${i}`).value),bins=texts.every(x=>x==='')?null:texts.map(x=>x===''?NaN:Number(x)),s={display:$('display-max').value===''?null:Number($('display-max').value),threshold:$('threshold').value===''?null:Number($('threshold').value),bins};if(!settingsValid(s))throw Error('Use a positive display maximum, a nonnegative high-intensity threshold, and three positive, increasing bin boundaries. Leave all three bin fields blank to disable bins.');const old=entry().settings.threshold;entry().settings=s;stamp();if($('queue').value==='secondary'&&old!==s.threshold)buildGallery();else repaint();message('Exploration settings saved. Accepted cutoff is unchanged.');}
  function displayPreset(name){const saved=entry().display_presets?.[name],value=window.prompt(`Set the ${name} display maximum for ${marker.marker}. This affects brightness only.`,saved??entry().settings.display??'');if(value===null)return;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error('Enter a positive display maximum.');saveDrafts();entry().display_presets={...entry().display_presets,[name]:n};entry().settings.display=n;stamp();$('display-max').value=n;repaint();}
  function exportDoc(only){const doc={...store,exported_at:new Date().toISOString(),dataset_name:catalog.dataset_name,channel_mapping:catalog.channels,scope:'Inspection settings, cell assessments and working cutoffs only; no final exclusions or corrections applied.'};if(only){doc.markers={[marker.marker_id]:entry()};doc.reviews=Object.fromEntries(Object.entries(store.reviews).filter(([,r])=>r.marker_id===marker.marker_id));}return doc;}
  function exportReviews(only=false){saveDrafts();const url=URL.createObjectURL(new Blob([JSON.stringify(exportDoc(only),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${catalog.dataset_id}_${only?marker.marker_id:'all_markers'}_cell_reviews.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Exported settings, cutoff decisions and saved reviews.');}
  async function importReviews(event){const file=event.target.files[0];if(!file)return;try{const doc=JSON.parse(await file.text());if(doc.schema_version!==1||doc.export_type!=='imc-cell-inspection'||doc.dataset_id!==catalog.dataset_id||!doc.markers||!doc.reviews)throw Error('This is not a matching dataset review export.');saveDrafts();const next=structuredClone(store);
      for(const [mid,e] of Object.entries(doc.markers)){if(!next.markers[mid]||!settingsValid(e.settings)||!cutoffValid(e.cutoff))throw Error(`Invalid imported marker settings: ${mid}`);if(e.display_presets&&Object.values(e.display_presets).some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid display preset.');if(e.updated_at&&!Number.isFinite(Date.parse(e.updated_at)))throw Error('Invalid settings timestamp.');if(Date.parse(e.updated_at||0)>Date.parse(next.markers[mid].updated_at||0))next.markers[mid]=e;}
      for(const [k,r] of Object.entries(doc.reviews)){const rr=catalog.rois.find(x=>x.roi===r.roi);if(!next.markers[r.marker_id]||!rr?.cells.some(c=>c.label===r.mask_label&&c.include)||k!==`${r.marker_id}::${r.roi}::${r.mask_label}`||r.cell_id!==`${r.roi}:${r.mask_label}`||!settingsValid(r.settings)||!Number.isFinite(Date.parse(r.updated_at))||typeof r.notes!=='string'||!['','plausible','problematic','uncertain'].includes(r.mask_assessment)||!['','plausible','artifact','uncertain'].includes(r.pixel_assessment))throw Error('Invalid imported cell review.');if(!next.reviews[k]||Date.parse(r.updated_at)>Date.parse(next.reviews[k].updated_at))next.reviews[k]=r;}
      store=next;persist();restoreControls();buildGallery();message('Matching backup imported; newer settings and cell records retained.');
    }finally{event.target.value='';}
  }
  function drawPlot(){const canvas=$('distribution'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const max=Math.max(...cells.map(c=>Math.asinh(c.mean/5)),.001);ctx.font='12px Arial';ctx.fillStyle='#536575';for(let i=0;i<=4;i++){const y=220-i*200/4;ctx.fillText(fmt(i*max/4),2,y+4);ctx.fillStyle='#edf2f5';ctx.fillRect(65,y,915,1);ctx.fillStyle='#536575';}ctx.fillText('Cell rank by raw mean →',390,250);plotPoints=cells.map((c,i)=>({c,x:70+(cells.length===1?0:i/(cells.length-1))*900,y:220-Math.asinh(c.mean/5)/max*200}));ctx.fillStyle='#145da0';for(const p of plotPoints){ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();}}
  async function init(){if(location.protocol==='file:')throw Error('Start the supplied local server and use its http://127.0.0.1 address.');if(!window.DecompressionStream)throw Error('This browser needs DecompressionStream support.');const response=await fetch('catalog.json');if(!response.ok)throw Error('catalog.json is missing. Run prepare_dataset.py.');catalog=await response.json();storageKey=`${catalog.dataset_id}:cell-inspection-v1`;const empty={schema_version:1,export_type:'imc-cell-inspection',dataset_id:catalog.dataset_id,markers:Object.fromEntries(catalog.channels.map(c=>[c.marker_id,blank()])),reviews:{}};
    try{store=JSON.parse(localStorage.getItem(storageKey))||empty;}catch(e){store=empty;}for(const c of catalog.channels)store.markers[c.marker_id]??=blank();
    $('dataset').textContent=catalog.dataset_name;$('provenance').textContent=`Intensities: ${catalog.intensity_provenance} Masks: ${catalog.mask_semantics} Review population follows the include column in cell metadata; the supplied teaching example selects neurons.`;
    for(const c of catalog.channels)option($('marker'),c.marker_id,c.marker);for(const r of catalog.rois)option($('roi'),r.roi,r.roi);
    bind('marker','change',load);bind('roi','change',load);bind('queue','change',()=>{saveDrafts();buildGallery();});bind('apply-settings','click',applySettings);
    for(const id of ['display-max','threshold','bin1','bin2','bin3'])bind(id,'keydown',e=>{if(e.key==='Enter')applySettings();});
    bind('comparison-bin','change',()=>{comparisonBin=Number($('comparison-bin').value);for(const ctx of rows)renderMeasurements(ctx);});
    bind('display-original','click',()=>displayPreset('original'));bind('display-review','click',()=>displayPreset('review'));
    for(const id of ['outlines','bin-outline','outline-style','all-outlines'])bind(id,'change',()=>{renderLegend();for(const ctx of rows)drawImages(ctx);});
    bind('zoom','change',()=>{globalZoom=Number($('zoom').value);for(const ctx of rows){ctx.zoom=globalZoom;ctx.role('zoom').value=globalZoom;drawImages(ctx);}});
    bind('reset-view','click',()=>{globalZoom=1;$('zoom').value=1;for(const ctx of rows)resetRow(ctx);});bind('crop','change',()=>{for(const ctx of rows)resetRow(ctx,globalZoom);});
    bind('apply-context','click',()=>{const t=$('context-max').value,n=t===''?null:Number(t);if(n!==null&&(!Number.isFinite(n)||n<=0))throw Error('Use a positive context display maximum or leave it blank for auto contrast.');contextMax=n;renderLegend();for(const ctx of rows)drawImages(ctx);});
    bind('save-cutoff','click',()=>{const c={value:Number($('cutoff').value),operator:$('operator').value,rationale:$('rationale').value.trim(),updated_at:new Date().toISOString()};if(!cutoffValid(c)||!c.rationale)throw Error('Enter a positive cutoff and a decision rationale.');entry().cutoff=c;stamp();restoreCutoff();message('Marker cutoff decision saved. No pixels or cells were excluded.');});
    bind('export-all-markers','click',()=>exportReviews());bind('export-reviews','click',()=>exportReviews(true));bind('import-reviews','change',importReviews);window.addEventListener('beforeunload',saveDrafts);
    bind('distribution','click',e=>{if(!plotPoints.length)return;saveDrafts();const rect=e.target.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*1000,y=(e.clientY-rect.top)/rect.height*260,p=[...plotPoints].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];$('queue').value='all';buildGallery();rows.find(r=>r.c.label===p.c.label).root.scrollIntoView({block:'start'});$('plot-readout').textContent=`Selected ${p.c.cell_id}: raw mean ${fmt(p.c.mean)}.`;});
    await load();persist();
    // Read-only inspection for checking navigation/calibration without altering review data.
    window.neuronReview=Object.freeze({getState:()=>structuredClone({loading,marker:marker.marker_id,roi:roi.roi,queue:queue.map(c=>c.cell_id),rows:rows.map(r=>({cell_id:r.c.cell_id,center:r.center,zoom:r.zoom,active:r.active,peakShown:r.peakShown}))}),exportReviews:()=>structuredClone(exportDoc(false))});
  }
  init().catch(fail);
})();
