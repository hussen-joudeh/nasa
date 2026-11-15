import {MongoClient} from 'mongodb';
import {DEMO_FIELD_ID,DEMO_FIELD_URL} from './demo-config.mjs';
import {CANONICAL_COLLECTION_COUNTS,resolveMongoDatabase,resolveMongoUri} from '../../scripts/fieldshift-config.mjs';
import {readOnlyDenied,storageFailure,badQuery,notFound,sendJson,validateClimateDailyRow,validateClimateSeasonalRow,validateCropProfile,validateScenario,validateDemoFieldPayload,cropCompatibilityMatrix} from './evidence-validate.mjs';

export function createDemoStore(){
  const client=new MongoClient(resolveMongoUri(),{serverSelectionTimeoutMS:5000});
  const db=client.db(resolveMongoDatabase());
  const col=name=>db.collection(name);
  const collectionNames=['fields','climate_daily','climate_seasonal','crop_history','field_soils','crop_profiles','scenarios'];
  return {
    async ping(){
      const database=resolveMongoDatabase();
      const base={storage:'MongoDB',http:true,fieldId:DEMO_FIELD_ID,mongodb:{reachable:false,database}};
      try{
        await client.db().command({ping:1});
      }catch{
        return {...base,ready:false,mongodb:{reachable:false,database},evidence:{imported:false,collections:[]},analysis:{ready:false,reason:'mongodb_unreachable'},collections:[]};
      }
      const counts=await Promise.all(collectionNames.map(async name=>({collection:name,count:await col(name).estimatedDocumentCount()})));
      const imported=counts.every(({collection,count})=>count>=(CANONICAL_COLLECTION_COUNTS[collection]??1));
      const collectionsMatch=counts.every(({collection,count})=>count===CANONICAL_COLLECTION_COUNTS[collection]);
      let analysis={ready:false,reason:'demo_field_not_loaded'};
      try{
        const data=await col('fields').findOne({_id:DEMO_FIELD_ID});
        if(!data)analysis={ready:false,reason:'canonical_field_missing'};
        else{
          const [climateDaily,cropHistory,soils]=await Promise.all([
            col('climate_daily').find({field_id:DEMO_FIELD_ID,date:{$gte:'2025-01-01',$lte:'2025-12-31'}}).sort({date:1}).toArray(),
            col('crop_history').find({field_id:DEMO_FIELD_ID}).toArray(),
            col('field_soils').find({field_id:DEMO_FIELD_ID}).toArray(),
          ]);
          const err=validateDemoFieldPayload({storage:'MongoDB',field:data,climateDaily,cropHistory,soils});
          if(err)analysis={ready:false,reason:'validation_failed',detail:err};
          else if(climateDaily.length!==365)analysis={ready:false,reason:'climate_2025_incomplete',climateDaily2025:climateDaily.length};
          else analysis={ready:true,climateDaily2025:365};
        }
      }catch{
        analysis={ready:false,reason:'analysis_probe_failed'};
      }
      const ready=imported&&collectionsMatch&&analysis.ready===true;
      return {...base,ready,mongodb:{reachable:true,database},evidence:{imported,collectionsMatch,collections:counts},analysis,collections:counts};
    },
    async load(){
      const field=await col('fields').findOne({_id:DEMO_FIELD_ID});
      if(!field)return null;
      const [climateDaily,cropHistory,soils]=await Promise.all([
        col('climate_daily').find({field_id:DEMO_FIELD_ID,date:{$gte:'2025-01-01',$lte:'2025-12-31'}}).sort({date:1}).toArray(),
        col('crop_history').find({field_id:DEMO_FIELD_ID}).sort({year:1}).toArray(),
        col('field_soils').find({field_id:DEMO_FIELD_ID}).sort({map_unit_id:1,depth_top_cm:1}).toArray(),
      ]);
      const data={storage:'MongoDB',field,climateDaily,cropHistory,soils};
      const err=validateDemoFieldPayload(data);
      if(err)throw Error(`malformed:${err}`);
      return data;
    },
    async loadClimateSeasonal(){
      const rows=await col('climate_seasonal').find({field_id:DEMO_FIELD_ID}).sort({year:1}).toArray();
      for(const row of rows){const err=validateClimateSeasonalRow(row);if(err)throw Error(`malformed:${err}`);}
      return {storage:'MongoDB',fieldId:DEMO_FIELD_ID,climateSeasonal:rows,semantics:{kind:'historical_growing_season_summary',timeStandard:'LST',notForecast:true}};
    },
    async loadScenarios(){
      const rows=await col('scenarios').find({$or:[{field_id:DEMO_FIELD_ID},{field_id:null,region_id:'scottsbluff_gering_ne'}]}).sort({period_start:1}).toArray();
      for(const row of rows){const err=validateScenario(row);if(err)throw Error(`malformed:${err}`);}
      return {storage:'MongoDB',fieldId:DEMO_FIELD_ID,scenarios:rows,semantics:{historicalVsHypothetical:'scenario_type distinguishes documented events from what_if records'}};
    },
    async loadCropProfiles(){
      const rows=await col('crop_profiles').find({}).sort({_id:1}).toArray();
      for(const row of rows){const err=validateCropProfile(row);if(err)throw Error(`malformed:${err}`);}
      return {storage:'MongoDB',cropProfiles:rows,compatibility:cropCompatibilityMatrix(rows),semantics:{waterUseRanges:'evidence_only_not_engine_kc',status:'proposed_for_engine_review'}};
    },
    close:()=>client.close(),
  };
}

function routeError(err,res){
  if(String(err?.message??'').startsWith('malformed:'))return sendJson(res,422,{error:'Stored evidence failed validation.',detail:String(err.message).slice('malformed:'.length)});
  return storageFailure(res);
}

export function createDemoApi(store=createDemoStore()){
  const routes=new Map([
    ['/api/health',{methods:['GET'],run:async()=>{const body=await store.ping();return {status:body.ready?200:503,body};}}],
    [DEMO_FIELD_URL,{methods:['GET'],run:async()=>{const data=await store.load();if(!data)return {status:404,body:{error:'Demo field not imported. Run npm run db:import.'}};return {status:200,body:data};}}],
    ['/api/demo-field/climate-seasonal',{methods:['GET'],run:async()=>({status:200,body:await store.loadClimateSeasonal()})}],
    ['/api/demo-field/scenarios',{methods:['GET'],run:async()=>({status:200,body:await store.loadScenarios()})}],
    ['/api/crop-profiles',{methods:['GET'],run:async()=>({status:200,body:await store.loadCropProfiles()})}],
    ['/api/crop-compatibility',{methods:['GET'],run:async()=>{const body=await store.loadCropProfiles();return {status:200,body:{storage:'MongoDB',compatibility:body.compatibility,note:'Proposed mappings are not active in the rotation engine.'}};}}],
  ]);
  const handler=async(req,res,next)=>{
    const url=new URL(req.url,'http://localhost');
    const route=routes.get(url.pathname);
    if(!route){next();return;}
    if(!route.methods.includes(req.method??'GET')){readOnlyDenied(res);return;}
    if(url.search&&!['GET','HEAD'].includes(req.method??'GET')){badQuery(res,'Query strings are not accepted on write operations.');return;}
    if(url.searchParams.size>0&&!['/api/crop-profiles','/api/crop-compatibility','/api/health'].includes(url.pathname)){
      badQuery(res,'This endpoint does not accept query parameters.');
      return;
    }
    try{
      const result=await route.run(req,url);
      if(result?.status===404){notFound(res,result.body?.error??'Not found.');return;}
      sendJson(res,result?.status??200,result?.body??result);
    }catch(err){routeError(err,res);}
  };
  handler.close=()=>store.close();
  return handler;
}