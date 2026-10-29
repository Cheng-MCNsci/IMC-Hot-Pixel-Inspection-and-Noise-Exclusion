"""Maintainer adapter: package the five 09082026 ROIs from the original project.

Users of the tutorial do not need this legacy-project adapter.
"""
import argparse
import base64
import csv
import json
from pathlib import Path

import numpy as np
import tifffile

from prepare_dataset import prepare, sha, write_json


def table(path, rows):
    with path.open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def build(source, marker_file, destination, snapshot):
    source, destination = Path(source), Path(destination)
    selected = ['CoN_1_01','nLnK_1_04','nLwK_1_03','N_1_02','B_1_02']
    with (source/'01_MCD_Extraction/metadata/panel.csv').open() as handle:
        panel=list(csv.DictReader(handle))
    th=next((i for i,r in enumerate(panel) if r['name'].endswith('_TH')), None)
    if th is None:
        raise ValueError('Cannot identify TH channel in extraction panel')
    destination.mkdir(exist_ok=False, parents=True)
    (destination/'images').mkdir()
    (destination/'masks').mkdir()
    markers=json.loads(Path(marker_file).read_text())+[dict(id='TH',label='TH (context)',plane=th,channel='Dy163')]
    channels=[dict(marker_id=m['id'],marker=m['label'],channel=m['channel'],channel_index=i,
                   image_pattern='',original_panel_index=m['plane']) for i,m in enumerate(markers)]
    records={r['roi']:r for r in json.loads((source/'06_Neuron_ID/selected_rois.json').read_text())}
    rows=[]; identities=[]; provenance=[]
    for name in selected:
        r=records[name]
        with tifffile.TiffFile(r['image_path']) as image:
            raw=np.stack([image.pages[m['plane']].asarray() for m in markers])
        snapshot_path=Path(snapshot)/'markers/p_Akt_S473/assets/components'/f'{name}.json'
        saved=json.loads(snapshot_path.read_text())
        labels=np.frombuffer(base64.b64decode(saved['labels_b64']),dtype='<u2').reshape(saved['height'],saved['width'])
        # These are the exact masks and population flags used by the All Marker interfaces.
        # The mutable upstream classification table is deliberately not used.
        for m, plane in zip(markers,raw):
            if m['id']=='TH':
                continue
            original=json.loads((Path(marker_file).parent/f'{m["id"]}_sources.json').read_text())
            expected=next(s for s in original['sources'] if s['roi']==name)['raw_plane_sha256']
            if __import__('hashlib').sha256(plane.tobytes()).hexdigest()!=expected:
                raise ValueError(f'{name}/{m["id"]}: quantitative plane differs from original reviewed snapshot')
        tifffile.imwrite(destination/f'images/{name}.tif',raw,metadata={'axes':'CYX'},compression='deflate',photometric='minisblack')
        tifffile.imwrite(destination/f'masks/{name}.tif',labels,metadata={'axes':'YX'},compression='deflate')
        rows.append(dict(roi=name,image_path=f'images/{name}.tif',mask_path=f'masks/{name}.tif',axes='CYX',
                         pixel_size_x_um=1,pixel_size_y_um=1,condition=r['condition'],sample='09082026_well1'))
        identities.extend(dict(roi=name,mask_label=a['label'],include=str(a['is_neuron']).lower()) for a in saved['cells'])
        provenance.append(dict(roi=name,original_image=Path(r['image_path']).name,original_mask=Path(r['mask_path']).name,
                               original_image_sha256=sha(r['image_path']),preserved_review_package=snapshot_path.name,
                               preserved_review_package_sha256=sha(snapshot_path),mask_and_population_source='Preserved All Marker aggregate-inspection package; upstream population table has since changed.',
                               unchanged_selected_plane_hashes={m['id']:sha_bytes for m,sha_bytes in zip(markers,[__import__('hashlib').sha256(p.tobytes()).hexdigest() for p in raw])},
                               image_export='Selected channels, lossless deflate TIFF, original pixel grid; no cropping or intensity change'))
    table(destination/'rois.csv',rows);table(destination/'channels.csv',channels);table(destination/'cell_metadata.csv',identities)
    write_json(destination/'dataset.json',dict(dataset_name='Rat SCG IMC · 09082026 · five-ROI teaching subset',
               rois='rois.csv',channels='channels.csv',cells='cell_metadata.csv',context_marker_id='TH',
               intensity_provenance='Steinbock 0.16.3 extraction with HPF=50; no spillover correction or normalization. Selected quantitative channels preserved exactly. Teaching subset, not independent biological replicates.',
               mask_semantics='User-validated whole-cell analysis regions with unchanged nuclear-origin labels. Original segmentation labels retained; neuronal assignments supplied separately.'))
    write_json(destination/'source_provenance.json',dict(example_date='2026-09-08',rois=provenance,
               channel_mapping_note='channel_index is the zero-based plane in this redistributed 16-channel stack; original_panel_index refers to the original 57-channel extraction.',
               scope='Five selected Well 1 ROIs; 15 inspection markers including cl. Casp3, plus quantitative TH for context. The later final analysis excluded cl. Casp3; no marker exclusions are applied here.'))
    prepare(destination/'dataset.json',destination/'review')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--marker-file',type=Path,required=True)
    parser.add_argument('--destination',type=Path,required=True)
    parser.add_argument('--snapshot',type=Path,required=True,help='Preserved 02_Hot_Pixel_Aggregate_Inspection directory')
    args=parser.parse_args()
    build(args.source,args.marker_file,args.destination,args.snapshot)
