"""Contract checks using independent small images, including sparse IDs and unequal XY calibration."""
import csv
import gzip
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import tifffile

from prepare_dataset import prepare


class PreparationContract(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.raw=np.array([[0.,1.,5.,6.],[2.,3.,0.,8.]],dtype=np.float64)
        self.labels=np.array([[0,7,7,7],[0,4000000000,4000000000,0]],dtype=np.uint32)
        tifffile.imwrite(self.root/'raw.tif',self.raw)
        tifffile.imwrite(self.root/'labels.tif',self.labels)
        (self.root/'rois.csv').write_text('roi,image_path,mask_path,axes,pixel_size_x_um,pixel_size_y_um\nR1,raw.tif,labels.tif,YX,0.5,2\n')
        (self.root/'channels.csv').write_text('marker_id,marker,channel,channel_index\nA,Marker A,X1,0\n')
        self.config=dict(dataset_name='Independent contract fixture',intensity_provenance='Synthetic test values',
                         mask_semantics='Handwritten labels',rois='rois.csv',channels='channels.csv',context_marker_id=None)
        self.write_config()

    def write_config(self):
        (self.root/'dataset.json').write_text(json.dumps(self.config))

    def run_prepare(self,name='out'):
        return prepare(self.root/'dataset.json',self.root/name)

    def test_measurement_precision_labels_zeros_calibration(self):
        result=self.run_prepare()
        with (self.root/'out/cell_marker_measurements.csv').open() as handle:
            rows=list(csv.DictReader(handle))
        self.assertEqual(len(rows),2)
        self.assertEqual(float(rows[0]['raw_mean']),4.)  # (1+5+6)/3
        self.assertEqual(float(rows[1]['raw_mean']),1.5)  # (3+0)/2; zero remains
        self.assertEqual(float(rows[1]['area_um2']),2.)  # 2 pixels * 0.5 * 2
        self.assertEqual(result['rois'][0]['pixel_size_y_um'],2.)
        with gzip.open(self.root/'out/data/R1_A.f64.gz','rb') as f:
            np.testing.assert_array_equal(np.frombuffer(f.read(),dtype='<f8').reshape(2,4),self.raw)
        with gzip.open(self.root/'out/data/R1_labels.u32.gz','rb') as f:
            np.testing.assert_array_equal(np.frombuffer(f.read(),dtype='<u4').reshape(2,4),self.labels)
        with self.assertRaisesRegex(ValueError,'already exists'):
            self.run_prepare()

    def test_population_flags_and_dataset_identity(self):
        first=self.run_prepare()['dataset_id']
        (self.root/'cells.csv').write_text('roi,mask_label,include\nR1,7,true\nR1,4000000000,false\n')
        self.config['cells']='cells.csv';self.write_config()
        second=self.run_prepare('selected')
        self.assertNotEqual(first,second['dataset_id'])
        self.assertEqual(sum(c['include'] for c in second['rois'][0]['cells']),1)
        # A changed label geometry, even with identical area/centroid, must invalidate imports.
        self.labels[0,1],self.labels[0,3]=self.labels[0,3],self.labels[0,1]
        # Explicitly swapping two different labels changes the image identity.
        self.labels[0,1],self.labels[1,1]=self.labels[1,1],self.labels[0,1]
        tifffile.imwrite(self.root/'labels.tif',self.labels)
        self.assertNotEqual(second['dataset_id'],self.run_prepare('changed')['dataset_id'])

    def test_separate_channels_and_shape_rejection(self):
        (self.root/'channels.csv').write_text('marker_id,marker,channel,channel_index,image_pattern\nA,Marker A,X1,,raw.tif\n')
        self.run_prepare()
        tifffile.imwrite(self.root/'raw.tif',self.raw[:1])
        with self.assertRaisesRegex(ValueError,'image shape'):
            self.run_prepare('bad_shape')
        self.assertFalse((self.root/'bad_shape').exists())

    def test_invalid_metadata_and_values_fail_before_delivery(self):
        (self.root/'cells.csv').write_text('roi,mask_label,include\nR1,7,true\n')
        self.config['cells']='cells.csv';self.write_config()
        with self.assertRaisesRegex(ValueError,'missing 4000000000'):
            self.run_prepare()
        self.config.pop('cells');self.write_config()
        raw=self.raw.copy();raw[0,0]=np.nan;tifffile.imwrite(self.root/'raw.tif',raw)
        with self.assertRaisesRegex(ValueError,'finite, nonnegative'):
            self.run_prepare()
        self.assertFalse((self.root/'out').exists())


if __name__=='__main__':unittest.main(verbosity=2)
