import schemaVersion from 'virtual:swingsphere-schema-version';
import { supabase } from '../supabase';

export type PlatformStatus =
  | 'Operational'
  | 'Operational · Action needed'
  | 'Partial'
  | 'Schema only'
  | 'Pending deploy'
  | 'Local only'
  | 'Not connected'
  | 'Degraded';

export type PlatformHealthItem = {
  key: string;
  title: string;
  status: PlatformStatus;
  description: string;
  nextStep?: string;
  detail?: string;
};

type PlatformCapabilities = {
  profiles: boolean;
  mediaAssets: boolean;
  organizations: boolean;
  organizationMembers: boolean;
  venues: boolean;
  organizationVenueRelationships: boolean;
  eventSeries: boolean;
  clubBrands: boolean;
  resorts: boolean;
  cruiseSeries: boolean;
  cruiseSailings: boolean;
  feedbackTargets: boolean;
  feedbackRegistration: boolean;
  adminUserProjection: boolean;
  adminUserBadges: boolean;
  adminPrivateProfilePreview: boolean;
  adminUserMutation: boolean;
  profilePrivacy: boolean;
  savedRelationships: boolean;
  listingClaims: boolean;
  outboundAnalytics: boolean;
  badges: boolean;
  listingStore: boolean;
  listingModerationHistory: boolean;
  listingLegacyImportComplete: boolean;
  publicListingRead: boolean;
  myListingRead: boolean;
  adminListingRead: boolean;
  listingSubmit: boolean;
  listingAdminSave: boolean;
  listingModerate: boolean;
  generalAdminAudit: boolean;
  adminNotifications: boolean;
  taxonomy: boolean;
  accountDeletion: boolean;
};

type PlatformHealthRpc = {
  checkedAt: string;
  database: {
    latestMigration: string;
    serverVersion: string;
  };
  counts: {
    profiles: number;
    mediaAssets: number;
    feedbackTargets: number;
    listings: number;
    organizations: number;
    venues: number;
    eventSeries: number;
    clubBrands: number;
    resorts: number;
    cruiseSeries: number;
    cruiseSailings: number;
  };
  capabilities: PlatformCapabilities;
};

export type PlatformHealthSnapshot = {
  checkedAt: string;
  localMigration: typeof schemaVersion;
  remoteMigration: string;
  databaseVersion: string;
  migrationMatches: boolean;
  items: PlatformHealthItem[];
  counts: PlatformHealthRpc['counts'];
};

const all = (...values: boolean[]) => values.every(Boolean);
const any = (...values: boolean[]) => values.some(Boolean);

const buildItems = (health: PlatformHealthRpc): PlatformHealthItem[] => {
  const c = health.capabilities;
  const remote = health.database.latestMigration || 'unknown';
  const local = schemaVersion.version || 'unknown';
  const migrationMatches = remote === local;
  const remoteBehind = Boolean(remote !== 'unknown' && local !== 'unknown' && remote < local);
  const cloudflareDeliveryConfigured = Boolean(
    import.meta.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH
      || import.meta.env.VITE_CLOUDFLARE_IMAGES_ACCOUNT_HASH,
  );

  const listingOperational = all(
    c.listingStore,
    c.publicListingRead,
    c.myListingRead,
    c.adminListingRead,
    c.listingSubmit,
    c.listingAdminSave,
    c.listingModerate,
  );

  return [
    {
      key: 'database',
      title: 'Supabase database & authentication',
      status: c.profiles ? 'Operational' : 'Degraded',
      description: c.profiles
        ? 'Supabase is reachable and the authenticated profile system is available.'
        : 'The platform-health probe succeeded, but the profile system is unavailable.',
      detail: `${health.counts.profiles} profile${health.counts.profiles === 1 ? '' : 's'} · PostgreSQL ${health.database.serverVersion}`,
    },
    {
      key: 'migration-drift',
      title: 'Migration / deployment sync',
      status: migrationMatches ? 'Operational' : remoteBehind ? 'Pending deploy' : 'Degraded',
      description: migrationMatches
        ? 'The newest migration in this checkout exactly matches the newest migration recorded by production Supabase.'
        : remoteBehind
          ? 'This checkout contains database migrations that production Supabase has not applied yet.'
          : 'Production and this checkout report different migration heads. Reconcile before additional schema work.',
      detail: `Local ${local} · Production ${remote}`,
      nextStep: migrationMatches ? undefined : 'Run a migration dry-run, review the pending chain, then deploy in order.',
    },
    {
      key: 'user-admin',
      title: 'User, badge & profile administration',
      status: all(c.adminUserProjection, c.adminUserBadges, c.adminPrivateProfilePreview)
        ? c.adminUserMutation ? 'Operational' : 'Partial'
        : any(c.adminUserProjection, c.adminUserBadges, c.adminPrivateProfilePreview) ? 'Partial' : 'Not connected',
      description: all(c.adminUserProjection, c.adminUserBadges, c.adminPrivateProfilePreview)
        ? c.adminUserMutation
          ? 'Privileged member reads, badge management, private-profile preview, and account mutations are backed by protected Supabase RPCs.'
          : 'Privileged member reads, badge management, and private-profile preview are live. Role/suspension/deletion mutations are still intentionally read-only.'
        : 'Only part of the privileged member administration backend is available.',
      nextStep: c.adminUserMutation ? undefined : 'Add protected role/status mutation RPCs with confirmation and persistent audit records.',
    },
    {
      key: 'listings',
      title: 'Listings & submission moderation',
      status: listingOperational
        ? c.listingLegacyImportComplete ? 'Operational' : 'Operational · Action needed'
        : c.listingStore ? 'Partial' : 'Local only',
      description: listingOperational
        ? c.listingLegacyImportComplete
          ? 'Public discovery reads, member submissions, admin editing, and moderation are backed by Supabase with raw submission payloads kept private.'
          : 'The Supabase listing/submission pipeline is live, but the existing legacy catalog still needs its one-time production backfill.'
        : c.listingStore
          ? 'The canonical listing store exists, but one or more read/write/moderation endpoints are missing.'
          : 'Listings and submissions are still backed by the bundled/local development catalog.',
      detail: c.listingStore ? `${health.counts.listings} active Supabase listing${health.counts.listings === 1 ? '' : 's'}` : undefined,
      nextStep: listingOperational
        ? c.listingLegacyImportComplete ? undefined : 'Open the local admin build once while signed in as an active admin; the raw legacy catalog backfills idempotently into Supabase.'
        : 'Complete the canonical Supabase listing store and retire local persistence for production writes.',
    },
    {
      key: 'entity-catalog',
      title: 'Organizations, venues, brands, series & travel',
      status: all(
        c.organizations,
        c.organizationMembers,
        c.venues,
        c.organizationVenueRelationships,
        c.eventSeries,
        c.clubBrands,
        c.resorts,
        c.cruiseSeries,
        c.cruiseSailings,
      ) ? 'Operational' : any(
        c.organizations,
        c.venues,
        c.eventSeries,
        c.clubBrands,
        c.resorts,
        c.cruiseSeries,
        c.cruiseSailings,
      ) ? 'Partial' : 'Not connected',
      description: all(
        c.organizations,
        c.organizationMembers,
        c.venues,
        c.organizationVenueRelationships,
        c.eventSeries,
        c.clubBrands,
        c.resorts,
        c.cruiseSeries,
        c.cruiseSailings,
      )
        ? 'Promoters/hosts, venues, organization relationships, recurring event brands, club brands, resorts, and cruise entities use canonical Supabase tables with RLS-backed administration.'
        : 'Only part of the durable entity catalog is available in Supabase.',
      detail: `${health.counts.organizations} organizations · ${health.counts.venues} venues · ${health.counts.eventSeries} event series · ${health.counts.clubBrands} club brands · ${health.counts.resorts} resorts · ${health.counts.cruiseSeries} cruise series · ${health.counts.cruiseSailings} sailings`,
    },
    {
      key: 'moderation-audit',
      title: 'Audit logging',
      status: c.generalAdminAudit ? 'Operational' : c.listingModerationHistory ? 'Partial' : 'Not connected',
      description: c.generalAdminAudit
        ? 'A persistent general administrative audit trail is installed.'
        : c.listingModerationHistory
          ? 'Listing moderation actions are persisted, but a platform-wide append-only admin audit log is not installed yet.'
          : 'No persistent production administrative audit trail is installed.',
      nextStep: c.generalAdminAudit ? undefined : 'Add a general append-only admin audit log for privileged changes outside listing moderation.',
    },
    {
      key: 'feedback',
      title: 'Feedback & reviews',
      status: all(c.feedbackTargets, c.feedbackRegistration) ? 'Operational' : 'Degraded',
      description: all(c.feedbackTargets, c.feedbackRegistration)
        ? 'Feedback targets and target registration are backed by Supabase.'
        : 'The feedback backend is missing a required target or registration capability.',
      detail: `${health.counts.feedbackTargets} registered feedback target${health.counts.feedbackTargets === 1 ? '' : 's'}`,
    },
    {
      key: 'privacy',
      title: 'Profile privacy & member relationships',
      status: all(c.profilePrivacy, c.savedRelationships) ? 'Operational' : any(c.profilePrivacy, c.savedRelationships) ? 'Partial' : 'Not connected',
      description: all(c.profilePrivacy, c.savedRelationships)
        ? 'Private-by-default profile visibility and saved member relationships are installed in Supabase.'
        : 'Only part of the profile privacy/relationship schema is available.',
    },
    {
      key: 'claims-analytics',
      title: 'Listing claims & outbound analytics',
      status: all(c.listingClaims, c.outboundAnalytics) ? 'Operational' : any(c.listingClaims, c.outboundAnalytics) ? 'Partial' : 'Not connected',
      description: all(c.listingClaims, c.outboundAnalytics)
        ? 'Ownership-claim workflow storage and privacy-conscious outbound click analytics are installed.'
        : 'Only part of the claims/analytics backend is available.',
    },
    {
      key: 'badges',
      title: 'Badges & achievements',
      status: c.badges ? 'Operational' : 'Not connected',
      description: c.badges
        ? 'Badge definitions, member awards, founder numbering, and protected admin badge operations are installed.'
        : 'The badge system schema is unavailable.',
    },
    {
      key: 'media',
      title: 'Cloudflare Images & media metadata',
      status: c.mediaAssets && cloudflareDeliveryConfigured ? 'Operational' : c.mediaAssets ? 'Operational · Action needed' : 'Degraded',
      description: c.mediaAssets && cloudflareDeliveryConfigured
        ? 'Supabase media ownership records and Cloudflare image delivery configuration are present.'
        : c.mediaAssets
          ? 'Media metadata exists in Supabase, but this frontend build does not expose a Cloudflare delivery account hash.'
          : 'The production media metadata store is unavailable.',
      detail: `${health.counts.mediaAssets} media asset record${health.counts.mediaAssets === 1 ? '' : 's'}`,
      nextStep: c.mediaAssets && cloudflareDeliveryConfigured ? 'Finish abandoned-upload and account-deletion lifecycle cleanup.' : undefined,
    },
    {
      key: 'taxonomy',
      title: 'Tags & filter taxonomy',
      status: c.taxonomy ? 'Operational' : 'Local only',
      description: c.taxonomy
        ? 'Canonical tag and category tables are installed.'
        : 'The interface taxonomy still comes from local application data rather than production database tables.',
      nextStep: c.taxonomy ? undefined : 'Create canonical tag/category tables before enabling production taxonomy edits.',
    },
    {
      key: 'notifications',
      title: 'Administrative notifications',
      status: c.adminNotifications ? 'Operational' : 'Not connected',
      description: c.adminNotifications
        ? 'Administrative notification preferences/events have production persistence.'
        : 'Submission and moderation alerts are not stored or delivered yet.',
      nextStep: c.adminNotifications ? undefined : 'Choose notification events, recipients, provider, and opt-out rules before enabling alerts.',
    },
    {
      key: 'account-deletion',
      title: 'Account deletion',
      status: c.accountDeletion ? 'Operational' : 'Not connected',
      description: c.accountDeletion
        ? 'A controlled account-deletion workflow is installed.'
        : 'Automated secure account deletion is not connected yet.',
      nextStep: c.accountDeletion ? undefined : 'Implement reauthentication, deletion receipts, data cleanup, and listing-attribution detachment.',
    },
  ];
};

export const getPlatformHealth = async (): Promise<PlatformHealthSnapshot> => {
  const { data, error } = await supabase.rpc('admin_platform_health');
  if (error) throw error;
  const health = data as PlatformHealthRpc;
  return {
    checkedAt: health.checkedAt,
    localMigration: schemaVersion,
    remoteMigration: health.database.latestMigration,
    databaseVersion: health.database.serverVersion,
    migrationMatches: health.database.latestMigration === schemaVersion.version,
    items: buildItems(health),
    counts: health.counts,
  };
};
