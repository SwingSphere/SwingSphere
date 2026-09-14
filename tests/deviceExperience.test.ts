import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeviceExperience } from '../lib/deviceExperience';

test('routes iPhone and Android phones to mobile', () => {
  assert.equal(resolveDeviceExperience({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), 'mobile');
  assert.equal(resolveDeviceExperience({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36' }), 'mobile');
});

test('routes explicit iPad and Android tablet user agents to tablet', () => {
  assert.equal(resolveDeviceExperience({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }), 'tablet');
  assert.equal(resolveDeviceExperience({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/140 Safari/537.36' }), 'tablet');
});

test('recognizes modern iPadOS desktop-style user agents by Macintosh platform plus touch', () => {
  assert.equal(resolveDeviceExperience({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  }), 'tablet');
});

test('uses touch capability plus tablet-class viewport only as an ambiguous-UA fallback', () => {
  assert.equal(resolveDeviceExperience({
    userAgent: 'Mozilla/5.0',
    maxTouchPoints: 10,
    coarsePointer: true,
    viewportWidth: 800,
    viewportHeight: 1280,
  }), 'tablet');

  assert.equal(resolveDeviceExperience({
    userAgent: 'Mozilla/5.0',
    maxTouchPoints: 10,
    coarsePointer: false,
    viewportWidth: 800,
    viewportHeight: 1280,
  }), 'desktop');
});

test('keeps ordinary desktop browsers on desktop', () => {
  assert.equal(resolveDeviceExperience({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    platform: 'Win32',
    maxTouchPoints: 0,
    coarsePointer: false,
    viewportWidth: 1365,
    viewportHeight: 768,
  }), 'desktop');
});
