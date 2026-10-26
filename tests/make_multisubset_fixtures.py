"""Regenerate synthetic two-station TEMP fixtures (requires ecCodes)."""
import eccodes as e
from pathlib import Path
for compressed in (0,1):
    h=e.codes_bufr_new_from_samples('BUFR4')
    e.codes_set(h,'masterTablesVersionNumber',31)
    e.codes_set(h,'numberOfSubsets',2)
    e.codes_set(h,'compressedData',compressed)
    e.codes_set_array(h,'inputExtendedDelayedDescriptorReplicationFactor',[6] if compressed else [6,6])
    e.codes_set_array(h,'inputDelayedDescriptorReplicationFactor',[0] if compressed else [0,0])
    e.codes_set_array(h,'unexpandedDescriptors',[309057])
    for key,value in [('typicalYear',2026),('typicalMonth',10),('typicalDay',26),('typicalHour',0),('typicalMinute',0),('typicalSecond',0)]: e.codes_set(h,key,value)
    for key,values in {'blockNumber':[10,10],'stationNumber':[184,35],'year':[2026,2026],'month':[10,10],'day':[26,26],'hour':[0,0],'minute':[0,0],'second':[0,0],'heightOfStationGroundAboveMeanSeaLevel':[0,0]}.items():
        e.codes_set_array(h,key,values)
    values={'nonCoordinateGeopotentialHeight':[0,1000,2000,3000,4000,5000], 'pressure':[100000,90000,80000,70000,60000,50000], 'airTemperature':[280,274,268,262,256,250], 'dewpointTemperature':[275,269,263,257,251,245]}
    for key,vs in values.items():
        if compressed:
            for i,v in enumerate(vs,1): e.codes_set_array(h,f'#{i}#{key}',[v,v])
        else:
            e.codes_set_array(h,key,[float(v) for v in vs+vs])
    e.codes_set(h,'pack',1)
    Path(f'tests/fixtures/multi-{compressed}.bufr').write_bytes(e.codes_get_message(h))
    e.codes_release(h)
