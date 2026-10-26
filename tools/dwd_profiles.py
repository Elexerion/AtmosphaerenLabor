"""Decode verified DWD TEMP ascent subsets; publish portable, unit-explicit JSON.

Only template 309057 is supported initially. No descent, dropsonde, trajectory,
or invented humidity/height values are accepted. Requires ECMWF ecCodes.
"""
import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote
from urllib.request import urlopen

import eccodes as ec

BASE = 'https://opendata.dwd.de/weather/weather_reports/radiosonde/bufr/'
UTC = timezone.utc


def frames(data):
    """DWD files have WMO envelopes and can contain multiple BUFR messages."""
    pos = 0
    while (pos := data.find(b'BUFR', pos)) >= 0:
        length = int.from_bytes(data[pos + 4:pos + 7], 'big')
        if length < 12 or pos + length > len(data) or data[pos + length - 4:pos + length] != b'7777':
            raise ValueError('Truncated or invalid BUFR frame')
        yield data[pos:pos + length]
        pos += length


def array(h, key):
    try:
        return [float(x) for x in ec.codes_get_array(h, key)]
    except ec.CodesInternalError:
        return []


def scalar(h, key):
    values = array(h, key)
    if len(values) != 1 or not valid(values[0]):
        raise ValueError('Missing/ambiguous ' + key)
    return values[0]


def valid(x):
    return x is not None and math.isfinite(x) and abs(x) < 1e9


def clean_levels(heights, pressures, temperatures, dewpoints, directions=(), speeds=()):
    n = len(pressures)
    if n < 5 or any(len(a) != n for a in (heights, temperatures, dewpoints)):
        raise ValueError('Missing or unaligned level arrays')
    rows = []
    for i, (z, p, t, td) in enumerate(zip(heights, pressures, temperatures, dewpoints)):
        if not all(valid(v) for v in (z, p, t, td)):
            continue
        if not (-500 < z < 50000 and 100 < p <= 110000 and 170 < t < 340 and 130 < td <= t + .25):
            continue
        row = dict(height_m=round(z, 2), pressure_hpa=round(p / 100, 3),
                   temp_c=round(t - 273.15, 3), dewpoint_c=round(td - 273.15, 3))
        if len(directions) == n and len(speeds) == n and valid(directions[i]) and valid(speeds[i]):
            if 0 <= directions[i] <= 360 and 0 <= speeds[i] < 200:
                row.update(wind_dir_deg=directions[i], wind_speed_ms=speeds[i])
        rows.append(row)
    # Never silently reverse a descent into an ascent.
    if len(rows) < 5 or any(b['height_m'] < a['height_m'] for a, b in zip(rows, rows[1:])):
        raise ValueError('Insufficient levels or descending profile')
    clean = []
    for row in rows:
        if not clean or (row['height_m'] > clean[-1]['height_m'] and row['pressure_hpa'] < clean[-1]['pressure_hpa']):
            clean.append(row)
    if len(clean) < 5 or clean[-1]['height_m'] - clean[0]['height_m'] < 3000:
        raise ValueError('Profile is too short for stability analysis')
    return clean


def flight_endpoints(h, levels, launch):
    heights, pressures, elapsed = (array(h, key) for key in ('nonCoordinateGeopotentialHeight', 'pressure', 'timePeriod'))
    latitudes, longitudes = array(h, 'latitudeDisplacement'), array(h, 'longitudeDisplacement')
    base_lat, base_lon = array(h, 'latitude'), array(h, 'longitude')
    result = {}
    for key, row in (('ascent_start', levels[0]), ('ascent_end', levels[-1])):
        matches = [i for i,z in enumerate(heights) if abs(z-row['height_m']) < .02 and i < len(pressures) and abs(pressures[i]/100-row['pressure_hpa']) < .004]
        endpoint = {k: row[k] for k in ('height_m','pressure_hpa','temp_c','dewpoint_c')}
        if len(matches) == 1:
            i = matches[0]
            if len(elapsed) == len(heights) and valid(elapsed[i]) and 0 <= elapsed[i] <= 43200:
                endpoint['time'] = (launch + timedelta(seconds=elapsed[i])).isoformat().replace('+00:00','Z')
            if len(base_lat) == len(base_lon) == 1 and len(latitudes) == len(longitudes) == len(heights) and all(valid(x) for x in (base_lat[0],base_lon[0],latitudes[i],longitudes[i])):
                lat, lon = base_lat[0]+latitudes[i], base_lon[0]+longitudes[i]
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    endpoint.update(latitude=round(lat,5),longitude=round(lon,5))
        result[key] = endpoint
    return result


def decode_subset(h, station, source, message):
    actual = f'{int(scalar(h, "blockNumber")):02d}{int(scalar(h, "stationNumber")):03d}'
    if actual != station:
        return None
    # typical* is nominal reporting time, year/month/... is actual balloon launch.
    nominal = datetime(*(int(ec.codes_get(h, 'typical' + k)) for k in ('Year', 'Month', 'Day', 'Hour', 'Minute', 'Second')), tzinfo=UTC)
    launch = datetime(*(int(scalar(h, k)) for k in ('year', 'month', 'day', 'hour', 'minute', 'second')), tzinfo=UTC)
    if abs((launch - nominal).total_seconds()) > 3 * 3600:
        raise ValueError('Launch differs from reporting time by more than 3 hours')
    rows = clean_levels(array(h, 'nonCoordinateGeopotentialHeight'), array(h, 'pressure'),
                        array(h, 'airTemperature'), array(h, 'dewpointTemperature'),
                        array(h, 'windDirection'), array(h, 'windSpeed'))
    ground = scalar(h, 'heightOfStationGroundAboveMeanSeaLevel')
    if abs(rows[0]['height_m'] - ground) > 100:
        raise ValueError('Profile does not start near station ground')
    return dict(schema_version=1, source='DWD Open Data / BUFR / ecCodes', station_id=actual,
                nominal_time=nominal.isoformat().replace('+00:00', 'Z'),
                launch_time=launch.isoformat().replace('+00:00', 'Z'),
                retrieved_at=datetime.now(UTC).isoformat().replace('+00:00', 'Z'),
                source_url=source, message_sha256=hashlib.sha256(message).hexdigest(),
                template=309057, height_reference='geopotential metres MSL',
                station_height_m=ground, levels=rows, **flight_endpoints(h,rows,launch))


def decode(data, station, source):
    profiles = []
    for message in frames(data):
        h = ec.codes_new_from_message(message)
        try:
            if set(ec.codes_get_array(h, 'unexpandedDescriptors')) != {309057}:
                continue
            ec.codes_set(h, 'unpack', 1)
            blocks, numbers = array(h, 'blockNumber'), array(h, 'stationNumber')
            count = int(ec.codes_get(h, 'numberOfSubsets'))
            # Compressed constants may be represented once for all subsets.
            if len(blocks) == 1: blocks *= count
            if len(numbers) == 1: numbers *= count
            if len(blocks) != count or len(numbers) != count:
                raise ValueError('Unaligned station identifiers')
            for i, (block, number) in enumerate(zip(blocks, numbers), 1):
                if not valid(block) or not valid(number) or f'{int(block):02d}{int(number):03d}' != station:
                    continue
                subset = ec.codes_clone(h)
                try:
                    ec.codes_set(subset, 'unpack', 1)
                    if count > 1:
                        ec.codes_set(subset, 'extractSubset', i)
                        ec.codes_set(subset, 'doExtractSubsets', 1)
                        extracted = ec.codes_new_from_message(ec.codes_get_message(subset))
                        ec.codes_release(subset)
                        subset = extracted
                        ec.codes_set(subset, 'unpack', 1)
                    profile = decode_subset(subset, station, source, message)
                    if profile: profiles.append(profile)
                finally:
                    ec.codes_release(subset)
        finally:
            ec.codes_release(h)
    return profiles


def download(url):
    with urlopen(url, timeout=45) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise ValueError('DWD response exceeds size limit')
    return data


def collect(output, station, limit=240, cache=None):
    links = sorted(set(re.findall(r'href="(Z__C_EDZW_\d{14}[^"/]+\.bin)"', download(BASE).decode())), reverse=True)
    errors, found = [], {}
    cutoff = datetime.now(UTC) - timedelta(hours=30)
    for link in links[:limit]:
        stamp = datetime.strptime(re.search(r'EDZW_(\d{14})', link)[1], '%Y%m%d%H%M%S').replace(tzinfo=UTC)
        if stamp < cutoff: break
        try:
            path = cache / unquote(link) if cache else None
            data = path.read_bytes() if path and path.exists() else download(BASE + link)
            if path and not path.exists(): path.write_bytes(data)
            for profile in decode(data, station, BASE + link):
                key = profile['nominal_time']
                if key not in found or len(profile['levels']) > len(found[key]['levels']): found[key] = profile
        except (OSError, ValueError, ec.CodesInternalError) as exc:
            errors.append(dict(file=unquote(link), error=str(exc)))
            print(f'Skipping {unquote(link)}: {exc}', file=sys.stderr, flush=True)
        # Latest complete ascent is sufficient; scheduled runs preserve earlier profiles.
        if found: break
    if not found:
        raise RuntimeError(f'No verified ascent for WMO {station}; inspected up to {limit} files; errors={len(errors)}')
    for profile in found.values():
        moment = datetime.fromisoformat(profile['nominal_time'].replace('Z', '+00:00'))
        if moment.hour not in (0, 12) or moment.minute != 0:
            raise ValueError('Unsupported nominal reporting time')
        path = output / station / moment.strftime('%Y-%m-%d') / (moment.strftime('%H') + '.json')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(profile, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        print(f'{station} {profile["nominal_time"]}: {len(profile["levels"])} levels, base {profile["levels"][0]["height_m"]} m MSL', flush=True)
    (output / 'status.json').write_text(json.dumps(dict(updated_at=datetime.now(UTC).isoformat(), station_id=station, errors=errors)), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('profiles'))
    parser.add_argument('--station', default='10035', choices=['10035'])
    parser.add_argument('--limit', type=int, default=240)
    parser.add_argument('--cache', type=Path)
    args = parser.parse_args()
    if args.cache: args.cache.mkdir(parents=True, exist_ok=True)
    collect(args.output, args.station, args.limit, args.cache)
