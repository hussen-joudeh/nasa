// Camera and overlay helpers for the MapLibre explorer. Pure functions: no map, DOM or network access.
// maxZoom caps automatic framing at the Sentinel-2 source's real maxzoom (14); manual zoom is limited only by the map itself.
// V4B: a moderate tilt near north keeps 2D and 3D the same way up; one short settle per selection; approachZoom is where a distant parcel is jumped to before that settle; terrainWait bounds the wait for DEM tiles.
export const CAMERA={pitch3d:45,bearing3d:-18,maxPitch:72,maxZoom:14,duration:900,focusDuration:1100,revealDuration:1200,orbitStep:45,orbitDuration:800,approachZoom:12.5,terrainWait:2000};
// Room reserved for the data overlay (inline start), tools (inline end), layer switch (top) and draw tools + attribution (bottom).
const PADDING={wide:{top:160,bottom:145,start:285,end:300},compact:{top:104,bottom:120,start:22,end:66}};
// Visual V2 docked shell: nothing floats over the map except the slim tool column (inline end) and the bottom action row.
const DOCKED={wide:{top:72,bottom:104,start:72,end:92},compact:{top:72,bottom:104,start:24,end:68}};
// Resting boundary style. The reveal animates towards exactly these values, so the settled map always matches them.
// V4B: a thin light edge on a dark casing carries the contrast; glow, inner band and fill are kept to a hint.
export const FIELD_PAINT={'field-mask':{'fill-opacity':.2},'field-shadow':{'line-opacity':.3},'field-fill':{'fill-opacity':.07},'field-inner':{'line-opacity':0},'field-glow':{'line-width':5,'line-opacity':.2},'field-casing':{'line-width':4},'field-line':{'line-width':1.75}};
const REVEAL_START={'field-mask':{'fill-opacity':0},'field-shadow':{'line-opacity':0},'field-fill':{'fill-opacity':.16},'field-inner':{'line-opacity':.3},'field-glow':{'line-width':10,'line-opacity':.5},'field-casing':{'line-width':5},'field-line':{'line-width':2.75}};
const easeInOut=t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2;
// View bearing that would lay the parcel's longest real edge across the screen. Kept as a measurement helper; since V4B automatic framing stays near north instead.
export function parcelBearing(polygon){
  if(!Array.isArray(polygon)||polygon.length<3)return 0;
  let best=0,azimuth=90;
  polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],dx=(b[0]-a[0])*Math.cos((a[1]+b[1])/2*Math.PI/180),dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length>best+1e-12){best=length;azimuth=Math.atan2(dx,dy)*180/Math.PI;}});
  return Math.round((((azimuth-90)%180+270)%180-90)*10)/10||0;
}
const WORLD=[[-179.9,-85],[179.9,-85],[179.9,85],[-179.9,85],[-179.9,-85]];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=value=>typeof value==='number'&&Number.isFinite(value);
// Drawing must never be interrupted and reduced-motion users get instant moves.
const duration=state=>state?.reducedMotion||state?.drawing?0:CAMERA.duration;
const pitch=state=>state?.terrain?CAMERA.pitch3d:0;
export function polygonBounds(polygon){const lons=polygon.map(p=>p[0]),lats=polygon.map(p=>p[1]);return [[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]];}
export function focusCamera(polygon,state={}){
  if(!Array.isArray(polygon)||polygon.length<3)return null;
  return {bounds:polygonBounds(polygon),options:{padding:focusPadding(state),maxZoom:CAMERA.maxZoom,pitch:pitch(state),bearing:state.terrain?CAMERA.bearing3d:0,duration:duration(state)&&CAMERA.focusDuration,easing:easeInOut,curve:1.25}};
}
// Layout change (inspector, language, viewport): the same parcel frame for the new map, at the current view angle, never animated. A hidden map is left alone.
export function reframeCamera(polygon,state={},current={}){
  if(Array.isArray(state.size)&&(state.size[0]===0||state.size[1]===0))return null;
  const focus=focusCamera(polygon,state);
  if(!focus)return null;
  return {bounds:focus.bounds,options:{...focus.options,bearing:Number.isFinite(current.bearing)?current.bearing:focus.options.bearing,pitch:Number.isFinite(current.pitch)?current.pitch:focus.options.pitch,duration:0}};
}
// A parcel outside the current view is first jumped to at its real centre, so the visible motion is one short settle and the DEM under it can load before the oblique fit.
export function approachCamera(polygon){
  if(!Array.isArray(polygon)||polygon.length<3)return null;
  const [[west,south],[east,north]]=polygonBounds(polygon);
  return {center:[(west+east)/2,(south+north)/2],zoom:CAMERA.approachZoom};
}
// Padding never takes more than 60% of either map dimension, so MapLibre can always fit the parcel.
export function focusPadding(state={}){
  const set=state.docked?DOCKED:PADDING,base=state.compact?set.compact:set.wide;
  let {top,bottom}=base,left=state.rtl?base.end:base.start,right=state.rtl?base.start:base.end;
  const [width,height]=Array.isArray(state.size)?state.size:[];
  if(width>0&&left+right>width*.6){const k=width*.6/(left+right);left*=k;right*=k;}
  if(height>0&&top+bottom>height*.6){const k=height*.6/(top+bottom);top*=k;bottom*=k;}
  return {top,bottom,left,right};
}
// One finite rotation step. With a parcel in view the camera orbits it and keeps it framed; otherwise it turns where the user is looking.
export function orbitCamera(polygon,state={},current={},direction=1){
  const bearing=(Number(current.bearing)||0)+(direction<0?-1:1)*CAMERA.orbitStep,time=duration(state)&&CAMERA.orbitDuration,focus=state.drawing?null:focusCamera(polygon,state);
  if(focus)return {bounds:focus.bounds,options:{...focus.options,bearing,pitch:Number(current.pitch)||0,duration:time,linear:true}};
  return {bearing,duration:time};
}
// Next action on the analysis path, from app state only.
export function nextStep({polygon,nasaClimate,evaluations}={}){
  if(!Array.isArray(polygon)||polygon.length<3)return null;
  if(!nasaClimate)return 'analyze';
  return Array.isArray(evaluations)&&evaluations.length>0?'review':'preflight';
}
/** World mask spotlight is 2D-only; draped on terrain it covers the pitched view. */
export function shouldShowFieldMask({terrain=false,drawing=false,hasField=false}={}) {
  return !(terrain && hasField && !drawing);
}
// Moving highlight for the one-off boundary trace. Fully transparent at rest, so it never changes the settled boundary.
export function traceGradient(progress){
  const p=Math.min(1,Math.max(0,Number(progress)||0)),clear='rgba(236,255,214,0)',base=['interpolate',['linear'],['line-progress']];
  if(p<=0||p>=1)return [...base,0,clear,1,clear];
  const head=Math.min(.999,Math.max(.002,p/.85)),tail=Math.max(.001,head-.32),alpha=p<.7?1:Math.max(0,(1-p)/.3);
  return [...base,0,clear,tail,clear,head,'rgba(236,255,214,'+alpha.toFixed(3)+')',head+.0005,clear,1,clear];
}
export function terrainCamera(on,state={}){return {pitch:on?CAMERA.pitch3d:0,bearing:on?CAMERA.bearing3d:0,duration:duration(state)};}
// GeoJSON for the single field source: vertices, the outline, and (only for a finished boundary) a surrounding mask whose hole is the parcel itself.
export function fieldFeatures(points,{drawing=false}={}){
  if(!Array.isArray(points)||!points.length)return [];
  const feature=(kind,type,coordinates)=>({type:'Feature',properties:{kind},geometry:{type,coordinates}});
  const features=points.map(point=>feature('vertex','Point',[...point]));
  if(points.length>=3){
    const ring=[...points,points[0]].map(point=>[...point]);
    features.push(feature('field','Polygon',[ring]));
    if(!drawing){features.push(feature('mask','Polygon',[WORLD.map(point=>[...point]),ring.map(point=>[...point])]));features.push(feature('trace','LineString',ring.map(point=>[...point])));}
  }else if(points.length===2)features.push(feature('draft','LineString',points.map(point=>[...point])));
  return features;
}
export function revealPlan(state={}){return {duration:state.reducedMotion||state.drawing?0:CAMERA.revealDuration};}
export function revealPaint(progress){
  const p=Math.min(1,Math.max(0,Number(progress)||0)),eased=1-(1-p)**3,paint={};
  for(const [layer,props] of Object.entries(FIELD_PAINT)){paint[layer]={};for(const [key,end] of Object.entries(props)){const start=REVEAL_START[layer][key];paint[layer][key]=p===1?end:start+(end-start)*eased;}}
  return paint;
}
export function locationCamera(center,zoom,state={}){return {center:[...center],zoom,duration:duration(state)}};
export function searchInputDirection(query){return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*,\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(String(query))?'ltr':'auto'};
export function resetCamera(polygon,state={},home){
  const focus=focusCamera(polygon,state);
  if(focus)return {bounds:focus.bounds,options:{...focus.options,bearing:0}};
  return {center:[...home.center],zoom:home.zoom,bearing:0,pitch:pitch(state),duration:duration(state)};
}
export function overlayHtml({labels,num,polygon,areaHa,center,nasaClimate,evaluations,terrain}){
  const note=labels.styleNote?'<p class="overlay-note overlay-extra">'+esc(labels.styleNote)+'</p>':'';
  const none='<span class="overlay-missing">'+esc(labels.unavailable)+'</span>';
  const has=Array.isArray(polygon)&&polygon.length>=3;
  const row=(term,value,extra='')=>'<div class="overlay-row'+extra+'"><dt>'+term+'</dt><dd>'+value+'</dd></div>';
  const planning=nasaClimate?.planning,period=nasaClimate?.period;
  const value=(v,unit)=>known(v)?esc(num(v,1))+' <small dir="ltr">'+unit+'</small>':none;
  const climate=nasaClimate?value(planning?.precipitationAnnualMm,'mm')+' · '+value(planning?.temperatureMeanMaxC,'°C')+' / '+value(planning?.temperatureMeanMinC,'°C'):none;
  const ran=Array.isArray(evaluations)&&evaluations.length>0;
  const unresolved=ran?'<bdi>'+evaluations.map((evaluation,index)=>String.fromCharCode(65+index)+' '+esc(num((evaluation?.checks??[]).filter(check=>check.status!=='PASS').length,0))).join(' · ')+'</bdi>':none;
  // The analysis path reflects app state only: a boundary exists, NASA POWER data is loaded, Preflight has run.
  const steps=[[labels.stepBoundary,has],[labels.stepClimate,!!nasaClimate],[labels.stepPreflight,ran]];
  const next=steps.findIndex(([,done])=>!done);
  const path='<ol class="overlay-path" aria-label="'+esc(labels.path)+'">'+steps.map(([label,done],index)=>{const state=done?'done':index===next?'next':'todo';return '<li data-state="'+state+'"'+(state==='next'?' aria-current="step"':'')+'><i aria-hidden="true"></i><span>'+esc(label)+'</span><span class="sr-only"> — '+esc(done?labels.stepDone:labels.stepPending)+'</span></li>';}).join('')+'</ol>';
  return '<header class="overlay-head"><h3>'+esc(labels.title)+'</h3><span class="overlay-mode" data-mode="'+(terrain?'3d':'2d')+'"><bdi>'+esc(terrain?labels.mode3d:labels.mode2d)+'</bdi></span></header><dl>'+
    row(esc(labels.area),has&&known(areaHa)?esc(num(areaHa,2))+' <small>'+esc(labels.hectares)+'</small>':none,' overlay-area')+
    row(esc(labels.centre),has&&center?'<bdi dir="ltr">'+esc(center[1].toFixed(5)+', '+center[0].toFixed(5))+'</bdi>':none)+
    row(esc(labels.climate)+(period?.startIso?' <bdi dir="ltr">'+esc(period.startIso)+' — '+esc(period.endIso)+'</bdi>':''),climate,' overlay-extra')+
    row(esc(labels.preflight),esc(ran?labels.preflightRun:labels.preflightNotRun),' overlay-extra')+
    row(esc(labels.unresolved),unresolved,' overlay-extra')+'</dl>'+path+note;
}
