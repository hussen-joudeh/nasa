import {renderEvidence} from './evidence-view.mjs';
import {fetchDemoEvidence,fetchDemoSupplement,loadFieldClimate,DEMO_FIELD_ID} from './demo-evidence.mjs';
import {messages} from './i18n.mjs';
import {parseCoordinates,areaHa,validatePolygon,centerOf,crops,defaultRotations,rotationSummary,parseWeather,parseClimate,climateUrl,fetchJson,readSaved,decodeTerrain,assertPlanImportByteSize,utf8ByteLength} from './domain.mjs';
import {compareRotations} from './domain.mjs';
import {renderPlanLane,renderFamilyLegend,renderDecisionComparison,planChange} from './rotation-view.mjs';
import {fetchPowerClimate} from './nasa-power.mjs';
import {renderPreflightPanel as renderPreflightPanelHtml,renderStalePreflightResults,renderPreflightResultsSection,renderBudgetConfirmation,renderSeasonWaterReason,renderSeasonWaterChart} from './preflight-view.mjs';
import {analyzeDecisionSensitivity} from './decision-breakpoint.mjs';
import {emptyBioFirewall,normalizeBioFirewall} from './biofirewall.mjs';
import {emptyFarmerInputs,normalizeFarmerInputs,migrateLegacyPreviousCrop,enginePreviousCrop,fieldScopeKey,validateWaterBudgetDraft,summarizeFarmerImpact} from './farmer-inputs.mjs';
import {renderFarmerPreviousCropControls,renderFarmerInputImpact} from './farmer-input-view.mjs';
import {buildAllDecisionTraces} from './decision-trace.mjs';
import {buildDecisionSnapshot,assessSnapshotValidity,SNAPSHOT_VALIDITY,materialEvaluationFingerprint,climateEvidenceDigest} from './decision-snapshot.mjs';
import {markSnapshotArchived} from './decision-snapshot-validity.mjs';
import {renderFarmerChangeTrace} from './decision-trace-view.mjs';
import {focusCamera,locationCamera,resetCamera,searchInputDirection,terrainCamera,overlayHtml,fieldFeatures,revealPlan,revealPaint,polygonBounds,FIELD_PAINT,CAMERA,orbitCamera,nextStep,traceGradient,shouldShowFieldMask,reframeCamera,approachCamera} from './map-explorer.mjs';
const $=id=>document.getElementById(id);
let lang='en', map, mapReady=false, drawing=false, draft=[], polygon=[], center=[-119.95,36.78], zoom=12, layer='satellite', terrain=false, generation=0, mapGeneration=0, fieldTag=null, revealFrame=0, prefer2d=false, selectionRequest=0, selectionTask=Promise.resolve(), terrainTask=null;
// V4B camera ownership: `framed` holds while the camera is still the app's own parcel frame; `autoMove` while an app-driven animation is in flight.
let framed=false, autoMove=false;
let farmerInputs=emptyFarmerInputs();
let farmerInputImpact=null;
let decisionTraces=null;
let decisionSnapshot=null,historicalSnapshot=null,snapshotValidity=null;
let demoSelection=null,demoSupplement=null,demoRequest=0;
let cinematicOpen=true, inspectorOpen=true,preflightRotationFocus=0;
let workspaceScreen='field',fieldLoading=false;
let dashboardTab='overview';
let biofirewallMemory=emptyBioFirewall();
let preflightInputs={waterBudget:{amount:'',unit:'m3',period:'perSeason'},plantingDates:['','',''],illustrativeCropSettings:false,effectiveRainfallSlopeConfirmed:false};
let preflightEvaluations=null,preflightBreakpoints=null,preflightLastSnapshot=null;
let rotationChange=null;
let rotations=defaultRotations.map(sequence=>[...sequence]),country='USA',scenario='ssp245',period='2040-2059',weather=null,nasaClimate=null,climate=null,weatherRequest=0,climateRequest=0;
const HOME={center:[-119.95,36.78],zoom:12};
const MAP_CONTROLS=['zoom-in','zoom-out','north','terrain','orbit-left','orbit-right','reset-view','fit','draw'];
const media=query=>typeof window!=='undefined'&&!!window.matchMedia?.(query).matches;
const mapSize=()=>{const el=map?.getContainer?.();return el?[el.clientWidth,el.clientHeight]:null;};
const cameraState=()=>({terrain,drawing,rtl:lang==='ar',size:mapSize(),reducedMotion:media('(prefers-reduced-motion: reduce)'),compact:media('(max-width:760px)'),docked:true});
const countries=['USA','PSE','EGY','JOR','IND','ESP','FRA','KEN','BRA','AUS'];
const t=k=>messages[lang][k];
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(n,d=1)=>new Intl.NumberFormat(lang==='ar'?'ar':'en',{maximumFractionDigits:d}).format(n);
const brandMark=(w=32,h=36)=>`<img class="brand-mark" src="/src/assets/brand/fieldshift-mark.svg" width="${w}" height="${h}" alt="" decoding="async">`;
const brandWordmark=()=>'<span class="brand-wordmark" aria-label="FieldShift"><span class="brand-field">Field</span><span class="brand-shift">Shift</span></span>';
const brandHeader=()=>brandMark()+brandWordmark();
const icon=(name)=>{const paths={leaf:'M20 4C10 3 3 8 5 15c2 7 13 6 15-11ZM5 21l10-11',layers:'m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',arrow:'M4 12h16m-6-6 6 6-6 6',globe:'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM2 12h20M12 2c6 6 6 14 0 20-6-6-6-14 0-20',search:'M21 21l-6-6M17 9a8 8 0 1 1-16 0 8 8 0 0 1 16 0',field:'m4 5 14-2 3 15-16 3L4 5Zm0 0 7 6 10 7M11 11l-6 10m6-10 7-8',sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',drop:'M12 2S4 11 4 16a8 8 0 0 0 16 0C20 11 12 2 12 2Z',wind:'M2 8h14a3 3 0 1 0-3-3M2 12h18a3 3 0 1 1-3 3M2 16h7',save:'M4 3h14l3 3v15H3V3h1Zm3 0v7h10V3M7 21v-7h10v7',orbitLeft:'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',orbitRight:'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',home:'m3 11 9-8 9 8M6 9v11h12V9'};return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';};
function status(key,error=false){$('status').textContent=t(key);$('status').classList.toggle('error',error);}
function render(){
 // Keep the live MapLibre instance (camera, terrain, sources) across ordinary re-renders such as language changes.
 const keep=map&&mapReady?map.getContainer():null;
 if(map&&!keep){center=map.getCenter().toArray();zoom=map.getZoom();map.remove();map=null;fieldTag=null;}
 if(!keep){mapGeneration++;mapReady=false;terrain=false;}
 drawing=false;draft=[];generation++;weatherRequest++;climateRequest++;
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 document.title='FieldShift — '+t('title');
 $('root').innerHTML=
 '<a class="skip" href="#workspace">'+t('explore')+'</a><header class="header"><a href="#" class="brand">'+brandHeader()+'</a><nav aria-label="'+t('explore')+'"><a href="#workspace">'+t('explore')+'</a><a href="#planning">'+t('plan')+'</a><a href="/sources.html">'+t('sources')+'</a></nav><div class="header-end"><span class="local"><i></i>'+t('local')+'</span><button id="language" lang="'+(lang==='en'?'ar':'en')+'">'+(lang==='en'?'العربية':'English')+'</button></div></header>'+
 cinematicHtml()+'<main>'+
 // Visual V2 shell: console bar (stage rail + search), map stage with docked inspector, compact footer. Element ids are unchanged.
 '<section id="workspace" class="console" data-inspector="'+(inspectorOpen?'open':'closed')+'" aria-label="'+t('region')+'"><div class="console-bar"><div class="console-rail" id="console-rail"></div><div class="console-search"><form id="search-form" class="console-search-form"><label class="sr-only" for="search-input">'+t('search')+'</label>'+icon('search')+'<input id="search-input" dir="auto" placeholder="'+t('searchHint')+'" autocomplete="off" required maxlength="160"><button type="submit" id="search-button">'+t('searchGo')+'</button></form><div id="search-status" role="status"></div><div id="search-results" class="console-results"></div></div></div>'+
 '<div class="console-stage"><div class="stage-map" id="map-shell" data-field="0" data-mode="2d"><div id="map" role="region" aria-label="'+t('map')+'"></div><div id="map-loading" class="map-loading" role="status">'+t('loadingMap')+'</div><div class="stage-layers" role="group" aria-label="'+t('map')+'"><button id="satellite" class="selected" aria-pressed="true">'+icon('layers')+t('satellite')+'</button><button id="relief" aria-pressed="false">'+t('relief')+'</button></div><div class="stage-tools" role="group" aria-label="'+t('explorer').terrainToggle+'"><button id="terrain" aria-pressed="false" aria-label="'+t('explorer').terrainToggle+'" title="'+t('explorer').terrainToggle+'">3D</button><button id="fit" aria-label="'+t('fit')+'" title="'+t('fit')+'">'+icon('field')+'</button><button id="orbit-left" aria-label="'+t('explorer').orbitLeft+'" title="'+t('explorer').orbitLeft+'">'+icon('orbitLeft')+'</button><button id="orbit-right" aria-label="'+t('explorer').orbitRight+'" title="'+t('explorer').orbitRight+'">'+icon('orbitRight')+'</button><button id="north" class="compass" aria-label="'+t('north')+'" title="'+t('north')+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="needle-n" d="M12 2.5 16 12H8Z"/><path class="needle-s" d="M12 21.5 8 12h8Z"/></svg></button><i class="tool-rule" aria-hidden="true"></i><button id="zoom-in" aria-label="'+t('zoomIn')+'">+</button><button id="zoom-out" aria-label="'+t('zoomOut')+'">−</button><button id="reset-view" aria-label="'+t('explorer').reset+'" title="'+t('explorer').reset+'">'+icon('home')+'</button></div><div class="stage-actions"><div class="stage-draw"><button id="draw" aria-label="'+t('draw')+'">'+icon('field')+'<span>'+t('draw')+'</span></button><button id="finish" hidden>'+t('finish')+'</button><button id="undo" hidden>'+t('undo')+'</button><button id="clear">'+t('clear')+'</button></div><button type="button" id="next-step" class="next-step" hidden></button></div><button type="button" id="inspector-open" class="stage-inspector-open" aria-controls="inspector" aria-expanded="'+String(inspectorOpen)+'">'+icon('field')+'<span>'+inspectorLabel('open')+'</span></button></div>'+
 '<aside class="inspector" id="inspector" data-field="0" aria-label="'+inspectorLabel('title')+'"><header class="inspector-head"><div class="inspector-heading"><p class="inspector-kicker">'+t('boundary')+'</p><h2 id="field-title">'+t('none')+'</h2><p id="field-desc">'+t('noneHelp')+'</p></div><button type="button" id="inspector-toggle" class="inspector-toggle" aria-controls="inspector-body" aria-expanded="'+String(inspectorOpen)+'" aria-label="'+inspectorLabel(inspectorOpen?'collapse':'open')+'" title="'+inspectorLabel(inspectorOpen?'collapse':'open')+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></header><div class="inspector-body" id="inspector-body"><div id="demo-slot" class="inspector-demo"></div><div id="field-area"></div><button class="primary full" id="analyze" disabled>'+t('analyze')+icon('arrow')+'</button><div id="map-overlay" class="inspector-status" aria-live="polite"></div><details class="coordinate-editor inspector-editor"><summary>'+t('editor')+'</summary><label for="coordinates">'+t('editorHelp')+'</label><textarea id="coordinates" rows="5" dir="ltr" placeholder="36.780, -119.950&#10;36.780, -119.940&#10;36.785, -119.940&#10;36.785, -119.950"></textarea><button type="button" id="apply">'+t('apply')+'</button></details><p class="inspector-foot">'+t('estimated')+'</p></div></aside></div><div class="console-foot"><span class="status-line" id="status" role="status">'+t('statusIdle')+'</span><span id="map-help">'+t('normalHelp')+'</span><span id="terrain-status"></span><span class="map-vintage">'+t('mapNote')+'</span><span class="keyboard-help">'+t('keyboardHelp')+'</span></div></section>'+
 '<section class="environment panel"><div class="section-heading"><div><p class="eyebrow">03 / '+t('data')+'</p><h2>'+t('analysis')+'</h2></div><span class="badge">'+t('model')+'</span></div><div id="weather-content"><p class="muted">'+t('analyzeHelp')+'</p></div><div id="nasa-content" class="nasa-panel"></div><button type="button" id="view-field" class="view-field">'+icon('field')+t('explorer').viewField+'</button><p class="no-data">'+t('noMetrics')+'</p></section>'+
 '<section id="planning" class="planning"><div class="rotation panel"><div class="planner-head"><div><p class="eyebrow">01 / '+t('plan')+'</p><h2>'+t('rotation')+'</h2><p class="muted">'+t('rotationIntro')+'</p></div><div id="farmer-previous-crop-root" class="planner-prev"></div><div id="farmer-input-impact"></div></div>'+renderFamilyLegend(lang)+'<div class="plan-lanes" id="rotation-grid"></div><div id="rotation-comparison" aria-live="polite"></div><div id="preflight-root"></div><details><summary>'+t('sources')+'</summary><p class="small">'+t('rotationMethod')+'</p><a href="https://www.fao.org/conservation-agriculture/in-practice/crop-diversification/en/" target="_blank" rel="noreferrer">FAO · Crop diversification ↗</a></details></div>'+
 '<div class="climate panel"><p class="eyebrow">02 / CMIP6</p><h2>'+t('climate')+'</h2><p class="muted">'+t('climateIntro')+'</p><div class="climate-controls"><label>'+t('country')+'<select id="country">'+countries.map((c,i)=>'<option value="'+c+'" '+(c===country?'selected':'')+'>'+messages[lang].countryNames[i]+'</option>').join('')+'</select></label><label>'+t('scenario')+'<select id="scenario">'+['ssp126','ssp245','ssp585'].map((s,i)=>'<option value="'+s+'" '+(scenario===s?'selected':'')+'>'+t(['low','mid','high'][i])+'</option>').join('')+'</select></label><label>'+t('period')+'<select id="period" dir="ltr">'+['2020-2039','2040-2059','2060-2079','2080-2099'].map(p=>'<option '+(period===p?'selected':'')+'>'+p+'</option>').join('')+'</select></label></div><p class="small muted">'+t('countryHelp')+'</p><button id="run-climate">'+t('runClimate')+icon('arrow')+'</button><div id="climate-content" role="status"></div><p class="provenance">'+t('climateNote')+' <a href="https://climateknowledgeportal.worldbank.org/metadata" target="_blank" rel="noreferrer">CCKP ↗</a></p></div></section>'+
 '<section class="save-panel panel"><div>'+icon('save')+'<div><h2>'+t('save')+'</h2><p class="muted">'+t('saveHelp')+'</p></div></div><div class="save-actions"><button id="save" class="primary">'+t('save')+'</button><button id="restore">'+t('restore')+'</button><button id="export">'+t('export')+'</button><button id="import">'+t('import')+'</button><input id="import-file" type="file" accept="application/json,.json" hidden></div><p id="save-status" role="status"></p></section></main><footer><a class="brand" href="#">'+brandMark(27,30)+brandWordmark()+'</a><div><strong>'+t('footer')+'</strong><p>'+t('privacy')+'</p></div><a href="/sources.html">'+t('attribution')+' ↗</a></footer>';
 setupExperience();bind();renderRotations();renderField();renderWeather();renderNasaClimate();renderClimate();
 if(keep){$('map').replaceWith(keep);keep.setAttribute('aria-label',t('map'));$('map-loading').hidden=true;$('terrain').setAttribute('aria-pressed',String(terrain));$('terrain-status').textContent=terrain?t('terrainReady'):'';switchLayer(layer);updateDraw();syncFieldMaskVisibility();renderField();updateCompass();map.resize();reframe();}
 else{for(const id of MAP_CONTROLS)$(id).disabled=true;initMap();}
}
const inspectorLabel=key=>({title:lang==='ar'?'مفتش الحقل':'Field inspector',open:lang==='ar'?'تفاصيل الحقل':'Field details',collapse:lang==='ar'?'طي تفاصيل الحقل':'Collapse field details'})[key];
// Presentation only: collapsing the inspector keeps the MapLibre instance, camera and all field state.
function setInspector(open){
 inspectorOpen=open;const shell=$('workspace');if(shell?.dataset)shell.dataset.inspector=open?'open':'closed';
 for(const id of ['inspector-toggle','inspector-open'])$(id)?.setAttribute('aria-expanded',String(open));
 const label=inspectorLabel(open?'collapse':'open');$('inspector-toggle')?.setAttribute('aria-label',label);$('inspector-toggle')?.setAttribute('title',label);
 const relayout=()=>map?.resize();if(typeof requestAnimationFrame==='function')requestAnimationFrame(relayout);else relayout();
}
function setMobileView(view){showScreen({explore:'field',plan:'setup',decision:'results'}[view]??'field');}

function cinematicHtml(){
 const ar=lang==='ar';
 return `<section class="cinematic" aria-labelledby="cinematic-title"><img class="cinematic-art" src="/src/assets/cinematic-farmland.webp" alt="" fetchpriority="high"><div class="cinematic-shade"></div><div class="cinematic-copy"><p class="eyebrow">${ar?'من بيانات الأرض إلى قرارات أفضل':'EARTH INTELLIGENCE. HUMAN POSSIBILITY.'}</p><h1 id="cinematic-title">${brandWordmark()}</h1><h2>${ar?'أرض تعرفها. غد تصنعه.':'Know your land.<br>Grow a better tomorrow.'}</h2><p>${ar?'استكشف أرضك، وافهم المناخ، واختبر خطتك قبل أن تزرع.':'Explore your land. Understand its climate.<br>Test what comes next, before you plant.'}</p><button class="primary cinematic-enter" type="button">${ar?'افتح مستكشف الحقول الحقيقي':'Explore your real field'} ${icon('arrow')}</button><span class="cinematic-private">${ar?'بيانات مفتوحة · لا حاجة لحساب':'Open data · No account needed'}</span></div><aside class="cinematic-note"><span class="eyebrow">${ar?'الصورة توضيحية':'AN ILLUSTRATED POSSIBILITY'}</span><p>${ar?'كل حقل يبدأ بسؤال.':'Every field starts<br>with a question.'}</p><small>${ar?'منظر فني مولّد، وليس صور أقمار صناعية أو قياسات ناسا.':'Original AI-generated artwork.<br>Not satellite imagery or NASA measurements.'}</small></aside><div class="cinematic-path"><div><b>01</b><span>${ar?'استكشف':'Explore'}<small>${ar?'خرائط وتضاريس حقيقية':'Real maps & terrain'}</small></span></div><div><b>02</b><span>${ar?'افهم':'Understand'}<small>${ar?'مناخ تاريخي موثق':'Sourced historical climate'}</small></span></div><div><b>03</b><span>${ar?'تحقق':'Verify'}<small>${ar?'اختبر خطتك قبل الزراعة':'Stress-test your plan'}</small></span></div><button class="cinematic-enter" type="button">${ar?'ابدأ بأرضك':'Start with your land'} ↗</button></div></section>`;
}
function setCinematic(open){
 cinematicOpen=open;document.documentElement.dataset.cinematic=String(open);
 if(!open){showScreen(workspaceScreen,{focus:false});requestAnimationFrame(()=>map?.resize());}
 window.scrollTo({top:0,behavior:'instant'});
}
async function selectDemoField(){
 if(fieldLoading)return;
 const ticket=++demoRequest;invalidateDecisionArtifacts({preserveHistorical:true,reason:'demo_select'});
 setFieldProgress(guidedText('Loading the Scottsbluff–Gering boundary and evidence from MongoDB…','جار تحميل حدود سكوتسبلوف–غيرينغ وأدلته من MongoDB…'),true);
 $('demo-select').disabled=true;$('demo-status').textContent=lang==='ar'?'جار تحميل دليل MongoDB…':'Loading MongoDB evidence…';
 try{const selected=await fetchDemoEvidence();if(ticket!==demoRequest)return;const supplement=await fetchDemoSupplement();if(ticket!==demoRequest)return;prefer2d=true;if(mapReady){selectionRequest++;map.setTerrain(null);terrain=false;prefer2d=true;$('terrain').setAttribute('aria-pressed','false');$('terrain-status').textContent='';map.jumpTo({center:selected.field.centroid.coordinates,zoom:13,pitch:0});}setPolygon(selected.polygon);demoSelection=selected;demoSupplement=supplement;center=[...selected.field.centroid.coordinates];preflightInputs.waterBudget.amount='';syncFarmerScope();renderField();renderPreflightPanel();}
 catch{if(ticket===demoRequest)$('demo-status').textContent=lang==='ar'?'تعذر تحميل MongoDB. أعد المحاولة.':'MongoDB unavailable or invalid evidence. Select again to retry.';}
 finally{setFieldProgress(demoSelection?guidedText('Boundary loaded. Analyze & continue to load the historical climate.','تم تحميل الحدود. حلّل وتابع لتحميل المناخ التاريخي.'):$('demo-status').textContent,false);$('demo-select').disabled=false;}
}
const guidedText=(en,ar)=>lang==='ar'?ar:en;
function setFieldProgress(message,busy){
 fieldLoading=busy;const progress=$('field-progress');if(progress)progress.textContent=message;
 for(const id of ['demo-select','choose-own-field','language','apply','clear'])if($(id))$(id).disabled=busy;
 if($('draw'))$('draw').disabled=busy||!mapReady;
 if($('analyze'))$('analyze').disabled=busy||polygon.length<3;
}
function mountGuidedScreens(){
 const main=document.querySelector('main'),field=$('workspace'),planning=$('planning');
 const environment=document.querySelector('.environment'),climatePanel=document.querySelector('.climate'),save=document.querySelector('.save-panel');
 main.insertAdjacentHTML('afterbegin',`<nav id="guided-navigation" class="guided-navigation" aria-label="${guidedText('Planning stages','مراحل التخطيط')}">${['field','setup','results'].map((screen,i)=>`<button type="button" data-screen-link="${screen}"><b>${i+1}</b><span>${[guidedText('Choose your field','اختر حقلك'),guidedText('Set up your comparison','أعدّ المقارنة'),guidedText('Results dashboard','لوحة النتائج')][i]}</span></button>`).join('')}</nav>
 <section id="field-screen" class="guided-screen" aria-labelledby="field-screen-title"><header class="guided-heading"><p class="eyebrow">01 / FieldShift</p><h1 id="field-screen-title" tabindex="-1">${guidedText('Choose your field','اختر حقلك')}</h1><p class="muted">${guidedText('Start with Scottsbluff–Gering, Nebraska, or outline your own field.','ابدأ بحقل سكوتسبلوف–غيرينغ في نبراسكا، أو ارسم حدود حقلك.')}</p><div id="field-entry" class="field-entry"></div><p id="field-progress" role="status" aria-live="polite"></p></header><div id="field-map-slot"></div></section>
 <section id="setup-screen" class="guided-screen" aria-labelledby="setup-screen-title" hidden><header class="guided-heading"><button id="back-to-field" type="button">${guidedText('← Change field','تغيير الحقل ←')}</button><p class="eyebrow">02 / FieldShift</p><h1 id="setup-screen-title" tabindex="-1">${guidedText('Set up your comparison','أعدّ المقارنة')}</h1><p id="comparison-field-summary" class="compact-field"></p></header></section>
 <section id="results-screen" class="guided-screen" aria-labelledby="results-screen-title" hidden><header class="guided-heading"><p class="eyebrow">03 / FieldShift</p><h1 id="results-screen-title" tabindex="-1">${guidedText('Results dashboard','لوحة النتائج')}</h1><div id="dashboard-context" class="dashboard-context"></div></header>
 <div class="dashboard-tabs" role="tablist" aria-label="${guidedText('Results views','عروض النتائج')}">${[['overview','Overview','نظرة عامة'],['compare','Compare plans','مقارنة الخطط'],['field-data','Field data','بيانات الحقل'],['checks','Checks & methods','الفحوص والمنهجية']].map(([id,en,ar])=>`<button type="button" role="tab" id="dashboard-tab-${id}" data-dashboard-tab="${id}" aria-controls="dashboard-panel-${id}" aria-selected="${dashboardTab===id}" tabindex="${dashboardTab===id?0:-1}">${guidedText(en,ar)}</button>`).join('')}</div>
 <section id="dashboard-panel-overview" role="tabpanel" aria-labelledby="dashboard-tab-overview" tabindex="0"><div id="dashboard-overview"></div></section>
 <section id="dashboard-panel-compare" role="tabpanel" aria-labelledby="dashboard-tab-compare" tabindex="0" hidden><div id="dashboard-comparison"></div></section>
 <section id="dashboard-panel-field-data" role="tabpanel" aria-labelledby="dashboard-tab-field-data" tabindex="0" hidden>
 <details id="dashboard-map" class="dashboard-evidence"><summary>${guidedText('Field map and boundary','خريطة الحقل وحدوده')}</summary><div id="dashboard-map-slot"></div></details>
 <details id="dashboard-climate" class="dashboard-evidence"><summary>${guidedText('Historical climate','المناخ التاريخي')}</summary></details>
 <details id="dashboard-history" class="dashboard-evidence"><summary>${guidedText('Crop history','سجل المحاصيل')}</summary><div id="dashboard-history-output"></div></details>
 <details id="dashboard-soil" class="dashboard-evidence"><summary>${guidedText('Soil','التربة')}</summary><div id="dashboard-soil-output"></div></details>
 <details id="dashboard-field-evidence" class="dashboard-evidence"><summary>${guidedText('Data sources and crop profiles','مصادر البيانات وملفات المحاصيل')}</summary><div id="dashboard-field-evidence-output"></div></details></section>
 <section id="dashboard-panel-checks" role="tabpanel" aria-labelledby="dashboard-tab-checks" tabindex="0" hidden><div id="dashboard-calculations"><div id="dashboard-calculation-output"></div></div><details id="dashboard-tools" class="dashboard-evidence"><summary>${guidedText('Climate scenarios and saved plans','سيناريوهات المناخ والخطط المحفوظة')}</summary></details></section></section>`);
 $('field-map-slot').append(field);$('setup-screen').append(planning);
 const history=document.createElement('details');history.className='setup-field-history';history.innerHTML=`<summary>${guidedText('Previous crop (optional)','المحصول السابق (اختياري)')}</summary>`;history.append($('farmer-previous-crop-root'));planning.querySelector('.planner-head').append(history);
 $('dashboard-climate').append(environment);$('dashboard-tools').append(climatePanel,save);
 const sources=planning.querySelector('.rotation > details');if(sources)$('dashboard-calculations').append(sources);
 $('dashboard-map').addEventListener('toggle',()=>{if($('dashboard-map').open)requestAnimationFrame(()=>{map?.resize();reframe();});});
 document.querySelectorAll('[data-dashboard-tab]').forEach(button=>{
  button.onclick=()=>selectDashboardTab(button.dataset.dashboardTab);
  button.onkeydown=event=>{
   const tabs=[...document.querySelectorAll('[data-dashboard-tab]')],index=tabs.indexOf(button),forward=lang==='ar'?'ArrowLeft':'ArrowRight';
   let next;
   if(event.key===forward)next=(index+1)%tabs.length;
   else if(event.key===(lang==='ar'?'ArrowRight':'ArrowLeft'))next=(index+tabs.length-1)%tabs.length;
   else if(event.key==='Home')next=0;
   else if(event.key==='End')next=tabs.length-1;
   if(next!==undefined){event.preventDefault();selectDashboardTab(tabs[next].dataset.dashboardTab);tabs[next].focus();}
  };
 });
 $('back-to-field').onclick=()=>showScreen('field');
 document.querySelectorAll('[data-screen-link]').forEach(button=>button.onclick=()=>showScreen(button.dataset.screenLink));
 document.querySelectorAll('.header nav a').forEach(link=>{if(link.hash==='#workspace'||link.hash==='#planning')link.onclick=event=>{event.preventDefault();setCinematic(false);showScreen(link.hash==='#workspace'?'field':'setup');};});
}
function selectDashboardTab(id){
 dashboardTab=id;
 document.querySelectorAll('[data-dashboard-tab]').forEach(button=>{const active=button.dataset.dashboardTab===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(button.getAttribute('aria-controls')).hidden=!active;});
 if(id==='field-data'&&$('dashboard-map').open)requestAnimationFrame(()=>{map?.resize();reframe();});
}
function showScreen(screen,{focus=true}={}){
 if(screen==='setup'&&!nasaClimate)screen='field';
 if(screen==='results'&&!preflightEvaluations)screen=nasaClimate?'setup':'field';
 workspaceScreen=screen;
 updateWorkflow();
 if(!$('field-screen')?.dataset)return;
 for(const name of ['field','setup','results'])$(name+'-screen').hidden=name!==screen;
 const skip=document.querySelector?.('.skip');if(skip){skip.href='#'+screen+'-screen-title';skip.textContent=screen==='results'?guidedText('Skip to results','انتقل إلى النتائج'):screen==='setup'?guidedText('Skip to comparison setup','انتقل إلى إعداد المقارنة'):guidedText('Skip to field','انتقل إلى الحقل');}
 const slot=$(screen==='results'?'dashboard-map-slot':'field-map-slot');slot.append($('workspace'));
 if(screen==='results')renderGuidedDashboard();
 requestAnimationFrame(()=>{map?.resize();if(focus){$(screen+'-screen-title')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}});
}
function renderGuidedDashboard(){
 const root=$('dashboard-overview');if(!root)return;
 if(!preflightEvaluations){root.innerHTML='';return;}
 const waterBudget=preflightEvaluations[0].water.waterBudget;
 const perSeason=waterBudget?.period==='perSeason';
 const budget=perSeason?waterBudget.mm:null,hasSeasonalBudget=Number.isFinite(budget);
 const rows=preflightEvaluations.map((evaluation,index)=>({evaluation,index,season:evaluation.water.seasons.find(s=>s.season===2),check:evaluation.checks.find(c=>c.ruleId==='water.balance'&&c.season===2)}));
 const labels=rows=>new Intl.ListFormat(lang,{type:'conjunction'}).format(rows.map(row=>String.fromCharCode(65+row.index)));
 const passing=rows.filter(row=>row.check?.status==='PASS'),warnings=rows.filter(row=>row.check?.status==='WARNING'),failed=rows.filter(row=>row.check?.status==='FAIL'),unknown=rows.filter(row=>!row.check||row.check.status==='UNKNOWN');
 const measured=value=>Number.isFinite(value)?`<bdi dir="ltr">${num(value,2)} mm</bdi>`:esc(t('decision').UNKNOWN);
 const badge=status=>`<span class="preflight-status" data-status="${esc(status)}">${esc(t('decision')[status])}</span>`;
 const allUnknown=unknown.length===rows.length;
 const missing=[...new Set(rows.flatMap(row=>row.check?.missingInformation??row.season?.missingInformation??[]))];
 const missingBudget=preflightEvaluations.some(e=>e.checks.some(c=>c.ruleId==='water.budget'&&c.missingInformation?.includes('availableIrrigationBudget')));
 const reviewSeasons=missing.some(key=>['seasonPlantingDate','cropCoefficientsAndCalendar','cropCoefficients','cropGrowthStageCalendar','fieldSlopeApplicability','completeCropSeasonWithinNASAObservedPeriod'].includes(key));
 const action=missingBudget?'budget':reviewSeasons?'seasons':allUnknown?'checks':'compare';
 const actionLabel=action==='budget'?guidedText('Enter irrigation budget','أدخل ميزانية الري'):action==='seasons'?guidedText('Review season inputs','راجع مدخلات الموسم'):action==='checks'?guidedText('Review missing inputs','راجع المدخلات الناقصة'):guidedText('Compare plans','قارن الخطط');
 const headline=allUnknown?guidedText('The Season 2 comparison cannot be completed yet.','لا يمكن إكمال مقارنة الموسم الثاني بعد.'):passing.length?guidedText(`${labels(passing)} ${passing.length===1?'passes':'pass'} the season-2 water check at ${num(budget,2)} mm.`,`${passing.length===1?'الخطة':'الخطط'} ${labels(passing)} تجتاز فحص مياه الموسم الثاني بميزانية ${num(budget,2)} مم.`):guidedText(`No plans pass the season-2 water check at ${num(budget,2)} mm yet.`,`لم تجتز أي خطة فحص مياه الموسم الثاني بميزانية ${num(budget,2)} مم حتى الآن.`);
 const summary=hasSeasonalBudget?[
  warnings.length?guidedText(`${labels(warnings)} ${warnings.length===1?'has a warning':'have warnings'}.`,`خطط لديها تحذيرات: ${labels(warnings)}.`):guidedText('No plans have warnings for this water check.','لا توجد خطط لديها تحذيرات في فحص المياه هذا.'),
  failed.length?guidedText(`Failing plans: ${labels(failed)}.`,`خطط لم تجتز الفحص: ${labels(failed)}.`):'',
  unknown.length?guidedText(`${labels(unknown)} ${unknown.length===1?'needs':'need'} more information.`,`خطط تحتاج إلى معلومات إضافية: ${labels(unknown)}.`):''
 ].filter(Boolean).join(' '):waterBudget?guidedText('The entered irrigation budget covers the whole plan; a budget for each crop season is needed for this check.','ميزانية الري المدخلة تغطي الخطة كاملة؛ يحتاج هذا الفحص إلى ميزانية لكل موسم محصول.'):guidedText('Missing input: available field-applied irrigation budget for each crop season.','المدخل الناقص: ميزانية مياه الري المتاحة عند الحقل لكل موسم محصول.');
 const nextStep=action==='budget'?guidedText('Enter the available irrigation amount, unit and seasonal period.','أدخل كمية مياه الري المتاحة ووحدتها وفترتها الموسمية.'):action==='seasons'?guidedText('Review the reference dates, crop settings and slope assumption listed as missing.','راجع التواريخ المرجعية وإعدادات المحاصيل وافتراض الانحدار المدرجة ضمن المدخلات الناقصة.'):action==='checks'?guidedText('Review the missing evidence before interpreting the water check.','راجع الأدلة الناقصة قبل تفسير فحص المياه.'):guidedText('Compare the estimates and warnings, then confirm water delivery and assumptions locally.','قارن التقديرات والتحذيرات، ثم تأكد محلياً من المياه المتاحة والافتراضات.');
 const context=$('dashboard-context');
 if(context)context.innerHTML=`<p class="compact-field">${$('comparison-field-summary')?.innerHTML??''}</p><div id="dashboard-budget-confirmation" class="budget-confirmation" data-unit="${esc(waterBudget?.unit??preflightInputs.waterBudget.unit)}">${renderBudgetConfirmation({lang,budget:waterBudget??preflightInputs.waterBudget,areaHa:preflightEvaluations[0].water.areaHa})}</div><button type="button" id="edit-comparison">${guidedText('Edit comparison','تعديل المقارنة')}</button>`;
 const actionButton=`<button type="button" data-result-action="${action}" id="${action==='budget'?'enter-irrigation-budget':'result-next-action'}" class="primary">${actionLabel}</button>`;
 root.innerHTML=`<section class="decision-first panel"><p class="eyebrow">${guidedText('SEASON 2 / WATER CHECK','الموسم الثاني / فحص المياه')}</p><h2>${esc(headline)}</h2><p>${esc(allUnknown?(hasSeasonalBudget?guidedText('Your irrigation budget is recorded. Missing model inputs prevent a Season 2 water comparison.','تم تسجيل ميزانية الري. تمنع مدخلات النموذج الناقصة مقارنة مياه الموسم الثاني.'):summary):summary)}</p><p>${esc(nextStep)}</p>${actionButton}<p class="small muted">${guidedText('Season 2 water only. Overall plan assessments include all seasons and other checks.','فحص مياه الموسم الثاني فقط. تشمل التقييمات العامة جميع المواسم والفحوص الأخرى.')}</p></section>
 ${rows.some(row=>Number.isFinite(row.season?.needMm?.max))?renderSeasonWaterChart({rows,budget,lang}):`<section class="requirements-unavailable"><h3>${guidedText('Irrigation requirements unavailable','احتياجات الري غير متوفرة')}</h3><p>${guidedText('No plan has a calculated Season 2 requirement yet.','لم يُحسب احتياج الموسم الثاني لأي خطة بعد.')}</p>${missing.length?`<p>${[...new Set(missing.map(key=>t('preflight').missingLabels[key]??t('preflight').missing))].map(esc).join(' · ')}</p>`:''}<button type="button" data-result-action="${reviewSeasons?'seasons':action}">${reviewSeasons?guidedText('Review season inputs','راجع مدخلات الموسم'):actionLabel}</button></section>`}`;
 $('dashboard-comparison').innerHTML=`
 <section class="season-comparison" aria-labelledby="season-comparison-title"><h2 id="season-comparison-title">${guidedText('Compare season-2 water needs','قارن الاحتياجات المائية للموسم الثاني')}</h2><p class="muted">${guidedText('Upper modeled requirement and balance, in mm of field-applied irrigation.','الحد الأعلى للاحتياج المحسوب والرصيد، بالملليمتر من مياه الري المطبقة على الحقل.')}</p><table class="guided-comparison"><thead><tr>${[guidedText('Plan / crop','الخطة / المحصول'),guidedText('Upper requirement','الاحتياج الأعلى'),guidedText('Applied budget','الميزانية المطبقة'),guidedText('Margin / shortfall','الفائض / العجز'),guidedText('Season-2 water check','فحص مياه الموسم الثاني')].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(({evaluation,index,season,check})=>{const margin=season?.remainingMm?.min;return `<tr data-water-plan="${String.fromCharCode(65+index)}"><th scope="row"><strong>${String.fromCharCode(65+index)}</strong> ${esc(crops[season?.crop]?.[lang]??t('unavailable'))}<small><bdi>${esc(season?.plantingDate??'—')} → ${esc(season?.harvestDate??'—')}</bdi></small></th><td data-label="${guidedText('Upper requirement','الاحتياج الأعلى')}">${measured(season?.needMm?.max)}</td><td data-label="${guidedText('Applied budget','الميزانية المطبقة')}">${measured(perSeason?evaluation.water.waterBudget?.mm:null)}</td><td data-label="${guidedText('Margin / shortfall','الفائض / العجز')}">${Number.isFinite(margin)?`<div class="water-balance" data-direction="${margin<0?'shortfall':'margin'}"><strong><bdi dir="ltr">${margin<0?'−':'+'}${num(margin<0?season.deficitMm.max:margin,2)} mm</bdi></strong><span>${margin<0?guidedText('Shortfall vs upper estimate','عجز مقابل التقدير الأعلى'):guidedText('Margin vs upper estimate','فائض مقابل التقدير الأعلى')}</span></div>`:hasSeasonalBudget?guidedText('Not calculated — see row explanation','لم يُحسب — راجع تفسير الصف'):guidedText('Unknown — enter a seasonal budget','غير معروف — أدخل ميزانية للموسم')}</td><td data-label="${guidedText('Water check','فحص المياه')}"><div class="water-status-reason">${badge(check?.status??'UNKNOWN')}${renderSeasonWaterReason({evaluation,lang})}</div></td></tr>`;}).join('')}</tbody></table><p class="small muted">${guidedText('A warning can reflect method uncertainty or a partial rainfall period. Review the calculation details before acting. Whole-plan budgets cannot be applied separately to this season.','قد يعكس التحذير عدم يقين في الطريقة أو فترة أمطار غير مكتملة. راجع تفاصيل الحساب قبل اتخاذ القرار. لا يمكن تطبيق ميزانية الخطة كاملة على موسم منفرد.')}</p></section>
 <section class="overall-assessments"><h2>${guidedText('Overall plan assessments','التقييمات العامة للخطط')}</h2><div>${preflightEvaluations.map((evaluation,index)=>`<p><strong>${String.fromCharCode(65+index)}</strong> ${badge(evaluation.status)}</p>`).join('')}</div><p class="muted">${guidedText('All seasons, rotation checks and missing evidence are included here, separately from the season-2 water rule.','يشمل التقييم جميع المواسم وفحوص الدورة والأدلة الناقصة، بشكل منفصل عن قاعدة مياه الموسم الثاني.')}</p></section>`;
 $('edit-comparison').onclick=()=>showScreen('setup');
 document.querySelectorAll('[data-result-action]').forEach(button=>button.onclick=()=>{
  const target=button.dataset.resultAction;
  if(target==='compare'||target==='checks'){selectDashboardTab(target);$('dashboard-tab-'+target).focus();return;}
  showScreen('setup',{focus:false});
  requestAnimationFrame(()=>{
   if(target==='seasons')document.querySelector('.setup-assumptions').open=true;
   const key=missing.includes('seasonPlantingDate')||missing.includes('completeCropSeasonWithinNASAObservedPeriod')?'planting-date-2':missing.some(key=>['cropCoefficientsAndCalendar','cropCoefficients','cropGrowthStageCalendar'].includes(key))?'illustrative-crop-settings':'effective-rainfall-slope-confirmed';
   const input=$(target==='budget'?'water-budget-amount':key);input.focus();input.scrollIntoView({block:'center',behavior:'instant'});
  });
 });
 document.querySelectorAll('.season-water-reason').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)document.querySelectorAll('.season-water-reason').forEach(other=>{if(other!==details)other.open=false;});}));
 selectDashboardTab(dashboardTab);
}
function setupExperience(){
 mountGuidedScreens();
 const demo=document.createElement('div');demo.className='demo-picker';
 demo.innerHTML='<div class="field-choice-actions"><button type="button" id="demo-select" class="primary">'+guidedText('Try the demo field','جرّب الحقل التجريبي')+'</button><button type="button" id="choose-own-field">'+guidedText('Choose your own field','اختر حقلك الخاص')+'</button></div><p id="demo-status" class="muted" role="status">'+demoStatusMessage()+'</p>';
 $('field-entry').append(demo);$('demo-select').onclick=selectDemoField;
 demo.querySelector('.field-choice-actions').append($('analyze'));
 $('choose-own-field').onclick=()=>{setInspector(true);document.querySelector('.coordinate-editor').open=true;$('coordinates').focus();$('coordinates').scrollIntoView({block:'center'});};
 document.documentElement.dataset.cinematic=String(cinematicOpen);
 document.querySelectorAll('.cinematic-enter').forEach(el=>el.onclick=()=>{setCinematic(false);showScreen('field');});
 document.querySelectorAll('.brand').forEach(el=>el.onclick=e=>{e.preventDefault();setCinematic(true);});
 const cta=document.createElement('a');cta.className='primary nav-cta';cta.href='#workspace';cta.onclick=e=>{e.preventDefault();setCinematic(false);showScreen('field');};cta.textContent=guidedText('Start exploring ↗','ابدأ الاستكشاف ↗');document.querySelector('.header-end').prepend(cta);
 showScreen(workspaceScreen,{focus:false});
}
function updateWorkflow(){
 document.querySelectorAll('[data-screen-link]').forEach(el=>{const screen=el.dataset.screenLink;el.setAttribute('aria-current',screen===workspaceScreen?'step':'false');el.disabled=screen==='setup'?!nasaClimate:screen==='results'?!preflightEvaluations:false;});
 const summary=$('comparison-field-summary');if(summary)summary.innerHTML=esc(demoSelection?guidedText('Scottsbluff–Gering, Nebraska','سكوتسبلوف–غيرينغ، نبراسكا'):guidedText('Your selected field','الحقل المحدد'))+' · '+(polygon.length>=3?'<bdi dir="ltr">'+num(areaHa(polygon),2)+'</bdi> '+esc(t('hectares')):'')+(nasaClimate?' · <bdi dir="ltr">'+esc(nasaClimate.period.startIso)+' — '+esc(nasaClimate.period.endIso)+'</bdi>':'');
}

function bind(){
 $('inspector-toggle').onclick=()=>setInspector(!inspectorOpen);$('inspector-open').onclick=()=>setInspector(true);
 $('language').onclick=()=>{capturePreflightInputs();lang=lang==='en'?'ar':'en';render();};
 $('search-form').onsubmit=search;
 $('search-input').oninput=e=>e.currentTarget.dir=searchInputDirection(e.currentTarget.value);
 $('draw').onclick=()=>{demoSelection=null;demoSupplement=null;demoRequest++;invalidateDecisionArtifacts({preserveHistorical:true,reason:'draw'});weatherRequest++;nasaClimate=null;renderNasaClimate();renderField();drawing=true;draft=[];$('analyze').disabled=true;revealField();updateDraw();};
 $('finish').onclick=()=>{try{setPolygon(validatePolygon(draft));}catch{status('boundaryError',true);}};
 $('undo').onclick=()=>{draft.pop();updateDraw();};
 $('clear').onclick=()=>{demoSelection=null;demoSupplement=null;demoRequest++;invalidateDecisionArtifacts({preserveHistorical:false});resetFarmerInputsForField();polygon=[];draft=[];drawing=false;weather=null;nasaClimate=null;weatherRequest++;renderField();renderWeather();renderNasaClimate();updateDraw();};
 $('apply').onclick=()=>{try{setPolygon(validatePolygon($('coordinates').value.trim().split(/\n/).filter(x=>x.trim()).map(parseCoordinates)));}catch{status('boundaryError',true);}};
 $('analyze').onclick=()=>nasaClimate?showScreen('setup'):analyze();
 for(const l of ['satellite','relief'])$(l).onclick=()=>switchLayer(l);
 $('zoom-in').onclick=()=>{userControl();map?.zoomIn({duration:0});};$('zoom-out').onclick=()=>{userControl();map?.zoomOut({duration:0});};$('north').onclick=()=>map?.easeTo({bearing:0,duration:cameraState().reducedMotion?0:500});$('orbit-left').onclick=()=>orbit(-1);$('orbit-right').onclick=()=>orbit(1);$('next-step').onclick=()=>{if($('next-step').dataset.step==='analyze')analyze();else {setMobileView('decision');$('preflight-root')?.scrollIntoView({behavior:cameraState().reducedMotion?'auto':'smooth',block:'start'});}};$('fit').onclick=fit;$('reset-view').onclick=resetView;$('view-field').onclick=()=>{setMobileView('explore');$('workspace').scrollIntoView({behavior:cameraState().reducedMotion?'auto':'smooth',block:'start'});fit();};$('terrain').onclick=toggleTerrain;
 for(const id of ['country','scenario','period'])$(id).onchange=()=>{country=$('country').value;scenario=$('scenario').value;period=$('period').value;climate=null;climateRequest++;$('run-climate').disabled=false;renderClimate();};
 $('run-climate').onclick=loadClimate;
 $('save').onclick=()=>{try{if(!polygon.length){$('save-status').textContent=t('choose');return;}localStorage.setItem('field-shift-plan',JSON.stringify(plan()));$('save-status').textContent=t('saved');}catch{$('save-status').textContent=t('saveError');}};
 $('restore').onclick=()=>{try{restore(readSaved(localStorage.getItem('field-shift-plan')));}catch{$('save-status').textContent=t('importError');}};
 $('export').onclick=()=>{if(!polygon.length){$('save-status').textContent=t('choose');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(plan(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='field-shift-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('save-status').textContent=t('exported');};
 $('import').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{const f=e.target.files[0];if(!f){e.target.value='';return;}try{assertPlanImportByteSize(f.size);const text=await f.text();assertPlanImportByteSize(utf8ByteLength(text));const saved=readSaved(text);restore(saved);$('save-status').textContent=restoreStatusMessage(saved.decisionSnapshotTrust??snapshotValidity);}catch(err){$('save-status').textContent=err?.code==='plan-too-large'?t('importTooLarge'):t('importError');}finally{e.target.value='';}};
 const editor=document.querySelector('.coordinate-editor');
 if(editor&&!editor.dataset.bound){editor.dataset.bound='1';if(window.matchMedia('(max-width:760px)').matches)editor.open=true;editor.addEventListener('toggle',()=>{if(editor.open)requestAnimationFrame(()=>$('apply')?.scrollIntoView({block:'nearest'}));});}
}
function normalizePreflightInputs(value){const input=value&&typeof value==='object'?value:{};const budget=input.waterBudget&&typeof input.waterBudget==='object'?input.waterBudget:{};return {waterBudget:{amount:typeof budget.amount==='string'||typeof budget.amount==='number'?String(budget.amount):'',unit:['mm','m3'].includes(budget.unit)?budget.unit:'m3',period:['perSeason','wholePlan'].includes(budget.period)?budget.period:'perSeason'},plantingDates:Array.isArray(input.plantingDates)&&input.plantingDates.length===3?input.plantingDates.map(date=>typeof date==='string'?date:''):['','',''],illustrativeCropSettings:input.illustrativeCropSettings===true,effectiveRainfallSlopeConfirmed:input.effectiveRainfallSlopeConfirmed===true};}
function resolveDemoFieldId(){const id=demoSelection?.field?._id??null;return id===DEMO_FIELD_ID?id:null;}
function currentFieldScope(){return fieldScopeKey({demoFieldId:resolveDemoFieldId(),polygon:polygon.length>=3?polygon:null});}
function liveSnapshotContext(){return {fieldScope:currentFieldScope(),demoFieldId:resolveDemoFieldId(),materialFingerprint:materialEvaluationFingerprint({rotations,preflightInputs,farmerInputs,fieldScope:currentFieldScope(),demoFieldId:resolveDemoFieldId(),areaHa:polygon.length>=3?areaHa(polygon):null}),climateDigest:climateEvidenceDigest(nasaClimate),hasCurrentEvaluation:Array.isArray(preflightEvaluations)&&preflightEvaluations.length>0,hasClimateForReproduction:!!nasaClimate};}
function invalidateDecisionArtifacts({preserveHistorical=true,reason='input_change'}={}){if(preserveHistorical&&decisionSnapshot){historicalSnapshot=markSnapshotArchived(decisionSnapshot,reason);snapshotValidity={state:SNAPSHOT_VALIDITY.STALE,reasons:[reason]};}else if(!preserveHistorical){historicalSnapshot=null;snapshotValidity=null;}decisionSnapshot=null;decisionTraces=null;preflightEvaluations=null;preflightBreakpoints=null;preflightLastSnapshot=null;if(workspaceScreen==='results')showScreen(nasaClimate?'setup':'field',{focus:false});}
function resetFarmerInputsForField(){invalidateDecisionArtifacts({preserveHistorical:true,reason:'field_scope'});farmerInputs=normalizeFarmerInputs(null,currentFieldScope());farmerInputImpact=null;}
function syncFarmerScope(){farmerInputs=normalizeFarmerInputs(farmerInputs,currentFieldScope());}
function updateFarmerImpact(){
 if(!rotations[0]?.length)return;
 const ctx=preflightContext();
 const emptyBudget={amount:'',unit:preflightInputs.waterBudget?.unit??'m3',period:preflightInputs.waterBudget?.period??'perSeason'};
 farmerInputImpact=summarizeFarmerImpact({rotation:rotations[0],fieldContext:ctx,climateData:nasaClimate,beforePreviousCrop:null,afterPreviousCrop:enginePreviousCrop(farmerInputs),beforeBudget:emptyBudget,afterBudget:preflightInputs.waterBudget});
}
function plan(){const scope=currentFieldScope();const archive=snapshotValidity?.state!==SNAPSHOT_VALIDITY.CURRENT&&historicalSnapshot?{snapshot:historicalSnapshot,validity:snapshotValidity}:null;return {version:1,savedAt:new Date().toISOString(),polygon,rotations,farmerInputs:normalizeFarmerInputs(farmerInputs,scope),previousCrop:enginePreviousCrop(farmerInputs),preflightInputs:normalizePreflightInputs(preflightInputs),biofirewall:normalizeBioFirewall(biofirewallMemory),decisionSnapshot:snapshotValidity?.state===SNAPSHOT_VALIDITY.CURRENT?decisionSnapshot:null,decisionSnapshotArchive:archive,country,scenario,period,geometry:{type:'Polygon',coordinates:[[...polygon,polygon[0]]]},areaHa:areaHa(polygon),method:'Spherical WGS84 approximation, radius 6371008.8 m; user-defined boundary. Refresh environmental sources.'};}
function restoreStatusMessage(trust){const sv=messages[lang].snapshotValidity;const key=trust?.state==='HISTORICAL'?'restoredHistorical':trust?.state==='STALE'?'restoredStale':trust?.state==='UNREPRODUCIBLE'?'restoredUnreproducible':'restored';return sv?.[key]??t('restored');}
function restore(p){demoSelection=null;demoSupplement=null;demoRequest++;invalidateDecisionArtifacts({preserveHistorical:false});polygon=p.polygon;farmerInputs=migrateLegacyPreviousCrop(p,currentFieldScope());biofirewallMemory=normalizeBioFirewall(p.biofirewall);preflightInputs=normalizePreflightInputs(p.preflightInputs);farmerInputImpact=null;rotations=p.rotations;rotationChange=null;country=p.country;scenario=p.scenario;period=p.period;center=centerOf(polygon);zoom=13;weather=null;nasaClimate=null;climate=null;const trust=p.decisionSnapshotTrust??null;if(p.decisionSnapshot){historicalSnapshot=p.decisionSnapshot;snapshotValidity=trust??assessSnapshotValidity(p.decisionSnapshot,{fieldScope:currentFieldScope()});}else if(p.decisionSnapshotArchive?.snapshot){historicalSnapshot=p.decisionSnapshotArchive.snapshot;snapshotValidity=p.decisionSnapshotArchive.validity??{state:SNAPSHOT_VALIDITY.HISTORICAL,reasons:['imported']};}else{historicalSnapshot=null;snapshotValidity=null;}render();revealField();selectionTask=focusSelection();$('save-status').textContent=restoreStatusMessage(trust??snapshotValidity);}
function setPolygon(p){demoSelection=null;demoSupplement=null;demoRequest++;invalidateDecisionArtifacts({preserveHistorical:true,reason:'boundary_change'});polygon=p.map(x=>[...x]);resetFarmerInputsForField();draft=[];drawing=false;weather=null;nasaClimate=null;weatherRequest++;renderField();renderWeather();renderNasaClimate();updateDraw();revealField();selectionTask=focusSelection();}
// Map call-to-action for the next step on the analysis path; hidden while drawing or without a boundary.
function renderNextStep(){const el=$('next-step');if(!el)return;const step=drawing?null:nextStep({polygon,nasaClimate,evaluations:preflightEvaluations});el.hidden=!step;el.disabled=false;if(el.dataset)el.dataset.step=step??'';if(step)el.innerHTML='<span>'+esc(t('explorer')[{analyze:'nextAnalyze',preflight:'nextPreflight',review:'nextReview'}[step]])+'</span>'+icon('arrow');}
function updateCompass(){const style=$('north')?.style;style?.setProperty?.('--bearing',String(-(map?.getBearing?.()??0)));}
function demoFieldStatusText(){if(!demoSelection)return lang==='ar'?'لا يوجد ارتباط بدليل MongoDB؛ اختر الحقل صراحة.':'No MongoDB association. Select the demo explicitly to load its evidence.';const stored=demoSelection.field?.area_ha,calc=polygon.length>=3?areaHa(polygon):null;const parts=[t('proposedBoundary')];if(Number.isFinite(stored))parts.push(t('areaStoredRecord')+': '+num(stored,6)+' '+t('hectares'));if(Number.isFinite(calc))parts.push(t('areaCalculatedFromBoundary')+': '+num(calc,2)+' '+t('hectares'));return parts.join(' · ');}
function demoStatusMessage(){const base=demoSelection?demoFieldStatusText():(lang==='ar'?'سكوتسبلوف–غيرينغ، نبراسكا · حدود مقترحة':'Scottsbluff–Gering, Nebraska · Proposed boundary');if(!demoSelection)return base;if(nasaClimate)return base+' · '+t('demoClimateReady');if(polygon.length>=3)return base+' · '+t('demoAnalyzeHint');return base;}
function syncConsoleStatus(){if(drawing)return;if(polygon.length<3){status('statusIdle');return;}status(nasaClimate?'climateReady':'boundaryReady');}
function fieldAreaHtml(has){if(!has)return '';const calc=areaHa(polygon),stored=demoSelection?.field?.area_ha;let html='<div class="area-number">'+num(calc,2)+' <small>'+t('hectares')+'</small></div><p class="muted area-calc-label">'+t('areaCalculatedFromBoundary')+'</p>';if(Number.isFinite(stored))html+='<p class="area-stored" dir="ltr"><span class="muted">'+t('areaStoredRecord')+' ('+t('areaStoredMethod')+'):</span> <strong>'+num(stored,6)+'</strong> '+t('hectares')+'</p>';html+='<p class="area-meta"><span>'+num(calc*2.47105381,2)+' '+t('acres')+'</span><span class="coordinates" dir="ltr">'+(demoSelection?.field.centroid.coordinates??centerOf(polygon)).slice().reverse().map(x=>x.toFixed(5)).join(', ')+'</span></p><details class="area-more"><summary>'+(lang==='ar'?'طريقة حساب المساحة':'How this area is calculated')+'</summary>'+(Number.isFinite(stored)?'<p class="muted small area-reconcile">'+t('areaReconciliationNote')+'</p>':'')+'<p class="muted small">'+t('areaWaterTruthUses')+'</p></details>';return html;}
function renderMapOverlay(){updateWorkflow();const el=$('map-overlay');if(!el)return;const has=polygon.length>=3;const shell=$('map-shell');if(shell?.dataset){shell.dataset.field=has?'1':'0';shell.dataset.mode=terrain?'3d':'2d';}const dock=$('inspector');if(dock?.dataset)dock.dataset.field=has?'1':'0';renderNextStep();el.innerHTML=overlayHtml({labels:{...t('explorer'),hectares:t('hectares'),unavailable:t('unavailable')},num,polygon,areaHa:has?areaHa(polygon):null,center:has?centerOf(polygon):null,nasaClimate,evaluations:preflightEvaluations,terrain});}
function renderField(){if($('demo-status'))$('demo-status').textContent=demoStatusMessage();syncConsoleStatus();renderMapOverlay();const has=polygon.length>=3;const analyzeEl=$('analyze');if(analyzeEl){analyzeEl.innerHTML=(has&&nasaClimate?t('analyzeAgain'):t('analyze'))+icon('arrow');} $('view-field').disabled=!has;$('fit').disabled=!has||!mapReady;$('analyze').disabled=!has;$('analyze').hidden=!has;$('field-title').textContent=has?t('area'):t('none');$('field-desc').textContent=has?num(polygon.length,0)+' '+t('vertices'):t('noneHelp');$('field-area').innerHTML=fieldAreaHtml(has);$('coordinates').value=polygon.map(([lon,lat])=>lat.toFixed(6)+', '+lon.toFixed(6)).join('\n');}
// Re-renders the planner from the real engine output. Open evidence stays open and the edited plan states which counts moved.
function renderRotations(){syncFarmerScope();const confirmedPrevious=enginePreviousCrop(farmerInputs); const comparison=compareRotations(rotations,{previousCrop:confirmedPrevious},nasaClimate);
 const opened=new Set([...document.querySelectorAll('#planning details[data-k]')].filter(el=>el.open).map(el=>el.dataset.k));
 $('rotation-grid').innerHTML=comparison.evaluations.map((evaluation,i)=>renderPlanLane(evaluation,i,lang,rotationChange?.index===i?rotationChange:null)).join('');
 $('rotation-comparison').innerHTML=renderDecisionComparison(comparison,lang);
 document.querySelectorAll('#planning details[data-k]').forEach(el=>{if(opened.has(el.dataset.k))el.open=true;});
 const mappedHistory=demoSelection?.evidence?.cropHistory??[];
 $('farmer-previous-crop-root').innerHTML=renderFarmerPreviousCropControls({lang,farmerInputs,mappedHistory});
 updateFarmerImpact();
 $('farmer-input-impact').innerHTML=renderFarmerInputImpact({lang,impact:farmerInputImpact})+(farmerInputImpact?.items?.length?renderFarmerChangeTrace(farmerInputImpact,lang):'');
 renderPreflightPanel();
 const select=$('previous-crop'),confirm=$('previous-crop-confirmed');
 const onFarmerPrevious=()=>{const cropId=select?.value||null;farmerInputs.previousCrop={cropId:cropId&&Object.hasOwn(crops,cropId)?cropId:null,confirmed:confirm?.checked===true&&!!(cropId&&Object.hasOwn(crops,cropId)),provenance:confirm?.checked===true&&cropId?'farmer_assertion':null};farmerInputs.fieldScope=currentFieldScope();rotationChange=null;invalidateDecisionArtifacts({preserveHistorical:true,reason:'farmer_inputs'});renderRotations();};
 if(select)select.onchange=onFarmerPrevious;
 if(confirm)confirm.onchange=onFarmerPrevious;
 document.querySelectorAll('[data-rotation]').forEach(el=>el.onchange=()=>{const i=Number(el.dataset.rotation),j=Number(el.dataset.season),evaluate=()=>compareRotations([rotations[i]],{previousCrop:confirmedPrevious},nasaClimate).evaluations[0],before=evaluate();rotations[i][j]=el.value;rotationChange={index:i,items:planChange(before,evaluate())};invalidateDecisionArtifacts({preserveHistorical:true,reason:'rotation_change'});renderRotations();document.querySelector('[data-rotation="'+i+'"][data-season="'+j+'"]').focus();});
}
function collectPreflightInputs(){return {waterBudget:{amount:$('water-budget-amount')?.value??'',unit:$('water-budget-unit')?.value??'m3',period:$('water-budget-period')?.value??'perSeason'},plantingDates:[1,2,3].map(index=>$('planting-date-'+index)?.value??''),illustrativeCropSettings:$('illustrative-crop-settings')?.checked===true,effectiveRainfallSlopeConfirmed:$('effective-rainfall-slope-confirmed')?.checked===true};}
function capturePreflightInputs(){if($('preflight-form')){preflightInputs=collectPreflightInputs();biofirewallMemory=collectBioFirewallInputs();}}
function collectBioFirewallInputs(){
 const old=biofirewallMemory,equipment=old.equipmentMovements.at(-1)??{},sourceUse=$('bio-source-use')?.value??'';
 const hazard={fieldId:$('bio-hazard-field-id')?.value??'',hazardId:$('bio-hazard-id')?.value??'clubroot',hazardName:$('bio-hazard-name')?.value??'',evidenceStatus:$('bio-hazard-status')?.value??'unknown',recordedDate:$('bio-recorded-date')?.value??'',notes:$('bio-notes')?.value??''};
 const hasHazard=!!(hazard.fieldId||hazard.hazardName||hazard.recordedDate||hazard.notes||hazard.evidenceStatus!=='unknown');
 const movement={id:equipment.id||'movement-1',equipmentId:$('bio-equipment-id')?.value??'',fromFieldId:$('bio-from-field-id')?.value??'',toFieldId:$('bio-to-field-id')?.value??'',sourceUseConfirmed:sourceUse==='true'?true:sourceUse==='false'?false:null,movedAt:$('bio-moved-at')?.value??'',cleaningStatus:$('bio-cleaning-status')?.value??'unknown',cleaningDate:$('bio-cleaning-date')?.value??'',notes:hazard.notes};
 const hasMovement=!!(movement.equipmentId||movement.fromFieldId||movement.toFieldId||movement.movedAt||movement.sourceUseConfirmed!==null||movement.cleaningDate||movement.cleaningStatus!=='not-recorded');
 const movements=old.equipmentMovements.length?[...old.equipmentMovements.slice(0,-1),...(hasMovement?[movement]:[])]:hasMovement?[movement]:[];
 return normalizeBioFirewall({fieldId:$('bio-field-id')?.value??old.fieldId,reportedHazard:hasHazard?hazard:null,equipmentMovements:movements});
}
function preflightContext(inputs=preflightInputs){return {...inputs,polygon:polygon.map(point=>[...point]),areaHa:polygon.length>=3?areaHa(polygon):null,previousCrop:enginePreviousCrop(farmerInputs),biofirewall:biofirewallMemory};}
function preflightInputSnapshot(context){return {waterBudget:context.waterBudget??null,plantingDates:Array.isArray(context.plantingDates)?[...context.plantingDates]:null,illustrativeCropSettings:context.illustrativeCropSettings===true,effectiveRainfallSlopeConfirmed:context.effectiveRainfallSlopeConfirmed===true,previousCrop:context.previousCrop??null,rotations:rotations.map(sequence=>[...sequence])};}
function runCurrentPreflight(){
 const context=preflightContext(),prior=preflightLastSnapshot;
 preflightBreakpoints=analyzeDecisionSensitivity(rotations,context,nasaClimate,{previousEvaluations:prior?.evaluations,previousInputs:prior?.inputs});
 preflightEvaluations=preflightBreakpoints.evaluations;
 preflightLastSnapshot={evaluations:preflightEvaluations,inputs:preflightInputSnapshot(context)};
 const traceMeta={context,fieldScope:currentFieldScope(),demoFieldId:resolveDemoFieldId(),farmerInputs,climateData:nasaClimate};
 decisionTraces=buildAllDecisionTraces(preflightEvaluations,traceMeta);
 updateFarmerImpact();
 decisionSnapshot=buildDecisionSnapshot({rotations,preflightInputs,farmerInputs,farmerImpact:farmerInputImpact,traces:decisionTraces,fieldScope:traceMeta.fieldScope,demoFieldId:traceMeta.demoFieldId,polygon,areaHa:context.areaHa,climateData:nasaClimate});
 snapshotValidity={state:SNAPSHOT_VALIDITY.CURRENT,reasons:[]};
 historicalSnapshot=null;
 renderRotations();
 dashboardTab='overview';showScreen('results');
}
function loadDecisionBreakpointDemo(evaluate=true){
 const period=nasaClimate?.period,start=period?.startIso,end=period?.endIso;
 if(polygon.length<3||!start){const message=$('breakpoint-demo-status');if(message)message.textContent=t('preflight').breakpoint.demoUnavailable;return;}
 const spring=['2025-04-20','2025-05-01','2025-05-15'];
 const clamp=(iso)=>{if(!iso)return '';if(iso<start)return start;if(end&&iso>end)return end;return iso;};
 preflightInputs={waterBudget:evaluate?{amount:'',unit:'m3',period:'perSeason'}:{...preflightInputs.waterBudget},plantingDates:spring.map(clamp),illustrativeCropSettings:true,effectiveRainfallSlopeConfirmed:true};
 preflightEvaluations=null;preflightBreakpoints=null;preflightLastSnapshot=null;
 const message=$('breakpoint-demo-status');if(message)message.textContent=t('preflight').illustrativePlantingNote;
 if(evaluate)runCurrentPreflight();else{invalidateDecisionArtifacts({preserveHistorical:true,reason:'illustrative_inputs'});renderPreflightPanel();}
}
function loadBioFirewallDemo(){
 biofirewallMemory=normalizeBioFirewall({fieldId:'Field-B',reportedHazard:{fieldId:'Field-A',hazardId:'clubroot',hazardName:'',evidenceStatus:'confirmed',recordedDate:'2025-04-01',notes:'Illustrative demo only — not a real outbreak record.'},equipmentMovements:[{id:'illustrative-move-1',equipmentId:'shared-tractor-1',fromFieldId:'Field-A',toFieldId:'Field-B',sourceUseConfirmed:true,movedAt:'2025-04-02',cleaningStatus:'not-recorded',cleaningDate:'',notes:'Illustrative demo only — not a real outbreak record.'}]});
 preflightEvaluations=null;preflightBreakpoints=null;preflightLastSnapshot=null;
 runCurrentPreflight();
}
function renderPreflightPanel(){
 renderMapOverlay();
 const root=$('preflight-root');if(!root)return;
 root.innerHTML=renderPreflightPanelHtml({lang,inputs:preflightInputs,areaHa:polygon.length>=3?areaHa(polygon):null,period:nasaClimate?.period??null,evaluations:preflightEvaluations,breakpoint:preflightBreakpoints,biofirewall:biofirewallMemory,decisionTraces,snapshotValidity,selectedRotation:preflightRotationFocus,dashboard:true});
 const calculations=$('dashboard-calculation-output');
 if(calculations?.replaceChildren)calculations.replaceChildren(root.querySelector('#preflight-results'),root.querySelector('#biofirewall-results'));
 bindPreflightResults();
 const scenarioButton=$('illustrative-scenario');if(scenarioButton)scenarioButton.onclick=()=>loadDecisionBreakpointDemo(false);
 const demoBudget=$('demo-budget');if(demoBudget)demoBudget.onclick=()=>{
  const prior=preflightLastSnapshot;preflightInputs.waterBudget={amount:'600',unit:'mm',period:'perSeason'};
  invalidateDecisionArtifacts({preserveHistorical:true,reason:'preflight_inputs'});preflightLastSnapshot=prior;renderPreflightPanel();
 };
 const demo=$('decision-breakpoint-demo');if(demo)demo.onclick=loadDecisionBreakpointDemo;
 const bioDemo=$('bio-demo');if(bioDemo)bioDemo.onclick=loadBioFirewallDemo;
 const form=$('preflight-form');if(!form)return;
 const changed=()=>{
  const prior=preflightLastSnapshot;
  preflightInputs=collectPreflightInputs();biofirewallMemory=collectBioFirewallInputs();const budgetCheck=validateWaterBudgetDraft(preflightInputs.waterBudget);const err=$('water-budget-error');if(err){if(!budgetCheck.valid&&budgetCheck.empty===false){err.textContent=t('farmer').budgetInvalid;err.hidden=false;}else{err.hidden=true;err.textContent='';}}
  invalidateDecisionArtifacts({preserveHistorical:true,reason:'preflight_inputs'});
  preflightLastSnapshot=prior;renderMapOverlay();
  const confirmation=$('water-budget-confirmation');if(confirmation)confirmation.innerHTML=renderBudgetConfirmation({lang,budget:preflightInputs.waterBudget,areaHa:polygon.length>=3?areaHa(polygon):null});
  updateFarmerImpact();const impact=$('farmer-input-impact');if(impact)impact.innerHTML=renderFarmerInputImpact({lang,impact:farmerInputImpact});const output=$('preflight-results');if(output){output.innerHTML=renderStalePreflightResults(lang);bindPreflightResults();}const bioOutput=$('biofirewall-results');if(bioOutput)bioOutput.innerHTML='<h4 id="biofirewall-results-title">'+esc(t('preflight').biofirewall.ruleTitle)+'</h4><p>'+esc(t('preflight').biofirewall.runFindings)+'</p>';
 };
 for(const id of ['water-budget-amount','water-budget-unit','water-budget-period','planting-date-1','planting-date-2','planting-date-3','illustrative-crop-settings','effective-rainfall-slope-confirmed','bio-field-id','bio-hazard-field-id','bio-hazard-id','bio-hazard-name','bio-hazard-status','bio-recorded-date','bio-equipment-id','bio-from-field-id','bio-to-field-id','bio-source-use','bio-moved-at','bio-cleaning-status','bio-cleaning-date','bio-notes']){const element=$(id);if(element){element.oninput=changed;element.onchange=changed;}}
 form.onsubmit=event=>{event.preventDefault();preflightInputs=collectPreflightInputs();biofirewallMemory=collectBioFirewallInputs();const budgetCheck=validateWaterBudgetDraft(preflightInputs.waterBudget);const err=$('water-budget-error');if(!budgetCheck.valid&&budgetCheck.empty===false){if(err){err.textContent=t('farmer').budgetInvalid;err.hidden=false;}return;}if(err){err.hidden=true;err.textContent='';}runCurrentPreflight();};
}
function setPreflightRotationFocus(index){
 preflightRotationFocus=Math.max(0,Math.min(2,Number(index)||0));
 if(document.querySelector?.('#dashboard-plan-select')){renderPreflightPanel();$('dashboard-plan-select').focus();return;}
 const output=$('preflight-results');
 if(!output||!preflightEvaluations?.length)return;
 output.innerHTML=renderPreflightResultsSection({lang,inputs:preflightInputs,areaHa:polygon.length>=3?areaHa(polygon):null,period:nasaClimate?.period??null,evaluations:preflightEvaluations,breakpoint:preflightBreakpoints,decisionTraces,selectedRotation:preflightRotationFocus});
 bindPreflightResults();
 const demo=$('decision-breakpoint-demo');if(demo)demo.onclick=loadDecisionBreakpointDemo;
}
function bindPreflightResults(){
 const planSelect=document.querySelector?.('#dashboard-plan-select');if(planSelect)planSelect.onchange=()=>setPreflightRotationFocus(planSelect.value);
 document.querySelectorAll('[data-preflight-rotation]').forEach(btn=>{btn.onclick=()=>setPreflightRotationFocus(btn.dataset.preflightRotation);});
 let drawerTrigger;
 const openDrawer=(rotation,key)=>{const store=document.querySelector(`.preflight-check-store[data-rotation="${rotation}"][data-check-key="${key}"]`);const body=$('preflight-drawer-body');const drawer=$('preflight-provenance-drawer');if(!store||!body||!drawer)return;body.innerHTML=store.innerHTML;drawer.hidden=false;drawer.removeAttribute('hidden');$('preflight-drawer-close')?.focus?.();drawer.scrollIntoView?.({block:'nearest'});};
 document.querySelectorAll('.preflight-check-pick').forEach(btn=>{btn.onclick=()=>{drawerTrigger=btn;openDrawer(btn.dataset.rotation,btn.dataset.checkKey);};});
 const close=$('preflight-drawer-close');if(close){close.onclick=()=>{$('preflight-provenance-drawer').hidden=true;drawerTrigger?.focus();};$('preflight-provenance-drawer').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();close.onclick();}};}
 const stale=$('preflight-stale-run');if(stale)stale.onclick=()=>$('run-preflight')?.click();
}
async function search(e){e.preventDefault();const query=$('search-input').value.trim();const current=++generation;$('search-results').replaceChildren();$('search-status').textContent='';
 if(query.includes(',')){try{center=parseCoordinates(query);zoom=13;userControl();map?.easeTo(locationCamera(center,zoom,cameraState()));$('search-status').textContent=center.slice().reverse().join(', ');}catch{$('search-status').textContent=t('invalid');}return;}
 if(query.length<2){$('search-status').textContent=t('empty');return;}
 $('search-status').textContent=t('searching');$('search-button').disabled=true;
 try{const data=await fetchJson('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(query)+'&count=5&language='+lang+'&format=json');if(current!==generation)return;const results=(data.results||[]).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=85);$('search-status').textContent=results.length?'':t('empty');for(const place of results){const b=document.createElement('button');b.textContent=[place.name,place.admin1,place.country].filter(Boolean).join(' · ');b.onclick=()=>{center=[place.longitude,place.latitude];zoom=12;map?.easeTo(locationCamera(center,zoom,cameraState()));$('search-input').value=place.name;$('search-results').replaceChildren();$('search-status').textContent='GeoNames / Open-Meteo · '+place.name;};$('search-results').append(b);}}catch{if(current===generation)$('search-status').textContent=t('searchError');}finally{if(current===generation)$('search-button').disabled=false;}
}
async function analyze(){if(!polygon.length)return;const request=++weatherRequest;const [lon,lat]=centerOf(polygon);$('analyze').disabled=true;$('next-step').disabled=true;$('weather-content').innerHTML='<p role="status" class="loading">'+t('loading')+'</p>';$('nasa-content').innerHTML='<p role="status" class="loading">'+t('loading')+'</p>';
 const url='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&timezone=auto&forecast_days=1';
 const weatherTask=fetchJson(url).then(data=>({...parseWeather(data),retrieved:new Date().toISOString(),url})).catch(()=>null);
 const nasaTask=loadFieldClimate(demoSelection,polygon,lon,lat).catch(()=>null);
 const [nextWeather,nextNasa]=await Promise.all([weatherTask,nasaTask]);
 if(request!==weatherRequest)return;
 invalidateDecisionArtifacts({preserveHistorical:true,reason:'climate_refresh'});
 weather=nextWeather;nasaClimate=nextNasa;renderWeather();renderNasaClimate();
 if(!weather)$('weather-content').innerHTML='<p role="alert" class="error">'+t('serviceError')+'</p>';
 if(!nasaClimate)$('nasa-content').innerHTML='<p role="alert" class="error">'+(demoSelection?(lang==='ar'?'تعذر تحميل دليل MongoDB. اضغط تحليل الحقل لإعادة المحاولة.':'MongoDB evidence unavailable. Analyze this field to retry; no live-data substitution was used.'):t('nasaUnavailable'))+'</p>';
 renderField();
 $('analyze').disabled=false;
 $('next-step').disabled=false;
 setFieldProgress(nasaClimate?guidedText('Historical climate ready.','المناخ التاريخي جاهز.'):guidedText('Analysis could not be loaded. Retry analysis to continue.','تعذر تحميل التحليل. أعد المحاولة للمتابعة.'),false);
 if(nasaClimate)showScreen('setup');else $('analyze').textContent=guidedText('Retry analysis','إعادة التحليل');
}
function metric(label,value,unit,ico){return '<div class="metric">'+icon(ico)+'<span>'+t(label)+'</span><strong>'+(value===null||value===undefined?t('unavailable'):num(value)+' <small dir="ltr">'+unit+'</small>')+'</strong></div>';}
function renderNasaClimate(){renderRotations();const el=$('nasa-content');if(!el)return;if(!nasaClimate){el.innerHTML='';return;}
 const p=nasaClimate,plan=p.planning,c=p.channels;
 el.innerHTML='<div class="nasa-head"><h3>'+t('nasaTitle')+'</h3><span class="badge">'+t('nasaHistorical')+'</span></div><p class="small muted">'+t('nasaPeriod')+': <bdi>'+esc(p.period.startIso)+' — '+esc(p.period.endIso)+'</bdi> · '+esc(p.timeStandard||'')+'</p><div class="weather-grid">'+metric('nasaPrecipTotal',plan.precipitationAnnualMm,'mm','drop')+metric('nasaTempMax',plan.temperatureMeanMaxC,'°C','sun')+metric('nasaTempMin',plan.temperatureMeanMinC,'°C','sun')+metric('nasaSolar',plan.solarRadiationMeanDailyMj,c.solarRadiation.unit||'MJ/m^2/day','sun')+'</div><p class="provenance">'+(p.storage==='MongoDB'?(lang==='ar'?'أرشيف NASA POWER عند مركز الحقل المخزن. تقديرات شبكية تاريخية وليست قياسات حقلية؛ تختلف دقة البيانات حسب المتغير.':'Archived NASA POWER at the stored field centroid. Historical gridded estimates, not field instruments; resolution varies by parameter.'):t('nasaNote'))+' <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER ↗</a></p><p class="small muted">'+t('sample')+': <bdi>'+p.coordinates.latitude+', '+p.coordinates.longitude+'</bdi> · '+t('nasaResolution')+' | '+t('retrieved')+': <bdi>'+esc(p.retrieved)+'</bdi> · <a href="'+esc(p.url)+'" target="_blank" rel="noreferrer">'+t('viewSource')+'</a></p>';
 if(p.storage==='MongoDB'){
  el.innerHTML+='<p class="provenance demo-source">MongoDB · NASA POWER · 2025 · LST</p>'+renderEvidence(demoSelection.evidence,demoSupplement,lang,true);
 }
 if(el.querySelector){
  for(const kind of ['history','soil']){
   const output=$('dashboard-'+kind+'-output'),section=el.querySelector(`[data-evidence-kind="${kind}"]`);
   output.replaceChildren();
   if(section){section.querySelector('summary').remove();output.append(...section.childNodes);section.remove();}
   else output.textContent=guidedText('No field records loaded.','لم تُحمّل سجلات للحقل.');
  }
  const evidence=el.querySelector('.evidence-verification'),output=$('dashboard-field-evidence-output');
  output.replaceChildren();if(evidence){
   // Historical seasonal summaries belong beside the daily climate, with their source metadata.
   const seasonal=[...evidence.querySelectorAll(':scope > details')].find(details=>!details.querySelector('table'));
   if(seasonal)el.append(seasonal);
   output.append(evidence);
  }else output.textContent=guidedText('Climate source and coverage are shown with the historical data. No crop or soil records loaded.','يظهر مصدر المناخ وفترته مع البيانات التاريخية. لم تُحمّل سجلات للمحاصيل أو التربة.');
 }
 renderMapOverlay();
}
function renderWeather(){if(!weather){$('weather-content').innerHTML='<p class="muted">'+t('analyzeHelp')+'</p>';return;}
 $('weather-content').innerHTML='<div class="weather-grid">'+[['temperature','temperature','°C','sun'],['rain','rain','mm','drop'],['wind','wind','km/h','wind'],['humidity','humidity','%','drop']].map(([key,label,unit,ico])=>'<div class="metric">'+icon(ico)+'<span>'+t(label)+'</span><strong>'+(weather[key]===null?t('unavailable'):num(weather[key])+' <small dir="ltr">'+unit+'</small>')+'</strong></div>').join('')+'</div><p class="provenance">'+t('weatherNote')+' <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo ↗</a></p><p class="small muted">'+esc(weather.time)+' · '+esc(weather.timezone)+' | '+t('sample')+': <bdi>'+weather.latitude+', '+weather.longitude+'</bdi> | '+t('retrieved')+': <bdi>'+weather.retrieved+'</bdi> · <a href="'+esc(weather.url)+'" target="_blank" rel="noreferrer">'+t('viewSource')+'</a></p>';
}
async function loadClimate(){const request=++climateRequest;const url=climateUrl(country,scenario,period);$('run-climate').disabled=true;$('climate-content').innerHTML='<p class="loading">'+t('loading')+'</p>';
 try{const data=await fetchJson(url);if(request!==climateRequest)return;climate={value:parseClimate(data,country),url,retrieved:new Date().toISOString()};renderClimate();}catch{if(request===climateRequest){climate=null;$('climate-content').innerHTML='<p class="error">'+t('serviceError')+'</p>';}}finally{if(request===climateRequest)$('run-climate').disabled=false;}
}
function renderClimate(){$('climate-content').innerHTML=climate?'<div class="climate-result"><span>'+t('climateMetric')+'</span><strong dir="ltr">'+(climate.value>0?'+':'')+num(climate.value,2)+' °C</strong><span>'+messages[lang].countryNames[countries.indexOf(country)]+' · <bdi>'+scenario.toUpperCase()+' · '+period+'</bdi></span></div><p class="small muted">'+t('retrieved')+': <bdi>'+esc(climate.retrieved)+'</bdi> · <a href="'+esc(climate.url)+'" target="_blank" rel="noreferrer">'+t('viewSource')+'</a></p>':'<p class="climate-empty">'+t('climateEmpty')+'</p>';}
let libraryPromise;
function loadMapLibrary(){if(window.maplibregl)return Promise.resolve(window.maplibregl);if(libraryPromise)return libraryPromise;libraryPromise=new Promise((resolve,reject)=>{if(!document.getElementById('maplibre-css')){const css=document.createElement('link');css.id='maplibre-css';css.rel='stylesheet';css.href='https://unpkg.com/maplibre-gl@5.3.0/dist/maplibre-gl.css';document.head.append(css);}const s=document.createElement('script');s.src='https://unpkg.com/maplibre-gl@5.3.0/dist/maplibre-gl.js';s.onload=()=>window.maplibregl?resolve(window.maplibregl):reject(Error('library'));s.onerror=()=>reject(Error('library'));document.head.append(s);});return libraryPromise;}
async function initMap(){const current=mapGeneration;let timeout=setTimeout(()=>{if(current===mapGeneration&&!mapReady)mapFailure();},20000);
 try{const ml=await loadMapLibrary();if(current!==mapGeneration)return;
 map=new ml.Map({container:'map',center,zoom,maxZoom:17,minZoom:2,maxPitch:CAMERA.maxPitch,attributionControl:false,style:{version:8,sources:{satellite:{type:'raster',tiles:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],tileSize:256,maxzoom:14,attribution:'<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024) · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>'},relief:{type:'raster',tiles:['https://tiles.maps.eox.at/wmts/1.0.0/terrain_3857/default/g/{z}/{y}/{x}.jpg'],tileSize:256,maxzoom:13,attribution:'Terrain © <a href="https://maps.eox.at">EOX</a>; OpenStreetMap contributors, NASA, USGS, Copernicus, GEBCO'}},layers:[{id:'satellite',type:'raster',source:'satellite'},{id:'relief',type:'raster',source:'relief',layout:{visibility:'none'}}]}});
 framed=false;autoMove=false;bindMapCamera();
 map.addControl(new ml.AttributionControl({compact:media('(max-width:760px)')}),'bottom-right');map.addControl(new ml.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
 map.on('load',()=>{if(current!==mapGeneration)return;clearTimeout(timeout);mapReady=true;for(const id of MAP_CONTROLS)if(id!=='fit')$(id).disabled=false;$('fit').disabled=!polygon.length;$('map-loading').hidden=true;map.setSky?.({'sky-color':'#071c32','horizon-color':'#89b5cc','fog-color':'#244357','sky-horizon-blend':.7,'horizon-fog-blend':.6,'fog-ground-blend':.6,'atmosphere-blend':0});map.on('rotate',updateCompass);updateCompass();map.once('idle',()=>{const credit=map?.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact');credit?.classList.remove('maplibregl-compact-show');credit?.removeAttribute('open');});map.addSource('field',{type:'geojson',lineMetrics:true,data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'field-mask',type:'fill',source:'field',filter:['==','kind','mask'],paint:{'fill-color':'#03100b',...FIELD_PAINT['field-mask']}});map.addLayer({id:'field-shadow',type:'line',source:'field',filter:['==','kind','field'],layout:{'line-join':'round'},paint:{'line-color':'#010604','line-width':6,'line-blur':5,'line-translate':[0,3],'line-translate-anchor':'viewport',...FIELD_PAINT['field-shadow']}});map.addLayer({id:'field-fill',type:'fill',source:'field',filter:['==','kind','field'],paint:{'fill-color':'#36B77A',...FIELD_PAINT['field-fill']}});map.addLayer({id:'field-inner',type:'line',source:'field',filter:['==','kind','field'],layout:{'line-join':'round'},paint:{'line-color':'#D6F5A8','line-width':10,'line-blur':10,'line-offset':5,...FIELD_PAINT['field-inner']}});map.addLayer({id:'field-glow',type:'line',source:'field',filter:['==','kind','field'],layout:{'line-join':'round'},paint:{'line-color':'#36B77A','line-blur':4,...FIELD_PAINT['field-glow']}});map.addLayer({id:'field-casing',type:'line',source:'field',filter:['in','kind','field','draft'],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#03130f','line-opacity':.75,...FIELD_PAINT['field-casing']}});map.addLayer({id:'field-line',type:'line',source:'field',filter:['in','kind','field','draft'],layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#EFFFE6',...FIELD_PAINT['field-line']}});map.addLayer({id:'field-trace',type:'line',source:'field',filter:['==','kind','trace'],layout:{'line-join':'round','line-cap':'round'},paint:{'line-width':4,'line-blur':2,'line-gradient':traceGradient(1)}});map.addLayer({id:'field-points',type:'circle',source:'field',filter:['==','kind','vertex'],paint:{'circle-radius':4.5,'circle-color':'#f2fff7','circle-stroke-color':'#0f6b4c','circle-stroke-width':2}});const tag=document.createElement('div');tag.className='field-tag';tag.tabIndex=-1;tag.setAttribute('aria-hidden','true');fieldTag=new ml.Marker({element:tag,anchor:'bottom',offset:[0,-14]});switchLayer(layer);updateDraw();if(polygon.length>=3){revealField();selectionTask=focusSelection();}});
 map.on('click',e=>{if(drawing&&draft.length<100){draft.push([e.lngLat.lng,e.lngLat.lat]);updateDraw();}});
 map.on('error',e=>{if(current!==mapGeneration)return;if(e.sourceId==='dem-shade')return;if(e.sourceId==='dem'){const msg=String(e.error?.message||e.error||'');if(/source unavailable|could not be decoded|404|not found/i.test(msg)){terrain=false;map.setTerrain(null);syncFieldMaskVisibility();map.setPitch(0);map.setBearing(0);$('terrain').setAttribute('aria-pressed','false');$('terrain-status').textContent=t('terrainFailed');renderMapOverlay();}return;}status('tilesFailed',true);});
 map.on('moveend',()=>{center=map.getCenter().toArray();zoom=map.getZoom();updateCompass();});
 }catch{clearTimeout(timeout);if(current===mapGeneration)mapFailure();}
}
function mapFailure(){for(const id of MAP_CONTROLS)$(id).disabled=true;$('map-loading').hidden=false;$('map-loading').innerHTML='<div>'+icon('globe')+'<p>'+t('mapFailed')+'</p><button id="retry-map">'+t('retry')+'</button></div>';$('retry-map').onclick=()=>{map?.remove();map=null;fieldTag=null;mapReady=false;libraryPromise=null;mapGeneration++;$('map-loading').textContent=t('loadingMap');initMap();};}
function switchLayer(next){layer=next;if(mapReady){map.setLayoutProperty('satellite','visibility',next==='satellite'?'visible':'none');map.setLayoutProperty('relief','visibility',next==='relief'?'visible':'none');}for(const l of ['satellite','relief']){$(l).classList.toggle('selected',l===next);$(l).setAttribute('aria-pressed',String(l===next));}}
// Bounded wait for the DEM tiles under the current view, so an oblique move is computed on real ground heights. V4B replaces the whole-map idle wait, which the boundary reveal could hold back for seconds. Without a DEM status API it resolves at once.
function terrainSettled(maxMs=CAMERA.terrainWait){const target=map;return new Promise(resolve=>{if(typeof target?.isSourceLoaded!=='function')return resolve();const start=Date.now();const poll=()=>{if(map!==target||!terrain||!target.getSource('dem')||target.isSourceLoaded('dem')||Date.now()-start>=maxMs)resolve();else setTimeout(poll,60);};setTimeout(poll,60);});}
// MapLibre 5.3 can leave the camera aimed at sea level when terrain is switched on again over ground whose DEM tiles are already cached (seen at Scottsbluff, ~1184 m: the parcel slid off the top edge and looked over-zoomed). queryTerrainElevation is relative to the camera's ground height, so a large value means that height is stale; re-applying the same real 1× DEM makes MapLibre read it again. Nothing about the terrain data changes.
function groundTerrain(){if(!mapReady||!terrain||!map.getSource?.('dem'))return;const offset=map.queryTerrainElevation?.(map.getCenter());if(Number.isFinite(offset)&&Math.abs(offset)>1)map.setTerrain({source:'dem',exaggeration:1});}
// Relief shading drawn from the same real elevation tiles, under the boundary and only while terrain is on. Its strength is styling; the heights are not changed. A separate source keeps it independent of the terrain mesh, and any failure simply leaves the scene unshaded.
function ensureTerrainShade(){try{if(!map.getSource('dem-shade'))map.addSource('dem-shade',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,encoding:'terrarium',maxzoom:15});if(!map.getLayer('terrain-shade'))map.addLayer({id:'terrain-shade',type:'hillshade',source:'dem-shade',layout:{visibility:'none'},paint:{'hillshade-exaggeration':.32,'hillshade-illumination-direction':315,'hillshade-illumination-anchor':'map','hillshade-shadow-color':'#04131c','hillshade-highlight-color':'#f1f8ee','hillshade-accent-color':'#0d2a33'}},map.getLayer('field-mask')?'field-mask':undefined);}catch{/* shading is optional */}}
function syncFieldMaskVisibility(){if(mapReady&&map.getLayer?.('terrain-shade'))map.setLayoutProperty('terrain-shade','visibility',terrain?'visible':'none');if(!mapReady||!map.getLayer('field-mask'))return;const show=shouldShowFieldMask({terrain,drawing,hasField:polygon.length>=3});map.setLayoutProperty('field-mask','visibility',show?'visible':'none');}
function updateDraw(){$('finish').hidden=!drawing;$('undo').hidden=!drawing;$('finish').disabled=draft.length<3;$('undo').disabled=!draft.length;$('draw').classList.toggle('selected',drawing);$('map-help').textContent=t(drawing?'drawHelp':'normalHelp')+(drawing?' ('+num(draft.length,0)+')':'');if(!mapReady)return;map.getCanvas().style.cursor=drawing?'crosshair':'';map.getSource('field').setData({type:'FeatureCollection',features:fieldFeatures(drawing?draft:polygon,{drawing})});map.setLayoutProperty('field-points','visibility',drawing?'visible':'none');syncFieldMaskVisibility();renderNextStep();updateFieldTag();}
// Area tag pinned to the parcel's real northern edge; hidden while drawing and never interactive.
function updateFieldTag(){if(!fieldTag)return;if(drawing||polygon.length<3){fieldTag.remove();return;}const [[west],[east,north]]=polygonBounds(polygon);fieldTag.getElement().innerHTML='<strong>'+esc(num(areaHa(polygon),2))+'</strong> '+esc(t('hectares'));fieldTag.setLngLat([(west+east)/2,north]).addTo(map);}
function paintField(progress){for(const [id,props] of Object.entries(revealPaint(progress)))for(const [key,value] of Object.entries(props))map.setPaintProperty(id,key,value);map.setPaintProperty('field-trace','line-gradient',traceGradient(progress));}
// One finite reveal per completed boundary; instant for reduced motion, while drawing, or without animation frames.
function revealField(){if(!mapReady)return;const frames=typeof requestAnimationFrame==='function';if(revealFrame&&frames)cancelAnimationFrame(revealFrame);revealFrame=0;const total=revealPlan(cameraState()).duration;if(!total||!frames){paintField(1);return;}const owner=map,start=performance.now();const step=now=>{if(map!==owner||!mapReady){revealFrame=0;return;}const progress=drawing?1:Math.min(1,(now-start)/total);paintField(progress);revealFrame=progress<1?requestAnimationFrame(step):0;};paintField(0);revealFrame=requestAnimationFrame(step);}
// Every app-driven camera move goes through here, so real user input can stop it at once. MapLibre ends the previous move inside the call, hence the flag is set afterwards; moveend clears it.
function moveCamera(camera){const options=camera.bounds?camera.options:camera;syncFieldMaskVisibility();if(camera.bounds)map.fitBounds(camera.bounds,options);else map.easeTo(camera);autoMove=options.duration>0;}
// Any real input on the map hands the camera to the user: pending automatic framing is dropped and an automatic move in flight stops immediately.
function userControl(){selectionRequest++;framed=false;if(autoMove){autoMove=false;map?.stop?.();}}
// Wires pointer, touch, wheel and keyboard input on the map surface plus MapLibre's own gesture events (those carry originalEvent; programmatic moves do not). Tab only moves focus.
function bindMapCamera(){const surface=map.getCanvasContainer?.()??map.getContainer();for(const type of ['pointerdown','touchstart','wheel','keydown'])surface.addEventListener(type,e=>{if(e?.key!=='Tab')userControl();},{capture:true,passive:true});for(const type of ['dragstart','zoomstart','rotatestart','pitchstart'])map.on(type,e=>{if(e?.originalEvent)userControl();});map.on('moveend',()=>{autoMove=false;groundTerrain();});map.on('resize',reframe);}
// Layout changes keep a framed parcel framed, instantly and at the current angle. A camera the user moved is never touched.
function reframe(){if(!mapReady||!framed||drawing)return;const camera=reframeCamera(polygon,cameraState(),{bearing:map.getBearing?.(),pitch:map.getPitch?.()});if(camera)moveCamera(camera);}
// The mode switch changes only the view angle around the same centre and zoom; it never re-fits the parcel.
function composeMode(){moveCamera(terrainCamera(terrain,cameraState()));}
function fit(){if(!mapReady)return;const camera=focusCamera(polygon,cameraState());if(camera){moveCamera(camera);framed=true;}}
// One instant jump when the parcel is outside the current view; the visible motion is then a single short settle.
function approach(){const camera=approachCamera(polygon);if(camera&&map.getBounds?.().contains(camera.center)===false)map.jumpTo(camera);}
// One finite turn per press: orbits the parcel while it is still framed, otherwise rotates the view the user chose without changing its zoom.
function orbit(direction){if(!mapReady)return;selectionRequest++;const camera=orbitCamera(framed?polygon:[],cameraState(),{bearing:map.getBearing?.()??0,pitch:map.getPitch?.()??0},direction);moveCamera(camera);framed=!!camera.bounds;}
function resetView(){if(!mapReady)return;selectionRequest++;const camera=resetCamera(polygon,cameraState(),HOME);moveCamera(camera);framed=!!camera.bounds;}
// The 3D button is the explicit mode switch. Choosing 2D is remembered so later selections stay flat until 3D is chosen again.
async function toggleTerrain(){if(!mapReady)return;const request=++selectionRequest;if(terrain){prefer2d=true;terrain=false;map.setTerrain(null);syncFieldMaskVisibility();composeMode();$('terrain').setAttribute('aria-pressed','false');$('terrain-status').textContent='';renderMapOverlay();return;}
 prefer2d=false;if(await loadTerrain()){await terrainSettled();groundTerrain();if(request===selectionRequest)composeMode();}
}
// Selecting a field frames the real parcel once: oblique on the real 1× DEM, or flat if the user chose 2D or the DEM is unavailable. Any user input meanwhile cancels the pending fit.
function focusSelection(){if(!mapReady)return Promise.resolve();const request=++selectionRequest,live=()=>request===selectionRequest&&!drawing;approach();if(prefer2d&&!terrain){fit();return Promise.resolve();}
 return (terrain?Promise.resolve(true):loadTerrain(centerOf(polygon))).then(ok=>{if(!ok)prefer2d=true;return ok&&live()?terrainSettled():null;}).then(()=>{groundTerrain();if(live())fit();});
}
// Activates the real DEM at 1× on the live map without moving the camera. Resolves true only when terrain is on; concurrent callers share one load.
function loadTerrain(point){if(terrain)return Promise.resolve(true);if(!terrainTask)terrainTask=requestTerrain(point).finally(()=>{terrainTask=null;});return terrainTask;}
async function requestTerrain(point){
 const targetMap=map;const [lon,lat]=point??targetMap.getCenter().toArray();const z=Math.min(12,Math.floor(targetMap.getZoom())),n=2**z;const x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
 $('terrain').disabled=true;$('terrain-status').textContent=t('terrainWait');
 try{const r=await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+z+'/'+x+'/'+y+'.png',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('dem');const bitmap=await createImageBitmap(await r.blob());const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const pixel=ctx.getImageData(Math.floor(bitmap.width/2),Math.floor(bitmap.height/2),1,1).data;bitmap.close();decodeTerrain(pixel);if(map!==targetMap)return false;if(!map.getSource('dem'))map.addSource('dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,encoding:'terrarium',maxzoom:15,attribution:'Elevation: <a href="/sources.html#terrain">Mapzen / AWS · USGS and other DEM contributors</a>'});map.setTerrain({source:'dem',exaggeration:1});map.setLight?.({anchor:'viewport',color:'#ffffff',intensity:0.35});terrain=true;ensureTerrainShade();syncFieldMaskVisibility();$('terrain').setAttribute('aria-pressed','true');$('terrain-status').textContent=t('terrainReady');renderMapOverlay();return true;}catch{if(map===targetMap){terrain=false;map.setTerrain(null);syncFieldMaskVisibility();map.setPitch(0);$('terrain').setAttribute('aria-pressed','false');$('terrain-status').textContent=t('terrainFailed');renderMapOverlay();}return false;}finally{if(map===targetMap)$('terrain').disabled=false;}
}
render();
