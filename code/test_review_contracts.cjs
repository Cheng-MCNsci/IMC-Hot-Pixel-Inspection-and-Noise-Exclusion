'use strict';
// Run the real persistence/export functions with an in-memory DOM/storage adapter.
// These checks do not open a browser or read/change a user's saved reviews.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const dir=path.resolve(__dirname,'../interface');
const clone=v=>JSON.parse(JSON.stringify(v));
function context(){const nodes=new Map(),storage=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',children:[],addEventListener(){},replaceChildren(){},getContext(){return {clearRect(){}}}});return nodes.get(id);};return vm.createContext({equal:(a,b)=>assert.deepEqual(clone(a),clone(b)),assert,console,structuredClone,Uint8Array,Uint32Array,Float64Array,Number,Date,JSON,Set,Map,URL,Blob,setTimeout,clearTimeout,document:{getElementById:node},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)||null},EndpointAnalysis:require('../interface/spread_engine.js'),AggregateEngine:require('../interface/aggregate_engine.js'),clone});}
const spread=context();vm.runInContext(fs.readFileSync(path.join(dir,'spread.js'),'utf8').replace('init().catch(error);',''),spread);
vm.runInContext(`
catalog={dataset_id:'test',channels:[{marker_id:'A'}],rois:[{roi:'R',width:10,height:10}]};store={cutoffs:{},reviews:{}};storageKey='test';loadControls=()=>{};loadComponents=()=>{};
const r={marker_id:'A',roi:'R',cutoff:{value:5,operator:'>='},anchor:22,config:E.defaults(5),polygons:[],manual_indices:[22,23,90],decision:'accepted',notes:'reviewed',updated_at:'2026-01-02T00:00:00Z'};
const k=keyFor('A','R',r.cutoff,22);validateReview(r,k);
const d={width:2,height:2,roiWidth:10,roiHeight:10,ox:2,oy:2,sx:.5,sy:2,raw:new Float64Array(4),valid:new Uint8Array([1,1,1,0]),core:new Uint8Array([1,0,0,0])};
const a={candidateMask:new Uint8Array([0,1,0,0]),unresolvedMask:new Uint8Array([0,0,1,0]),referenceMask:new Uint8Array(4),reference:{available:true},sectors:[]};
let out=maskExport(d,r,a);equal(clone(out.mask.automatic_indices),[23]);equal(clone(out.mask.manual_indices),[23,90]);equal(clone(out.mask.accepted_indices),[23,90]);equal(clone(out.mask.unresolved_indices),[32]);assert(!out.mask.accepted_indices.includes(22));assert(!out.mask.accepted_indices.includes(32));
for(const choice of ['unreviewed','no_spread','needs_revision'])assert.equal(maskExport(d,{...r,decision:choice},a).mask.accepted_indices.length,0);
const backup={schema_version:1,export_type:'imc-spread-backup',dataset_id:'test',method_version:method,cutoffs:{A:r.cutoff},reviews:{[k]:r}};
importSpread(clone(backup));assert.equal(store.reviews[k].notes,'reviewed');
importSpread({...clone(backup),reviews:{[k]:{...r,notes:'old',updated_at:'2026-01-01T00:00:00Z'}}});assert.equal(store.reviews[k].notes,'reviewed');
const before=JSON.stringify(store);assert.throws(()=>importSpread({...backup,dataset_id:'wrong'}),/matching/);assert.equal(JSON.stringify(store),before);
assert.throws(()=>importSpread({...backup,reviews:{[k]:{...r,manual_indices:[100]}}}),/Invalid/);assert.equal(JSON.stringify(store),before);
record=clone(r);data=d;activeKey=k;$('notes').value='edited';save(true);assert.equal(store.reviews[k].decision,'unreviewed');
record.decision='accepted';save(false);assert.equal(store.reviews[k].decision,'accepted');
console.log('PASS: spread source coordinates, padding/core exclusion, overlap union, out-of-crop manual preservation, unresolved separation, acceptance reset, identity validation and newer-review merge.');
`,spread);
const aggregate=context();vm.runInContext(fs.readFileSync(path.join(dir,'aggregates.js'),'utf8').replace('init().catch(error);',''),aggregate);
vm.runInContext(`
catalog={dataset_id:'test',channels:[{marker_id:'A'},{marker_id:'TH'}],context_marker_id:'TH',rois:[{roi:'R'}]};key='test';store={schema_version:1,export_type:'imc-aggregate-inspection',dataset_id:'test',markers:{},notes:{},rules:E.defaults,required:['A'],radius:25,minimum:1,updated_at:'1970-01-01T00:00:00Z'};analyze=()=>{};$('marker').value='A';
const backup={...clone(store),markers:{A:{cutoff:{value:5,operator:'>='}}},updated_at:'2026-01-01T00:00:00Z'};importBackup(backup);assert.equal(store.markers.A.cutoff.value,5);
assert.throws(()=>importBackup({...backup,dataset_id:'wrong'}),/Invalid/);assert.throws(()=>importBackup({...backup,required:['A','A']}),/Invalid/);
const before=JSON.stringify(store);assert.throws(()=>importBackup({...backup,markers:{A:{cutoff:{value:5,operator:'BAD'}}}}),/Invalid/);assert.equal(JSON.stringify(store),before);
readCellReview({dataset_id:'test',export_type:'imc-cell-inspection',markers:{A:{cutoff:{value:7,operator:'>'}}}});assert.equal(store.markers.A.cutoff.value,7);assert.equal(store.markers.A.cutoff.operator,'>');
let exported;download=d=>exported=clone(d);exportBackup(true);assert.equal(exported.markers.A.cutoff.value,7);assert.equal(exported.dataset_id,'test');
console.log('PASS: aggregate imports carry cutoff/operator, reject mismatches and invalid settings atomically, and preserve export identity.');
`,aggregate);
const cell=context();vm.runInContext(fs.readFileSync(path.join(dir,'review.js'),'utf8').replace('init().catch(fail);',`
globalThis.testPromise=(async()=>{
catalog={dataset_id:'test',dataset_name:'test',channels:[{marker_id:'A'}],rois:[{roi:'R',cells:[{label:7,include:true}]}]};marker={marker_id:'A'};storageKey='test';store={schema_version:1,export_type:'imc-cell-inspection',dataset_id:'test',markers:{A:blank()},reviews:{}};restoreControls=()=>{};buildGallery=()=>{};
const settings={display:5,bins:[1,3,5],threshold:3};const r={marker_id:'A',roi:'R',mask_label:7,cell_id:'R:7',settings,mask_assessment:'plausible',pixel_assessment:'uncertain',notes:'saved',updated_at:'2026-01-02T00:00:00Z'};
const backup={...clone(store),markers:{A:{settings,cutoff:{value:5,operator:'>=',rationale:'inspected',updated_at:r.updated_at},updated_at:r.updated_at}},reviews:{'A::R::7':r}};
const ingest=doc=>importReviews({target:{files:[{text:async()=>JSON.stringify(doc)}],value:'test'}});
await ingest(backup);assert.equal(store.reviews['A::R::7'].notes,'saved');assert.equal(store.markers.A.cutoff.value,5);
await ingest({...clone(backup),reviews:{'A::R::7':{...r,notes:'older',updated_at:'2026-01-01T00:00:00Z'}}});assert.equal(store.reviews['A::R::7'].notes,'saved');
const before=JSON.stringify(store);await assert.rejects(ingest({...backup,dataset_id:'wrong'}),/matching/);await assert.rejects(ingest({...backup,reviews:{'A::R::7':{...r,mask_label:8}}}),/Invalid/);assert.equal(JSON.stringify(store),before);
const exported=exportDoc(true);assert.equal(exported.dataset_id,'test');assert.equal(exported.reviews['A::R::7'].cell_id,'R:7');assert.equal(exported.markers.A.settings.display,5);
console.log('PASS: cell backup round-trip, settings/cutoff preservation, newer-review merge, dataset/cell-ID rejection and atomic failed imports.');
})();
`),cell);
cell.testPromise.catch(e=>{console.error(e);process.exitCode=1;});
