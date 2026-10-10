import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMigrationManifests,
  classifyGitStatus,
  classifyReleaseError,
  isSecretPath,
  isBuildOrTempPath,
  sanitizeErrorMessage,
  verifyFrontendCompatibility,
  parseMigrationListCliOutput,
} from '../lib/admin/releaseManagement';

describe('Migration manifest comparison', () => {
  it('detects fully synchronized histories', () => {
    const local = ['20261005081500', '20261006220721', '20261006221620'];
    const remote = ['20261005081500', '20261006220721', '20261006221620'];

    const result = compareMigrationManifests(local, remote);
    assert.equal(result.status, 'synchronized');
    assert.equal(result.safeToMigrate, true);
    assert.equal(result.pendingLocal.length, 0);
    assert.equal(result.missingRemote.length, 0);
    assert.equal(result.matchedCount, 3);
  });

  it('detects local-only pending migrations', () => {
    const local = ['20261005081500', '20261006220721', '20261007010000'];
    const remote = ['20261005081500', '20261006220721'];

    const result = compareMigrationManifests(local, remote);
    assert.equal(result.status, 'local_pending');
    assert.equal(result.safeToMigrate, true);
    assert.deepEqual(result.pendingLocal, ['20261007010000']);
    assert.equal(result.missingRemote.length, 0);
  });

  it('detects remote migrations missing locally', () => {
    const local = ['20261005081500'];
    const remote = ['20261005081500', '20261006220721', '20261006221620'];

    const result = compareMigrationManifests(local, remote);
    assert.equal(result.status, 'remote_missing');
    assert.equal(result.safeToMigrate, false);
    assert.equal(result.pendingLocal.length, 0);
    assert.deepEqual(result.missingRemote, ['20261006220721', '20261006221620']);
  });

  it('detects divergent migration histories', () => {
    // Exactly reproducing the SwingSphere bug scenario:
    const local = [
      '20261005081500',
      '20261006051522',
      '20261006053326',
      '20261007010000',
    ];
    const remote = [
      '20261005081500',
      '20261006220721',
      '20261006221620',
      '20261007005614',
    ];

    const result = compareMigrationManifests(local, remote);
    assert.equal(result.status, 'divergent');
    assert.equal(result.safeToMigrate, false);
    assert.equal(result.pendingLocal.length, 3);
    assert.equal(result.missingRemote.length, 3);
    assert(result.explanation.includes('Database push is blocked'));
  });

  it('handles empty or invalid lists gracefully', () => {
    const result = compareMigrationManifests([], []);
    assert.equal(result.status, 'unknown');
    assert.equal(result.safeToMigrate, false);
  });
});

describe('Git staging classification', () => {
  it('excludes secrets, credentials, and env files', () => {
    assert.equal(isSecretPath('.env'), true);
    assert.equal(isSecretPath('.env.local'), true);
    assert.equal(isSecretPath('config/credentials.json'), true);
    assert.equal(isSecretPath('id_rsa'), true);
    assert.equal(isSecretPath('components/EventBrowser.tsx'), false);
  });

  it('excludes build artifacts and temporary files', () => {
    assert.equal(isBuildOrTempPath('dist/index.html'), true);
    assert.equal(isBuildOrTempPath('.wrangler/state/v3'), true);
    assert.equal(isBuildOrTempPath('scratch/test.sql'), true);
    assert.equal(isBuildOrTempPath('.codex-temp/cache.json'), true);
    assert.equal(isBuildOrTempPath('components/admin/AdminSettings.tsx'), false);
  });

  it('classifies porcelain status lines and detects conflicts', () => {
    const status = `
 M components/EventBrowser.tsx
?? components/dev/BuildingImpactReviewModal.tsx
UU components/maps/mapLayers.ts
 M .env.local
?? scratch/notes.tmp
`;
    const result = classifyGitStatus(status);
    assert.equal(result.canStage, false);
    assert.deepEqual(result.conflicts, ['components/maps/mapLayers.ts']);
    assert.deepEqual(result.excludedSecrets, ['.env.local']);
    assert.deepEqual(result.excludedBuildOrTemp, ['scratch/notes.tmp']);
    assert(result.safeToStage.includes('components/EventBrowser.tsx'));
    assert(result.safeToStage.includes('components/dev/BuildingImpactReviewModal.tsx'));
    assert(result.blockReason?.includes('Unresolved merge conflicts'));
  });

  it('allows safe files when no secrets or conflicts are present', () => {
    const status = `
 M components/EventBrowser.tsx
 M vite.config.ts
?? supabase/migrations/20261007010000_venue_ambient_building_massings.sql
`;
    const result = classifyGitStatus(status);
    assert.equal(result.canStage, true);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.excludedSecrets.length, 0);
    assert.equal(result.safeToStage.length, 3);
  });
});

describe('Error classification & sanitization', () => {
  it('redacts database credentials and bearer tokens', () => {
    const raw = 'Failed with postgresql://postgres:SuperSecret123@db.supabase.co:5432/postgres and Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
    const sanitized = sanitizeErrorMessage(raw);
    assert(!sanitized.includes('SuperSecret123'));
    assert(!sanitized.includes('eyJhbGciOiJIUzI1NiJ9'));
    assert(sanitized.includes('postgresql://***:***@***/***'));
    assert(sanitized.includes('Bearer [REDACTED]'));
  });

  it('classifies unauthorized deployment attempts', () => {
    const classified = classifyReleaseError('auth', 'Active admin access is required for deployment.');
    assert.equal(classified.category, 'unauthorized');
    assert(classified.userMessage.includes('privileges'));
  });

  it('classifies migration mismatch errors', () => {
    const classified = classifyReleaseError('migration', 'DbPushMissingLocalError: Remote migration versions not found in local migrations directory.');
    assert.equal(classified.category, 'migration_mismatch');
    assert(classified.userMessage.includes('missing or mismatched'));
  });

  it('classifies database connectivity errors', () => {
    const classified = classifyReleaseError('db', 'failed to connect to server: ECONNREFUSED');
    assert.equal(classified.category, 'database_connectivity');
  });

  it('classifies production build failures', () => {
    const classified = classifyReleaseError('build', 'vite build failed with 2 errors');
    assert.equal(classified.category, 'production_build');
  });

  it('classifies git push failures', () => {
    const classified = classifyReleaseError('push', 'failed to push some refs to origin main: rejected');
    assert.equal(classified.category, 'git_push');
  });

  it('classifies Cloudflare deployment failures', () => {
    const classified = classifyReleaseError('deploy', 'wrangler pages deploy dist failed: 1101');
    assert.equal(classified.category, 'cloudflare_deploy');
  });
});

describe('Frontend compatibility verification', () => {
  it('permits frontend-only deployment when migrations are safe/additive', () => {
    const check = verifyFrontendCompatibility(['20261007010000']);
    assert.equal(check.compatible, true);
  });
});

describe('Supabase CLI migration list parsing', () => {
  it('parses text table output correctly', () => {
    const tableOutput = `
   Local          | Remote         | Time (UTC)          
  ----------------|----------------|---------------------
   20261005081500 | 20261005081500 | 2026-10-05 08:15:00 
   20261006220721 | 20261006220721 | 2026-10-06 22:07:21 
   20261007010000 |                | 2026-10-07 01:00:00 
                  | 20261007005614 | 2026-10-07 00:56:14 
`;
    const parsed = parseMigrationListCliOutput(tableOutput);
    assert.deepEqual(parsed.local, ['20261005081500', '20261006220721', '20261007010000']);
    assert.deepEqual(parsed.remote, ['20261005081500', '20261006220721', '20261007005614']);
  });

  it('parses JSON output correctly', () => {
    const jsonOutput = JSON.stringify({
      migrations: [
        { local: '20261005081500', remote: '20261005081500', time: '2026-10-05 08:15:00' },
        { local: '20261007010000', remote: '', time: '2026-10-07 01:00:00' },
        { local: '', remote: '20261007005614', time: '2026-10-07 00:56:14' },
      ],
      message: 'Migrations listed',
    });
    const parsed = parseMigrationListCliOutput(jsonOutput);
    assert.deepEqual(parsed.local, ['20261005081500', '20261007010000']);
    assert.deepEqual(parsed.remote, ['20261005081500', '20261007005614']);
  });
});

