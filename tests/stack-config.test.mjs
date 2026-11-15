import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHealthBody, resolveApiTarget } from '../scripts/fieldshift-config.mjs';
import { resolveFrontendApiProxyTarget as fromServer } from '../scripts/local-server.mjs';

test('classifyHealthBody detects stale missing route', () => {
  const c = classifyHealthBody(404, { error: 'Route not found.' });
  assert.equal(c.contract, 'missing_route');
});

test('classifyHealthBody detects legacy 07C health shape', () => {
  const c = classifyHealthBody(200, { ready: true, storage: 'MongoDB' });
  assert.equal(c.contract, 'legacy');
});

test('classifyHealthBody accepts 07E readiness contract', () => {
  const c = classifyHealthBody(200, {
    http: true,
    ready: true,
    mongodb: { reachable: true },
    evidence: { collectionsMatch: true },
    analysis: { ready: true },
  });
  assert.equal(c.contract, 'current');
  assert.equal(c.ready, true);
});

test('frontend proxy target follows PORT then FIELDSHIFT_API_PORT', () => {
  const fromApiPort = resolveApiTarget({ FIELDSHIFT_API_PORT: '5999' });
  assert.equal(fromApiPort.port, 5999);
  const fromPort = resolveApiTarget({ PORT: '5188', FIELDSHIFT_API_PORT: '5999' });
  assert.equal(fromPort.port, 5188);
  assert.equal(fromServer({ FIELDSHIFT_API_PORT: '5190' }).port, 5190);
});