import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as domain from '../src/domain.mjs';
import * as view from '../src/rotation-view.mjs';
import {runPreflight} from '../src/preflight.mjs';
import * as biofirewall from '../src/biofirewall.mjs';
import {renderPreflightPanel as renderPreflightPanelHtml} from '../src/preflight-view.mjs';
import {messages} from '../src/i18n.mjs';
import * as explorer from '../src/map-explorer.mjs';

const square=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];
const num=(n,d=1)=>Number(n).toFixed(d);
const overlay=(extra={},lang='en')=>explorer.overlayHtml({labels:{...messages[lang].explorer,hectares:messages[lang].hectares,unavailable:messages[lang].unavailable},num,polygon:[],areaHa:null,center:null,nasaClimate:null,evaluations:null,...extra});

test('focus camera frames the actual polygon bounds and follows the 2D/3D mode',()=>{
  const flat=explorer.focusCamera(square,{terrain:false});
  assert.deepEqual(flat.bounds,[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(flat.options.pitch,0);
  assert.equal(flat.options.bearing,0);
  assert.equal(flat.options.maxZoom,15);
  assert.ok(flat.options.duration>0);
  const oblique=explorer.focusCamera(square,{terrain:true});
  assert.deepEqual(oblique.bounds,flat.bounds);
  assert.equal(oblique.options.pitch,55);
  assert.equal(oblique.options.bearing,explorer.CAMERA.bearing3d);
  assert.notEqual(explorer.CAMERA.bearing3d,0);
  assert.equal(explorer.focusCamera([],{}),null);
});
test('focus padding keeps the parcel clear of the overlay and controls, and always leaves room to fit',()=>{
  const wide=explorer.focusCamera(square,{}).options.padding;
  assert.ok(wide.left>=272&&wide.right>=280,'desktop framing reserves both floating panels');
  assert.ok(wide.bottom>=124&&wide.top>=150,'framing clears bottom controls and top branding');
  const rtl=explorer.focusCamera(square,{rtl:true}).options.padding;
  assert.deepEqual([rtl.left,rtl.right],[wide.right,wide.left]);
  const compact=explorer.focusCamera(square,{compact:true}).options.padding;
  assert.ok(compact.left<wide.left&&compact.top>=96);
  const tiny=explorer.focusCamera(square,{size:[300,260]}).options.padding;
  assert.ok(tiny.left+tiny.right<=300*.6+1e-9);
  assert.ok(tiny.top+tiny.bottom<=260*.6+1e-9);
  assert.ok(Math.abs(tiny.left/tiny.right-wide.left/wide.right)<1e-9,'clamping keeps the composition proportions');
  assert.deepEqual(explorer.focusCamera(square,{size:[1040,690]}).options.padding,wide);
});
test('field features stay on the real coordinates and spotlight only a finished boundary',()=>{
  const done=explorer.fieldFeatures(square,{drawing:false});
  const ring=[...square,square[0]];
  const outline=done.find(f=>f.geometry.type==='Polygon'&&f.properties.kind==='field');
  assert.deepEqual(outline.geometry.coordinates,[ring]);
  const mask=done.find(f=>f.properties.kind==='mask');
  assert.equal(mask.geometry.coordinates.length,2);
  assert.deepEqual(mask.geometry.coordinates[1],ring);
  assert.deepEqual(done.filter(f=>f.geometry.type==='Point').map(f=>f.geometry.coordinates),square);
  const draft=explorer.fieldFeatures(square,{drawing:true});
  assert.equal(draft.some(f=>f.properties.kind==='mask'),false);
  assert.equal(draft.filter(f=>f.geometry.type==='Polygon').length,1);
  assert.deepEqual(explorer.fieldFeatures(square.slice(0,2),{drawing:true}).map(f=>f.geometry.type),['Point','Point','LineString']);
  assert.deepEqual(explorer.fieldFeatures([],{}),[]);
});
test('boundary reveal is finite, settles on the resting style and is skipped for reduced motion or drawing',()=>{
  assert.ok(explorer.revealPlan({}).duration>0&&explorer.revealPlan({}).duration<=2000);
  assert.equal(explorer.revealPlan({reducedMotion:true}).duration,0);
  assert.equal(explorer.revealPlan({drawing:true}).duration,0);
  const start=explorer.revealPaint(0),end=explorer.revealPaint(1);
  assert.deepEqual(end,explorer.FIELD_PAINT);
  assert.deepEqual(explorer.revealPaint(7),end);
  assert.deepEqual(explorer.revealPaint(-1),start);
  assert.equal(start['field-mask']['fill-opacity'],0);
  assert.ok(end['field-mask']['fill-opacity']>0&&end['field-mask']['fill-opacity']<=.45);
  assert.ok(start['field-glow']['line-width']>end['field-glow']['line-width']);
  assert.ok(end['field-line']['line-width']>=3);
  const mid=explorer.revealPaint(.5);
  assert.ok(mid['field-glow']['line-width']<start['field-glow']['line-width']&&mid['field-glow']['line-width']>end['field-glow']['line-width']);
});
test('camera never animates under reduced motion or while drawing',()=>{
  assert.equal(explorer.focusCamera(square,{reducedMotion:true}).options.duration,0);
  assert.equal(explorer.focusCamera(square,{drawing:true}).options.duration,0);
  assert.equal(explorer.terrainCamera(true,{reducedMotion:true}).duration,0);
  assert.equal(explorer.resetCamera([],{drawing:true},{center:[1,2],zoom:12}).duration,0);
});
test('coordinate search stays left-to-right while place names follow their language',()=>{
  assert.equal(explorer.searchInputDirection('36.8, -119.93'),'ltr');
  assert.equal(explorer.searchInputDirection('31.53,35.10'),'ltr');
  assert.equal(explorer.searchInputDirection('Hebron'),'auto');
  assert.equal(explorer.searchInputDirection('الخليل'),'auto');
});

test('location camera moves to searched coordinates and respects reduced motion',()=>{
  assert.deepEqual(explorer.locationCamera([-119.95,36.78],13),{center:[-119.95,36.78],zoom:13,duration:900});
  assert.equal(explorer.locationCamera([1,2],8,{reducedMotion:true}).duration,0);
});

test('terrain camera pitches for 3D and flattens for 2D without changing exaggeration',()=>{
  assert.deepEqual(Object.keys(explorer.terrainCamera(true,{})).sort(),['bearing','duration','pitch']);
  assert.equal(explorer.terrainCamera(true,{}).bearing,explorer.CAMERA.bearing3d);
  assert.equal(explorer.terrainCamera(false,{}).bearing,0);
  assert.equal(explorer.terrainCamera(true,{}).pitch,55);
  assert.equal(explorer.terrainCamera(false,{}).pitch,0);
});
test('reset view restores north and returns to the field, or home when no field exists',()=>{
  const withField=explorer.resetCamera(square,{terrain:true},{center:[1,2],zoom:12});
  assert.deepEqual(withField.bounds,[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(withField.options.bearing,0);
  assert.equal(withField.options.pitch,55);
  const home=explorer.resetCamera([],{},{center:[1,2],zoom:12});
  assert.deepEqual({center:home.center,zoom:home.zoom,bearing:home.bearing,pitch:home.pitch},{center:[1,2],zoom:12,bearing:0,pitch:0});
});
test('overlay states every missing value as unavailable and invents no metrics',()=>{
  const html=overlay();
  assert.equal(html.match(/Unavailable/g).length,4);
  assert.match(html,/Not run/);
  assert.doesNotMatch(html,/NDVI|soil moisture|yield|risk score|live/i);
});
test('overlay shows real area, centre, NASA period and Preflight unresolved counts',()=>{
  const nasaClimate={period:{startIso:'2025-01-01',endIso:'2025-12-31'},planning:{precipitationAnnualMm:312.4,temperatureMeanMaxC:24.1,temperatureMeanMinC:null}};
  const evaluations=[{checks:[{status:'PASS'},{status:'WARNING'},{status:'UNKNOWN'}]},{checks:[{status:'PASS'}]}];
  const html=overlay({polygon:square,areaHa:49.5,center:[-119.945,36.7825],nasaClimate,evaluations});
  assert.match(html,/49\.50/);
  assert.match(html,/36\.78250, -119\.94500/);
  assert.match(html,/2025-01-01 — 2025-12-31/);
  assert.match(html,/312\.4/);
  assert.match(html,/24\.1/);
  assert.equal(html.match(/Unavailable/g).length,1);
  assert.match(html,/A 2 · B 0/);
  assert.doesNotMatch(html,/Not run/);
});
test('overlay states the real view mode and the analysis path from app state only',()=>{
  const empty=overlay();
  assert.match(empty,/2D map/);
  assert.doesNotMatch(empty,/Real DEM/);
  assert.equal(empty.match(/data-state="done"/g),null);
  assert.equal(empty.match(/data-state="next"/g).length,1);
  assert.match(empty,/<li data-state="next"[^>]*>(?:(?!<\/li>).)*Boundary/);
  const three=overlay({terrain:true,polygon:square,areaHa:49.5,center:[-119.945,36.7825]});
  assert.match(three,/3D · Real DEM · 1×/);
  assert.equal(three.match(/data-state="done"/g).length,1);
  assert.match(three,/<li data-state="next"[^>]*>(?:(?!<\/li>).)*Climate/);
  const all=overlay({polygon:square,areaHa:49.5,center:[-119.945,36.7825],nasaClimate:{period:{startIso:'2025-01-01',endIso:'2025-12-31'},planning:{}},evaluations:[{checks:[]}]});
  assert.equal(all.match(/data-state="done"/g).length,3);
  assert.doesNotMatch(all,/data-state="next"/);
});
test('overlay is localized in Arabic',()=>{
  const html=overlay({},'ar');
  assert.match(html,/غير متاح/);
  assert.doesNotMatch(html,/Unavailable|Not run/);
});
test('overlay never intercepts pointer or touch input and map controls keep touch-sized targets',async()=>{
  const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
  assert.match(css,/\.map-overlay\{[^}]*pointer-events:none/);
  assert.match(css,/@media\(max-width:760px\)\{\.map-tools button\{[^}]*min-height:44px;width:44px/);
  assert.match(css,/\.field-tag\{[^}]*pointer-events:none/);
  assert.match(css,/\.map-shell::after\{[^}]*pointer-events:none/);
  assert.match(css,/@media\(max-width:760px\)\{[^@]*\.draw-tools button,\.layer-switch button\{[^}]*min-height:44px;min-width:44px/);
  assert.match(css,/@media\(max-width:760px\)\{[^@]*\.maplibregl-ctrl-attrib\{[^}]*min-height:44px/);
  assert.doesNotMatch(css,/animation:[^;}]*infinite/);
});

const source=(await readFile(new URL('../src/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/render\(\);\s*$/,'');
function harness(){
  const elements=new Map();
  const make=()=>({innerHTML:'',value:'',textContent:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},replaceWith(next){this.replacedWith=next;},addEventListener(){},append(){},prepend(){}});
  const document={createElement:()=>({...make(),querySelectorAll:()=>[]}),documentElement:{dataset:{}},getElementById(id){if(!elements.has(id))elements.set(id,make());return elements.get(id);},querySelectorAll(){return [];},querySelector(selector){return [".header-end","main"].includes(selector)?make():null;}};
  const calls=[];
  const container=make();
  const fakeMap={removed:false,remove(){this.removed=true;},getCenter:()=>({toArray:()=>[1,2]}),getZoom:()=>10,getContainer:()=>container,resize(){calls.push(['resize']);},getCanvas:()=>({style:{}}),getSource:()=>({setData(data){calls.push(['setData',data]);}}),setLayoutProperty(){},setTerrain(){},setPitch(){},setPaintProperty(...a){calls.push(['paint',...a]);},fitBounds(...a){calls.push(['fitBounds',...a]);},easeTo(...a){calls.push(['easeTo',...a]);}};
  const context=vm.createContext({...domain,...view,...biofirewall,...explorer,runPreflight,renderPreflightPanelHtml,messages,document,Intl,URL,console,fakeMap});
  vm.runInContext(source,context);return {elements,calls,container,fakeMap,run:code=>vm.runInContext(code,context)};
}
test('app renders the map overlay from current field state',()=>{
  const h=harness();h.run('renderField()');
  assert.match(h.elements.get('map-overlay').innerHTML,/Unavailable/);
  h.run('polygon=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];renderField()');
  assert.match(h.elements.get('map-overlay').innerHTML,/36\.78250, -119\.94500/);
});
test('switching language keeps the same MapLibre instance and 3D state',()=>{
  const h=harness();
  h.run("map=fakeMap;mapReady=true;terrain=true;lang='ar';render()");
  assert.equal(h.fakeMap.removed,false);
  assert.equal(h.elements.get('map').replacedWith,h.container);
  assert.ok(h.calls.some(([name])=>name==='resize'));
  assert.equal(h.run('terrain'),true);
  assert.equal(h.run('map===fakeMap'),true);
  assert.equal(h.elements.get('terrain')['aria-pressed'],'true');
});
const fits=h=>h.calls.filter(([name])=>name==='fitBounds');
const apply='setPolygon([[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]])';
test('selecting a field loads the real DEM and frames the parcel once in the oblique view',async()=>{
  const h=harness();
  h.run('var demLoads=0;loadTerrain=async()=>{demLoads++;terrain=true;return true;};map=fakeMap;mapReady=true;'+apply);
  assert.equal(fits(h).length,0,'no flat camera move before the oblique one');
  await h.run('selectionTask');
  assert.equal(fits(h).length,1);
  assert.deepEqual(fits(h)[0][1],[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(fits(h)[0][2].pitch,explorer.CAMERA.pitch3d);
  assert.equal(fits(h)[0][2].bearing,explorer.CAMERA.bearing3d);
  assert.equal(h.run('demLoads'),1);
  h.run(apply);await h.run('selectionTask');
  assert.equal(h.run('demLoads'),1,'an active DEM is reused');
  assert.equal(fits(h).length,2);
});
test('selection falls back to an honest flat view when the DEM is unavailable',async()=>{
  const h=harness();
  h.run('var demLoads=0;loadTerrain=async()=>{demLoads++;return false;};map=fakeMap;mapReady=true;'+apply);
  await h.run('selectionTask');
  assert.equal(fits(h).length,1);
  h.run(apply);await h.run('selectionTask');
  assert.equal(h.run('demLoads'),1,'a failed DEM is not re-probed on every selection');
  assert.equal(fits(h).length,2);
  assert.equal(fits(h)[1][2].pitch,0);
  assert.equal(fits(h)[0][2].pitch,0);
  assert.equal(fits(h)[0][2].bearing,0);
  assert.equal(h.run('terrain'),false);
  assert.match(h.elements.get('map-overlay').innerHTML,/2D map/);
});
test('an explicit switch back to 2D is kept for later selections',async()=>{
  const h=harness();
  h.run('var demLoads=0;loadTerrain=async()=>{demLoads++;terrain=true;return true;};map=fakeMap;mapReady=true;terrain=true;');
  await h.run('toggleTerrain()');
  assert.equal(h.run('terrain'),false);
  h.run(apply);await h.run('selectionTask');
  assert.equal(h.run('demLoads'),0);
  assert.equal(fits(h).at(-1)[2].pitch,0);
  await h.run('toggleTerrain()');
  assert.equal(h.run('terrain'),true);
  h.run(apply);await h.run('selectionTask');
  assert.equal(fits(h).at(-1)[2].pitch,explorer.CAMERA.pitch3d);
});
test('only the latest selection moves the camera and drawing is never interrupted',async()=>{
  const h=harness();
  h.run('loadTerrain=async()=>{terrain=true;return true;};map=fakeMap;mapReady=true;'+apply);
  const first=h.run('selectionTask');
  h.run('setPolygon([[10,20],[10.01,20],[10.01,20.01]])');
  await first;await h.run('selectionTask');
  assert.equal(fits(h).length,1);
  assert.deepEqual(fits(h)[0][1],[[10,20],[10.01,20.01]]);
  h.run('terrain=false;'+apply);h.run('drawing=true');await h.run('selectionTask');
  assert.equal(fits(h).length,1);
});
test('setting a completed boundary animates the camera to its actual bounds',async()=>{
  const h=harness();
  h.run('map=fakeMap;mapReady=true;drawing=true;setPolygon([[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]])');
  assert.equal(h.run('drawing'),false);
  await h.run('selectionTask');
  const focus=h.calls.filter(([name])=>name==='fitBounds').at(-1);
  assert.ok(focus);
  assert.deepEqual(focus[1],[[-119.95,36.78],[-119.94,36.785]]);
  assert.ok(focus[2].duration>0);
});

test('focus and reset use MapLibre camera APIs on the live instance',()=>{
  const h=harness();
  h.run('map=fakeMap;mapReady=true;polygon=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];fit()');
  assert.deepEqual(h.calls.at(-1)[1],[[-119.95,36.78],[-119.94,36.785]]);
  h.run('polygon=[];resetView()');
  assert.equal(h.calls.at(-1)[0],'easeTo');
  assert.equal(h.calls.at(-1)[1].bearing,0);
});
test('a completed boundary is spotlighted on its own coordinates and settles on the resting style',()=>{
  const h=harness();
  h.run('map=fakeMap;mapReady=true;setPolygon([[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]])');
  const data=h.calls.filter(([name])=>name==='setData').at(-1)[1];
  assert.deepEqual(data.features.find(f=>f.properties.kind==='mask').geometry.coordinates[1][0],[-119.95,36.78]);
  const paints=h.calls.filter(([name])=>name==='paint');
  assert.ok(paints.some(([,layer,prop,value])=>layer==='field-mask'&&prop==='fill-opacity'&&value===explorer.FIELD_PAINT['field-mask']['fill-opacity']));
  h.run('drawing=true;draft=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785]];updateDraw()');
  assert.equal(h.calls.filter(([name])=>name==='setData').at(-1)[1].features.some(f=>f.properties.kind==='mask'),false);
});
test('overlay mode follows the real 2D/3D state',()=>{
  const h=harness();h.run('renderField()');
  assert.match(h.elements.get('map-overlay').innerHTML,/2D map/);
  h.run('terrain=true;renderField()');
  assert.match(h.elements.get('map-overlay').innerHTML,/3D · Real DEM · 1×/);
});
test('oblique focus bearing follows the real longest edge of the parcel',()=>{
  assert.equal(explorer.parcelBearing(square),0);
  const tall=[[10,20],[10.002,20],[10.002,20.02],[10,20.02]];
  assert.equal(Math.abs(explorer.parcelBearing(tall)),90);
  assert.equal(explorer.focusCamera(tall,{terrain:true}).options.bearing,explorer.parcelBearing(tall)+explorer.CAMERA.bearing3d);
  assert.equal(explorer.focusCamera(tall,{terrain:false}).options.bearing,0);
  assert.equal(explorer.parcelBearing([]),0);
});
test('orbit is one finite step that keeps the parcel framed and respects reduced motion',()=>{
  const right=explorer.orbitCamera(square,{terrain:true},{bearing:-18,pitch:55},1);
  assert.deepEqual(right.bounds,[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(right.options.bearing,-18+explorer.CAMERA.orbitStep);
  assert.equal(right.options.pitch,55);
  assert.ok(right.options.duration>0&&right.options.duration<=1000);
  assert.equal(explorer.orbitCamera(square,{reducedMotion:true},{bearing:0,pitch:0},-1).options.duration,0);
  assert.deepEqual(explorer.orbitCamera([],{},{bearing:10},-1),{bearing:10-explorer.CAMERA.orbitStep,duration:explorer.CAMERA.orbitDuration});
});
test('next step on the map follows boundary, NASA and Preflight state only',()=>{
  assert.equal(explorer.nextStep({polygon:[]}),null);
  assert.equal(explorer.nextStep({polygon:square}),'analyze');
  assert.equal(explorer.nextStep({polygon:square,nasaClimate:{}}),'preflight');
  assert.equal(explorer.nextStep({polygon:square,nasaClimate:{},evaluations:[{checks:[]}]}),'review');
});
test('boundary trace is transparent at rest and its stops always ascend',()=>{
  for(const p of [0,1])assert.deepEqual(explorer.traceGradient(p).slice(3),[0,'rgba(236,255,214,0)',1,'rgba(236,255,214,0)']);
  for(const p of [.01,.3,.7,.85,.99]){const stops=explorer.traceGradient(p).slice(3).filter((_,i)=>i%2===0);assert.ok(stops.every((v,i)=>i===0||v>stops[i-1]),'ascending at '+p);assert.equal(stops.at(-1),1);}
  assert.equal(explorer.fieldFeatures(square,{}).filter(f=>f.properties.kind==='trace').length,1);
  assert.equal(explorer.fieldFeatures(square,{drawing:true}).some(f=>f.properties.kind==='trace'),false);
});
test('the map next-step button and overlay note are wired from app state',()=>{
  const h=harness();h.run('renderField()');
  assert.equal(h.elements.get('next-step').hidden,true);
  h.run('polygon=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];renderField()');
  assert.equal(h.elements.get('next-step').hidden,false);
  assert.match(h.elements.get('next-step').innerHTML,/Analyze this field/);
  assert.match(h.elements.get('map-overlay').innerHTML,/visual emphasis, not measurements/);
  assert.equal(h.elements.get('map-shell').dataset.field,'1');
});

