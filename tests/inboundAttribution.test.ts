import test from 'node:test';
import assert from 'node:assert/strict';
import { inferInboundSource, sourceFromInboundHost } from '../lib/analytics/inboundAttribution';

test('Reddit Android app referrers are classified as Reddit social traffic', () => {
  assert.deepEqual(sourceFromInboundHost('com.reddit.frontpage'), {
    category: 'social',
    name: 'reddit',
  });
});

test('Reddit Android app keeps the supplied path but strips query and fragment via URL parsing', () => {
  const result = inferInboundSource({
    search: '',
    referrer: 'android-app://com.reddit.frontpage/https/www.reddit.com/r/Swingers/comments/abc123/example/?utm_source=x#comments',
    currentOrigin: 'https://swingsphere.co',
  });

  assert.equal(result.category, 'social');
  assert.equal(result.name, 'reddit');
  assert.equal(result.referrerDomain, 'com.reddit.frontpage');
  assert.equal(result.referrerPath, '/https/www.reddit.com/r/Swingers/comments/abc123/example/');
});

test('direct means no external referrer and no campaign attribution', () => {
  const result = inferInboundSource({
    search: '',
    referrer: '',
    currentOrigin: 'https://swingsphere.co',
  });

  assert.equal(result.category, 'direct');
  assert.equal(result.name, 'direct');
  assert.equal(result.referrerDomain, null);
  assert.equal(result.referrerPath, null);
});

test('UTM attribution wins while retaining an available referrer path', () => {
  const result = inferInboundSource({
    search: '?utm_source=reddit&utm_medium=social&utm_campaign=soft-launch',
    referrer: 'https://www.reddit.com/r/Swingers/comments/abc123/example/?share_id=secret',
    currentOrigin: 'https://swingsphere.co',
  });

  assert.equal(result.category, 'campaign');
  assert.equal(result.name, 'reddit');
  assert.equal(result.referrerDomain, 'reddit.com');
  assert.equal(result.referrerPath, '/r/Swingers/comments/abc123/example/');
  assert.equal(result.utmCampaign, 'soft-launch');
});

test('same-origin navigation is not treated as an external referrer', () => {
  const result = inferInboundSource({
    search: '',
    referrer: 'https://swingsphere.co/clubs/example',
    currentOrigin: 'https://swingsphere.co',
  });

  assert.equal(result.category, 'direct');
  assert.equal(result.referrerDomain, null);
});

test('Bluesky and Threads referrers are classified as social traffic', () => {
  assert.deepEqual(sourceFromInboundHost('bsky.app'), {
    category: 'social',
    name: 'bluesky',
  });
  assert.deepEqual(sourceFromInboundHost('threads.com'), {
    category: 'social',
    name: 'threads',
  });
  assert.deepEqual(sourceFromInboundHost('threads.net'), {
    category: 'social',
    name: 'threads',
  });
});

