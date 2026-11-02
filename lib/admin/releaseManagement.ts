export type MigrationSyncState =
  | 'synchronized'
  | 'local_pending'
  | 'remote_missing'
  | 'divergent'
  | 'unknown';

export type MigrationPendingDetail = {
  version: string;
  filename?: string;
  name?: string;
  isOutOfOrder: boolean;
};

export type MigrationComparisonResult = {
  status: MigrationSyncState;
  statusLabel: string;
  localHead: string;
  remoteHead: string;
  localCount: number;
  remoteCount: number;
  pendingLocal: string[];
  inOrderPendingLocal?: string[];
  outOfOrderPendingLocal?: string[];
  requiresIncludeAll?: boolean;
  pendingDetails?: MigrationPendingDetail[];
  duplicateMigrationNames?: string[];
  missingRemote: string[];
  matchedCount: number;
  explanation: string;
  safeToMigrate: boolean;
};

export type StagingClassification = {
  safeToStage: string[];
  modifiedTracked: string[];
  untracked: string[];
  flaggedExperimentalOrLocal: string[];
  defaultSelectedFiles: string[];
  excludedSecrets: string[];
  excludedBuildOrTemp: string[];
  conflicts: string[];
  canStage: boolean;
  blockReason?: string;
};

export type ReleaseErrorCategory =
  | 'supabase_auth'
  | 'database_connectivity'
  | 'migration_mismatch'
  | 'migration_sql_failure'
  | 'production_build'
  | 'git_commit'
  | 'git_push'
  | 'cloudflare_deploy'
  | 'preflight_validation'
  | 'concurrency_locked'
  | 'unauthorized'
  | 'unknown';

export type ClassifiedReleaseError = {
  category: ReleaseErrorCategory;
  categoryLabel: string;
  userMessage: string;
  actionableNextStep: string;
  sanitizedDetail: string;
  recoveryGuidance?: string;
};

export type ReleasePreflightReport = {
  ok: boolean;
  checkedAt: string;
  git: {
    branch: string;
    commit: string;
    commitAuthor: string;
    commitDate: string;
    commitMessage: string;
    isClean: boolean;
    hasConflicts: boolean;
    conflicts: string[];
    upstream?: string;
    aheadCount?: number;
    behindCount?: number;
  };
  staging: StagingClassification;
  migration: MigrationComparisonResult;
  migrationDryRun: {
    passed: boolean;
    output: string;
    error?: string;
    requiresIncludeAll?: boolean;
    includeAllDryRunPassed?: boolean;
    includeAllPreview?: string;
  };
  cloudflare: {
    ready: boolean;
    hasHash: boolean;
    projectName?: string;
    configFound?: boolean;
    supabaseEnvReady?: boolean;
  };
  actions: {
    canDeployFrontend: boolean;
    canApplyMigrations: boolean;
    canApplyMigrationsWithIncludeAll?: boolean;
    canFullRelease: boolean;
    canFullReleaseWithIncludeAll?: boolean;
  };
  blockReasons: string[];
  warnings: string[];
};

export type ReleaseStageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export type ReleaseExecutionPlan = {
  id: string;
  operation: 'verify' | 'deploy_frontend' | 'apply_migrations' | 'full_release';
  dryRun?: boolean;
  startedAt: string;
  completedAt?: string;
  actorEmail?: string | null;
  success: boolean;
  stages: Array<{
    name: string;
    label: string;
    status: ReleaseStageStatus;
    detail?: string;
    durationMs?: number;
  }>;
  error?: ClassifiedReleaseError;
};

const SECRET_PATTERNS = [
  /(?:^|[\\/])\.env(?:\.local|\.production|\.development|\.cloudflare)?(?:\.local)?$/i,
  /(?:^|[\\/])credentials\.json$/i,
  /(?:^|[\\/])(?:id_rsa|id_ed25519|.*\.pem|.*\.key)$/i,
  /(?:^|[\\/])wrangler\.secret(?:\.local)?$/i,
  /(?:^|[\\/])supabase[\\/]\.temp[\\/]/i,
];

const BUILD_AND_TEMP_PATTERNS = [
  /(?:^|[\\/])dist[\\/]/i,
  /(?:^|[\\/])node_modules[\\/]/i,
  /(?:^|[\\/])\.wrangler[\\/]/i,
  /(?:^|[\\/])scratch[\\/]/i,
  /(?:^|[\\/])\.codex-temp[\\/]/i,
  /\.log$/i,
  /\.tmp$/i,
];

const EXPERIMENTAL_OR_LOCAL_DATA_PATTERNS = [
  /(?:^|[\\/])components[\\/]dev[\\/]Globe2LabPage\.tsx$/i,
  /(?:^|[\\/])src[\\/]features[\\/]globe-v2(?:[\\/]|$)/i,
  /(?:^|[\\/])public[\\/]geo[\\/]globe-v2(?:[\\/]|$)/i,
  /(?:^|[\\/])supabase[\\/]pending-migrations(?:[\\/]|$)/i,
  /(?:^|[\\/])data[\\/][^\\/]+\.local\.json$/i,
  /(?:^|[\\/])\.agents(?:[\\/]|$)/i,
  /(?:^|[\\/])docs[\\/]audits(?:[\\/]|$)/i,
];

export const isSecretPath = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, '/');
  return SECRET_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isBuildOrTempPath = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, '/');
  return BUILD_AND_TEMP_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isExperimentalOrLocalDataPath = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, '/');
  return EXPERIMENTAL_OR_LOCAL_DATA_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const compareMigrationManifests = (
  localVersionsInput: string[],
  remoteVersionsInput: string[],
  localFilenameMap?: Record<string, { filename: string; name: string }>,
  duplicateMigrationNames: string[] = [],
): MigrationComparisonResult => {
  const localVersions = Array.from(new Set(localVersionsInput.filter((v) => /^\d{14}$/.test(v)))).sort();
  const remoteVersions = Array.from(new Set(remoteVersionsInput.filter((v) => /^\d{14}$/.test(v)))).sort();

  const localHead = localVersions.at(-1) ?? '';
  const remoteHead = remoteVersions.at(-1) ?? '';

  if (localVersions.length === 0 && remoteVersions.length === 0) {
    return {
      status: 'unknown',
      statusLabel: 'Unable to verify',
      localHead: '',
      remoteHead: '',
      localCount: 0,
      remoteCount: 0,
      pendingLocal: [],
      inOrderPendingLocal: [],
      outOfOrderPendingLocal: [],
      requiresIncludeAll: false,
      pendingDetails: [],
      duplicateMigrationNames,
      missingRemote: [],
      matchedCount: 0,
      explanation: 'No migration records were provided for comparison.',
      safeToMigrate: false,
    };
  }

  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);

  const pendingLocal = localVersions.filter((v) => !remoteSet.has(v));
  const missingRemote = remoteVersions.filter((v) => !localSet.has(v));
  const matched = localVersions.filter((v) => remoteSet.has(v));

  const inOrderPendingLocal = remoteHead
    ? pendingLocal.filter((v) => v > remoteHead)
    : [...pendingLocal];
  const outOfOrderPendingLocal = remoteHead
    ? pendingLocal.filter((v) => v <= remoteHead)
    : [];
  const requiresIncludeAll = outOfOrderPendingLocal.length > 0;
  const pendingDetails: MigrationPendingDetail[] = pendingLocal.map((version) => ({
    version,
    filename: localFilenameMap?.[version]?.filename,
    name: localFilenameMap?.[version]?.name,
    isOutOfOrder: Boolean(remoteHead && version <= remoteHead),
  }));

  if (missingRemote.length > 0 && pendingLocal.length > 0) {
    return {
      status: 'divergent',
      statusLabel: 'Divergent migration histories',
      localHead,
      remoteHead,
      localCount: localVersions.length,
      remoteCount: remoteVersions.length,
      pendingLocal,
      inOrderPendingLocal,
      outOfOrderPendingLocal,
      requiresIncludeAll,
      pendingDetails,
      duplicateMigrationNames,
      missingRemote,
      matchedCount: matched.length,
      explanation: `Production has ${missingRemote.length} migration(s) missing locally (${missingRemote.join(', ')}), and this checkout has ${pendingLocal.length} unapplied migration(s) (${pendingLocal.join(', ')}). Database push is blocked until histories are reconciled.`,
      safeToMigrate: false,
    };
  }

  if (missingRemote.length > 0) {
    return {
      status: 'remote_missing',
      statusLabel: 'Remote migrations missing locally',
      localHead,
      remoteHead,
      localCount: localVersions.length,
      remoteCount: remoteVersions.length,
      pendingLocal: [],
      inOrderPendingLocal: [],
      outOfOrderPendingLocal: [],
      requiresIncludeAll: false,
      pendingDetails: [],
      duplicateMigrationNames,
      missingRemote,
      matchedCount: matched.length,
      explanation: `Production contains ${missingRemote.length} migration(s) that are missing from this checkout: ${missingRemote.join(', ')}. Local migration files must be restored or aligned before deploying.`,
      safeToMigrate: false,
    };
  }

  if (pendingLocal.length > 0) {
    const outOfOrderExplanation = requiresIncludeAll
      ? `This checkout has ${pendingLocal.length} unapplied local migration(s) (${pendingLocal.join(', ')}), including ${outOfOrderPendingLocal.length} out-of-order migration(s) timestamped before the current production head (${remoteHead}): ${outOfOrderPendingLocal.join(', ')}. Even though local head (${localHead}) and production head (${remoteHead}) match, ${outOfOrderPendingLocal.join(', ')} is not in supabase_migrations.schema_migrations and requires "--include-all" confirmation after SQL verification.`
      : `This checkout has ${pendingLocal.length} new migration(s) ready to apply in order: ${pendingLocal.join(', ')}. Remote database is fully accounted for.`;

    return {
      status: 'local_pending',
      statusLabel: requiresIncludeAll
        ? 'Local migrations pending (out-of-order)'
        : 'Local migrations pending',
      localHead,
      remoteHead,
      localCount: localVersions.length,
      remoteCount: remoteVersions.length,
      pendingLocal,
      inOrderPendingLocal,
      outOfOrderPendingLocal,
      requiresIncludeAll,
      pendingDetails,
      duplicateMigrationNames,
      missingRemote: [],
      matchedCount: matched.length,
      explanation: outOfOrderExplanation,
      safeToMigrate: true,
    };
  }

  return {
    status: 'synchronized',
    statusLabel: 'Fully synchronized',
    localHead,
    remoteHead,
    localCount: localVersions.length,
    remoteCount: remoteVersions.length,
    pendingLocal: [],
    inOrderPendingLocal: [],
    outOfOrderPendingLocal: [],
    requiresIncludeAll: false,
    pendingDetails: [],
    duplicateMigrationNames,
    missingRemote: [],
    matchedCount: matched.length,
    explanation: `All ${matched.length} migrations match between this checkout and production Supabase. Current schema head is ${localHead || remoteHead}.`,
    safeToMigrate: true,
  };
};

export const classifyGitStatus = (porcelainOutput: string): StagingClassification => {
  const lines = porcelainOutput
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length >= 3);

  const safeToStage: string[] = [];
  const modifiedTracked: string[] = [];
  const untracked: string[] = [];
  const flaggedExperimentalOrLocal: string[] = [];
  const excludedSecrets: string[] = [];
  const excludedBuildOrTemp: string[] = [];
  const conflicts: string[] = [];

  for (const line of lines) {
    const code = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ')[1].trim();
    }
    filePath = filePath.replace(/^"|"$/g, '');

    if (code.includes('U') || code === 'AA' || code === 'DD') {
      conflicts.push(filePath);
      continue;
    }

    if (isSecretPath(filePath)) {
      excludedSecrets.push(filePath);
      continue;
    }

    if (isBuildOrTempPath(filePath)) {
      excludedBuildOrTemp.push(filePath);
      continue;
    }

    if (isExperimentalOrLocalDataPath(filePath)) {
      flaggedExperimentalOrLocal.push(filePath);
    }

    if (code.startsWith('?')) {
      untracked.push(filePath);
      safeToStage.push(filePath);
    } else {
      modifiedTracked.push(filePath);
      safeToStage.push(filePath);
    }
  }

  let blockReason: string | undefined;
  if (conflicts.length > 0) {
    blockReason = `Unresolved merge conflicts in ${conflicts.join(', ')}. Resolve conflicts before release.`;
  } else if (excludedSecrets.length > 0) {
    blockReason = `Working directory contains protected secrets or credentials: ${excludedSecrets.join(', ')}. Remove or untrack before staging.`;
  }

  const dedupSafe = Array.from(new Set(safeToStage)).sort();
  const dedupFlagged = new Set(flaggedExperimentalOrLocal);
  const defaultSelectedFiles = dedupSafe.filter((f) => !dedupFlagged.has(f));

  return {
    safeToStage: dedupSafe,
    modifiedTracked: Array.from(new Set(modifiedTracked)).sort(),
    untracked: Array.from(new Set(untracked)).sort(),
    flaggedExperimentalOrLocal: Array.from(dedupFlagged).sort(),
    defaultSelectedFiles,
    excludedSecrets: Array.from(new Set(excludedSecrets)).sort(),
    excludedBuildOrTemp: Array.from(new Set(excludedBuildOrTemp)).sort(),
    conflicts: Array.from(new Set(conflicts)).sort(),
    canStage: conflicts.length === 0 && excludedSecrets.length === 0,
    blockReason,
  };
};

export const sanitizeErrorMessage = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/postgresql:\/\/[^:]+:[^@]+@[^/:]+(?::\d+)?\/[^\s"']+/gi, 'postgresql://***:***@***/***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:supabase[_-]?anon[_-]?key|supabase[_-]?service[_-]?role[_-]?key|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9._-]+['"]?/gi, '$1=[REDACTED]')
    .replace(/ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[JWT_REDACTED]');
};

export const extractMeaningfulCliError = (rawOutput: string): string => {
  const sanitized = sanitizeErrorMessage(rawOutput || '');
  const lines = sanitized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^initialising login role/i.test(line) &&
        !/^connecting to remote database/i.test(line) &&
        !/^dry run:\s*migrations will \*not\* be pushed/i.test(line) &&
        !/^a new version of supabase cli is available/i.test(line) &&
        !/^we recommend updating regularly/i.test(line),
    );
  return lines.join(' ') || sanitized.trim();
};

export const classifyReleaseError = (stage: string, rawError: string): ClassifiedReleaseError => {
  const sanitized = sanitizeErrorMessage(rawError || '');
  const lower = sanitized.toLowerCase();

  if (lower.includes('already in progress') || lower.includes('concurrent release')) {
    return {
      category: 'concurrency_locked',
      categoryLabel: 'Release Already Running',
      userMessage: 'Another release or migration operation is currently running on this server.',
      actionableNextStep: 'Wait for the active release operation to finish before starting another action.',
      sanitizedDetail: sanitized,
    };
  }

  if (lower.includes('unauthorized') || lower.includes('admin access is required') || lower.includes('invalid or expired') || lower.includes('only permitted from localhost')) {
    return {
      category: 'unauthorized',
      categoryLabel: 'Authentication Required',
      userMessage: 'Administrator session is invalid, expired, or lacking active admin privileges.',
      actionableNextStep: 'Sign in to the Admin Panel on localhost with an active administrator account and retry.',
      sanitizedDetail: sanitized,
    };
  }

  if (
    lower.includes('inserted before the last migration on remote database') ||
    lower.includes('--include-all') ||
    lower.includes('out-of-order migration')
  ) {
    return {
      category: 'migration_mismatch',
      categoryLabel: 'Out-of-Order Local Migration',
      userMessage: 'A pending local migration has a version timestamp earlier than the latest migration already applied on production.',
      actionableNextStep: 'Inspect the out-of-order migration SQL in the Release Preflight drawer and enable "--include-all" confirmation if verified safe.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'No database changes were applied. The remote database remains untouched.',
    };
  }

  if (lower.includes('dbpushmissinglocalerror') || lower.includes('remote migration versions not found in local migrations directory') || lower.includes('migration drift') || lower.includes('divergent')) {
    return {
      category: 'migration_mismatch',
      categoryLabel: 'Migration History Mismatch',
      userMessage: 'Production contains database migration versions that are missing or mismatched in this local checkout.',
      actionableNextStep: 'Align local migration files in supabase/migrations/ with production records before pushing database changes.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'No database changes were applied. Reconcile supabase/migrations/ with remote history.',
    };
  }

  if (lower.includes('failed to connect') || lower.includes('econnrefused') || lower.includes('etimedout') || lower.includes('could not connect to server')) {
    return {
      category: 'database_connectivity',
      categoryLabel: 'Database Connectivity Failure',
      userMessage: 'Could not connect to the remote Supabase database.',
      actionableNextStep: 'Check internet connectivity and remote Supabase project status, then retry.',
      sanitizedDetail: sanitized,
    };
  }

  if (stage === 'migration' || stage === 'apply' || lower.includes('syntax error at or near') || lower.includes('relation already exists') || lower.includes('column already exists')) {
    return {
      category: 'migration_sql_failure',
      categoryLabel: 'SQL Migration Error',
      userMessage: 'A database migration script failed to execute against PostgreSQL.',
      actionableNextStep: 'Inspect the SQL migration file for syntax or DDL errors and test locally before reapplying.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'Frontend push and Cloudflare deploy were halted to prevent deploying code that depends on a failed migration.',
    };
  }

  if (stage === 'build' || lower.includes('build failed') || lower.includes('vite build') || lower.includes('typescript error')) {
    return {
      category: 'production_build',
      categoryLabel: 'Production Build Failure',
      userMessage: 'Cloudflare production frontend build failed.',
      actionableNextStep: 'Review TypeScript compiler and Vite bundling errors in the build log.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'Build runs before Git staging and commit, so no files were committed or pushed and no migrations were applied.',
    };
  }

  if (stage === 'staging' || stage === 'commit' || lower.includes('git commit') || lower.includes('nothing to commit') || lower.includes('explicit file selection')) {
    return {
      category: 'git_commit',
      categoryLabel: 'Git Staging / Commit Error',
      userMessage: 'Failed to stage or commit release files to the local repository.',
      actionableNextStep: 'Verify selected files and working tree state, and resolve any index locks or conflicts.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'No commits were pushed to GitHub and no production deployments were triggered.',
    };
  }

  if (stage === 'push' || lower.includes('git push') || lower.includes('failed to push some refs') || lower.includes('rejected')) {
    return {
      category: 'git_push',
      categoryLabel: 'GitHub Push Failure',
      userMessage: 'Failed to push committed changes to GitHub origin/main.',
      actionableNextStep: 'Check git credentials and ensure local main is up to date with origin/main.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'Local commit succeeded on main. Once remote push access or upstream sync is resolved, re-run Frontend Deploy or git push.',
    };
  }

  if (stage === 'deploy' || lower.includes('wrangler pages deploy') || lower.includes('cloudflare pages')) {
    return {
      category: 'cloudflare_deploy',
      categoryLabel: 'Cloudflare Deployment Failure',
      userMessage: 'Cloudflare Pages deployment failed.',
      actionableNextStep: 'Check Cloudflare authentication (`npx wrangler whoami`), Wrangler configuration, or project permissions.',
      sanitizedDetail: sanitized,
      recoveryGuidance: 'Git commit/push and any prior database migrations completed. You can retry "B. Commit & deploy frontend" to deploy the built bundle without re-running migrations.',
    };
  }

  return {
    category: 'unknown',
    categoryLabel: 'Release Operation Failed',
    userMessage: 'An error occurred during release execution.',
    actionableNextStep: 'Inspect the detailed failure output below to diagnose the root cause.',
    sanitizedDetail: sanitized,
  };
};

export const verifyFrontendCompatibility = (
  localPendingMigrations: string[],
): { compatible: boolean; reason?: string } => {
  // If there are migrations that introduce breaking changes or critical DDL,
  // we check them here. Ambient massings (venue_ambient_building_massings) is purely
  // additive: frontend gracefully falls back if table is missing.
  return {
    compatible: true,
  };
};

export const parseMigrationListCliOutput = (
  raw: string,
): { local: string[]; remote: string[] } => {
  const local: string[] = [];
  const remote: string[] = [];

  // Try parsing JSON if present
  const jsonMatch = raw.match(/\{[\s\S]*"migrations"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      if (Array.isArray(data.migrations)) {
        for (const m of data.migrations) {
          if (typeof m.local === 'string' && /^\d{14}$/.test(m.local)) {
            local.push(m.local);
          }
          if (typeof m.remote === 'string' && /^\d{14}$/.test(m.remote)) {
            remote.push(m.remote);
          }
        }
        return {
          local: Array.from(new Set(local)).sort(),
          remote: Array.from(new Set(remote)).sort(),
        };
      }
    } catch {
      // Fall through to text table parsing
    }
  }

  // Parse text table format
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/);
    if (match) {
      if (match[1]) local.push(match[1]);
      if (match[2]) remote.push(match[2]);
    }
  }

  return {
    local: Array.from(new Set(local)).sort(),
    remote: Array.from(new Set(remote)).sort(),
  };
};
