import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOutboundDestinationDomain,
  getOutboundDestinationPath,
} from '../lib/analytics/outboundDestination';

test('outbound HTTP links keep domain and path but drop query and fragment', () => {
  const href = 'https://tickets.example.com/events/party-123?utm_source=swingsphere#checkout';
  assert.equal(getOutboundDestinationDomain(href), 'tickets.example.com');
  assert.equal(getOutboundDestinationPath(href), '/events/party-123');
});

test('social profile paths are preserved for exact-link attribution', () => {
  const href = 'https://www.instagram.com/exampleclub/?igsh=secret';
  assert.equal(getOutboundDestinationDomain(href), 'instagram.com');
  assert.equal(getOutboundDestinationPath(href), '/exampleclub/');
});

test('mailto links never expose an address path', () => {
  const href = 'mailto:hello@example.com?subject=SwingSphere';
  assert.equal(getOutboundDestinationDomain(href), 'example.com');
  assert.equal(getOutboundDestinationPath(href), null);
});

test('geo and blob destinations remain coarse only', () => {
  assert.equal(getOutboundDestinationDomain('geo:37.7,-122.4'), 'device-maps.local');
  assert.equal(getOutboundDestinationPath('geo:37.7,-122.4'), null);
  assert.equal(getOutboundDestinationDomain('blob:https://swingsphere.co/abc'), 'download.local');
  assert.equal(getOutboundDestinationPath('blob:https://swingsphere.co/abc'), null);
});
