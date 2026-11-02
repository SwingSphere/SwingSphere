import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMigrationManifests,
  classifyGitStatus,
  classifyReleaseError,
  extractMeaningfulCliError,
  isSecretPath,
  isBuildOrTempPath,
  isExperimentalOrLocalDataPath,
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
    assert.equal(result.requiresIncludeAll, false);
    assert.equal(result.pendingLocal.length, 0);
    assert.equal(result.missingRemote.length, 0);
    assert.equal(result.matchedCount, 3);
  });

  it('detects in-order local-only pending migrations', () => {
    const local = ['20261005081500', '20261006220721', '20261007010000'];
    const remote = ['20261005081500', '20261006220721'];

    const result = compareMigrationManifests(local, remote);
    assert.equal(result.status, 'local_pending');
    assert.equal(result.safeToMigrate, true);
    assert.equal(result.requiresIncludeAll, false);
    assert.deepEqual(result.pendingLocal, ['20261007010000']);
    assert.deepEqual(result.inOrderPendingLocal, ['20261007010000']);
    assert.deepEqual(result.outOfOrderPendingLocal, []);
    assert.equal(result.missingRemote.length, 0);
  });

  it('detects out-of-order pending migration when localHead and remoteHead match (20261007010000 < 20261015000000)', () => {
    const local = [
      '20261006222420',
      '20261007005614',
      '20261007010000',
      '20261009050000',
      '20261015000000',
    ];
    const remote = [
      '20261006222420',
      '20261007005614',
      '20261009050000',
      '20261015000000',
    ];

    const result = compareMigrationManifests(local, remote, {
      '20261007010000': {
        filename: '20261007010000_venue_ambient_building_massings.sql',
        name: 'venue_ambient_building_massings',
      },
    });
    assert.equal(result.status, 'local_pending');
    assert.equal(result.localHead, '20261015000000');
    assert.equal(result.remoteHead, '20261015000000');
    assert.equal(result.requiresIncludeAll, true);
    assert.deepEqual(result.pendingLocal, ['20261007010000']);
    assert.deepEqual(result.outOfOrderPendingLocal, ['20261007010000']);
    assert.deepEqual(result.inOrderPendingLocal, []);
    assert.equal(result.pendingDetails?.[0]?.isOutOfOrder, true);
    assert.equal(result.pendingDetails?.[0]?.filename, '20261007010000_venue_ambient_building_massings.sql');
    assert(result.explanation.includes('out-of-order'));
    assert(result.explanation.includes('--include-all'));
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

  it('allows safe files when no secrets or conflicts are present and flags experimental/local data', () => {
    const status = `
 M components/EventBrowser.tsx
 M vite.config.ts
?? supabase/migrations/20261007010000_venue_ambient_building_massings.sql
?? components/dev/Globe2LabPage.tsx
 M data/listings.local.json
`;
    const result = classifyGitStatus(status);
    assert.equal(result.canStage, true);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.excludedSecrets.length, 0);
    assert.equal(result.safeToStage.length, 5);
    assert.deepEqual(result.flaggedExperimentalOrLocal, [
      'components/dev/Globe2LabPage.tsx',
      'data/listings.local.json',
    ]);
    assert.deepEqual(result.defaultSelectedFiles, [
      'components/EventBrowser.tsx',
      'supabase/migrations/20261007010000_venue_ambient_building_massings.sql',
      'vite.config.ts',
    ]);
    assert.equal(isExperimentalOrLocalDataPath('src/features/globe-v2/index.ts'), true);
  });
});

describe('Error classification & sanitization', () => {
  it('extracts meaningful CLI error messages while stripping Supabase startup and update noise', () => {
    const cliOutput = `
Initialising login role...
Connecting to remote database...
DRY RUN: migrations will *not* be pushed to the database.
Found local migration files to be inserted before the last migration on remote database.

Rerun the command with --include-all flag to apply these migrations:
supabase\\migrations\\20261007010000_venue_ambient_building_massings.sql

A new version of Supabase CLI is available: v2.84.2 (currently installed v2.75.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started
`;
    const extracted = extractMeaningfulCliError(cliOutput);
    assert(!extracted.includes('Initialising login role'));
    assert(!extracted.includes('A new version of Supabase CLI'));
    assert(extracted.includes('Found local migration files to be inserted before the last migration on remote database.'));
    assert(extracted.includes('20261007010000_venue_ambient_building_massings.sql'));
  });

  it('classifies out-of-order migration and concurrency lock errors', () => {
    const outOfOrder = classifyReleaseError(
      'migration',
      'Found local migration files to be inserted before the last migration on remote database. Rerun with --include-all',
    );
    assert.equal(outOfOrder.category, 'migration_mismatch');
    assert(outOfOrder.userMessage.includes('earlier than the latest migration'));
    assert(outOfOrder.recoveryGuidance?.includes('No database changes were applied'));

    const locked = classifyReleaseError('lock', 'Another release operation is already in progress');
    assert.equal(locked.category, 'concurrency_locked');
  });
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

