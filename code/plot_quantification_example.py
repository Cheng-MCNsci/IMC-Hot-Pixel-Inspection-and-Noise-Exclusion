"""Plot a computed one-marker audit. No values are read from prior violin figures.
Usage: python code/plot_quantification_example.py AUDIT.csv OUTPUT_DIRECTORY
Requires numpy, pandas, matplotlib. Each dot is a cell; ROIs are not independent experiments.
"""
from pathlib import Path
import argparse,json
import numpy as np,pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
CONDITIONS=['CoN','nLnK','nLwK','N','B'];NAMES=['CoN','nLnK','nLwK','30min N','30min B'];COLORS=['#0072B2','#E69F00','#009E73','#CC79A7','#D55E00']

def draw(ax,frame,column,title,limit=None):
 values=[frame.loc[frame.condition.eq(c),column].to_numpy() for c in CONDITIONS]
 parts=ax.violinplot(values,positions=range(1,6),widths=.8,points=256,bw_method='scott',showextrema=False)
 rng=np.random.default_rng(20261028)
 for i,(body,c,v) in enumerate(zip(parts['bodies'],CONDITIONS,values),1):
  body.set_facecolor('#e5eaf0');body.set_edgecolor('#778899');body.set_alpha(.7);body.set_linewidth(.85)
  verts=body.get_paths()[0].vertices;ys,inv=np.unique(verts[:,1],return_inverse=True);widths=np.zeros(len(ys));np.maximum.at(widths,inv,np.abs(verts[:,0]-i));x=i+rng.uniform(-.94,.94,len(v))*np.interp(v,ys,widths);rows=frame[frame.condition.eq(c)];roi=rows.roi.str.rsplit('_',n=1).str[-1].astype(int).to_numpy();order=rng.permutation(len(v));ax.scatter(x[order],v[order],c=np.array(COLORS)[roi[order]-1],s=4,alpha=.55,lw=0,rasterized=True,zorder=2)
  q1,med,q3=np.quantile(v,[.25,.5,.75]);ax.vlines(i,q1,q3,color='#26323f',lw=3,zorder=3);ax.scatter([i],[med],s=24,c='white',edgecolors='#26323f',lw=.8,zorder=4)
 ax.set_xticks(range(1,6),[f'{label}\nn={len(v):,}' for label,v in zip(NAMES,values)],fontsize=11);ax.set_xlim(.4,5.6);ax.set_ylim(0,limit or max(v.max() for v in values)*1.06);ax.set_ylabel('arcsinh(cell mean intensity / 5)',fontsize=12);ax.set_title(title,loc='left',fontsize=15,fontweight='bold',pad=14);ax.grid(axis='y',alpha=.18);ax.set_axisbelow(True);ax.spines[['top','right']].set_visible(False);ax.spines[['left','bottom']].set_color('#b6c0c9');ax.tick_params(length=3,color='#b6c0c9')
 return sum((v>(limit if limit else np.inf)).sum() for v in values)

def save(fig,out,stem):
 for ext in ['png','svg','pdf']:fig.savefig(out/f'{stem}.{ext}',dpi=180,facecolor='white')
 plt.close(fig)

def main():
 a=argparse.ArgumentParser();a.add_argument('audit',type=Path);a.add_argument('output',type=Path);args=a.parse_args();out=args.output;out.mkdir(exist_ok=True,parents=True);d=pd.read_csv(args.audit);assert d.marker_id.nunique()==1 and d.marker_id.iloc[0]=='p_Akt_S473';k=d[d.retained].copy();assert d.cell_id.is_unique;assert d.groupby('condition').roi.nunique().eq(5).all();assert np.isfinite(k.asinh_after).all();plt.rcParams.update({'font.family':'DejaVu Sans','svg.fonttype':'none','font.size':11})
 handles=[Line2D([0],[0],marker='o',linestyle='',color=c,label=f'ROI {i:02}',markersize=5) for i,c in enumerate(COLORS,1)]
 fig,ax=plt.subplots(1,2,figsize=(15,7.4));draw(ax[0],d,'asinh_before',f'Before · {len(d):,} identified neurons');draw(ax[1],k,'asinh_after',f'After · {len(k):,} retained neurons');fig.subplots_adjust(left=.075,right=.975,top=.79,bottom=.28,wspace=.27);fig.suptitle('p-Akt (S473): cell exclusions and artifact-pixel removal',x=.075,ha='left',y=.97,fontsize=21,fontweight='bold');fig.text(.075,.905,'09082026 · Well 1 · five ROIs per condition · final reviewed rules and historical spread masks',fontsize=12,color='#536575');fig.text(.075,.857,'Full observed ranges in both panels. The y-axis scales differ; the cell populations also differ.',fontsize=12,fontweight='bold',color='#536575');fig.legend(handles=handles,loc='lower center',bbox_to_anchor=(.52,.16),ncol=5,frameon=False)
 fig.text(.075,.10,'Dots: individual neurons, colored by ROI. White dot: median; dark bar: IQR. No cell subsampling or intensity trimming.',fontsize=11,color='#536575');fig.text(.075,.055,'Hot pixels (I ≥ 5) and adopted spread pixels leave both the intensity sum and pixel-count denominator. No background subtraction.',fontsize=11,color='#536575');save(fig,out,'pAkt_S473_before_after')
 # Same identities in every panel isolates pixel-removal effects from cell selection.
 fig,axs=plt.subplots(2,2,figsize=(15,11.5));full=max(k.asinh_before.max(),k.asinh_after.max())*1.06;draw(axs[0,0],k,'asinh_before','Same retained cells · original means',full);draw(axs[0,1],k,'asinh_after','Same retained cells · corrected means',full);zoom=.15;nb=draw(axs[1,0],k,'asinh_before','Distribution detail · original means',zoom);na=draw(axs[1,1],k,'asinh_after','Distribution detail · corrected means',zoom);axs[1,0].text(.98,.97,f'{nb} cells above this zoom\n(shown in full range above)',transform=axs[1,0].transAxes,ha='right',va='top',fontsize=10,color='#536575');axs[1,1].text(.98,.97,f'{na} cells above this zoom',transform=axs[1,1].transAxes,ha='right',va='top',fontsize=10,color='#536575');fig.subplots_adjust(left=.075,right=.975,top=.86,bottom=.16,wspace=.27,hspace=.43);fig.suptitle(f'p-Akt (S473): pixel-removal effect in the same {len(k):,} neurons',x=.075,ha='left',y=.97,fontsize=20,fontweight='bold');fig.text(.075,.918,'Same cell IDs and counts before/after. Top: shared full-range scale. Bottom: shared 0–0.15 detail view.',fontsize=12,color='#536575');fig.legend(handles=handles,loc='lower center',bbox_to_anchor=(.52,.065),ncol=5,frameon=False);fig.text(.075,.035,'Only hot/spread pixels change between columns; cell selection is fixed. Zeros remain in the retained-pixel denominator.',fontsize=11,color='#536575');save(fig,out,'pAkt_S473_same_cells')
 stats={'source_cells':len(d),'retained_cells':len(k),'changed_retained_means':int((~np.isclose(k.raw_mean_before,k.mean_after_pixel_removal,rtol=1e-12,atol=1e-12)).sum()),'spread_changes_beyond_hot_removal':int((~np.isclose(k.hot_only_mean,k.mean_after_pixel_removal,rtol=1e-12,atol=1e-12)).sum()),'retained_cells_with_spread_pixels':int((k.spread_pixels>0).sum()),'retained_removed_pixel_fraction':float(k.removed_union_pixels.sum()/k.original_pixel_count.sum()),'retained_removed_pixels':int(k.removed_union_pixels.sum()),'retained_original_pixels':int(k.original_pixel_count.sum()),'first_exclusion_counts':{str(k):int(v) for k,v in d.first_exclusion_reason.value_counts().items()},'zoom_limit':zoom,'same_cells_above_zoom_before':int(nb),'same_cells_above_zoom_after':int(na),'conditions':[]}
 for c in CONDITIONS:
  before=d[d.condition.eq(c)];keep=k[k.condition.eq(c)];stats['conditions'].append({'condition':c,'before':len(before),'retained':len(keep),'raw_all_median':float(before.raw_mean_before.median()),'raw_retained_median':float(keep.raw_mean_before.median()),'corrected_retained_median':float(keep.mean_after_pixel_removal.median()),'retained_pixels_removed_percent':float(100*keep.removed_union_pixels.sum()/keep.original_pixel_count.sum())})
 (out/'plot_summary.json').write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps(stats,indent=2))
if __name__=='__main__':main()
