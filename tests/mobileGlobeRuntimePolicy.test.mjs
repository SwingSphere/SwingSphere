import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAdaptiveClusterDecision,
  shouldIgnoreProgrammaticControlsChange,
} from '../src/features/globe/runtime/mobileRuntimePolicy.js';

test('adaptive mobile clustering uses hysteresis around the touch-separation thresholds', () => {
  assert.equal(resolveAdaptiveClusterDecision({ minimumScreenDistance: 40, wasClustered: false }), true);
  assert.equal(resolveAdaptiveClusterDecision({ minimumScreenDistance: 56, wasClustered: false }), false);
  assert.equal(resolveAdaptiveClusterDecision({ minimumScreenDistance: 56, wasClustered: true }), true);
  assert.equal(resolveAdaptiveClusterDecision({ minimumScreenDistance: 72, wasClustered: true }), false);
});

test('invalid projection distances conservatively keep a discovery cluster', () => {
  assert.equal(resolveAdaptiveClusterDecision({ minimumScreenDistance: null, wasClustered: false }), true);
  assert.equal(resolveAdaptiveClusterDecision({ minimumScreenDistance: Number.NaN, wasClustered: false }), true);
});

test('programmatic OrbitControls changes do not count as user interaction', () => {
  assert.equal(shouldIgnoreProgrammaticControlsChange(0), false);
  assert.equal(shouldIgnoreProgrammaticControlsChange(1), true);
  assert.equal(shouldIgnoreProgrammaticControlsChange(3), true);
});
