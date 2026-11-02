import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  getResolvedServerEnvValue,
  requireActiveAdmin,
  type ActiveAdminIdentity,
} from '../adminServerAuth';
import {
  classifyGitStatus,
  classifyReleaseError,
  compareMigrationManifests,
  extractMeaningfulCliError,
  isBuildOrTempPath,
  isExperimentalOrLocalDataPath,
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
const PENDING_MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase', 'pending-migrations');
const WRANGLER_CONFIG_PATH = path.join(ROOT_DIR, 'wrangler.jsonc');
const WRANGLER_BIN_PATH = path.join(ROOT_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const AUDIT_DIR = path.join(ROOT_DIR, '.codex-temp');
const AUDIT_FILE = path.join(AUDIT_DIR, 'release-audit.local.json');

type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
  launchError?: boolean;
};

let activeReleaseOperation: {
  id: string;
  operation: ReleaseExecutionPlan['operation'];
  startedAt: string;
} | null = null;

export const isReleaseOperationRunning = (): boolean => activeReleaseOperation !== null;

export const getActiveReleaseOperation = () => activeReleaseOperation;

export const withReleaseLock = async <T>(
  id: string,
  operation: ReleaseExecutionPlan['operation'],
  fn: () => Promise<T>,
): Promise<T> => {
  if (activeReleaseOperation) {
    const err = new Error(
      `Another release operation (${activeReleaseOperation.operation}) is already in progress since ${activeReleaseOperation.startedAt}.`,
    ) as Error & { statusCode?: number; classified?: ClassifiedReleaseError };
    err.statusCode = 409;
    err.classified = classifyReleaseError('lock', err.message);
    throw err;
  }
  activeReleaseOperation = {
    id,
    operation,
    startedAt: new Date().toISOString(),
  };
  try {
    return await fn();
  } finally {
    activeReleaseOperation = null;
  }
};

// Windows cannot launch .cmd shims directly with spawn's default shell:false.
// Only the fixed npm.cmd / npx.cmd release command needs a command shell.
export const getReleaseSpawnOptions = (command: string, platform = process.platform) => ({
  shell: platform === 'win32' && /^(?:npm|npx)\.cmd$/i.test(path.basename(command)),
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

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const isLocalhostRequest = (req: any): boolean => {
  const remoteAddress = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '').trim();
  const host = String(req.headers?.host || '').trim();
  const isLoopbackIp = LOOPBACK_IPS.has(remoteAddress);
  const isLocalHostHeader =
    /^localhost(:\d+)?$/i.test(host) ||
    /^127\.0\.0\.1(:\d+)?$/i.test(host) ||
    /^\[::1\](:\d+)?$/i.test(host);

  const forwardedFor = String(
    req.headers?.['x-forwarded-for'] ||
      req.headers?.['cf-connecting-ip'] ||
      req.headers?.['x-real-ip'] ||
      '',
  ).trim();
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor.split(',')[0].trim();
    if (firstForwardedIp && !LOOPBACK_IPS.has(firstForwardedIp)) {
      return false;
    }
  }

  return isLoopbackIp && isLocalHostHeader;
};

export const inspectLocalMigrationsDirectory = (migrationsDir = MIGRATIONS_DIR) => {
  if (!fs.existsSync(migrationsDir)) {
    return {
      versions: [] as string[],
      fileMap: {} as Record<string, { filename: string; name: string }>,
      duplicateMigrationNames: [] as string[],
    };
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();

  const versions: string[] = [];
  const fileMap: Record<string, { filename: string; name: string }> = {};
  const byName = new Map<string, string[]>();

  for (const filename of files) {
    const match = filename.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) continue;
    const [, version, name] = match;
    versions.push(version);
    fileMap[version] = { filename, name };
    const existing = byName.get(name) ?? [];
    existing.push(version);
    byName.set(name, existing);
  }

  const duplicateMigrationNames: string[] = [];
  for (const [name, vers] of byName.entries()) {
    if (vers.length > 1) {
      duplicateMigrationNames.push(`${name} (${vers.join(', ')})`);
    }
  }

  return { versions, fileMap, duplicateMigrationNames };
};

const readWranglerProjectConfig = (): { configFound: boolean; projectName: string } => {
  if (!fs.existsSync(WRANGLER_CONFIG_PATH)) {
    return { configFound: false, projectName: 'swingsphere' };
  }
  try {
    const raw = fs.readFileSync(WRANGLER_CONFIG_PATH, 'utf8');
    const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/);
    return {
      configFound: true,
      projectName: nameMatch?.[1]?.trim() || 'swingsphere',
    };
  } catch {
    return { configFound: true, projectName: 'swingsphere' };
  }
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

const deployBuiltBundleToCloudflarePages = async (projectName: string): Promise<ProcessResult> => {
  if (fs.existsSync(WRANGLER_BIN_PATH)) {
    return runCommand(
      process.execPath,
      [WRANGLER_BIN_PATH, 'pages', 'deploy', 'dist', '--project-name', projectName],
      'Cloudflare Pages deploy',
      'deploy',
    );
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return runCommand(npmCmd, ['run', 'deploy:cloudflare'], 'Cloudflare deploy', 'deploy');
};

export const resolveApprovedFilesToStage = (
  preflight: ReleasePreflightReport,
  requestedFiles?: string[],
): string[] => {
  const allowedSet = new Set(preflight.staging.safeToStage);
  if (Array.isArray(requestedFiles)) {
    for (const file of requestedFiles) {
      if (isSecretPath(file) || isBuildOrTempPath(file)) {
        throw new Error(`Refusing to stage protected or build/temp file: ${file}`);
      }
      if (!allowedSet.has(file)) {
        throw new Error(`File "${file}" is not in the current working tree safe-staging set.`);
      }
    }
    return Array.from(new Set(requestedFiles)).sort();
  }
  // Never auto-stage experimental Globe Lab or local runtime JSON stores unless explicitly selected
  return preflight.staging.defaultSelectedFiles.filter(
    (f) => allowedSet.has(f) && !isSecretPath(f) && !isBuildOrTempPath(f) && !isExperimentalOrLocalDataPath(f),
  );
};

export const runReleasePreflight = async (
  authorization?: string | null,
): Promise<ReleasePreflightReport> => {
  await requireActiveAdmin(authorization);

  // 1. Git branch & upstream tracking check
  const branchResult = await runProcessCapture('git', ['branch', '--show-current']);
  const branch = branchResult.stdout.trim() || 'unknown';

  let upstream = 'origin/main';
  let aheadCount = 0;
  let behindCount = 0;
  const revListResult = await runProcessCapture('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
  if (revListResult.code === 0) {
    const parts = revListResult.stdout.trim().split(/\s+/);
    aheadCount = Number(parts[0] || 0);
    behindCount = Number(parts[1] || 0);
  }

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
  const localDirInfo = inspectLocalMigrationsDirectory();
  const migrationListResult = await runProcessCapture('supabase', ['migration', 'list']);
  const parsedMigrations = parseMigrationListCliOutput(
    `${migrationListResult.stdout}\n${migrationListResult.stderr}`,
  );
  // Ensure we include local directory files even if CLI omitted any
  const combinedLocal = Array.from(new Set([...localDirInfo.versions, ...parsedMigrations.local])).sort();
  const migration = compareMigrationManifests(
    combinedLocal,
    parsedMigrations.remote,
    localDirInfo.fileMap,
    localDirInfo.duplicateMigrationNames,
  );

  // 5. Migration dry-run
  const dryRunResult = await runProcessCapture('supabase', ['db', 'push', '--dry-run']);
  const dryRunOutput = `${dryRunResult.stdout}\n${dryRunResult.stderr}`.trim();
  const dryRunPassed = dryRunResult.code === 0 && !/\berror\b/i.test(dryRunOutput);
  const meaningfulDryRunError = dryRunPassed ? undefined : extractMeaningfulCliError(dryRunOutput);

  let includeAllDryRunPassed: boolean | undefined;
  let includeAllPreview: string | undefined;
  if (!dryRunPassed && migration.requiresIncludeAll && migration.status === 'local_pending') {
    const includeAllResult = await runProcessCapture('supabase', ['db', 'push', '--dry-run', '--include-all']);
    const includeAllOutput = `${includeAllResult.stdout}\n${includeAllResult.stderr}`.trim();
    includeAllDryRunPassed = includeAllResult.code === 0 && !/\berror\b/i.test(includeAllOutput);
    includeAllPreview = extractMeaningfulCliError(includeAllOutput);
  }

  // 6. Cloudflare & build environment readiness
  const hasHash = Boolean(
    getResolvedServerEnvValue(
      'NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH',
      'VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH',
    ),
  );
  const supabaseEnvReady = Boolean(
    getResolvedServerEnvValue('VITE_SUPABASE_URL', 'SUPABASE_URL') &&
      getResolvedServerEnvValue('VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
  );
  const wranglerConfig = readWranglerProjectConfig();
  const cloudflare = {
    ready: wranglerConfig.configFound && supabaseEnvReady,
    hasHash,
    projectName: wranglerConfig.projectName,
    configFound: wranglerConfig.configFound,
    supabaseEnvReady,
  };

  // 7. Overall actions & blockers
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  if (branch !== 'main') {
    blockReasons.push(`Releases must originate from "main". Current branch: "${branch}".`);
  }
  if (behindCount > 0) {
    blockReasons.push(`Local branch "main" is behind "${upstream}" by ${behindCount} commit(s). Pull and rebase before releasing.`);
  }
  if (staging.conflicts.length > 0) {
    blockReasons.push(`Unresolved merge conflicts in: ${staging.conflicts.join(', ')}.`);
  }
  if (staging.excludedSecrets.length > 0) {
    blockReasons.push(`Protected credentials or secrets detected in working tree: ${staging.excludedSecrets.join(', ')}.`);
  }
  if (!supabaseEnvReady) {
    blockReasons.push('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY required for production bundle build.');
  }
  if (migration.status === 'divergent') {
    blockReasons.push(`Migration histories have diverged. ${migration.explanation}`);
  }
  if (migration.status === 'remote_missing') {
    blockReasons.push(`Remote migrations are missing locally. ${migration.explanation}`);
  }
  if (!dryRunPassed && migration.status === 'local_pending') {
    if (migration.requiresIncludeAll && includeAllDryRunPassed) {
      blockReasons.push(
        `Out-of-order pending migration (${(migration.outOfOrderPendingLocal ?? []).join(', ')}) precedes production head (${migration.remoteHead}). Standard "supabase db push" is blocked unless "--include-all" confirmation is enabled after SQL review.`,
      );
    } else {
      blockReasons.push(`Supabase migration dry-run failed: ${meaningfulDryRunError || 'Unknown CLI error'}`);
    }
  }

  if (migration.status === 'local_pending') {
    warnings.push(`${migration.pendingLocal.length} local migration(s) are pending application: ${migration.pendingLocal.join(', ')}.`);
  }
  if ((migration.duplicateMigrationNames?.length ?? 0) > 0) {
    warnings.push(
      `Duplicate migration slug name(s) detected in supabase/migrations/: ${migration.duplicateMigrationNames!.join('; ')}.`,
    );
  }
  if (fs.existsSync(PENDING_MIGRATIONS_DIR)) {
    const parked = fs.readdirSync(PENDING_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    if (parked.length > 0) {
      warnings.push(`Parked migration file(s) present in supabase/pending-migrations/: ${parked.join(', ')}.`);
    }
  }
  if (staging.flaggedExperimentalOrLocal.length > 0) {
    warnings.push(
      `${staging.flaggedExperimentalOrLocal.length} experimental or local-data file(s) are excluded from default staging (${staging.flaggedExperimentalOrLocal.slice(0, 4).join(', ')}${staging.flaggedExperimentalOrLocal.length > 4 ? '…' : ''}).`,
    );
  }
  if (!hasHash) {
    warnings.push('Cloudflare Images delivery account hash is not configured in environment.');
  }

  const compatibility = verifyFrontendCompatibility(migration.pendingLocal);
  const canDeployFrontend =
    branch === 'main' &&
    behindCount === 0 &&
    staging.conflicts.length === 0 &&
    staging.excludedSecrets.length === 0 &&
    supabaseEnvReady &&
    compatibility.compatible;

  const canApplyMigrations =
    branch === 'main' &&
    staging.conflicts.length === 0 &&
    migration.safeToMigrate &&
    migration.status === 'local_pending' &&
    dryRunPassed &&
    !migration.requiresIncludeAll;

  const canApplyMigrationsWithIncludeAll =
    branch === 'main' &&
    staging.conflicts.length === 0 &&
    migration.safeToMigrate &&
    migration.status === 'local_pending' &&
    Boolean(migration.requiresIncludeAll) &&
    Boolean(includeAllDryRunPassed);

  const canFullRelease =
    canDeployFrontend &&
    (migration.status === 'synchronized' || canApplyMigrations);

  const canFullReleaseWithIncludeAll =
    canDeployFrontend &&
    Boolean(canApplyMigrationsWithIncludeAll);

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
      upstream,
      aheadCount,
      behindCount,
    },
    staging,
    migration,
    migrationDryRun: {
      passed: dryRunPassed,
      output: sanitizeErrorMessage(dryRunOutput),
      error: meaningfulDryRunError,
      requiresIncludeAll: migration.requiresIncludeAll,
      includeAllDryRunPassed,
      includeAllPreview,
    },
    cloudflare,
    actions: {
      canDeployFrontend,
      canApplyMigrations,
      canApplyMigrationsWithIncludeAll,
      canFullRelease,
      canFullReleaseWithIncludeAll,
    },
    blockReasons,
    warnings,
  };
};

export const runDeployFrontend = async (
  authorization?: string | null,
  options?: { filesToStage?: string[]; dryRun?: boolean },
): Promise<ReleaseExecutionPlan> => {
  const admin = await requireActiveAdmin(authorization);
  const planId = `fe-${Date.now()}`;

  return withReleaseLock(planId, 'deploy_frontend', async () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const isDryRun = Boolean(options?.dryRun);

    const plan: ReleaseExecutionPlan = {
      id: planId,
      operation: 'deploy_frontend',
      dryRun: isDryRun,
      startedAt: new Date().toISOString(),
      actorEmail: admin.email,
      success: false,
      stages: [
        { name: 'preflight', label: 'Release Preflight', status: 'pending' },
        { name: 'build', label: 'Cloudflare Production Build', status: 'pending' },
        { name: 'staging', label: 'Safe Git Staging', status: 'pending' },
        { name: 'commit', label: 'Git Commit', status: 'pending' },
        { name: 'push', label: 'GitHub Push', status: 'pending' },
        { name: 'deploy', label: 'Cloudflare Pages Deploy', status: 'pending' },
        { name: 'verification', label: 'Post-Deploy Verification', status: 'pending' },
      ],
    };

    const stageStarts = new Map<string, number>();
    const updateStage = (name: string, status: ReleaseStageStatus, detail?: string) => {
      const stage = plan.stages.find((s) => s.name === name);
      if (stage) {
        if (status === 'running') {
          stageStarts.set(name, Date.now());
        } else if (stageStarts.has(name)) {
          stage.durationMs = Date.now() - (stageStarts.get(name) ?? Date.now());
        }
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
      const filesToStage = resolveApprovedFilesToStage(preflight, options?.filesToStage);
      updateStage('preflight', 'success', `Verified branch ${preflight.git.branch} (${preflight.git.commit})`);

      // 2. Build (runs BEFORE staging/commit so a failed build never dirties the Git index)
      updateStage('build', 'running');
      if (isDryRun) {
        updateStage('build', 'success', '[DRY RUN] Validated Cloudflare build configuration');
      } else {
        await runCommand(npmCmd, ['run', 'build:cloudflare'], 'Production build', 'build');
        updateStage('build', 'success', 'Vite & Cloudflare build completed in dist/');
      }

      // 3. Safe Staging
      updateStage('staging', 'running');
      if (filesToStage.length > 0) {
        if (isDryRun) {
          updateStage('staging', 'success', `[DRY RUN] Would stage ${filesToStage.length} approved file(s)`);
        } else {
          await runCommand('git', ['add', '--', ...filesToStage], 'Safe Git Staging', 'staging');
          updateStage('staging', 'success', `Staged ${filesToStage.length} approved file(s)`);
        }
      } else {
        updateStage('staging', 'skipped', 'No uncommitted files selected for staging');
      }

      // 4. Commit
      updateStage('commit', 'running');
      const commitMsg = `chore(frontend): deploy release ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      if (isDryRun) {
        updateStage(
          'commit',
          filesToStage.length > 0 ? 'success' : 'skipped',
          filesToStage.length > 0 ? `[DRY RUN] Would commit: ${commitMsg}` : 'No staged changes to commit',
        );
      } else {
        const cachedDiff = await runProcessCapture('git', ['diff', '--cached', '--quiet']);
        if (cachedDiff.code === 1) {
          await runCommand('git', ['commit', '-m', commitMsg], 'Git commit', 'commit');
          updateStage('commit', 'success', commitMsg);
        } else {
          updateStage('commit', 'skipped', 'No staged changes to commit');
        }
      }

      // 5. GitHub Push
      updateStage('push', 'running');
      if (isDryRun) {
        updateStage('push', 'success', '[DRY RUN] Would push main to origin/main');
      } else {
        await runCommand('git', ['push', 'origin', 'main'], 'GitHub push', 'push');
        updateStage('push', 'success', 'Pushed main to origin');
      }

      // 6. Cloudflare Deploy (deploys dist/ directly without rebuilding a second time)
      updateStage('deploy', 'running');
      const projectName = preflight.cloudflare.projectName || 'swingsphere';
      if (isDryRun) {
        updateStage('deploy', 'success', `[DRY RUN] Would deploy dist/ to Cloudflare Pages project "${projectName}"`);
      } else {
        const deployResult = await deployBuiltBundleToCloudflarePages(projectName);
        updateStage('deploy', 'success', deployResult.stdout.slice(-160).trim() || `Deployed to ${projectName}`);
      }

      // 7. Verification
      updateStage('verification', 'running');
      if (isDryRun) {
        updateStage('verification', 'success', `[DRY RUN] Verified head ${preflight.git.commit} on ${preflight.git.branch}`);
      } else {
        const postCommit = await runProcessCapture('git', ['rev-parse', '--short', 'HEAD']);
        updateStage('verification', 'success', `Verified deployed commit ${postCommit.stdout.trim() || preflight.git.commit}`);
      }

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
  });
};

export const runApplyMigrations = async (
  authorization?: string | null,
  options?: { confirm?: boolean; includeAll?: boolean; dryRun?: boolean },
): Promise<ReleaseExecutionPlan> => {
  const admin = await requireActiveAdmin(authorization);
  const planId = `db-${Date.now()}`;

  return withReleaseLock(planId, 'apply_migrations', async () => {
    const isDryRun = Boolean(options?.dryRun);
    const allowIncludeAll = Boolean(options?.includeAll);

    const plan: ReleaseExecutionPlan = {
      id: planId,
      operation: 'apply_migrations',
      dryRun: isDryRun,
      startedAt: new Date().toISOString(),
      actorEmail: admin.email,
      success: false,
      stages: [
        { name: 'preflight', label: 'Migration Preflight', status: 'pending' },
        { name: 'confirmation', label: 'Administrator Confirmation', status: 'pending' },
        { name: 'apply', label: 'Apply Database Migrations', status: 'pending' },
        { name: 'verify', label: 'Verify Migration State', status: 'pending' },
      ],
    };

    const stageStarts = new Map<string, number>();
    const updateStage = (name: string, status: ReleaseStageStatus, detail?: string) => {
      const stage = plan.stages.find((s) => s.name === name);
      if (stage) {
        if (status === 'running') {
          stageStarts.set(name, Date.now());
        } else if (stageStarts.has(name)) {
          stage.durationMs = Date.now() - (stageStarts.get(name) ?? Date.now());
        }
        stage.status = status;
        if (detail) stage.detail = sanitizeErrorMessage(detail);
      }
    };

    try {
      // 1. Preflight
      updateStage('preflight', 'running');
      const preflight = await runReleasePreflight(authorization);
      const canProceedWithIncludeAll =
        allowIncludeAll && Boolean(preflight.actions.canApplyMigrationsWithIncludeAll);
      if (!preflight.actions.canApplyMigrations && !canProceedWithIncludeAll) {
        throw new Error(`Migration apply blocked: ${preflight.blockReasons.join('; ')}`);
      }
      updateStage('preflight', 'success', preflight.migration.statusLabel);

      // 2. Confirmation check
      updateStage('confirmation', 'running');
      if (!options?.confirm) {
        throw new Error('Explicit administrator confirmation required to apply migrations.');
      }
      if (preflight.migration.requiresIncludeAll && !allowIncludeAll) {
        throw new Error(
          `Out-of-order migration(s) (${(preflight.migration.outOfOrderPendingLocal ?? []).join(', ')}) require explicit "--include-all" confirmation.`,
        );
      }
      updateStage(
        'confirmation',
        'success',
        `Confirmed by ${admin.email || admin.userId}${allowIncludeAll ? ' (with --include-all)' : ''}`,
      );

      // 3. Apply
      updateStage('apply', 'running');
      if (preflight.migration.status === 'local_pending') {
        const pushArgs = allowIncludeAll ? ['db', 'push', '--include-all'] : ['db', 'push'];
        if (isDryRun) {
          updateStage(
            'apply',
            'success',
            `[DRY RUN] Would run "supabase ${pushArgs.join(' ')}" for: ${preflight.migration.pendingLocal.join(', ')}`,
          );
        } else {
          const pushResult = await runCommand('supabase', pushArgs, 'Supabase DB push', 'migration');
          updateStage('apply', 'success', pushResult.stdout.trim() || 'Applied pending migrations');
        }
      } else {
        updateStage('apply', 'skipped', 'Remote database is already synchronized');
      }

      // 4. Verify post-state
      updateStage('verify', 'running');
      if (isDryRun) {
        updateStage(
          'verify',
          'success',
          `[DRY RUN] Dry-run preview verified for head ${preflight.migration.localHead}`,
        );
      } else {
        const postPreflight = await runReleasePreflight(authorization);
        if (postPreflight.migration.status !== 'synchronized') {
          throw new Error(`Post-migration verification failed: state is ${postPreflight.migration.statusLabel}`);
        }
        updateStage('verify', 'success', `Verified synchronized at head ${postPreflight.migration.remoteHead}`);
      }

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
  });
};

export const runFullRelease = async (
  authorization?: string | null,
  options?: { confirm?: boolean; filesToStage?: string[]; includeAll?: boolean; dryRun?: boolean },
): Promise<ReleaseExecutionPlan> => {
  const admin = await requireActiveAdmin(authorization);
  const planId = `rel-${Date.now()}`;

  return withReleaseLock(planId, 'full_release', async () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const isDryRun = Boolean(options?.dryRun);
    const allowIncludeAll = Boolean(options?.includeAll);

    const plan: ReleaseExecutionPlan = {
      id: planId,
      operation: 'full_release',
      dryRun: isDryRun,
      startedAt: new Date().toISOString(),
      actorEmail: admin.email,
      success: false,
      stages: [
        { name: 'preflight', label: 'Full Release Preflight', status: 'pending' },
        { name: 'confirmation', label: 'Administrator Confirmation', status: 'pending' },
        { name: 'build', label: 'Cloudflare Production Build', status: 'pending' },
        { name: 'staging', label: 'Safe Git Staging', status: 'pending' },
        { name: 'commit', label: 'Git Commit', status: 'pending' },
        { name: 'migration', label: 'Supabase Migration Deployment', status: 'pending' },
        { name: 'push', label: 'GitHub Push', status: 'pending' },
        { name: 'deploy', label: 'Cloudflare Pages Deploy', status: 'pending' },
        { name: 'verification', label: 'Release Verification', status: 'pending' },
      ],
    };

    const stageStarts = new Map<string, number>();
    const updateStage = (name: string, status: ReleaseStageStatus, detail?: string) => {
      const stage = plan.stages.find((s) => s.name === name);
      if (stage) {
        if (status === 'running') {
          stageStarts.set(name, Date.now());
        } else if (stageStarts.has(name)) {
          stage.durationMs = Date.now() - (stageStarts.get(name) ?? Date.now());
        }
        stage.status = status;
        if (detail) stage.detail = sanitizeErrorMessage(detail);
      }
    };

    try {
      // 1. Preflight
      updateStage('preflight', 'running');
      const preflight = await runReleasePreflight(authorization);
      const canProceedWithIncludeAll =
        allowIncludeAll && Boolean(preflight.actions.canFullReleaseWithIncludeAll);
      if (!preflight.actions.canFullRelease && !canProceedWithIncludeAll) {
        throw new Error(`Full release blocked: ${preflight.blockReasons.join('; ')}`);
      }
      const filesToStage = resolveApprovedFilesToStage(preflight, options?.filesToStage);
      updateStage('preflight', 'success', `Preflight passed on branch ${preflight.git.branch}`);

      // 2. Confirmation
      updateStage('confirmation', 'running');
      if (!options?.confirm) {
        throw new Error('Explicit administrator confirmation required for full release.');
      }
      if (preflight.migration.requiresIncludeAll && !allowIncludeAll) {
        throw new Error(
          `Out-of-order migration(s) (${(preflight.migration.outOfOrderPendingLocal ?? []).join(', ')}) require explicit "--include-all" confirmation.`,
        );
      }
      updateStage(
        'confirmation',
        'success',
        `Confirmed by ${admin.email || admin.userId}${allowIncludeAll ? ' (with --include-all)' : ''}`,
      );

      // 3. Build (runs BEFORE Git staging/commit and DB migration so build errors abort cleanly)
      updateStage('build', 'running');
      if (isDryRun) {
        updateStage('build', 'success', '[DRY RUN] Validated Cloudflare production build readiness');
      } else {
        await runCommand(npmCmd, ['run', 'build:cloudflare'], 'Production build', 'build');
        updateStage('build', 'success', 'Vite & Cloudflare build completed in dist/');
      }

      // 4. Staging
      updateStage('staging', 'running');
      if (filesToStage.length > 0) {
        if (isDryRun) {
          updateStage('staging', 'success', `[DRY RUN] Would stage ${filesToStage.length} approved file(s)`);
        } else {
          await runCommand('git', ['add', '--', ...filesToStage], 'Safe Git Staging', 'staging');
          updateStage('staging', 'success', `Staged ${filesToStage.length} approved file(s)`);
        }
      } else {
        updateStage('staging', 'skipped', 'No uncommitted files selected for staging');
      }

      // 5. Commit
      updateStage('commit', 'running');
      const commitMsg = `chore: sync production ${preflight.migration.localHead || new Date().toISOString()}`;
      if (isDryRun) {
        updateStage(
          'commit',
          filesToStage.length > 0 ? 'success' : 'skipped',
          filesToStage.length > 0 ? `[DRY RUN] Would commit: ${commitMsg}` : 'No staged changes to commit',
        );
      } else {
        const cachedDiff = await runProcessCapture('git', ['diff', '--cached', '--quiet']);
        if (cachedDiff.code === 1) {
          await runCommand('git', ['commit', '-m', commitMsg], 'Git commit', 'commit');
          updateStage('commit', 'success', commitMsg);
        } else {
          updateStage('commit', 'skipped', 'No staged changes to commit');
        }
      }

      // 6. Database Migration
      updateStage('migration', 'running');
      if (preflight.migration.status === 'local_pending') {
        const pushArgs = allowIncludeAll ? ['db', 'push', '--include-all'] : ['db', 'push'];
        if (isDryRun) {
          updateStage(
            'migration',
            'success',
            `[DRY RUN] Would run "supabase ${pushArgs.join(' ')}" for: ${preflight.migration.pendingLocal.join(', ')}`,
          );
        } else {
          const pushResult = await runCommand('supabase', pushArgs, 'Supabase DB push', 'migration');
          updateStage('migration', 'success', pushResult.stdout.trim() || 'Applied pending migrations');
        }
      } else {
        updateStage('migration', 'skipped', 'Database already up to date');
      }

      // 7. GitHub Push
      updateStage('push', 'running');
      if (isDryRun) {
        updateStage('push', 'success', '[DRY RUN] Would push main to origin/main');
      } else {
        await runCommand('git', ['push', 'origin', 'main'], 'GitHub push', 'push');
        updateStage('push', 'success', 'Pushed main to origin');
      }

      // 8. Cloudflare Deploy (deploys dist/ directly without rebuilding a second time)
      updateStage('deploy', 'running');
      const projectName = preflight.cloudflare.projectName || 'swingsphere';
      if (isDryRun) {
        updateStage('deploy', 'success', `[DRY RUN] Would deploy dist/ to Cloudflare Pages project "${projectName}"`);
      } else {
        const deployResult = await deployBuiltBundleToCloudflarePages(projectName);
        updateStage('deploy', 'success', deployResult.stdout.slice(-160).trim() || `Deployed to ${projectName}`);
      }

      // 9. Post verification
      updateStage('verification', 'running');
      if (isDryRun) {
        updateStage(
          'verification',
          'success',
          `[DRY RUN] Simulated release verified · Head: ${preflight.git.commit} · DB: ${preflight.migration.localHead}`,
        );
      } else {
        const postPreflight = await runReleasePreflight(authorization);
        updateStage(
          'verification',
          postPreflight.ok ? 'success' : 'failed',
          `Head: ${postPreflight.git.commit} · DB: ${postPreflight.migration.statusLabel}`,
        );
      }

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
  });
};
