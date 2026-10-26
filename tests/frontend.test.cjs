const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/index.html'),'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
new vm.Script(script); // The complete application must remain syntactically valid.
function extract(name) {
  const start=script.indexOf('function '+name+'('), tail=script.indexOf('\n}',start)+2;
  return script.slice(start,tail);
}
const context=vm.createContext({URL,Date,console});
for(const name of ['parseSoundingRows','csvToRows','dwdToRows','smoothSurfaceMesh']) vm.runInContext(extract(name),context);
const fixture=()=>JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/profile.json'),'utf8'));
test('verified real DWD profile loads with pressure in Pa and temperature in K',()=>{
  const rows=context.dwdToRows(fixture(),'10035','2026-10-26','00');
  assert.equal(rows.length,3329); assert.equal(rows[0].p,99274); assert.equal(rows[0].T,282.65);
});
test('wrong station, time, source, missing values and nonmonotonic profiles are rejected',()=>{
  for(const mutate of [p=>p.station_id='10184',p=>p.nominal_time='2026-10-25T12:00:00Z',p=>p.source_url='https://example.com/',p=>p.levels[0].dewpoint_c=null,p=>p.levels[1].height_m=0,p=>p.levels[1].pressure_hpa=1100]) {
    const p=fixture();mutate(p);assert.throws(()=>context.dwdToRows(p,'10035','2026-10-26','00'));
  }
});
test('Wyoming CSV headers remain accepted and empty dewpoints are not zero',()=>{
  const csv='pressure_hPa,geopotential height_m,temperature_C,dew point temperature_C\n1000,46,10,5\n900,1046,4,\n800,2046,-2,-5\n700,3046,-8,-12\n600,4046,-14,-18\n500,5046,-20,-25';
  const rows=context.csvToRows(csv);assert.equal(rows.length,5);assert.equal(context.parseSoundingRows(rows).length,5);
  assert.equal(rows[0].z,46);assert.equal(rows[0].p,100000);
});
test('surface smoothing softens sharp peaks without modifying input measurements',()=>{
  const mesh=[[{B:0},{B:0},{B:1},{B:0},{B:0},null]];
  const before=JSON.stringify(mesh),smoothed=context.smoothSurfaceMesh(mesh);
  assert.equal(JSON.stringify(mesh),before);assert.ok(smoothed[0][2].B<1);assert.ok(smoothed[0][1].B>0);assert.equal(smoothed[0][5],null);
  assert.ok(context.smoothSurfaceMesh([[{B:.5},{B:.5},{B:.5}]])[0].every(p=>p.B===.5));
});
