"""Independently check the redistributed example and its prepared measurements."""
import base64
import csv
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import tifffile


def validate():
    root=Path(__file__).resolve().parents[1]
    example=root/'example';review=example/'review'
    catalog=json.loads((review/'catalog.json').read_text())
    provenance=json.loads((example/'source_provenance.json').read_text())
    source={r['roi']:r for r in provenance['rois']}
    with (review/'cell_marker_measurements.csv').open() as f:
        measurements=list(csv.DictReader(f))
    by_pair={}
    for row in measurements:by_pair.setdefault((row['roi'],row['marker_id']),[]).append(row)
    comparisons=0;planes=0
    for roi in catalog['rois']:
        name=roi['roi'];labels=tifffile.imread(example/f'masks/{name}.tif')
        with gzip.open(review/roi['label_asset'],'rb') as f:
            prepared=np.frombuffer(f.read(),dtype='<u4').reshape(labels.shape)
        np.testing.assert_array_equal(prepared,labels)
        assert hashlib.sha256(prepared.astype('<u4').tobytes()).hexdigest()==roi['labels_sha256']
        stack=tifffile.imread(example/f'images/{name}.tif')
        counts=np.bincount(labels.ravel())
        for channel in catalog['channels']:
            mid=channel['marker_id'];raw=stack[int(channel['channel_index'])]
            with gzip.open(review/roi['channels'][mid]['asset'],'rb') as f:
                pixels=np.frombuffer(f.read(),dtype='<f8').reshape(raw.shape)
            np.testing.assert_array_equal(raw,pixels)
            assert hashlib.sha256(raw.tobytes()).hexdigest()==source[name]['unchanged_selected_plane_hashes'][mid]
            assert hashlib.sha256(pixels.tobytes()).hexdigest()==roi['channels'][mid]['raw_sha256']
            sums=np.bincount(labels.ravel(),weights=raw.ravel().astype(float))
            for row in by_pair[(name,mid)]:
                lab=int(row['mask_label'])
                assert int(row['pixel_count'])==counts[lab]
                assert np.isclose(float(row['raw_sum']),sums[lab],rtol=1e-12,atol=1e-12)
                assert np.isclose(float(row['raw_mean']),sums[lab]/counts[lab],rtol=1e-12,atol=1e-12)
                comparisons+=1
            planes+=1
    selected=sum(c['include'] for r in catalog['rois'] for c in r['cells'])
    assert selected==2401 and planes==80 and comparisons==95632
    report=dict(status='passed',roi_count=5,channels_including_context=16,quantitative_planes_checked=planes,
                masks_checked=5,selected_cells=selected,cell_marker_measurement_rows_checked=comparisons,
                checks=['All redistributed selected planes match recorded original float32 plane hashes',
                        'All prepared Float64 pixels equal redistributed source TIFFs exactly',
                        'All label arrays and content hashes match',
                        'Every cell/channel pixel count, sum and mean independently recalculated from TIFFs',
                        'Original All Marker population preserved: 2401 selected analysis regions'])
    (root/'validation').mkdir(exist_ok=True)
    (root/'validation/example_checks.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':validate()
