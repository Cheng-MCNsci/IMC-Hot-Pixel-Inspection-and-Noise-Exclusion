"""Rebuild the real-image spread lesson using prepared arrays and frozen historical mask records.
Requires numpy and matplotlib. Historical settings are shown explicitly; these are not a 75%-default prediction.
"""
from pathlib import Path
import gzip,json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
base=ROOT/'example/review';catalog=json.loads((base/'catalog.json').read_text());cases=json.loads((ROOT/'assets/spread_teaching_cases.json').read_text());metrics=[]
for case in cases:
 roi=next(r for r in catalog['rois'] if r['roi']==case['roi']);raw=np.frombuffer(gzip.decompress((base/roi['channels'][case['marker_id']]['asset']).read_bytes()),dtype='<f8').reshape(roi['height'],roi['width']);case['display_max']=case.get('figure_display_max',case['display_max']);cx,cy=case['crop_center_roi'];x0,y0=int(cx)-60,int(cy)-60;n=120
 crop=np.full((n,n),np.nan);core=np.zeros((n,n),bool);spread=core.copy()
 for y in range(n):
  for x in range(n):
   if 0<=x+x0<raw.shape[1] and 0<=y+y0<raw.shape[0]:crop[y,x]=raw[y+y0,x+x0]
 for indices,mask in [(case['core_indices'],core),(case['combined_indices'],spread)]:
  for i in indices:
   y,x=divmod(i,roi['width']);xx,yy=x-x0,y-y0
   if 0<=xx<n and 0<=yy<n:mask[yy,xx]=True
 values=raw.ravel()[case['combined_indices']];below=values<case['hot_cutoff'];stats=dict(marker_id=case['marker_id'],roi=case['roi'],hot_cutoff=case['hot_cutoff'],historical_bright_threshold=case['historical_config']['brightThreshold'],tutorial_default_bright_threshold=.75*case['hot_cutoff'],spread_pixels=len(values),below_hot_cutoff_pixels=int(below.sum()),below_hot_cutoff_percent=float(100*below.mean()),median_spread_intensity=float(np.median(values)),minimum_spread_intensity=float(values.min()),maximum_spread_intensity=float(values.max()),display_max=case['display_max'],anchor=case['anchor']);metrics.append(stats)
 plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10});fig,axes=plt.subplots(1,4,figsize=(14,4.6),facecolor='#f5f7fa');cm=plt.colormaps['gray'].copy();cm.set_bad('#777777');titles=['Raw marker','Selected hot core (cyan)','Only selected core hidden','Historical spread areas (orange)']
 for k,ax in enumerate(axes):
  image=crop.copy()
  if k==2:image[core]=0
  ax.imshow(image,cmap=cm,vmin=0,vmax=case['display_max'],interpolation='nearest')
  if k in [1,3]:ax.contour(core.astype(int),levels=[.5],colors=['cyan'],linewidths=1)
  if k==3:
   overlay=np.zeros((n,n,4));overlay[spread]=[1,.5,.05,.45];ax.imshow(overlay,interpolation='nearest')
  ax.set_title(titles[k],fontsize=11,fontweight='bold');ax.set_xticks([]);ax.set_yticks([]);ax.plot([8,33],[110,110],color='white',lw=3);ax.text(8,105,'25 µm',color='white',fontsize=9)
 label=next(c['marker'] for c in catalog['channels'] if c['marker_id']==case['marker_id']);fig.suptitle(f'{label} · {case["roi"]} · same 120 × 120 µm region, same display range',fontsize=15,fontweight='bold',y=.99)
 fig.text(.025,.13,f'Hot core: I ≥ {case["hot_cutoff"]:g}   |   {stats["below_hot_cutoff_pixels"]}/{stats["spread_pixels"]} historical spread-area pixels ({stats["below_hot_cutoff_percent"]:.1f}%) are below that cutoff.',fontsize=11)
 fig.text(.025,.075,f'Historical bright threshold: {stats["historical_bright_threshold"]:g}; new tutorial starting value: {stats["tutorial_default_bright_threshold"]:g} (75%, adjustable).',fontsize=10)
 fig.text(.025,.025,'Orange = historical automatic candidates + manual additions, not ground truth or a new 75%-default prediction. Gray = outside acquired ROI.',fontsize=9,color='#536575');fig.subplots_adjust(left=.025,right=.99,top=.88,bottom=.23,wspace=.045)
 fig.savefig(ROOT/f'assets/spread_{case["marker_id"]}.png',dpi=160,facecolor=fig.get_facecolor());plt.close(fig)
(ROOT/'assets/spread_teaching_metrics.json').write_text(json.dumps(metrics,indent=2)+'\n');print(json.dumps(metrics,indent=2))
