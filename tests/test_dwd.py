import json
import sys
import unittest
import tempfile
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import dwd_profiles as dwd

FIXTURES = Path(__file__).parent / 'fixtures'


class DecoderTests(unittest.TestCase):
    def test_real_schleswig_with_separate_wind_shear_replication(self):
        meta = json.loads((FIXTURES / 'schleswig-shear.json').read_text())
        data = (FIXTURES / 'schleswig-shear.bufr').read_bytes()
        p, = dwd.decode(data, '10035', meta['source_url'])
        self.assertEqual(p['message_sha256'], meta['message_sha256'])
        self.assertEqual(p['nominal_time'], '2026-10-26T12:00:00Z')
        self.assertEqual(len(p['levels']), 3371)
        self.assertEqual(p['levels'][0]['pressure_hpa'], 1004.84)
        self.assertEqual(p['levels'][-1]['pressure_hpa'], 6.03)
        self.assertEqual(p['ascent_end']['height_m'], 33872.4)
        self.assertEqual(p['ascent_end']['time'], '2026-10-26T12:36:50Z')
        # Removing a pressure is still a structural error, not a license to zip
        # unequal arrays or silently discard an arbitrary trailing observation.
        original = dwd.array
        with patch.object(dwd, 'array', side_effect=lambda h,k: original(h,k)[:-1] if k == 'pressure' else original(h,k)):
            with self.assertRaisesRegex(ValueError, 'unaligned.*pressure'):
                dwd.decode(data, '10035', meta['source_url'])

    def test_collector_backfills_earlier_reporting_time(self):
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        now = now.replace(hour=12 if now.hour >= 12 else 0)
        older = now - timedelta(hours=12)
        links = [f'Z__C_EDZW_{t:%Y%m%d%H%M%S}_test.bin' for t in (now,older)]
        listing = ''.join(f'<a href="{link}">file</a>' for link in links).encode()
        profiles = [dict(nominal_time=t.strftime('%Y-%m-%dT%H:00:00Z'), levels=[dict(height_m=45.8)]) for t in (now,older)]
        with tempfile.TemporaryDirectory() as directory, patch.object(dwd, 'download', side_effect=[listing,b'new',b'old']), patch.object(dwd, 'decode', side_effect=[[profiles[0]],[profiles[1]]]):
            output = Path(directory)
            dwd.collect(output, '10035')
            for t in (now,older):
                self.assertTrue((output / '10035' / t.strftime('%Y-%m-%d') / (t.strftime('%H')+'.json')).is_file())

    def test_real_schleswig(self):
        meta = json.loads((FIXTURES / 'schleswig.json').read_text())
        profiles = dwd.decode((FIXTURES / 'schleswig.bufr').read_bytes(), '10035', meta['source_url'])
        self.assertEqual(len(profiles), 1)
        p = profiles[0]
        self.assertEqual(p['station_id'], '10035')
        self.assertEqual(p['nominal_time'], '2026-10-26T00:00:00Z')
        self.assertEqual(p['launch_time'], '2026-10-25T22:44:54Z')
        self.assertEqual(len(p['levels']), 3329)
        self.assertEqual(p['message_sha256'], meta['message_sha256'])
        self.assertAlmostEqual(p['levels'][0]['height_m'], 45.8)
        self.assertAlmostEqual(p['levels'][0]['pressure_hpa'], 992.74)
        self.assertAlmostEqual(p['levels'][0]['temp_c'], 9.5)
        self.assertAlmostEqual(p['levels'][0]['dewpoint_c'], 5.76)
        self.assertGreater(p['levels'][-1]['height_m'], 30000)
        self.assertEqual(p['ascent_start']['time'], '2026-10-25T22:44:54Z')
        self.assertEqual(p['ascent_end']['time'], '2026-10-26T00:35:26Z')
        self.assertAlmostEqual(p['ascent_start']['latitude'],54.52727)
        self.assertAlmostEqual(p['ascent_end']['longitude'],11.13064)
        self.assertEqual(p['ascent_end']['height_m'],p['levels'][-1]['height_m'])

    def test_wrong_station(self):
        self.assertEqual(dwd.decode((FIXTURES / 'schleswig.bufr').read_bytes(), '10184', 'test'), [])

    def test_descent_is_not_an_ascent(self):
        self.assertEqual(dwd.decode((FIXTURES / 'descent.bufr').read_bytes(), '10035', 'test'), [])

    def test_compressed_and_uncompressed_subsets_stay_separate(self):
        for mode in (0,1):
            data = (FIXTURES / f'multi-{mode}.bufr').read_bytes()
            profiles = dwd.decode(data, '10035', 'test')
            self.assertEqual(len(profiles), 1)
            self.assertEqual(profiles[0]['station_id'], '10035')
            self.assertEqual(len(profiles[0]['levels']), 6)
            self.assertEqual(dwd.decode(data, '99999', 'test'), [])

    def test_nil_and_envelopes(self):
        self.assertEqual(dwd.decode(b'ZCZC\r\nNIL\r\nNNNN', '10035', 'test'), [])
        message = (FIXTURES / 'schleswig.bufr').read_bytes()
        self.assertEqual(len(list(dwd.frames(b'ZCZC\r\n' + message + b'\r\nNNNN'))), 1)
        with self.assertRaises(ValueError): list(dwd.frames(message[:-20]))

    def test_quality_control(self):
        z = [0, 1000, 2000, 3000, 4000, 5000, 6000]
        p = [100000, 90000, 80000, 70000, 60000, 50000, 40000]
        t = [280] * 7
        td = [270] * 7
        td[3] = dwd.ec.CODES_MISSING_DOUBLE
        self.assertEqual(len(dwd.clean_levels(z, p, t, td)), 6)
        p[2] = 95000
        self.assertEqual(len(dwd.clean_levels(z, p, t, td)), 5)
        with self.assertRaises(ValueError): dwd.clean_levels(z[::-1], p, t, td)
        with self.assertRaises(ValueError): dwd.clean_levels(z[:-1], p, t, td)
        z[1] = 0
        rows = dwd.clean_levels(z, p, t, td)
        self.assertEqual(len(rows), 5)
        self.assertTrue(all(b['height_m'] > a['height_m'] for a,b in zip(rows, rows[1:])))


if __name__ == '__main__': unittest.main()
