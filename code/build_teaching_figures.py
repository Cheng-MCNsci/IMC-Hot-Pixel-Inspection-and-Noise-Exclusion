"""Render real-image teaching figures from the bundled, preserved example.

Optional maintainer dependency: Matplotlib. No artifact classification is inferred.
"""
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np
import tifffile


def build():
    root=Path(__file__).resolve().parents[1]
    assets=root/'assets';assets.mkdir(exist_ok=True)
    example=root/'example';roi='N_1_02';mid='p_Akt_S473'
    catalog=json.loads((example/'review/catalog.json').read_text())
    rr=next(r for r in catalog['rois'] if r['roi']==roi)
    values=[r for r in rr['channels'][mid]['measurements'] if r['included']]
    cell=max(values,key=lambda r:r['raw_mean'])
    channels={r['marker_id']:int(r['channel_index']) for r in csv.DictReader((example/'channels.csv').open())}
    images=tifffile.imread(example/f'images/{roi}.tif');raw=images[channels[mid]];th=images[channels['TH']]
    labels=tifffile.imread(example/f'masks/{roi}.tif');mask=labels==cell['mask_label'];pixels=raw[mask].astype(float)
    boundaries=[1,3,5];groups=np.where(pixels==0,0,np.searchsorted(boundaries,pixels,side='left')+1)
    palette=['#15191f','#4967bc','#23a3a8','#e9b44c','#d54b77']
    names=['I = 0','0 < I ≤ 1','1 < I ≤ 3','3 < I ≤ 5','I > 5']
    counts=np.bincount(groups,minlength=5);sums=np.bincount(groups,weights=pixels,minlength=5)
    metrics=dict(roi=roi,mask_label=cell['mask_label'],marker_id=mid,selection='Highest original mean among selected N_1_02 cells; not a confirmed artifact label',
                 original_mean=float(pixels.mean()),original_max=float(pixels.max()),pixels=int(len(pixels)),
                 bin_boundaries=boundaries,illustrative_high_operator='>',illustrative_high_threshold=5,
                 high_pixels=int((pixels>5).sum()),high_area_percent=float(100*(pixels>5).mean()),
                 high_signal_percent=float(100*pixels[pixels>5].sum()/pixels.sum()),
                 bins=[dict(range=name,count=int(n),sum=float(s),area_percent=float(100*n/len(pixels)),
                            contribution_to_mean=float(s/len(pixels)),signal_percent=float(100*s/pixels.sum()))
                       for name,n,s in zip(names,counts,sums)])
    assert np.isclose(sums.sum()/len(pixels),cell['raw_mean'])
    (assets/'teaching_case.json').write_text(json.dumps(metrics,indent=2)+'\n')
    center=(int(round(cell['centroid_y_px'])),int(round(cell['centroid_x_px'])))
    size=75;oy,ox=center[0]-size//2,center[1]-size//2
    def crop(a):
        out=np.full((size,size),np.nan);y0,x0=max(0,oy),max(0,ox);y1,x1=min(a.shape[0],oy+size),min(a.shape[1],ox+size)
        out[y0-oy:y1-oy,x0-ox:x1-ox]=a[y0:y1,x0:x1];return out
    raw_crop,th_crop,lab_crop=crop(raw),crop(th),crop(labels)
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False})
    fig,axs=plt.subplots(1,4,figsize=(14,4.8))
    gray=plt.get_cmap('gray').copy();gray.set_bad('#9ba5a9')
    for ax in axs:ax.set_xticks([]);ax.set_yticks([]);ax.set_facecolor('#101820')
    axs[0].imshow(raw_crop,cmap=gray,vmin=0,vmax=5,interpolation='nearest')
    axs[1].imshow(th_crop,cmap=gray,vmin=0,vmax=180,interpolation='nearest')
    axs[2].imshow(raw_crop,cmap=gray,vmin=0,vmax=5,interpolation='nearest')
    binned=np.where(raw_crop==0,0,np.searchsorted(boundaries,raw_crop,side='left')+1).astype(float)
    binned[(lab_crop!=cell['mask_label'])|~np.isfinite(raw_crop)]=np.nan
    axs[3].imshow(raw_crop,cmap=gray,vmin=0,vmax=5,alpha=.25,interpolation='nearest')
    axs[3].imshow(binned,cmap=ListedColormap(palette),vmin=-.5,vmax=4.5,interpolation='nearest')
    for ax in axs[1:3]:ax.contour((lab_crop==cell['mask_label']).astype(float),levels=[.5],colors=['#ffe23c'],linewidths=.8)
    for ax,title in zip(axs,['p-Akt S473 · raw 0–5','TH context · raw 0–180','p-Akt + selected mask','Selected-cell intensity bins']):
        ax.set_title(title,fontsize=10,pad=12);ax.plot([5,20],[size-7,size-7],color='white',lw=3);ax.text(5,size-11,'15 µm',color='white',fontsize=9)
    fig.suptitle(f'{roi} · label {cell["mask_label"]} · raw mean {pixels.mean():.4g} · {len(pixels)} pixels',x=.05,ha='left',fontsize=15,fontweight='bold')
    fig.text(.05,.12,'75 × 75 µm crops; 1 µm/pixel. Display saturation does not change quantitative values.',fontsize=10,color='#425e68')
    fig.text(.05,.065,'Candidate selected by high cell mean. Inspection is needed before deciding whether the bright pattern is artifactual.',fontsize=10,color='#425e68')
    fig.subplots_adjust(left=.04,right=.99,top=.79,bottom=.2,wspace=.15);fig.savefig(assets/'cell_inspection.png',dpi=160);plt.close(fig)
    fig,axs=plt.subplots(1,2,figsize=(12,4.6))
    for ax,ys,title in [(axs[0],100*counts/len(pixels),'Fraction of original cell area'),(axs[1],100*sums/pixels.sum(),'Fraction of total cell signal')]:
        ax.bar(range(5),ys,color=palette);ax.set_xticks(range(5),names,rotation=15,ha='right');ax.set_ylim(0,110);ax.set_ylabel('Percent');ax.set_title(title,fontweight='bold',pad=18)
        for i,y in enumerate(ys):ax.text(i,y+2,f'{y:.2f}%',ha='center',fontsize=9)
    fig.suptitle(f'Same cell, different denominators · {roi}:{cell["mask_label"]}',x=.07,ha='left',fontsize=15)
    fig.text(.07,.02,'All bins include their upper boundary. Zero pixels count toward area. These exploratory bins remove no pixels.',fontsize=10,color='#425e68')
    fig.tight_layout(rect=[0,.07,1,.92]);fig.savefig(assets/'pixel_contributions.png',dpi=160);plt.close(fig)
    print(json.dumps({k:v for k,v in metrics.items() if k!='bins'},indent=2))


if __name__=='__main__':build()
