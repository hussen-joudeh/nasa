import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cropCompatibilityMatrix,engineCropCatalog} from '../backend/scripts/evidence-validate.mjs';
import {crops} from '../src/domain.mjs';
test('engine catalog remains separate from proposed Mongo crop profiles',()=>{
 const engine=Object.keys(engineCropCatalog());
 assert.deepEqual(engine.sort(),Object.keys(crops).sort());
 const matrix=cropCompatibilityMatrix([]);
 assert.ok(matrix.every(r=>r.status!=='active'));
 assert.ok(matrix.find(r=>r.engineId==='wheat')?.dbId==='winter_wheat');
 assert.equal(matrix.find(r=>r.engineId==='sunflower')?.status,'unmapped');
});