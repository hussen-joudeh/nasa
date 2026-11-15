import {createServer} from 'node:http';
import {createDemoApi} from './mongo-demo.mjs';
import {resolveApiPort,resolveMongoDatabase,resolveMongoUri,resolveApiTarget} from '../../scripts/fieldshift-config.mjs';
import {loadFieldshiftEnv} from '../../scripts/load-fieldshift-env.mjs';

loadFieldshiftEnv();

const host = process.env.FIELDSHIFT_API_HOST ?? '127.0.0.1';
const port = resolveApiPort();
const api = createDemoApi();
const server = createServer((request, response) => api(request, response, () => {
  response.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
  response.end(JSON.stringify({error: 'Route not found.'}));
}));
server.on('close', () => void api.close());
server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use on ${host}.`);
    console.error('Start the backend on another PORT (e.g. 5176) and set the same value in FIELDSHIFT_API_PORT for the frontend proxy.');
    console.error('Do not kill unknown or protected listeners; use the terminal that owns the existing process.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
server.listen(port, host, async () => {
  const bound = server.address().port;
  const mongoSafe = resolveMongoUri().replace(/\/\/[^@]+@/, '//***@');
  const target = resolveApiTarget();
  console.log(`FieldShift MongoDB API at http://${host}:${bound}/api/health`);
  console.log(`[FieldShift] Backend listening on port ${bound}; set FIELDSHIFT_API_PORT=${bound} for the frontend proxy.`);
  console.log(`[FieldShift] Configured API origin: ${target.origin}`);
  console.log(`MongoDB target: database=${resolveMongoDatabase()} uri=${mongoSafe}`);
  try {
    const probe = await fetch(`http://${host}:${bound}/api/health`);
    const body = await probe.json();
    console.log(body.ready ? 'Readiness: demo analysis ready (MongoDB + canonical evidence).' : `Readiness: not ready (${body.analysis?.reason ?? body.mongodb?.reachable === false ? 'mongodb_unreachable' : 'unknown'}). HTTP ${probe.status}.`);
  } catch {
    console.log('Readiness: self-check skipped.');
  }
});
