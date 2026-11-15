import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDepthMm, formatVolumeM3 } from '../src/display-format.mjs';

test('formatDepthMm rounds display without changing comparison precision in engines', () => {
  assert.equal(formatDepthMm(623.8591556593612, 'en'), '623.86');
  assert.equal(formatDepthMm(622, 'en'), '622');
});

test('formatVolumeM3 uses grouped whole units', () => {
  assert.equal(formatVolumeM3(138419.12822535323, 'en'), '138,419');
});