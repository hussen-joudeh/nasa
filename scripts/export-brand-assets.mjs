// Export PNG brand assets from brand-preview.html. Usage: node scripts/export-brand-assets.mjs <playwright-core-path> [base-url]
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(pathToFileURL(path.join(process.argv[2]||path.join(root,'node_modules/playwright-core'),'index.mjs')).href);
const base=process.argv[3]||'http://127.0.0.1:5173';
const out=path.join(root,'src/assets/brand');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
const preview=pathToFileURL(path.join(root,'src/assets/brand/brand-preview.html')).href;
await page.goto(preview);
await page.waitForSelector('#light .sizes img',{timeout:15000});
const mark=page.locator('#light .sizes img').first();
for(const [name,w,h] of [['icon-16.png',16,18],['icon-32.png',32,36],['icon-48.png',48,54],['icon-192.png',192,216],['icon-512.png',512,576]]){
 await mark.evaluate((el,s)=>{el.width=s.w;el.height=s.h;}, {w,h});
 await mark.screenshot({path:path.join(out,name)});
}
await page.locator('#og-card').screenshot({path:path.join(out,'og-fieldshift.png')});
await browser.close();
console.log('Wrote PNG exports to src/assets/brand/');