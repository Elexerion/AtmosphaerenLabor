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
vm.runInContext(script.slice(script.indexOf('const g='),script.indexOf('\nconst defs=')),context);
vm.runInContext(script.slice(script.indexOf('function es('),script.indexOf('// Pseudoadiabatic')),context);
for(const name of ['parseSoundingRows','csvToRows','dwdToRows','smoothSurfaceMesh','diagnostics','rowAtHeight','chartLandmarks','arrangeCallouts','flightEndpointInfo','cloudScenario','cloudSymbol','cloudFormHint','visibleChartRows','freezingPoints','lowerChartFocus','horizontalChartRange','surfaceCoordinates','heightPressureTicks','sampleHeightSurface','adjustedSoundingPoint','graphTermKeys','graphHelpHit','compareStabilityGradient','saturatedStabilityGradient','stabilityLayers','stabilityDescription','referenceTemperatureLines','learningTopics','learningText','matchingLearningTopics']) vm.runInContext(extract(name),context);
const fixture=()=>JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/profile.json'),'utf8'));
test('clouds fill only when saturation is reached; outline never paints a fill',()=>{
  const rows=[{z:0,B:-.01},{z:1000,B:-.02}],profile={rows,lcl:500};
  assert.equal(context.cloudScenario(profile,0),'outline');
  assert.equal(context.cloudScenario(profile,499),'outline');
  assert.equal(context.cloudScenario(profile,500),'filled');
  assert.equal(context.cloudScenario({...profile,lcl:0},0),'filled');
  for(const lcl of [null,1500])assert.equal(context.cloudScenario({...profile,lcl},3000),'none');
  let fills=0,strokes=0;const ctx={save(){},restore(){},beginPath(){},moveTo(){},bezierCurveTo(){},closePath(){},fill(){fills++},stroke(){strokes++}};
  context.cloudSymbol(ctx,0,0,false);assert.equal(fills,0);assert.equal(strokes,1);
  context.cloudSymbol(ctx,0,0,true);assert.equal(fills,1);assert.equal(strokes,2);
});
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
test('landmarks locate interpolated LCL/LFC/EL and the strongest inversion',()=>{
  const rows=[-.01,-.002,.02,-.01,-.03].map((B,i)=>({z:i*1000,p:100000-i*10000,T:280-i*7,Td:275-i*7,Te:[280,275,279,270,260][i],B}));
  const points=context.chartLandmarks({rows,lcl:500}),get=key=>points.find(p=>p.key===key);
  assert.equal(get('LCL').row.z,500);assert.ok(Math.abs(get('LFC').row.z-1090.909)<.01);assert.ok(Math.abs(get('EL').row.z-2666.667)<.01);
  assert.equal(get('maxB').row.z,2000);assert.equal(get('inversion').delta,4);assert.equal(get('inversion').row.z,1500);
  assert.equal(context.chartLandmarks({rows,lcl:null}).some(p=>p.key==='LCL'),false);
});
test('nearby label boxes do not overlap or leave the plot',()=>{
  const points=context.arrangeCallouts(Array.from({length:8},(_,i)=>({y:580+i})),20,600);
  assert.ok(points[0].labelY>=20);assert.ok(points.at(-1).labelY+38<=600);
  for(let i=1;i<points.length;i++)assert.ok(points[i].labelY>=points[i-1].labelY+44);
});
test('flight endpoints restore MSL height and keep missing metadata unknown',()=>{
  const rows=[{z:0,p:99000,T:280,Td:275},{z:30000,p:1000,T:220,Td:210}];
  const info=context.flightEndpointInfo(rows,46,null);assert.equal(info.start.height_m,46);assert.equal(info.end.height_m,30046);assert.equal(info.end.time,undefined);assert.equal(info.start.latitude,undefined);
});


test('chart crop interpolates its top and preserves all physical rows and diagnostics',()=>{
  const rows=[0,1000,2000,3000].map((z,i)=>({z,p:100000-i*10000,T:283.15-i*6,Te:285.15-i*8,Td:280-i*6,B:[-.02,-.01,.03,-.02][i]})),pro={rows,lcl:600};
  const before=JSON.stringify(pro),metrics=JSON.stringify(context.diagnostics(pro));
  const visible=context.visibleChartRows(rows,1500);assert.equal(visible.length,3);assert.equal(visible.at(-1).z,1500);assert.equal(visible.at(-1).p,85000);
  assert.equal(context.freezingPoints(rows).find(p=>p.key==='zeroEnv').row.z,1500);
  assert.ok(Math.abs(context.freezingPoints(rows).find(p=>p.key==='zeroParcel').row.z-1666.667)<.01);
  assert.ok(context.lowerChartFocus(pro)>=2000);assert.ok(context.lowerChartFocus(pro)<=3000);
  const full=context.horizontalChartRange(rows,'temp',1,600),crop=context.horizontalChartRange(visible,'temp',1,600),zoom=context.horizontalChartRange(visible,'temp',3,600);
  assert.ok(crop.max-crop.min<full.max-full.min);assert.ok(Math.abs((crop.max-crop.min)/3-(zoom.max-zoom.min))<1e-9);assert.ok(zoom.min<=0&&zoom.max>=0);
  const buoy=context.horizontalChartRange(visible,'buoy',4,600);assert.ok(buoy.min<=0&&buoy.max>=0);
  assert.equal(JSON.stringify(pro),before);assert.equal(JSON.stringify(context.diagnostics(pro)),metrics);
  assert.equal(context.freezingPoints([{z:0,T:270,Te:270},{z:100,T:269,Te:268}]).length,0);
});


test('geometric height is vertical and buoyancy horizontal in the 3D geometry',()=>{
  const base=context.surfaceCoordinates(.6,0,0),higher=context.surfaceCoordinates(.6,3000,0),positive=context.surfaceCoordinates(.6,0,.1);
  assert.equal(base[0],higher[0]);assert.equal(base[1],higher[1]);assert.ok(higher[2]>base[2]);
  assert.equal(positive[0],base[0]);assert.equal(positive[2],base[2]);assert.ok(positive[1]>base[1]);
});


test('loaded profile remains exact at baseline and each thermodynamic slider changes its scenario',()=>{
  const physics=vm.createContext({console});
  vm.runInContext(script.slice(script.indexOf('const g='),script.indexOf('\nconst defs=')),physics);
  vm.runInContext(script.slice(script.indexOf('function es('),script.indexOf('// Pseudoadiabatic')),physics);
  vm.runInContext(script.split('\n').find(line=>line.startsWith('function interpSound(')),physics);
  for(const name of ['adjustedSoundingPoint','graphTermKeys','graphHelpHit','compareStabilityGradient','saturatedStabilityGradient','stabilityLayers','stabilityDescription','referenceTemperatureLines','learningTopics','learningText','matchingLearningTopics','soundingEnvironment','profile','diagnostics'])vm.runInContext(extract(name),physics);
  const baseline={t0:10,td0:6,p0:993,gamma:.65,top:15000,rhDecay:2000};
  const raw=fixture().levels,base=raw[0].height_m;
  physics.sounding=raw.map(r=>({z:r.height_m-base,p:r.pressure_hpa*100,T:r.temp_c+273.15,Td:r.dewpoint_c+273.15}));
  physics.soundingBaseline={...baseline};physics.state={...baseline};
  const original=JSON.stringify(physics.sounding),pro=physics.profile(.65),d=physics.diagnostics(pro);
  assert.equal(d.lcl,480);assert.ok(Math.abs(d.lfc-1436)<2);assert.ok(Math.abs(d.el-2436)<2);assert.ok(Math.abs(d.cape-10)<1);assert.ok(Math.abs(d.cin+59)<1);
  assert.equal(pro.rows[0].T,raw[0].temp_c+273.15);assert.equal(pro.rows[0].p,raw[0].pressure_hpa*100);
  for(const row of pro.rows)assert.ok(Math.abs(row.Te-physics.interpSound(row.z,'T'))<1e-9);
  for(const [key,value] of [['t0',11],['td0',7],['p0',1003],['gamma',.7],['rhDecay',2250]]){
    physics.state={...baseline,[key]:value};const changed=physics.profile(physics.state.gamma);
    assert.notEqual(JSON.stringify(changed),JSON.stringify(pro),key+' must affect the calculated profile');
  }
  physics.state={...baseline,gamma:.7};assert.ok(Math.abs(physics.profile(.7).rows[100].Te-(pro.rows[100].Te-1))<1e-9);
  physics.state={...baseline};assert.equal(JSON.stringify(physics.profile(.65)),JSON.stringify(pro));assert.equal(JSON.stringify(physics.sounding),original);
});


test('cloud forms remain conditional, with a stated condensation base and no invented cloud top',()=>{
  const rows=[-.02,-.01,.02,-.02].map((B,i)=>({z:i*1000,B})),pro={rows,lcl:500};
  const unforced=context.cloudFormHint(pro,0);assert.equal(unforced.state,'outline');assert.equal(unforced.form,'stratiform');assert.equal(unforced.base,500);
  assert.equal(context.cloudFormHint(pro,1000).form,'stratiform');
  const convective=context.cloudFormHint(pro,2000);assert.equal(convective.form,'cumuliform');assert.equal(convective.state,'filled');assert.equal(convective.top,undefined);
  assert.equal(context.cloudFormHint({...pro,lcl:null},3000).form,null);
});


test('canvas help uses word boundaries and correct hit coordinates after scaling',()=>{
  assert.deepEqual(Array.from(context.graphTermKeys('LCL · mögliche Cu-Form')),['LCL','Cu']);
  assert.equal(context.graphTermKeys('Modellobergrenze').length,0);
  assert.deepEqual(Array.from(context.graphTermKeys('B=0 · 850 hPa')),['B','hPa']);
  assert.deepEqual(Array.from(context.graphTermKeys('CAPE 100 J/kg')),['CAPE','J/kg']);
  const regions=[{x:100,y:200,width:80,height:40,keys:['LCL']},{x:100,y:200,width:20,height:20,keys:['B']}],rect={left:10,top:20,width:400,height:450};
  assert.equal(context.graphHelpHit(regions,rect,800,900,65,125).keys[0],'B');
  assert.equal(context.graphHelpHit(regions,rect,800,900,95,135).keys[0],'LCL');
  assert.equal(context.graphHelpHit(regions,rect,800,900,20,30),null);
  assert.equal(context.graphHelpHit(regions,{...rect,width:0},800,900,65,125),null);
});


test('height grid pairs each level with selected profile pressure without extrapolation',()=>{
 const rows=[{z:0,p:100000,B:-.1},{z:1000,p:90000,B:.1},{z:2000,p:80000,B:.05}],before=JSON.stringify(rows);
 const ticks=context.heightPressureTicks(rows,3000,6);assert.equal(ticks[1].z,500);assert.equal(ticks[1].pressure_hpa,950);assert.equal(ticks.at(-1).pressure_hpa,null);
 const mesh=context.sampleHeightSurface(rows,.65,3000,6,.8,1000);assert.equal(mesh[1].z,500);assert.equal(mesh[1].p,950);assert.equal(mesh[1].B,0);assert.equal(mesh[1].storm,0);assert.equal(mesh[2].storm,.8);assert.equal(mesh[5],null);
 assert.equal(JSON.stringify(rows),before);
 const a=context.surfaceCoordinates(.65,1000,0,3000),b=context.surfaceCoordinates(.65,2000,0,3000),c=context.surfaceCoordinates(.65,3000,0,3000);assert.ok(Math.abs((b[2]-a[2])-(c[2]-b[2]))<1e-12);
});


test('learning help covers every weather and display setting and searches across German wording',()=>{
 const topics=context.learningTopics(),ids=topics.map(t=>t.id),targets=new Set(topics.flatMap(t=>t.targets));
 assert.equal(new Set(ids).size,ids.length);assert.ok(topics.filter(t=>t.group==='practice').every(t=>t.steps.length>=3));
 const definition=script.slice(script.indexOf('const defs=')+'const defs='.length,script.indexOf(';let state={}'));
 const controls=vm.runInContext('('+definition+')',context).map(d=>d[0]);
 for(const id of [...controls,'referenceProfiles','chartCeiling','chartZoom','chartText','perspective','focal','mesh','smoothSurface','lighting','specular','stormColors','showThresholds','textSize','placeInput','stationSelect','launchDate','launchHour','loadSounding','soundingFile','soundingOff','reset','fullView','viewReset','zoomIn','zoomOut'])assert.ok(targets.has(id),'Missing learning help: '+id);
 assert.ok(context.matchingLearningTopics(topics,'all','TAUPUNKT').some(t=>t.id==='td0'));
 assert.ok(context.matchingLearningTopics(topics,'view','TEXTGRÖSSE').some(t=>t.id==='chartText'));
 assert.ok(context.matchingLearningTopics(topics,'weather','Bodentemperatur Taupunkt').some(t=>t.id==='t0'));
 assert.equal(context.matchingLearningTopics(topics,'all','xyz123unbekannt').length,0);
 for(const t of topics){assert.ok(t.sections.every(section=>section.text.length>30),t.id);if(t.source)assert.equal(new URL(t.source).protocol,'https:')}
});

test('learning exercises match the ideal model without claiming all changes increase CAPE',()=>{
 const physics=vm.createContext({console});
 vm.runInContext(script.slice(script.indexOf('const g='),script.indexOf('\nconst defs=')),physics);
 vm.runInContext(script.slice(script.indexOf('function es('),script.indexOf('// Pseudoadiabatic')),physics);
 for(const name of ['profile','diagnostics'])vm.runInContext(extract(name),physics);
 physics.sounding=null;const initial={t0:15,td0:8,p0:1013,gamma:.65,top:9000,rhDecay:2000,lift:0,wind0:5,wind6:25};physics.state={...initial};
 const before=physics.profile(.65);physics.state.td0=12;assert.ok(physics.profile(.65).lcl<before.lcl);
 physics.state={...initial,t0:20};assert.ok(physics.profile(.65).lcl>before.lcl);
 physics.state={...initial};assert.ok(physics.profile(.95).rows[150].B>physics.profile(.45).rows[150].B);
 physics.state={...initial,lift:3000,wind0:20,wind6:30};assert.equal(JSON.stringify(physics.profile(.65)),JSON.stringify(before));
});


test('layer stability distinguishes dry and saturated displacement, neutral limits and inversions',()=>{
 const row=(z,Te,p)=>({z,Te,p,T:Te,Td:Te-5,B:0}),pair=gamma=>[row(0,288.15,100000),row(500,288.15-gamma*5,95000)];
 assert.equal(context.stabilityLayers(pair(-.2),500)[0].type,'stable');
 const conditional=context.stabilityLayers(pair(.65),500)[0];assert.equal(conditional.dry,'stable');assert.equal(conditional.moist,'unstable');assert.equal(conditional.type,'conditional');
 assert.equal(context.stabilityLayers(pair(1.2),500)[0].type,'unstable');
 const dry=9.80665/1004*100;assert.equal(context.stabilityLayers(pair(dry),500)[0].dry,'neutral');assert.equal(context.compareStabilityGradient(1,dry),'neutral');
 const midT=288.15,moist=context.saturatedStabilityGradient(midT,97500),neutralMoist=[row(0,midT+moist*2.5,100000),row(500,midT-moist*2.5,95000)];assert.equal(context.stabilityLayers(neutralMoist,500)[0].moist,'neutral');
 assert.ok(context.saturatedStabilityGradient(250,60000)>context.saturatedStabilityGradient(295,100000));
 assert.equal(context.saturatedStabilityGradient(330,10000),null);
 const mixed=[...pair(.65),row(1000,285.9,90000)],before=JSON.stringify(mixed),layers=context.stabilityLayers(mixed,750);assert.equal(layers.at(-1).hi,750);assert.equal(context.stabilityDescription(layers).key,'mixed');assert.equal(JSON.stringify(mixed),before);
});

test('reference lines use a common start, exact requested gradients and a bounded ICAO segment',()=>{
 const rows=[{z:0,Te:288.15,T:288.15,Td:280,p:100000,B:0},{z:15000,Te:220,T:219,Td:210,p:12000,B:-.1}],before=JSON.stringify(rows);
 const refs=context.referenceTemperatureLines(rows,3000);assert.equal(refs.length,3);for(const r of refs)assert.equal(r.points[0].Tc,15);
 assert.equal(refs.find(r=>r.id==='moist').points[1].Tc,0);assert.equal(refs.find(r=>r.id==='icao').points[1].Tc,-4.5);assert.equal(refs.find(r=>r.id==='dry').points[1].Tc,-15);
 assert.equal(context.referenceTemperatureLines(rows,15000,46).find(r=>r.id==='icao').points[1].z,10954);
 const all=context.horizontalChartRange(rows,'temp',1,null,[-135]),plain=context.horizontalChartRange(rows,'temp',1,null);assert.ok(all.min<plain.min);assert.equal(JSON.stringify(rows),before);
});
