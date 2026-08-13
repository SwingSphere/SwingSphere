# Supabase Data Skill

Use this skill for Supabase schema work, migrations, authentication, storage, row-level security, moderation, submissions, listing relationships, media metadata, and host or promoter ownership.

## Workflow

1. Inspect existing migrations, schema consumers, queries, and generated or handwritten types.
2. Identify all affected roles: anonymous, authenticated user, submitter, owner, promoter, moderator, and admin.
3. Design the smallest additive schema or policy change.
4. Use a new migration; do not rewrite deployed migration history casually.
5. Update affected frontend types, queries, forms, and validation.
6. Verify both allowed and denied access paths.

## Data Rules

- never expose service-role credentials in browser code
- preserve row-level security and inspect policy interactions
- distinguish user-submitted informational content from owner- or promoter-managed official content
- preserve provenance, moderation status, ownership, and auditability
- avoid US-only assumptions in addresses, phone numbers, regions, and dates
- treat precise private-event locations and personal information as sensitive
- keep public discovery data separate from authenticated or privileged fields
- prefer explicit relationships and constraints over ambiguous free-text coupling
- consider deletion, ownership transfer, and moderation consequences

## Migration Rules

- use descriptive migration names
- make migrations safe for existing rows
- add defaults or backfills deliberately
- document destructive or irreversible operations
- inspect indexes for new filtering, geographic, ownership, and moderation queries
- update seed or fixture data only when it is part of the requested change

## Verification

Check:
- anonymous read behavior
- authenticated read and write behavior
- owner or promoter management behavior
- moderator and admin behavior
- storage bucket access when media is involved
- TypeScript consumers and nullability
- build output after meaningful changes

## Completion Criteria

- schema, policies, and application code agree
- privileged data is not exposed
- existing rows have a safe migration path
- official and informational content remain distinguishable
- untested production-data assumptions are disclosed
