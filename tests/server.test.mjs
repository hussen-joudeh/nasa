import {test} from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../scripts/local-server.mjs';
test('local runtime serves app but never workspace research or git files',async()=>{
 const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/.git/config')).status,404);assert.equal((await fetch(base+'/BRIEF.md')).status,404);assert.equal((await fetch(base+'/src/domain.mjs')).headers.get('content-type'),'text/javascript; charset=utf-8');} finally {await new Promise(r=>server.close(r));}
});
