"""Prepare quantitative IMC images and aligned labels for browser inspection.

Run from any directory: python prepare_dataset.py CONFIG --output NEW_DIRECTORY
Paths in the configuration and CSVs are relative to the configuration file.
"""
from __future__ import annotations
import argparse
import csv
import gzip
import hashlib
import json
import math
import os
import re
import shutil
import tempfile
from pathlib import Path

import numpy as np
import tifffile


def read_csv(path, required):
    with Path(path).open(newline='', encoding='utf-8-sig') as handle:
        reader = csv.DictReader(handle)
        missing = set(required) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f'{path}: missing columns {sorted(missing)}')
        rows = list(reader)
    if not rows:
        raise ValueError(f'{path}: table is empty')
    return rows


def identifier(value, field):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', value):
        raise ValueError(f'{field}: use letters, numbers, underscore, dot or hyphen: {value!r}')
    return value


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def positive(value, field):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f'{field}: expected a positive finite number')
    return value


def quantitative(array, description):
    if array.ndim != 2 or array.dtype.kind not in 'uif' or not np.isfinite(array).all() or (array < 0).any():
        raise ValueError(f'{description}: expected a finite, nonnegative numeric YX image')
    # The browser uses Float64, preserving common integer and float TIFF values.
    if array.dtype.kind in 'ui' and array.size and int(array.max()) > 2**53:
        raise ValueError(f'{description}: integer values exceed exact browser precision')
    return np.asarray(array, dtype='<f8')


def write_json(path, document):
    Path(path).write_text(json.dumps(document, indent=2, allow_nan=False) + '\n')


def write_array(path, array, dtype):
    with Path(path).open('wb') as handle:
        with gzip.GzipFile(fileobj=handle, mode='wb', mtime=0) as stream:
            stream.write(np.asarray(array, dtype=dtype).tobytes())


def prepare(config_path, output):
    config_path = Path(config_path).resolve()
    root = config_path.parent
    config = json.loads(config_path.read_text())
    for key in ['dataset_name', 'intensity_provenance', 'mask_semantics', 'rois', 'channels']:
        if not config.get(key):
            raise ValueError(f'Configuration requires {key}')
    rois = read_csv(root / config['rois'], ['roi', 'image_path', 'mask_path', 'axes', 'pixel_size_x_um', 'pixel_size_y_um'])
    channels = read_csv(root / config['channels'], ['marker_id', 'marker', 'channel', 'channel_index'])
    ids = [identifier(r['roi'], 'roi') for r in rois]
    mids = [identifier(c['marker_id'], 'marker_id') for c in channels]
    if len(ids) != len(set(ids)) or len(mids) != len(set(mids)):
        raise ValueError('ROI and marker IDs must be unique')
    context = config.get('context_marker_id')
    if context and context not in mids:
        raise ValueError('context_marker_id must match a channel marker_id')
    populations = None
    if config.get('cells'):
        populations = {}
        for row in read_csv(root / config['cells'], ['roi', 'mask_label', 'include']):
            key = (row['roi'], int(row['mask_label']))
            flag = row['include'].strip().lower()
            if row['roi'] not in ids or key[1] <= 0 or flag not in ['true', 'false', '1', '0'] or key in populations:
                raise ValueError(f'Invalid or duplicate population row: {row}')
            populations[key] = flag in ['true', '1']
    output = Path(output).resolve()
    if output.exists():
        raise ValueError(f'Output already exists: {output}. Choose a new directory to preserve previous reviews.')
    output.parent.mkdir(parents=True, exist_ok=True)
    sources = {}

    def record(path):
        path = path.resolve()
        if str(path) not in sources:
            sources[str(path)] = sha(path)
        return sources[str(path)]

    result = dict(schema_version=1, dataset_name=config['dataset_name'],
                  intensity_provenance=config['intensity_provenance'], mask_semantics=config['mask_semantics'],
                  context_marker_id=context, channels=channels, rois=[])
    measurements = []
    warnings = ['Numerical checks cannot establish correct image orientation, segmentation quality, channel identity or biological validity. Inspect the overlay.']
    with tempfile.TemporaryDirectory(prefix='.imc-prepare-', dir=output.parent) as temporary:
        stage = Path(temporary)
        (stage / 'data').mkdir()
        for row in rois:
            roi = row['roi']
            sx = positive(row['pixel_size_x_um'], f'{roi}: pixel_size_x_um')
            sy = positive(row['pixel_size_y_um'], f'{roi}: pixel_size_y_um')
            mask_path = (root / row['mask_path']).resolve()
            labels = tifffile.imread(mask_path)
            if labels.ndim != 2 or labels.dtype.kind not in 'ui' or labels.size == 0 or int(labels.max()) > 2**32-1:
                raise ValueError(f'{roi}: mask must be a nonempty 2D unsigned/nonnegative integer label image within uint32 range')
            if (labels < 0).any():
                raise ValueError(f'{roi}: negative mask labels')
            unique, inverse, counts = np.unique(labels, return_inverse=True, return_counts=True)
            # Dense internal indices permit sparse source labels without allocating by maximum label ID.
            inverse = inverse.ravel()
            order = np.argsort(inverse, kind='stable')
            offsets = np.r_[0, np.cumsum(counts)]
            cells = []
            for i, lab in enumerate(unique):
                if lab == 0:
                    continue
                key = (roi, int(lab))
                if populations is not None and key not in populations:
                    raise ValueError(f'{roi}: cell table must include every nonzero mask label; missing {lab}')
                indices = order[offsets[i]:offsets[i+1]]
                y, x = np.divmod(indices, labels.shape[1])
                cells.append(dict(label=int(lab), cell_id=f'{roi}:{lab}', pixels=int(counts[i]),
                                  area_um2=float(counts[i]*sx*sy), cx=float(x.mean()), cy=float(y.mean()),
                                  include=True if populations is None else populations[key], dense_index=i))
            if not cells:
                raise ValueError(f'{roi}: no labeled cells')
            if populations is not None:
                unknown = {lab for (r, lab) in populations if r == roi} - set(map(int, unique))
                if unknown:
                    raise ValueError(f'{roi}: cell table references absent labels {sorted(unknown)[:10]}')
            target = [c for c in cells if c['include']]
            if not target:
                warnings.append(f'{roi}: no cells selected for review; full image and masks retained')
            label_asset = f'data/{roi}_labels.u32.gz'
            write_array(stage / label_asset, labels, '<u4')
            stack = None
            image_path = (root / row['image_path']).resolve() if row['image_path'] else None
            needs_stack = any(not c.get('image_pattern', '').strip() for c in channels)
            if needs_stack:
                if not image_path:
                    raise ValueError(f'{roi}: image_path is required for stack channels')
                if row['axes'] not in ['CYX', 'YX']:
                    raise ValueError(f'{roi}: axes must be CYX or YX; export/select a 2D ROI before preparation')
                stack = tifffile.imread(image_path)
                if stack.ndim != len(row['axes']):
                    raise ValueError(f'{roi}: declared axes {row["axes"]} do not match image shape {stack.shape}')
                record(image_path)
            assets = {}
            for channel in channels:
                mid = channel['marker_id']
                pattern = channel.get('image_pattern', '').strip()
                if pattern:
                    path = (root / pattern.format(roi=roi)).resolve()
                    raw = quantitative(tifffile.imread(path), f'{roi}/{mid}')
                    record(path)
                else:
                    index = int(channel['channel_index'])
                    n = stack.shape[0] if row['axes'] == 'CYX' else 1
                    if not 0 <= index < n:
                        raise ValueError(f'{roi}/{mid}: zero-based channel index {index} outside [0, {n-1}]')
                    raw = quantitative(stack[index] if row['axes'] == 'CYX' else stack, f'{roi}/{mid}')
                if raw.shape != labels.shape:
                    raise ValueError(f'{roi}/{mid}: image shape {raw.shape} != mask shape {labels.shape}; align inputs before running')
                asset = f'data/{roi}_{mid}.f64.gz'
                write_array(stage / asset, raw, '<f8')
                flat = raw.ravel()
                total = np.bincount(inverse, weights=flat, minlength=len(unique))
                maximum = np.zeros(len(unique))
                np.maximum.at(maximum, inverse, flat)
                for cell in cells:
                    i = cell['dense_index']
                    measurements.append(dict(roi=roi, cell_id=cell['cell_id'], mask_label=cell['label'],
                                             included=cell['include'], marker_id=mid, marker=channel['marker'],
                                             pixel_count=cell['pixels'], area_um2=cell['area_um2'],
                                             centroid_x_px=cell['cx'], centroid_y_px=cell['cy'],
                                             raw_sum=float(total[i]), raw_mean=float(total[i]/counts[i]), raw_max=float(maximum[i])))
                positive_pixels = raw[raw > 0]
                # Preview contrast is intentionally independent of review/cutoff settings.
                preview = float(np.percentile(positive_pixels, 99)) if positive_pixels.size else 1.0
                assets[mid] = dict(asset=asset, preview_max=max(preview, 1e-12),
                                   raw_sha256=hashlib.sha256(raw.tobytes()).hexdigest())
            record(mask_path)
            result['rois'].append(dict(roi=roi, width=labels.shape[1], height=labels.shape[0],
                                       pixel_size_x_um=sx, pixel_size_y_um=sy, condition=row.get('condition', ''),
                                       sample=row.get('sample', ''), label_asset=label_asset,
                                       labels_sha256=hashlib.sha256(np.asarray(labels,dtype='<u4').tobytes()).hexdigest(),
                                       cells=[{k:v for k,v in c.items() if k != 'dense_index'} for c in cells], channels=assets))
            print(f'{roi}: {len(target)} selected / {len(cells)} labeled objects, {len(channels)} channels', flush=True)
        source_manifest = dict(config=config, config_sha256=sha(config_path), files=sources,
                               roi_table_sha256=sha(root/config['rois']), channel_table_sha256=sha(root/config['channels']),
                               cell_table_sha256=sha(root/config['cells']) if config.get('cells') else None)
        fingerprint = dict(name=result['dataset_name'], channels=channels, rois=result['rois'],
                           provenance=result['intensity_provenance'], mask_semantics=result['mask_semantics'])
        result['dataset_id'] = 'imc-review-' + hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()[:24]
        by_pair = {}
        for measure in measurements:
            by_pair.setdefault((measure['roi'], measure['marker_id']), []).append(measure)
        for roi in result['rois']:
            for mid, entry in roi['channels'].items():
                entry['measurements'] = [m for m in by_pair[roi['roi'], mid] if m['included']]
        (stage/'catalog.json').write_text(json.dumps(result, separators=(',', ':'), allow_nan=False)+'\n')
        with (stage/'cell_marker_measurements.csv').open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(measurements[0]))
            writer.writeheader()
            writer.writerows(measurements)
        write_json(stage/'input_provenance.json', source_manifest)
        write_json(stage/'validation.json', dict(status='passed', roi_count=len(rois), channel_count=len(channels),
                                               labeled_cells=sum(len(r['cells']) for r in result['rois']),
                                               selected_cells=sum(c['include'] for r in result['rois'] for c in r['cells']),
                                               measurements=len(measurements), warnings=warnings,
                                               checks=['unique IDs', 'explicit channel mapping', 'finite nonnegative intensities',
                                                       'label-image shapes', 'positive XY calibration', 'population-label matching']))
        viewer = Path(__file__).resolve().parents[1]/'interface'
        for file in ['index.html', 'review.js', 'review.css', 'aggregates.html', 'aggregates.css', 'aggregates.js', 'aggregate_engine.js', 'aggregate_worker.js', 'spread.html', 'spread.css', 'spread.js', 'spread_engine.js', 'spread_worker.js']:
            shutil.copy2(viewer/file, stage/file)
            if file.endswith('.html'):
                # Preserve the hosting prefix (e.g. GitHub Pages /repository/).
                guide = Path(os.path.relpath(viewer.parent/'index.html', output)).as_posix()
                text = (stage/file).read_text().replace('href="../index.html#', f'href="{guide}#')
                (stage/file).write_text(text)
        shutil.copytree(stage, output)
    print(f'Prepared {output}. Run the tutorial root serve.py and open the new directory at its local address.')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        prepare(args.config, args.output)
    except (ValueError, KeyError, FileNotFoundError, IndexError) as error:
        parser.exit(2, f'Input error: {error}\n')
