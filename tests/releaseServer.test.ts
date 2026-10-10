import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalhostRequest, getReleaseAuditLog, getReleaseSpawnOptions } from '../lib/admin/releaseServer';

describe('Release server localhost security validation', () => {
  it('identifies loopback IPv4 addresses as localhost', () => {
    const req = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost:5173' },
    };
    assert.equal(isLocalhostRequest(req), true);
  });

  it('identifies loopback IPv6 addresses as localhost', () => {
    const req = {
      socket: { remoteAddress: '::1' },
      headers: { host: 'localhost:5173' },
    };
    assert.equal(isLocalhostRequest(req), true);
  });

  it('identifies IPv4-mapped IPv6 loopback addresses as localhost', () => {
    const req = {
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: { host: '127.0.0.1:5173' },
    };
    assert.equal(isLocalhostRequest(req), true);
  });

  it('rejects external remote addresses', () => {
    const req = {
      socket: { remoteAddress: '192.168.1.50' },
      headers: { host: 'example.com' },
    };
    assert.equal(isLocalhostRequest(req), false);
  });

  it('rejects public internet IPs', () => {
    const req = {
      socket: { remoteAddress: '203.0.113.195' },
      headers: { host: 'swingsphere.club' },
    };
    assert.equal(isLocalhostRequest(req), false);
  });
});

describe('Release process spawning', () => {
  it('uses a shell for Windows npm.cmd shims', () => {
    assert.equal(getReleaseSpawnOptions('npm.cmd', 'win32').shell, true);
    assert.equal(getReleaseSpawnOptions('npm.cmd', 'linux').shell, false);
  });

  it('does not enable shell execution for Git or Supabase commands', () => {
    assert.equal(getReleaseSpawnOptions('git', 'win32').shell, false);
    assert.equal(getReleaseSpawnOptions('supabase', 'win32').shell, false);
  });
});

describe('Release server audit log', () => {
  it('returns an array of release execution plans', () => {
    const audit = getReleaseAuditLog();
    assert(Array.isArray(audit));
  });
});
