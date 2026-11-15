import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {MongoClient} from 'mongodb';
import {DEMO_FIELD_ID} from './demo-config.mjs';
import {resolveMongoDatabase,resolveMongoUri} from '../../scripts/fieldshift-config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.resolve(process.argv[2]??path.join(root,'.local/canonical'));
if(!process.argv[2]&&process.platform==='win32'){
  execFileSync('powershell.exe',['-NoProfile','-Command','$ErrorActionPreference="Stop"; Expand-Archive -LiteralPath $env:FIELDSHIFT_ARCHIVE -DestinationPath $env:FIELDSHIFT_IMPORT_DIR -Force'],{env:{...process.env,FIELDSHIFT_ARCHIVE:path.join(root,'FieldShift_Canonical_MongoDB_Import.zip'),FIELDSHIFT_IMPORT_DIR:directory},stdio:'inherit'});
}
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
if(manifest.field_id!==DEMO_FIELD_ID||manifest.mongo_import.key!=='_id')throw Error('Unexpected demo manifest');
const exports=manifest.exports.filter(entry=>entry.target_collection);
// Validate the entire package before writing any collections.
const collections=[];
for(const entry of exports){
  if(!/^[a-z_]+\.jsonl$/.test(entry.file)||!/^[a-z_]+$/.test(entry.target_collection))throw Error('Invalid collection entry');
  const records=(await readFile(path.join(directory,entry.file),'utf8')).split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));
  if(records.length!==entry.record_count||records.some(row=>typeof row._id!=='string'||!row._id)||new Set(records.map(row=>row._id)).size!==records.length)throw Error(`Invalid count or IDs: ${entry.file}`);
  collections.push({...entry,records});
}
for(const entry of manifest.exports.filter(entry=>entry.sha256)){
  const content=await readFile(path.join(directory,entry.file));
  if(createHash('sha256').update(content).digest('hex')!==entry.sha256)throw Error(`Asset hash mismatch: ${entry.file}`);
}
const client=new MongoClient(resolveMongoUri(),{serverSelectionTimeoutMS:5000});
try{
  await client.connect();
  const db=client.db(resolveMongoDatabase());
  const report={database:db.databaseName,fieldId:DEMO_FIELD_ID,importedAt:new Date().toISOString(),collections:[]};
  const priority=name=>name==='fields'?0:name==='crop_profiles'?1:2;
  for(const entry of collections.sort((a,b)=>priority(a.target_collection)-priority(b.target_collection))){
    const collection=db.collection(entry.target_collection);
    const result=await collection.bulkWrite(entry.records.map(row=>({replaceOne:{filter:{_id:row._id},replacement:row,upsert:true}})));
    const count=await collection.countDocuments();
    if(count!==entry.record_count)throw Error(`${entry.target_collection}: MongoDB count ${count}, manifest ${entry.record_count}; no records were deleted.`);
    report.collections.push({collection:entry.target_collection,expected:entry.record_count,actual:count,upserted:result.upsertedCount,matched:result.matchedCount});
  }
  await db.collection('climate_daily').createIndex({field_id:1,date:1});
  await db.collection('crop_history').createIndex({field_id:1,year:1});
  await db.collection('field_soils').createIndex({field_id:1});
  report.demoQueries={
    climate2025:await db.collection('climate_daily').countDocuments({field_id:DEMO_FIELD_ID,date:{$gte:'2025-01-01',$lte:'2025-12-31'}}),
    cropHistory:await db.collection('crop_history').countDocuments({field_id:DEMO_FIELD_ID}),
    soils:await db.collection('field_soils').countDocuments({field_id:DEMO_FIELD_ID}),
  };
  if(report.demoQueries.climate2025!==365||report.demoQueries.cropHistory!==3||report.demoQueries.soils!==26)throw Error('Demo field query counts do not match the manifest');
  await mkdir(path.join(root,'qa'),{recursive:true});
  await writeFile(path.join(root,'qa/mongo-import-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await client.close();}
