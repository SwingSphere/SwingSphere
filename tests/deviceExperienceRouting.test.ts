import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDeviceExperienceMapPath,
  toDeviceExperiencePath,
} from '../components/device/DeviceExperienceContext';

test('device experience paths stay inside their explicit namespace', () => {
  assert.equal(toDeviceExperiencePath('/mobile', '/nearby'), '/mobile/nearby');
  assert.equal(toDeviceExperiencePath('/tablet', '/nearby'), '/tablet/nearby');
  assert.equal(toDeviceExperiencePath('/tablet', '/'), '/tablet');
  assert.equal(toDeviceExperiencePath('/tablet', '/tablet/saved'), '/tablet/saved');
  assert.equal(toDeviceExperiencePath('/tablet/', 'account'), '/tablet/account');
});

test('tablet map handoff remains in the tablet namespace', () => {
  assert.equal(
    getDeviceExperienceMapPath('/tablet', 'club-twist-sf'),
    '/tablet?mapListing=club-twist-sf',
  );
});
