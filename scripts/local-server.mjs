import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function createAppServer(){return http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const allowed=pathname==='/'||pathname==='/index.html'||/^\/src\/[a-zA-Z0-9_-]+\.(mjs|css)$/.test(pathname)||pathname==='/sources.html';
 if(!allowed){res.writeHead(404);res.end('Not found');return;}
 try{const content=await readFile(path.join(root,pathname==='/'?'index.html':pathname.slice(1)));res.writeHead(200,{'Content-Type':pathname.endsWith('.mjs')?'text/javascript; charset=utf-8':pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(content);}catch{res.writeHead(404);res.end('Not found');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){createAppServer().listen(5173,'127.0.0.1',()=>console.log('Field Shift: http://127.0.0.1:5173'));}
