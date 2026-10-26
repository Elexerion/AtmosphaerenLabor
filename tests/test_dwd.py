import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import dwd_profiles as dwd

FIXTURES = Path(__file__).parent / 'fixtures'


class DecoderTests(unittest.TestCase):
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
