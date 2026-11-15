import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const brandDir=path.join(root,'src/assets/brand');
const required=['fieldshift-logo-horizontal.svg','fieldshift-logo-light.svg','fieldshift-logo-dark.svg','fieldshift-mark.svg','fieldshift-mark-mono.svg','favicon.svg'];
test('brand SVG assets are vector files without embedded raster',async()=>{
 for(const name of required){
  const text=await readFile(path.join(brandDir,name),'utf8');
  assert.match(text,/<svg[\s\S]*<\/svg>/,name);
  assert.ok(!/data:image\//i.test(text),`${name} must not embed raster data`);
  assert.ok(!/<image\b/i.test(text),`${name} must not use <image>`);
  if(name.includes('logo')||name.includes('mark'))assert.match(text,/FieldShift|fieldshift/i);
 }
});
test('brand tokens and css define primary palette',async()=>{
 const tokens=JSON.parse(await readFile(path.join(root,'brand-tokens.json'),'utf8'));
 assert.equal(tokens.brand,'FieldShift');
 assert.equal(tokens.colors.primary,'#0B5D3B');
 const css=await readFile(path.join(root,'src/brand-tokens.css'),'utf8');
 assert.match(css,/--brand-primary:#0B5D3B/);
 assert.match(css,/Montserrat/);
});
test('horizontal logo spells FieldShift in SVG text',async()=>{
 const svg=await readFile(path.join(brandDir,'fieldshift-logo-horizontal.svg'),'utf8');
 assert.ok(svg.includes('Field')&&svg.includes('Shift'));
 assert.ok(!svg.includes('Field Shift'));
});
test('brand directory is included in local build output',async()=>{
 const names=await readdir(brandDir);
 assert.ok(names.includes('favicon.svg'));
});