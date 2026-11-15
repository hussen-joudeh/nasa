import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createDemoApi } from '../scripts/mongo-demo.mjs';

async function getHealth(store) {
  const api = createDemoApi(store);
  const server = createServer((req, res) => api(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await api.close();
  }
}

test('health returns 503 when MongoDB is unreachable without leaking credentials', async () => {
  const r = await getHealth({
    ping: async () => ({
      storage: 'MongoDB',
      http: true,
      ready: false,
      fieldId: 'x',
      mongodb: { reachable: false, database: 'fieldshift_demo' },
      evidence: { imported: false, collections: [] },
      analysis: { ready: false, reason: 'mongodb_unreachable' },
      collections: [],
    }),
    load: async () => null,
    loadClimateSeasonal: async () => ({}),
    loadScenarios: async () => ({}),
    loadCropProfiles: async () => ({}),
    close: async () => {},
  });
  assert.equal(r.status, 503);
  assert.equal(r.body.mongodb.reachable, false);
  assert.equal(JSON.stringify(r.body).includes('mongodb://'), false);
});