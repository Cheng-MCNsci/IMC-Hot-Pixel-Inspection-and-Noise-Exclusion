#!/usr/bin/env node
/* Quantify one marker using the same aggregate engine as Chapter 3.
   Usage: node code/quantify_marker.cjs CATALOG CONFIG SPREAD_UNION OUTPUT_DIRECTORY
   A frozen-mask adapter supplies explicit, provenance-bearing reviewed masks.
   This command does not infer acceptance from unreviewed Chapter 4 candidates. */
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const E=require('../interface/aggregate_engine.js');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function measure(raw,labels,cells,cutoff,spread,rules,cofactor){
 const stats=new Map(cells.map(c=>[c.label,{...c,original_pixel_count:0,raw_sum_before:0,hot_pixels:0,spread_pixels:0,hot_and_spread_overlap_pixels:0,removed_union_pixels:0,retained_pixel_count:0,retained_zero_pixels:0,retained_sum:0,hot_only_sum:0,hot_only_pixel_count:0}]));
 for(let i=0;i<raw.length;i++){
  const c=stats.get(labels[i]);if(!c)continue;const v=raw[i],hot=cutoff.operator==='>='?v>=cutoff.value:v>cutoff.value,noise=!!spread[i];
  c.original_pixel_count++;c.raw_sum_before+=v;c.hot_pixels+=hot;c.spread_pixels+=noise;c.hot_and_spread_overlap_pixels+=hot&&noise;
  if(!hot){c.hot_only_sum+=v;c.hot_only_pixel_count++;}
  if(hot||noise)c.removed_union_pixels++;else{c.retained_pixel_count++;c.retained_sum+=v;c.retained_zero_pixels+=v===0;}
 }
 return [...stats.values()].filter(c=>c.include).map(c=>{
  if(c.original_pixel_count!==c.pixels)throw Error('Original mask area mismatch');
  const flags=[];
  if(c.area_um2<rules.minArea)flags.push('area');
  if(c.hot_marker_count>=rules.globalMarkers)flags.push('cross-marker');
  if(c.small_hot_pixels>rules.smallLimit)flags.push('small-hot');
  if(c.large_aggregate_near)flags.push('large-gap');
  if(c.spread_pixels>rules.maxSpreadFraction*c.original_pixel_count)flags.push('spread-overlap');
  if(!c.retained_pixel_count)flags.push('no-pixels');
  const retained=flags.length===0,mean=c.retained_pixel_count?c.retained_sum/c.retained_pixel_count:null;
  return {cell_id:c.cell_id,label:c.label,original_pixel_count:c.original_pixel_count,original_area_um2:c.area_um2,raw_sum_before:c.raw_sum_before,raw_mean_before:c.raw_sum_before/c.original_pixel_count,small_hot_pixels:c.small_hot_pixels,hot_pixels:c.hot_pixels,hot_marker_count:c.hot_marker_count,large_aggregate_near:c.large_aggregate_near,spread_pixels:c.spread_pixels,spread_overlap_percent:100*c.spread_pixels/c.original_pixel_count,hot_and_spread_overlap_pixels:c.hot_and_spread_overlap_pixels,removed_union_pixels:c.removed_union_pixels,retained_pixel_count:c.retained_pixel_count,retained_zero_pixels:c.retained_zero_pixels,retained_sum:c.retained_sum,hot_only_mean:c.hot_only_pixel_count?c.hot_only_sum/c.hot_only_pixel_count:null,mean_after_pixel_removal:mean,retained,first_exclusion_reason:flags[0]||'retained',all_rule_flags:flags.join(';'),asinh_before:Math.asinh(c.raw_sum_before/c.original_pixel_count/cofactor),asinh_after:retained?Math.asinh(mean/cofactor):null};
 });
}
function csv(file,rows,keys=Object.keys(rows[0])){const escape=v=>v===null||v===undefined?'':/[",\n]/.test(String(v))?'"'+String(v).replaceAll('"','""')+'"':String(v);fs.writeFileSync(file,keys.join(',')+'\n'+rows.map(r=>keys.map(k=>escape(r[k])).join(',')+'\n').join(''));}
function run(catalogFile,configFile,spreadFile,out){
 const read=f=>JSON.parse(fs.readFileSync(f)),cat=read(catalogFile),cfg=read(configFile),spreadDoc=read(spreadFile),base=path.dirname(catalogFile),mid=cfg.marker_id;
 if(fs.existsSync(out))throw Error('Output already exists. Use a new directory to preserve completed results.');
 if(!E.validRules(cfg.rules)||!Number.isFinite(cfg.rules.maxSpreadFraction)||!(cfg.rules.maxSpreadFraction>=0&&cfg.rules.maxSpreadFraction<=1)||!Number.isFinite(cfg.cofactor)||!(cfg.cofactor>0)||cfg.background_subtraction!==false)throw Error('Invalid rules/cofactor; this command does not perform background subtraction.');
 if(!cfg.required_markers.length||new Set(cfg.required_markers).size!==cfg.required_markers.length||!cfg.required_markers.includes(mid)||cfg.required_markers.some(m=>!E.validCutoff(cfg.cutoffs[m])))throw Error('All required cross-marker cutoffs must be provided.');
 if(spreadDoc.export_type!=='imc-quantification-spread-union'||spreadDoc.schema_version!==1||spreadDoc.dataset_id!==cat.dataset_id||spreadDoc.marker_id!==mid||!spreadDoc.review_scope)throw Error('Expected an explicit reviewed-mask union for this dataset and marker.');
 if(!E.validCutoff(spreadDoc.hot_cutoff)||spreadDoc.hot_cutoff.value!==cfg.cutoffs[mid].value||spreadDoc.hot_cutoff.operator!==cfg.cutoffs[mid].operator)throw Error('Reviewed spread masks must record the same hot cutoff and operator as this quantification. Re-review masks after changing the cutoff.');
 const masks=new Map();for(const m of spreadDoc.masks){const r=cat.rois.find(r=>r.roi===m.roi);if(!r||m.marker_id!==mid||!m.approval_basis||!Array.isArray(m.indices)||!m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<r.width*r.height))throw Error('Invalid reviewed mask or missing adoption provenance.');const set=masks.get(m.roi)||new Set();m.indices.forEach(i=>set.add(i));masks.set(m.roi,set);}
 const array=(asset,Type,hash,n)=>{const b=zlib.gunzipSync(fs.readFileSync(path.join(base,asset)));if(hash&&digest(b)!==hash)throw Error('Prepared array hash mismatch: '+asset);const a=new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));if(a.length!==n)throw Error('Array dimensions mismatch');return a;};
 const all=[],roiCounts=[];
 for(const r of cat.rois){
  if(!Number.isInteger(r.width)||r.width<1||!Number.isInteger(r.height)||r.height<1||![r.pixel_size_x_um,r.pixel_size_y_um].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid ROI dimensions or pixel calibration.');
  const n=r.width*r.height,labels=array(r.label_asset,Uint32Array,r.labels_sha256,n),cross=new Map();let current,raw;
  for(const id of cfg.required_markers){const ch=r.channels[id];if(!ch)throw Error('Missing required marker '+id+' in '+r.roi);const a=array(ch.asset,Float64Array,ch.raw_sha256,n);if(a.some(x=>!Number.isFinite(x)||x<0))throw Error('Invalid quantitative values');const parts=E.components(a,r.width,r.height,cfg.cutoffs[id]),ct=E.counts(parts.components,labels,cfg.rules.largePixels);for(const [lab,count] of ct.small)if(count>cfg.rules.smallLimit)cross.set(lab,(cross.get(lab)||0)+1);if(id===mid){raw=a;current=parts;}}
  // Radius zero avoids collecting an unnecessary gallery while retaining the exact large-gap rule.
  const inspected=E.inspect(current,labels,r.width,r.height,r.pixel_size_x_um,r.pixel_size_y_um,r.cells,cfg.rules,0,cross,true),spread=new Uint8Array(n);for(const i of masks.get(r.roi)||[])spread[i]=1;
  for(const c of inspected.cells){const area=c.pixels*r.pixel_size_x_um*r.pixel_size_y_um;if(!c.pixels||!Number.isFinite(c.area_um2)||Math.abs(c.area_um2-area)>1e-9*Math.max(1,area))throw Error('Cell metadata area does not match the label image and calibration: '+c.cell_id);}
  const rows=measure(raw,labels,inspected.cells,cfg.cutoffs[mid],spread,cfg.rules,cfg.cofactor).map(c=>({roi:r.roi,condition:r.condition,sample:r.sample,marker_id:mid,...c}));all.push(...rows);roiCounts.push({roi:r.roi,condition:r.condition,before:rows.length,retained:rows.filter(c=>c.retained).length,spread_union_roi_pixels:spread.reduce((a,b)=>a+b,0)});console.log(r.roi,rows.length,'→',roiCounts.at(-1).retained);
 }
 if(!all.length)throw Error('No included cells in this dataset. Check the population flags before quantification.');
 fs.mkdirSync(out,{recursive:true});csv(path.join(out,'cell_audit.csv'),all);csv(path.join(out,'retained_cells.csv'),all.filter(r=>r.retained),Object.keys(all[0]));csv(path.join(out,'roi_counts.csv'),roiCounts);
 const reasons={};for(const c of all)reasons[c.first_exclusion_reason]=(reasons[c.first_exclusion_reason]||0)+1;
 fs.writeFileSync(path.join(out,'run_manifest.json'),JSON.stringify({created_at:new Date().toISOString(),dataset_id:cat.dataset_id,marker_id:mid,configuration:cfg,source_neurons:all.length,retained_neurons:all.filter(c=>c.retained).length,first_exclusion_counts:reasons,spread_review_scope:spreadDoc.review_scope,spread_inventory:spreadDoc.inventory,inputs:Object.fromEntries([['catalog',catalogFile],['configuration',configFile],['reviewed_spread_union',spreadFile],['aggregate_engine',path.resolve(__dirname,'../interface/aggregate_engine.js')],['quantification_code',__filename]].map(([k,f])=>[k,{file:path.basename(f),sha256:digest(fs.readFileSync(f))}])),pixel_removal:'Union of all hot pixels and adopted spread pixels; remove from numerator AND denominator. Remaining zeros count. No background subtraction. No intensity-based cell trimming.',scope:'One marker quantified; all required markers evaluated for the global small-hot-pixel rule.'},null,2)+'\n');
 return all;
}
module.exports={measure,run};if(require.main===module){if(process.argv.length!==6)throw Error('Usage: node quantify_marker.cjs CATALOG CONFIG SPREAD_UNION NEW_OUTPUT_DIRECTORY');run(...process.argv.slice(2));}
