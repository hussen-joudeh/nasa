import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupChecks, checkKey } from '../src/preflight-ui.mjs';
import { runPreflight } from '../src/preflight.mjs';
import { renderPreflightPanel, renderStalePreflightResults } from '../src/preflight-view.mjs';

test('groupChecks preserves every rule with accurate counts', () => {
  const evaluation = runPreflight(['wheat', 'maize', 'wheat'], { waterBudget: { amount: '622', unit: 'mm', period: 'perSeason' }, illustrativeCropSettings: true, effectiveRainfallSlopeConfirmed: true, plantingDates: ['2025-04-20', '2025-05-01', '2025-05-15'] }, null);
  const checks = evaluation.checks.filter((c) => !c.ruleId.startsWith('biofirewall.'));
  const grouped = groupChecks(checks);
  const total = grouped.attention.length + grouped.unknown.length + grouped.pass.length;
  assert.equal(total, checks.length);
  assert.ok(grouped.unknown.length > 0);
});

test('Preflight hub exposes rotation strip, grouped checks, and hidden detail store', () => {
  const evaluations = [
    runPreflight(['wheat', 'soy', 'wheat'], { waterBudget: { amount: '622', unit: 'mm', period: 'perSeason' }, illustrativeCropSettings: true, effectiveRainfallSlopeConfirmed: true, plantingDates: ['2025-04-20', '2025-05-01', '2025-05-15'] }, null),
    runPreflight(['wheat', 'maize', 'wheat'], {}, null),
    runPreflight(['soy', 'maize', 'sunflower'], {}, null),
  ];
  const html = renderPreflightPanel({ lang: 'en', inputs: { waterBudget: { amount: '622', unit: 'mm', period: 'perSeason' } }, evaluations, selectedRotation: 0 });
  assert.match(html,/preflight-rotation-strip/);
  assert.match(html,/preflight-check-groups/);
  assert.match(html,/preflight-check-store/);
  assert.match(html,/id="preflight-provenance-drawer"/);
  assert.match(html,/decision-breakpoint/);
  const key = checkKey({ ruleId: 'water.balance', season: 1 });
  assert.match(html, new RegExp(`data-check-key="${key}"`));
  assert.match(html,/Relevant inputs/);
});

test('stale results banner replaces live Preflight output', () => {
  assert.match(renderStalePreflightResults('en'), /data-stale="1"/);
  assert.match(renderStalePreflightResults('en'), /Run Preflight/);
  assert.doesNotMatch(renderStalePreflightResults('en'), /preflight-results-hub/);
});