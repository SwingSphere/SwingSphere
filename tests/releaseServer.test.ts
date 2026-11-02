import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLocalhostRequest,
  getReleaseAuditLog,
  getReleaseSpawnOptions,
  inspectLocalMigrationsDirectory,
  isReleaseOperationRunning,
  resolveApprovedFilesToStage,
  withReleaseLock,
} from '../lib/admin/releaseServer';
import { getResolvedServerEnvValue } from '../lib/adminServerAuth';
import type { ReleasePreflightReport } from '../lib/admin/releaseManagement';

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

  it('rejects Host-header spoofing from non-loopback network addresses', () => {
    const req = {
      socket: { remoteAddress: '192.168.1.50' },
      headers: { host: 'localhost:5173' },
    };
    assert.equal(isLocalhostRequest(req), false);
  });

  it('rejects reverse-proxy or tunnel requests with external X-Forwarded-For or Host headers', () => {
    const tunnelHostReq = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'public-tunnel.trycloudflare.com' },
    };
    assert.equal(isLocalhostRequest(tunnelHostReq), false);

    const forwardedReq = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        host: 'localhost:5173',
        'x-forwarded-for': '203.0.113.195',
      },
    };
    assert.equal(isLocalhostRequest(forwardedReq), false);
  });
});

describe('Release process spawning', () => {
  it('uses a shell for Windows npm.cmd shims', () => {
    assert.equal(getReleaseSpawnOptions('npm.cmd', 'win32').shell, true);
    assert.equal(getReleaseSpawnOptions('npm.cmd', 'linux').shell, false);
  });

  it('does not enable shell execution for Git, Node, or Supabase commands', () => {
    assert.equal(getReleaseSpawnOptions('git', 'win32').shell, false);
    assert.equal(getReleaseSpawnOptions('supabase', 'win32').shell, false);
    assert.equal(getReleaseSpawnOptions(process.execPath, 'win32').shell, false);
  });
});

describe('Release server concurrency lock & staging validation', () => {
  it('prevents concurrent release operations with HTTP 409 lock error', async () => {
    assert.equal(isReleaseOperationRunning(), false);
    await withReleaseLock('test-1', 'deploy_frontend', async () => {
      assert.equal(isReleaseOperationRunning(), true);
      await assert.rejects(
        () => withReleaseLock('test-2', 'full_release', async () => 'should not run'),
        (err: any) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.classified?.category, 'concurrency_locked');
          return true;
        },
      );
    });
    assert.equal(isReleaseOperationRunning(), false);
  });

  it('excludes experimental Globe Lab and local runtime files when no explicit file list is passed', () => {
    const mockPreflight = {
      staging: {
        safeToStage: [
          'components/admin/AdminSettings.tsx',
          'components/dev/Globe2LabPage.tsx',
          'data/listings.local.json',
        ],
        defaultSelectedFiles: ['components/admin/AdminSettings.tsx'],
      },
    } as unknown as ReleasePreflightReport;

    const autoResolved = resolveApprovedFilesToStage(mockPreflight);
    assert.deepEqual(autoResolved, ['components/admin/AdminSettings.tsx']);

    assert.throws(
      () => resolveApprovedFilesToStage(mockPreflight, ['.env.local']),
      /Refusing to stage protected/,
    );
  });

  it('inspects local supabase/migrations directory and resolves .env.development.local fallback', () => {
    const info = inspectLocalMigrationsDirectory();
    assert(info.versions.includes('20261007010000'));
    assert(info.versions.includes('20261015000000'));
    assert.equal(
      info.fileMap['20261007010000']?.filename,
      '20261007010000_venue_ambient_building_massings.sql',
    );
    assert(
      info.duplicateMigrationNames.some((d) => d.includes('admin_archived_club_recovery')),
    );

    const supabaseUrl = getResolvedServerEnvValue('VITE_SUPABASE_URL');
    assert(supabaseUrl.startsWith('https://'));
  });
});

describe('Release server audit log', () => {
  it('returns an array of release execution plans', () => {
    const audit = getReleaseAuditLog();
    assert(Array.isArray(audit));
  });
});
