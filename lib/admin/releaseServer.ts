import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { requireActiveAdmin, type ActiveAdminIdentity } from '../adminServerAuth';
import {
  classifyGitStatus,
  classifyReleaseError,
  compareMigrationManifests,
  isBuildOrTempPath,
  isSecretPath,
  parseMigrationListCliOutput,
  sanitizeErrorMessage,
  verifyFrontendCompatibility,
  type ClassifiedReleaseError,
  type ReleaseExecutionPlan,
  type ReleasePreflightReport,
  type ReleaseStageStatus,
} from './releaseManagement';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(THIS_DIR, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase', 'migrations');
const AUDIT_DIR = path.join(ROOT_DIR, '.codex-temp');
const AUDIT_FILE = path.join(AUDIT_DIR, 'release-audit.local.json');

type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
  launchError?: boolean;
};

// Windows cannot launch .cmd shims directly with spawn's default shell:false.
// Only the fixed npm.cmd release command needs a command shell.
export const getReleaseSpawnOptions = (command: string, platform = process.platform) => ({
  shell: platform === 'win32' && /^npm\.cmd$/i.test(path.basename(command)),
  windowsHide: true,
});

const runProcessCapture = (command: string, args: string[], cwd = ROOT_DIR): Promise<ProcessResult> =>
  new Promise<ProcessResult>((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(command, args, { cwd, ...getReleaseSpawnOptions(command) });
    } catch (err) {
      resolve({ code: 1, stdout: '', stderr: `Process launch failed: ${String(err)}`, launchError: true });
      return;
    }
    let stdout = '';
    let stderr = '';
    let launchError = false;
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      launchError = true;
      stderr += `Process launch failed (${command}): ${err.message}`;
    });
    proc.on('close', (code) => {
      resolve({ code: launchError ? 1 : (code ?? 1), stdout, stderr, launchError });
    });
  });

const runCommand = async (command: string, args: string[], label: string, stage: string): Promise<ProcessResult> => {
  const result = await runProcessCapture(command, args);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout || `${label} failed.`).trim();
    const classified = result.launchError
      ? {
          category: 'production_build' as const,
          categoryLabel: 'Process Launch Failure',
          userMessage: `Could not start ${label}.`,
          actionableNextStep: 'Check that Node.js/npm are installed and accessible to the local development server, then retry. No build was executed.',
          sanitizedDetail: sanitizeErrorMessage(detail),
        }
      : classifyReleaseError(stage, `${label} failed: ${detail}`);
    const error = new Error(classified.userMessage);
    (error as any).classified = classified;
    (error as any).rawDetail = detail;
    throw error;
  }
  return result;
};

export const isLocalhostRequest = (req: any): boolean => {
  const remoteAddress = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '');
  const host = String(req.headers?.host || '');
  const isLoopbackIp = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
  const isLocalHostHeader = /^localhost(:\d+)?$/i.test(host) || /^127\.0\.0\.1(:\d+)?$/i.test(host);
  return isLoopbackIp || isLocalHostHeader;
};

const getLocalMigrationFiles = (): string[] => {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .map((f) => f.slice(0, 14));
};

const auditLogBuffer: ReleaseExecutionPlan[] = [];

const appendAuditLog = (plan: ReleaseExecutionPlan) => {
  auditLogBuffer.unshift(plan);
  if (auditLogBuffer.length > 50) auditLogBuffer.pop();
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLogBuffer.slice(0, 50), null, 2), 'utf8');
  } catch {
    // Non-fatal if disk write fails
  }
};

export const getReleaseAuditLog = (): ReleaseExecutionPlan[] => {
  if (auditLogBuffer.length === 0 && fs.existsSync(AUDIT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      if (Array.isArray(data)) {
        auditLogBuffer.push(...data);
      }
    } catch {
      // Ignore
    }
  }
  return auditLogBuffer;
};

export const runReleasePreflight = async (
  authorization?: string | null,
): Promise<ReleasePreflightReport> => {
  await requireActiveAdmin(authorization);

  // 1. Git branch check
  const branchResult = await runProcessCapture('git', ['branch', '--show-current']);
  const branch = branchResult.stdout.trim() || 'unknown';

  // 2. Git commit info
  const commitHashResult = await runProcessCapture('git', ['rev-parse', 'HEAD']);
  const commit = commitHashResult.stdout.trim().slice(0, 7) || 'unknown';
  const commitLogResult = await runProcessCapture('git', ['log', '-1', '--format=%an|%ad|%s']);
  const [commitAuthor = '', commitDate = '', commitMessage = ''] = commitLogResult.stdout.trim().split('|');

  // 3. Git status
  const statusResult = await runProcessCapture('git', ['status', '--porcelain=v1']);
  const staging = classifyGitStatus(statusResult.stdout);
  const isClean = statusResult.stdout.trim().length === 0;

  // 4. Migration list comparison
  const localVersions = getLocalMigrationFiles();
  const migrationListResult = await runProcessCapture('supabase', ['migration', 'list']);
  const parsedMigrations = parseMigrationListCliOutput(
    `${migrationListResult.stdout}\n${migrationListResult.stderr}`,
  );
  // Ensure we include local directory files even if CLI omitted any
  const combinedLocal = Array.from(new Set([...localVersions, ...parsedMigrations.local])).sort();
  const migration = compareMigrationManifests(combinedLocal, parsedMigrations.remote);

  // 5. Migration dry-run
  const dryRunResult = await runProcessCapture('supabase', ['db', 'push', '--dry-run']);
  const dryRunOutput = `${dryRunResult.stdout}\n${dryRunResult.stderr}`.trim();
  const dryRunPassed = dryRunResult.code === 0 && !/error/i.test(dryRunOutput);

  // 6. Cloudflare readiness
  const hasHash = Boolean(
    process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH ||
      process.env.VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH,
  );
  const cloudflare = {
    ready: true,
    hasHash,
  };

  // 7. Overall actions & blockers
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  if (branch !== 'main') {
    blockReasons.push(`Releases must originate from "main". Current branch: "${branch}".`);
  }
  if (staging.conflicts.length > 0) {
    blockReasons.push(`Unresolved merge conflicts in: ${staging.conflicts.join(', ')}.`);
  }
  if (staging.excludedSecrets.length > 0) {
    blockReasons.push(`Protected credentials or secrets detected in working tree: ${staging.excludedSecrets.join(', ')}.`);
  }
  if (migration.status === 'divergent') {
    blockReasons.push(`Migration histories have diverged. ${migration.explanation}`);
  }
  if (migration.status === 'remote_missing') {
    blockReasons.push(`Remote migrations are missing locally. ${migration.explanation}`);
  }
  if (!dryRunPassed && migration.status === 'local_pending') {
    blockReasons.push(`Supabase migration dry-run failed: ${sanitizeErrorMessage(dryRunOutput.split(/\r?\n/)[0])}`);
  }

  if (migration.status === 'local_pending') {
    warnings.push(`${migration.pendingLocal.length} local migration(s) are pending application: ${migration.pendingLocal.join(', ')}.`);
  }
  if (!hasHash) {
    warnings.push('Cloudflare Images delivery account hash is not configured in environment.');
  }

  const compatibility = verifyFrontendCompatibility(migration.pendingLocal);
  const canDeployFrontend =
    branch === 'main' &&
    staging.conflicts.length === 0 &&
    staging.excludedSecrets.length === 0 &&
    compatibility.compatible;

  const canApplyMigrations =
    branch === 'main' &&
    staging.conflicts.length === 0 &&
    migration.safeToMigrate &&
    (migration.status === 'local_pending' || migration.status === 'synchronized');

  const canFullRelease =
    blockReasons.length === 0 &&
    canDeployFrontend &&
    canApplyMigrations;

  return {
    ok: blockReasons.length === 0,
    checkedAt: new Date().toISOString(),
    git: {
      branch,
      commit,
      commitAuthor,
      commitDate,
      commitMessage,
      isClean,
      hasConflicts: staging.conflicts.length > 0,
      conflicts: staging.conflicts,
    },
    staging,
    migration,
    migrationDryRun: {
      passed: dryRunPassed,
      output: sanitizeErrorMessage(dryRunOutput),
      error: dryRunPassed ? undefined : sanitizeErrorMessage(dryRunOutput),
    },
    cloudflare,
    actions: {
      canDeployFrontend,
      canApplyMigrations,
      canFullRelease,
    },
    blockReasons,
    warnings,
  };
};

export const runDeployFrontend = async (
  authorization?: string | null,
  options?: { filesToStage?: string[] },
): Promise<ReleaseExecutionPlan> => {
  const admin = await requireActiveAdmin(authorization);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const plan: ReleaseExecutionPlan = {
    id: `fe-${Date.now()}`,
    operation: 'deploy_frontend',
    startedAt: new Date().toISOString(),
    success: false,
    stages: [
      { name: 'preflight', label: 'Release Preflight', status: 'pending' },
      { name: 'staging', label: 'Safe Git Staging', status: 'pending' },
      { name: 'build', label: 'Cloudflare Production Build', status: 'pending' },
      { name: 'commit', label: 'Git Commit', status: 'pending' },
      { name: 'push', label: 'GitHub Push', status: 'pending' },
      { name: 'deploy', label: 'Cloudflare Pages Deploy', status: 'pending' },
    ],
  };

  const updateStage = (name: string, status: ReleaseStageStatus, detail?: string) => {
    const stage = plan.stages.find((s) => s.name === name);
    if (stage) {
      stage.status = status;
      if (detail) stage.detail = sanitizeErrorMessage(detail);
    }
  };

  try {
    // 1. Preflight
    updateStage('preflight', 'running');
    const preflight = await runReleasePreflight(authorization);
    if (!preflight.actions.canDeployFrontend) {
      throw new Error(`Frontend deployment blocked: ${preflight.blockReasons.join('; ')}`);
    }
    updateStage('preflight', 'success', `Verified branch ${preflight.git.branch} (${preflight.git.commit})`);

    // 2. Safe Staging
    updateStage('staging', 'running');
    const allowedSet = new Set(preflight.staging.safeToStage);
    const filesToStage = (options?.filesToStage ?? preflight.staging.safeToStage)
      .filter((f) => allowedSet.has(f) && !isSecretPath(f) && !isBuildOrTempPath(f));

    if (filesToStage.length > 0) {
      await runCommand('git', ['add', '--', ...filesToStage], 'Safe Git Staging', 'commit');
      updateStage('staging', 'success', `Staged ${filesToStage.length} safe file(s)`);
    } else {
      updateStage('staging', 'skipped', 'No safe uncommitted files proposed for staging');
    }

    // 3. Build
    updateStage('build', 'running');
    const buildResult = await runCommand(npmCmd, ['run', 'build:cloudflare'], 'Production build', 'build');
    updateStage('build', 'success', 'Vite & Cloudflare build completed');

    // 4. Commit
    updateStage('commit', 'running');
    const cachedDiff = await runProcessCapture('git', ['diff', '--cached', '--quiet']);
    if (cachedDiff.code === 1) {
      const commitMsg = `chore(frontend): deploy release ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      await runCommand('git', ['commit', '-m', commitMsg], 'Git commit', 'commit');
      updateStage('commit', 'success', commitMsg);
    } else {
      updateStage('commit', 'skipped', 'No staged changes to commit');
    }

    // 5. GitHub Push
    updateStage('push', 'running');
    await runCommand('git', ['push', 'origin', 'main'], 'GitHub push', 'push');
    updateStage('push', 'success', 'Pushed main to origin');

    // 6. Cloudflare Deploy
    updateStage('deploy', 'running');
    const deployResult = await runCommand(npmCmd, ['run', 'deploy:cloudflare'], 'Cloudflare deploy', 'deploy');
    updateStage('deploy', 'success', deployResult.stdout.slice(-150).trim());

    plan.success = true;
    plan.completedAt = new Date().toISOString();
  } catch (err: any) {
    const errorStage = plan.stages.find((s) => s.status === 'running')?.name || 'general';
    updateStage(errorStage, 'failed', err?.message);
    plan.error = err.classified || classifyReleaseError(errorStage, err?.message || 'Operation failed');
    plan.completedAt = new Date().toISOString();
  } finally {
    appendAuditLog(plan);
  }

  return plan;
};

export const runApplyMigrations = async (
  authorization?: string | null,
  options?: { confirm?: boolean },
): Promise<ReleaseExecutionPlan> => {
  const admin = await requireActiveAdmin(authorization);

  const plan: ReleaseExecutionPlan = {
    id: `db-${Date.now()}`,
    operation: 'apply_migrations',
    startedAt: new Date().toISOString(),
    success: false,
    stages: [
      { name: 'preflight', label: 'Migration Preflight', status: 'pending' },
      { name: 'confirmation', label: 'Administrator Confirmation', status: 'pending' },
      { name: 'apply', label: 'Apply Database Migrations', status: 'pending' },
      { name: 'verify', label: 'Verify Migration State', status: 'pending' },
    ],
  };

  const updateStage = (name: string, status: ReleaseStageStatus, detail?: string) => {
    const stage = plan.stages.find((s) => s.name === name);
    if (stage) {
      stage.status = status;
      if (detail) stage.detail = sanitizeErrorMessage(detail);
    }
  };

  try {
    // 1. Preflight
    updateStage('preflight', 'running');
    const preflight = await runReleasePreflight(authorization);
    if (!preflight.actions.canApplyMigrations) {
      throw new Error(`Migration apply blocked: ${preflight.blockReasons.join('; ')}`);
    }
    updateStage('preflight', 'success', preflight.migration.statusLabel);

    // 2. Confirmation check
    updateStage('confirmation', 'running');
    if (!options?.confirm) {
      throw new Error('Explicit administrator confirmation required to apply migrations.');
    }
    updateStage('confirmation', 'success', `Confirmed by ${admin.email || admin.userId}`);

    // 3. Apply
    updateStage('apply', 'running');
    if (preflight.migration.status === 'local_pending') {
      const pushResult = await runCommand('supabase', ['db', 'push'], 'Supabase DB push', 'migration');
      updateStage('apply', 'success', pushResult.stdout.trim() || 'Applied pending migrations');
    } else {
      updateStage('apply', 'skipped', 'Remote database is already synchronized');
    }

    // 4. Verify post-state
    updateStage('verify', 'running');
    const postPreflight = await runReleasePreflight(authorization);
    if (postPreflight.migration.status !== 'synchronized') {
      throw new Error(`Post-migration verification failed: state is ${postPreflight.migration.statusLabel}`);
    }
    updateStage('verify', 'success', `Verified synchronized at head ${postPreflight.migration.remoteHead}`);

    plan.success = true;
    plan.completedAt = new Date().toISOString();
  } catch (err: any) {
    const errorStage = plan.stages.find((s) => s.status === 'running')?.name || 'general';
    updateStage(errorStage, 'failed', err?.message);
    plan.error = err.classified || classifyReleaseError(errorStage, err?.message || 'Operation failed');
    plan.completedAt = new Date().toISOString();
  } finally {
    appendAuditLog(plan);
  }

  return plan;
};

export const runFullRelease = async (
  authorization?: string | null,
  options?: { confirm?: boolean; filesToStage?: string[] },
): Promise<ReleaseExecutionPlan> => {
  const admin = await requireActiveAdmin(authorization);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const plan: ReleaseExecutionPlan = {
    id: `rel-${Date.now()}`,
    operation: 'full_release',
    startedAt: new Date().toISOString(),
    success: false,
    stages: [
      { name: 'preflight', label: 'Full Release Preflight', status: 'pending' },
      { name: 'confirmation', label: 'Administrator Confirmation', status: 'pending' },
      { name: 'staging', label: 'Safe Git Staging', status: 'pending' },
      { name: 'build', label: 'Cloudflare Production Build', status: 'pending' },
      { name: 'commit', label: 'Git Commit', status: 'pending' },
      { name: 'migration', label: 'Supabase Migration Deployment', status: 'pending' },
      { name: 'push', label: 'GitHub Push', status: 'pending' },
      { name: 'deploy', label: 'Cloudflare Pages Deploy', status: 'pending' },
      { name: 'verification', label: 'Release Verification', status: 'pending' },
    ],
  };

  const updateStage = (name: string, status: ReleaseStageStatus, detail?: string) => {
    const stage = plan.stages.find((s) => s.name === name);
    if (stage) {
      stage.status = status;
      if (detail) stage.detail = sanitizeErrorMessage(detail);
    }
  };

  try {
    // 1. Preflight
    updateStage('preflight', 'running');
    const preflight = await runReleasePreflight(authorization);
    if (!preflight.actions.canFullRelease) {
      throw new Error(`Full release blocked: ${preflight.blockReasons.join('; ')}`);
    }
    updateStage('preflight', 'success', `Preflight passed on branch ${preflight.git.branch}`);

    // 2. Confirmation
    updateStage('confirmation', 'running');
    if (!options?.confirm) {
      throw new Error('Explicit administrator confirmation required for full release.');
    }
    updateStage('confirmation', 'success', `Confirmed by ${admin.email || admin.userId}`);

    // 3. Staging
    updateStage('staging', 'running');
    const allowedSet = new Set(preflight.staging.safeToStage);
    const filesToStage = (options?.filesToStage ?? preflight.staging.safeToStage)
      .filter((f) => allowedSet.has(f) && !isSecretPath(f) && !isBuildOrTempPath(f));

    if (filesToStage.length > 0) {
      await runCommand('git', ['add', '--', ...filesToStage], 'Safe Git Staging', 'commit');
      updateStage('staging', 'success', `Staged ${filesToStage.length} safe file(s)`);
    } else {
      updateStage('staging', 'skipped', 'Working tree is already clean');
    }

    // 4. Build
    updateStage('build', 'running');
    await runCommand(npmCmd, ['run', 'build:cloudflare'], 'Production build', 'build');
    updateStage('build', 'success', 'Vite & Cloudflare build completed');

    // 5. Commit
    updateStage('commit', 'running');
    const cachedDiff = await runProcessCapture('git', ['diff', '--cached', '--quiet']);
    if (cachedDiff.code === 1) {
      const commitMsg = `chore: sync production ${preflight.migration.localHead || new Date().toISOString()}`;
      await runCommand('git', ['commit', '-m', commitMsg], 'Git commit', 'commit');
      updateStage('commit', 'success', commitMsg);
    } else {
      updateStage('commit', 'skipped', 'No staged changes to commit');
    }

    // 6. Database Migration
    updateStage('migration', 'running');
    if (preflight.migration.status === 'local_pending') {
      const pushResult = await runCommand('supabase', ['db', 'push'], 'Supabase DB push', 'migration');
      updateStage('migration', 'success', pushResult.stdout.trim() || 'Applied pending migrations');
    } else {
      updateStage('migration', 'skipped', 'Database already up to date');
    }

    // 7. GitHub Push
    updateStage('push', 'running');
    await runCommand('git', ['push', 'origin', 'main'], 'GitHub push', 'push');
    updateStage('push', 'success', 'Pushed main to origin');

    // 8. Cloudflare Deploy
    updateStage('deploy', 'running');
    const deployResult = await runCommand(npmCmd, ['run', 'deploy:cloudflare'], 'Cloudflare deploy', 'deploy');
    updateStage('deploy', 'success', deployResult.stdout.slice(-150).trim());

    // 9. Post verification
    updateStage('verification', 'running');
    const postPreflight = await runReleasePreflight(authorization);
    updateStage(
      'verification',
      postPreflight.ok ? 'success' : 'failed',
      `Head: ${postPreflight.git.commit} · DB: ${postPreflight.migration.statusLabel}`,
    );

    plan.success = true;
    plan.completedAt = new Date().toISOString();
  } catch (err: any) {
    const errorStage = plan.stages.find((s) => s.status === 'running')?.name || 'general';
    updateStage(errorStage, 'failed', err?.message);
    plan.error = err.classified || classifyReleaseError(errorStage, err?.message || 'Operation failed');
    plan.completedAt = new Date().toISOString();
  } finally {
    appendAuditLog(plan);
  }

  return plan;
};
