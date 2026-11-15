import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as domain from '../src/domain.mjs';
import * as view$ from '../src/rotation-view.mjs';
import {runPreflight} from '../src/preflight.mjs';
import * as biofirewall from '../src/biofirewall.mjs';
import {renderPreflightPanel as renderPreflightPanelHtml} from '../src/preflight-view.mjs';
import {messages} from '../src/i18n.mjs';
import * as explorer from '../src/map-explorer.mjs';
import * as farmerInputs from '../src/farmer-inputs.mjs';
import * as farmerInputView from '../src/farmer-input-view.mjs';
import * as decisionTrace from '../src/decision-trace.mjs';
import * as decisionSnapshot from '../src/decision-snapshot.mjs';
import * as decisionSnapshotValidity from '../src/decision-snapshot-validity.mjs';
import * as decisionTraceView from '../src/decision-trace-view.mjs';
import { DEMO_FIELD_ID } from '../src/demo-evidence.mjs';

const square=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];
const num=(n,d=1)=>Number(n).toFixed(d);
const overlay=(extra={},lang='en')=>explorer.overlayHtml({labels:{...messages[lang].explorer,hectares:messages[lang].hectares,unavailable:messages[lang].unavailable},num,polygon:[],areaHa:null,center:null,nasaClimate:null,evaluations:null,...extra});

test('focus camera frames the actual polygon bounds and follows the 2D/3D mode',()=>{
  const flat=explorer.focusCamera(square,{terrain:false});
  assert.deepEqual(flat.bounds,[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(flat.options.pitch,0);
  assert.equal(flat.options.bearing,0);
  assert.ok(flat.options.duration>0);
  const oblique=explorer.focusCamera(square,{terrain:true});
  assert.deepEqual(oblique.bounds,flat.bounds);
  assert.equal(oblique.options.pitch,explorer.CAMERA.pitch3d);
  assert.equal(oblique.options.bearing,explorer.CAMERA.bearing3d);
  assert.notEqual(explorer.CAMERA.bearing3d,0);
  assert.equal(explorer.focusCamera([],{}),null);
});
// ---- Visual V4B ----
test('V4B: automatic framing never zooms past the imagery\'s real maxzoom 14',()=>{
  assert.equal(explorer.CAMERA.maxZoom,14);
  for(const state of [{},{terrain:true},{compact:true,terrain:true},{reducedMotion:true}])assert.equal(explorer.focusCamera(square,state).options.maxZoom,14);
  assert.equal(explorer.resetCamera(square,{terrain:true},{center:[1,2],zoom:12}).options.maxZoom,14);
  assert.equal(explorer.orbitCamera(square,{terrain:true},{bearing:0,pitch:50},1).options.maxZoom,14);
});
test('V4B: the oblique view is a moderate tilt near north, whatever the parcel shape',()=>{
  assert.ok(explorer.CAMERA.pitch3d>=40&&explorer.CAMERA.pitch3d<=50,'moderate pitch keeps the soft far field out of frame');
  assert.ok(Math.abs(explorer.CAMERA.bearing3d)>0&&Math.abs(explorer.CAMERA.bearing3d)<=20);
  const tall=[[10,20],[10.002,20],[10.002,20.02],[10,20.02]],wide=[[10,20],[10.02,20],[10.02,20.002],[10,20.002]];
  for(const parcel of [square,tall,wide]){
    const focus=explorer.focusCamera(parcel,{terrain:true}).options;
    assert.equal(focus.bearing,explorer.CAMERA.bearing3d,'2D and 3D show the same ground the same way up');
    assert.equal(focus.pitch,explorer.CAMERA.pitch3d);
    assert.equal(explorer.focusCamera(parcel,{terrain:false}).options.bearing,0);
  }
});
test('V4B: selection motion is one short settle',()=>{
  const focus=explorer.focusCamera(square,{terrain:true}).options;
  assert.ok(focus.duration>=600&&focus.duration<=1300,'short enough to feel immediate, long enough to read');
  assert.equal(typeof focus.easing,'function');
  assert.equal(focus.easing(0),0);assert.equal(focus.easing(1),1);
  assert.ok(explorer.revealPlan({}).duration<=1300);
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
test('docked shell framing uses less padding, mirrors in RTL and leaves the floating-panel preset unchanged',()=>{
  const wide=explorer.focusCamera(square,{}).options.padding;
  const docked=explorer.focusCamera(square,{docked:true}).options.padding;
  assert.ok(docked.left<wide.left&&docked.right<wide.right&&docked.top<wide.top&&docked.bottom<wide.bottom,'the parcel fills more of the map when nothing floats over it');
  assert.ok(docked.right>=72&&docked.bottom>=96,'framing still clears the tool column and the bottom action row');
  const rtl=explorer.focusCamera(square,{docked:true,rtl:true}).options.padding;
  assert.deepEqual([rtl.left,rtl.right],[docked.right,docked.left]);
  const compact=explorer.focusCamera(square,{docked:true,compact:true}).options.padding;
  assert.ok(compact.left<docked.left&&compact.right>=60);
  assert.deepEqual(explorer.focusCamera(square,{docked:false}).options.padding,wide);
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
  assert.ok(end['field-line']['line-width']>=1.5);
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
  assert.equal(explorer.terrainCamera(true,{}).pitch,explorer.CAMERA.pitch3d);
  assert.equal(explorer.terrainCamera(false,{}).pitch,0);
});
test('reset view restores north and returns to the field, or home when no field exists',()=>{
  const withField=explorer.resetCamera(square,{terrain:true},{center:[1,2],zoom:12});
  assert.deepEqual(withField.bounds,[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(withField.options.bearing,0);
  assert.equal(withField.options.pitch,explorer.CAMERA.pitch3d);
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
  const make=()=>({innerHTML:'',value:'',textContent:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},replaceWith(next){this.replacedWith=next;},addEventListener(){},append(){},prepend(){},querySelectorAll(){return [];}});
  const body=make();
  const document={body,createElement:()=>({...make(),querySelectorAll:()=>[]}),documentElement:{dataset:{}},getElementById(id){if(!elements.has(id))elements.set(id,make());return elements.get(id);},querySelectorAll(){return [];},querySelector(selector){return [".header-end","main",".field-panel"].includes(selector)?make():null;}};
  const calls=[];
  const container=make();
  // Map events (on) and DOM input on the map surface are recorded so tests can fire them the way MapLibre and the browser do.
  const handlers={},inputs={},view={bearing:0,pitch:0};
  const emit=(type,event={})=>{for(const fn of handlers[type]??[])fn(event);};
  const look=options=>{if(Number.isFinite(options?.bearing))view.bearing=options.bearing;if(Number.isFinite(options?.pitch))view.pitch=options.pitch;};
  const surface={addEventListener(type,fn){(inputs[type]??=[]).push(fn);}};
  const fakeMap={removed:false,remove(){this.removed=true;},getCenter:()=>({toArray:()=>[1,2]}),getZoom:()=>10,getContainer:()=>container,getCanvasContainer:()=>surface,resize(){calls.push(['resize']);emit('resize');},getCanvas:()=>({style:{}}),getSource:()=>({setData(data){calls.push(['setData',data]);}}),getLayer(id){return id==='field-mask'?{}:null;},setLayoutProperty(...a){calls.push(['layout',...a]);},setTerrain(){},setLight(){},setPitch(){},setPaintProperty(...a){calls.push(['paint',...a]);},fitBounds(...a){look(a[1]);calls.push(['fitBounds',...a]);},easeTo(...a){look(a[0]);calls.push(['easeTo',...a]);},jumpTo(...a){calls.push(['jumpTo',...a]);},zoomIn(...a){calls.push(['zoomIn',...a]);},zoomOut(...a){calls.push(['zoomOut',...a]);},stop(){calls.push(['stop']);emit('moveend');},getBearing:()=>view.bearing,getPitch:()=>view.pitch,on(type,fn){(handlers[type]??=[]).push(fn);},once(){},isStyleLoaded:()=>true};
  const context=vm.createContext({DEMO_FIELD_ID,...domain,...view$,...biofirewall,...explorer,...farmerInputs,...farmerInputView,...decisionTrace,...decisionSnapshot,...decisionSnapshotValidity,...decisionTraceView,runPreflight,renderPreflightPanelHtml,messages,document,Intl,URL,console,setTimeout,clearTimeout,fakeMap});
  vm.runInContext(source,context);return {elements,calls,container,fakeMap,emit,input:(type,event={})=>{for(const fn of inputs[type]??[])fn(event);},run:code=>vm.runInContext(code,context)};
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
test('parcel bearing reports the real longest edge (V4B: no longer applied to automatic framing)',()=>{
  assert.equal(explorer.parcelBearing(square),0);
  const tall=[[10,20],[10.002,20],[10.002,20.02],[10,20.02]];
  assert.equal(Math.abs(explorer.parcelBearing(tall)),90);
  assert.equal(explorer.focusCamera(tall,{terrain:false}).options.bearing,0);
  assert.equal(explorer.parcelBearing([]),0);
});
// ---- Visual V4B: pure helpers ----
test('V4B: the resting boundary is a thin high-contrast edge with a subtle fill and no bloom',()=>{
  const p=explorer.FIELD_PAINT,start=explorer.revealPaint(0);
  assert.ok(p['field-line']['line-width']>=1.5&&p['field-line']['line-width']<=2.25,'thin edge');
  assert.ok(p['field-casing']['line-width']>p['field-line']['line-width']&&p['field-casing']['line-width']<=4.5,'dark casing gives the contrast');
  assert.ok(p['field-glow']['line-width']<=6&&p['field-glow']['line-opacity']<=.25,'no bloom at rest');
  assert.ok(p['field-inner']['line-opacity']<=.05);
  assert.ok(p['field-fill']['fill-opacity']>0&&p['field-fill']['fill-opacity']<=.1,'subtle fill');
  assert.ok(p['field-mask']['fill-opacity']<=.25&&p['field-shadow']['line-opacity']<=.35);
  assert.ok(start['field-glow']['line-width']<=12&&start['field-line']['line-width']<=3,'the one-off reveal stays restrained too');
});
test('V4B: a layout change re-frames the same parcel instantly at the current view angle',()=>{
  const focus=explorer.focusCamera(square,{terrain:true,docked:true});
  const again=explorer.reframeCamera(square,{terrain:true,docked:true},{bearing:27,pitch:38});
  assert.deepEqual(again.bounds,focus.bounds);
  assert.deepEqual(again.options.padding,focus.options.padding);
  assert.equal(again.options.maxZoom,14);
  assert.equal(again.options.duration,0);
  assert.equal(again.options.bearing,27);
  assert.equal(again.options.pitch,38);
  const fresh=explorer.reframeCamera(square,{terrain:true},{});
  assert.equal(fresh.options.bearing,explorer.CAMERA.bearing3d);
  assert.equal(fresh.options.pitch,explorer.CAMERA.pitch3d);
  assert.deepEqual(explorer.reframeCamera(square,{rtl:true,docked:true},{}).options.padding,explorer.focusCamera(square,{rtl:true,docked:true}).options.padding);
  assert.equal(explorer.reframeCamera([],{},{}),null);
  assert.equal(explorer.reframeCamera(square,{size:[0,0]},{}),null,'a hidden map is never fitted');
});
test('V4B: a distant parcel is approached at its real centre, below the fit zoom',()=>{
  const jump=explorer.approachCamera(square);
  assert.ok(Math.abs(jump.center[0]+119.945)<1e-9&&Math.abs(jump.center[1]-36.7825)<1e-9);
  assert.ok(jump.zoom<explorer.CAMERA.maxZoom&&jump.zoom>=11);
  assert.deepEqual(Object.keys(jump).sort(),['center','zoom']);
  assert.equal(explorer.approachCamera([]),null);
});
// ---- Visual V4B: live camera behaviour through the app ----
const moves=h=>h.calls.filter(([name])=>['fitBounds','easeTo','jumpTo'].includes(name));
const timing=call=>(call[0]==='fitBounds'?call[2]:call[1]).duration;
const lastLayout=(h,layer)=>h.calls.filter(([name,id,prop])=>name==='layout'&&id===layer&&prop==='visibility').at(-1)?.[3];
const live='loadTerrain=async()=>{terrain=true;return true;};map=fakeMap;mapReady=true;bindMapCamera();';
const held='var release;loadTerrain=()=>new Promise(done=>{release=()=>{terrain=true;done(true);};});map=fakeMap;mapReady=true;bindMapCamera();';
test('V4B: a parcel outside the view gets one approach jump, then exactly one short oblique fit',async()=>{
  const h=harness();h.fakeMap.getBounds=()=>({contains:()=>false});
  h.run(live+apply);await h.run('selectionTask');
  assert.deepEqual(moves(h).map(([name])=>name),['jumpTo','fitBounds']);
  assert.equal(moves(h)[0][1].zoom,explorer.CAMERA.approachZoom);
  const focus=fits(h)[0][2];
  assert.equal(focus.maxZoom,14);
  assert.equal(focus.pitch,explorer.CAMERA.pitch3d);
  assert.equal(focus.bearing,explorer.CAMERA.bearing3d);
  assert.ok(focus.duration>=900&&focus.duration<=1200);
  const near=harness();near.fakeMap.getBounds=()=>({contains:()=>true});
  near.run(live+apply);await near.run('selectionTask');
  assert.deepEqual(moves(near).map(([name])=>name),['fitBounds'],'a parcel already in view is framed once with no jump');
});
test('V4B: the oblique fit waits for the DEM under the view, but never indefinitely',async()=>{
  const h=harness();let polls=0;h.fakeMap.isSourceLoaded=id=>id==='dem'&&++polls>=3;
  h.run(live+apply);
  await new Promise(done=>setTimeout(done,30));
  assert.equal(fits(h).length,0,'no fit while DEM tiles are still loading');
  await h.run('selectionTask');
  assert.equal(fits(h).length,1);
  assert.ok(polls>=3);
  const slow=harness();slow.fakeMap.isSourceLoaded=()=>false;
  const started=Date.now();slow.run(live+apply);await slow.run('selectionTask');
  assert.equal(fits(slow).length,1,'a slow DEM delays the fit but cannot block it');
  assert.ok(Date.now()-started<=explorer.CAMERA.terrainWait+1000);
});
for(const type of ['pointerdown','touchstart','wheel','keydown'])test('V4B: '+type+' on the map cancels a pending automatic focus',async()=>{
  const h=harness();
  h.run(held+apply);
  h.input(type,{key:'ArrowLeft'});
  h.run('release()');await h.run('selectionTask');
  assert.equal(moves(h).length,0,'the user keeps the camera');
  assert.equal(h.run('terrain'),true,'the DEM itself still loads truthfully');
});
test('V4B: a real map gesture cancels pending focus; programmatic moves and Tab do not',async()=>{
  for(const [fire,cancelled] of [[h=>h.emit('dragstart',{originalEvent:{}}),true],[h=>h.emit('rotatestart',{originalEvent:{}}),true],[h=>h.emit('zoomstart',{originalEvent:{}}),true],[h=>h.emit('zoomstart',{}),false],[h=>h.input('keydown',{key:'Tab'}),false]]){
    const h=harness();h.run(held+apply);fire(h);h.run('release()');await h.run('selectionTask');
    assert.equal(fits(h).length,cancelled?0:1);
  }
});
test('V4B: the zoom buttons hand the camera to the user as well',async()=>{
  const h=harness();
  h.run('map=fakeMap;mapReady=true;render();'+held+apply);
  h.elements.get('zoom-in').onclick();
  h.run('release()');await h.run('selectionTask');
  assert.equal(fits(h).length,0);
  assert.ok(h.calls.some(([name])=>name==='zoomIn'));
});
test('V4B: user input stops an automatic fit in flight immediately, and only then',()=>{
  const h=harness(),stops=()=>h.calls.filter(([name])=>name==='stop').length;
  h.run(live+'polygon=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];fit()');
  h.input('pointerdown');
  assert.equal(stops(),1);
  h.input('pointerdown');
  assert.equal(stops(),1,'nothing left to stop');
  h.run('fit()');h.emit('moveend');h.input('wheel');
  assert.equal(stops(),1,'a finished move is not stopped');
});
test('V4B: the terrain toggle changes only the view angle — never centre, zoom or the parcel fit',async()=>{
  const h=harness();h.fakeMap.getBounds=()=>({contains:()=>true});
  h.run(live+'prefer2d=true;'+apply);
  const before=moves(h).length;
  await h.run('toggleTerrain()');
  const on=moves(h).slice(before);
  assert.deepEqual(on.map(([name])=>name),['easeTo']);
  assert.deepEqual(Object.keys(on[0][1]).sort(),['bearing','duration','pitch']);
  assert.equal(on[0][1].pitch,explorer.CAMERA.pitch3d);
  assert.equal(lastLayout(h,'field-mask'),'none','the 2D mask is never drawn over terrain');
  await h.run('toggleTerrain()');
  const off=moves(h).slice(before+1);
  assert.deepEqual(off.map(([name])=>name),['easeTo']);
  assert.deepEqual([off[0][1].pitch,off[0][1].bearing],[0,0]);
  assert.equal(lastLayout(h,'field-mask'),'visible');
  assert.equal(h.fakeMap.removed,false);
});
test('V4B: a terrain toggle still loading never tilts a view the user has since moved',async()=>{
  const h=harness();
  h.run(held+'polygon=[[-119.95,36.78],[-119.94,36.78],[-119.94,36.785],[-119.95,36.785]];');
  const pending=h.run('toggleTerrain()');
  h.input('wheel');h.run('release()');await pending;
  assert.equal(moves(h).length,0);
  assert.equal(h.run('terrain'),true);
});
test('V4B: switching the imagery layer never moves the camera and keeps the 3D mask hidden',async()=>{
  const h=harness();
  h.run(live+apply);await h.run('selectionTask');
  const before=moves(h).length;
  h.run("switchLayer('relief');switchLayer('satellite')");
  assert.equal(moves(h).length,before);
  assert.equal(lastLayout(h,'field-mask'),'none');
  assert.equal(lastLayout(h,'satellite'),'visible');
  assert.equal(h.fakeMap.removed,false);
});
test('V4B: collapsing the inspector re-frames a framed parcel instantly and leaves a user view alone',async()=>{
  const h=harness();
  h.run(live+apply);await h.run('selectionTask');
  h.run('setInspector(false)');
  const last=h.calls.at(-1);
  assert.equal(last[0],'fitBounds');
  assert.deepEqual(last[1],[[-119.95,36.78],[-119.94,36.785]]);
  assert.equal(last[2].duration,0);
  assert.equal(last[2].maxZoom,14);
  assert.deepEqual([last[2].pitch,last[2].bearing],[explorer.CAMERA.pitch3d,explorer.CAMERA.bearing3d]);
  assert.ok(h.calls.some(([name])=>name==='resize'));
  h.input('pointerdown');
  const before=moves(h).length;
  h.run('setInspector(true)');
  assert.equal(moves(h).length,before,'a camera the user moved is not re-framed');
  assert.equal(h.fakeMap.removed,false);
});
test('V4B: a language switch mirrors the frame instantly on the same map and never overrides a user view',async()=>{
  const h=harness();
  h.run(live+apply);await h.run('selectionTask');
  const before=moves(h).length;
  h.run("lang='ar';render()");
  const mirrored=moves(h).slice(before);
  assert.ok(mirrored.length>=1);
  assert.ok(mirrored.every(call=>call[0]==='fitBounds'&&call[2].duration===0),'no animated re-fit on language change');
  assert.deepEqual(mirrored.at(-1)[2].padding,explorer.focusCamera(square,{docked:true,rtl:true}).options.padding);
  assert.equal(lastLayout(h,'field-mask'),'none');
  assert.equal(h.run('map===fakeMap&&terrain'),true);
  h.input('wheel');
  const moved=moves(h).length;
  h.run("lang='en';render()");
  assert.equal(moves(h).length,moved);
  assert.equal(h.fakeMap.removed,false);
});
test('V4B: reduced motion makes every automatic camera move instant',async()=>{
  const h=harness();h.fakeMap.getBounds=()=>({contains:()=>false});
  h.run('var window={matchMedia:query=>({matches:/reduced-motion/.test(query)})};'+live+apply);await h.run('selectionTask');
  await h.run('toggleTerrain()');await h.run('toggleTerrain()');
  h.run('orbit(1);resetView();setInspector(false);fit()');
  const timed=moves(h).filter(([name])=>name!=='jumpTo').map(timing);
  assert.ok(timed.length>=7);
  assert.ok(timed.every(duration=>duration===0),JSON.stringify(timed));
  h.input('pointerdown');
  assert.equal(h.calls.some(([name])=>name==='stop'),false,'an instant move is never in flight');
});
test('V4B: vertices show only while drawing; the resting parcel is a clean edge',()=>{
  const h=harness();
  h.run('map=fakeMap;mapReady=true;'+apply);
  assert.equal(lastLayout(h,'field-points'),'none');
  h.run('drawing=true;draft=[[-119.95,36.78]];updateDraw()');
  assert.equal(lastLayout(h,'field-points'),'visible');
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
test('field mask spotlight stays off while real DEM terrain is active',()=>{
  assert.equal(explorer.shouldShowFieldMask({terrain:true,hasField:true,drawing:false}),false);
  assert.equal(explorer.shouldShowFieldMask({terrain:false,hasField:true,drawing:false}),true);
  assert.equal(explorer.shouldShowFieldMask({terrain:true,hasField:true,drawing:true}),true);
  assert.equal(explorer.shouldShowFieldMask({terrain:true,hasField:false,drawing:false}),true);
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

