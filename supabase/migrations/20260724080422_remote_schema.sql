drop extension if exists "pg_net";

create schema if not exists "private";

create type "public"."feedback_attendance_verification" as enum ('self_reported', 'linked_event', 'platform_confirmed');

create type "public"."feedback_safety_case_status" as enum ('new', 'triaged', 'investigating', 'resolved', 'closed');

create type "public"."feedback_sentiment" as enum ('positive', 'mixed', 'negative');

create type "public"."feedback_signal_polarity" as enum ('positive', 'improvement');

create type "public"."feedback_structured_status" as enum ('eligible', 'excluded', 'withdrawn');

create type "public"."feedback_target_record_status" as enum ('draft', 'active', 'archived');

create type "public"."feedback_target_type" as enum ('event', 'club', 'organization');

create type "public"."feedback_written_moderation_status" as enum ('none', 'pending', 'approved', 'rejected', 'needs_revision');

drop trigger if exists "organization_members_protect_last_owner" on "public"."organization_members";

drop policy "Owners can read their pending media assets" on "public"."media_assets";

drop policy "Public can read approved media assets" on "public"."media_assets";

drop policy "Authenticated users can create their own pending media assets" on "public"."media_assets";

drop policy "Members can read their memberships" on "public"."organization_members";

drop policy "Owners and admins can remove members" on "public"."organization_members";

drop policy "Owners managers and admins can add members" on "public"."organization_members";

drop policy "Owners managers and admins can update members" on "public"."organization_members";

drop policy "Admins can create organizations" on "public"."organizations";

drop policy "Organization team can update organizations" on "public"."organizations";

drop policy "Public can read active organizations" on "public"."organizations";

drop policy "Users can update their own safe profile fields" on "public"."profiles";

drop function if exists "public"."can_manage_organization"(check_organization_id text, allowed_roles public.organization_member_role[]);

drop function if exists "public"."is_active_admin"(check_user uuid);

drop function if exists "public"."organization_member_role_for"(check_organization_id text, check_user uuid);

drop function if exists "public"."protect_last_organization_owner"();


  create table "public"."feedback_moderation_actions" (
    "id" uuid not null default gen_random_uuid(),
    "subject_type" text not null,
    "written_revision_id" uuid,
    "safety_report_id" uuid,
    "feedback_submission_id" uuid,
    "action" text not null,
    "actor_user_id" uuid not null,
    "reason_code" text,
    "private_notes" text,
    "before_state" jsonb,
    "after_state" jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_moderation_actions" enable row level security;


  create table "public"."feedback_safety_reports" (
    "id" uuid not null default gen_random_uuid(),
    "reporter_user_id" uuid not null,
    "event_id" text,
    "club_id" text,
    "organization_id" text,
    "related_event_id" text,
    "related_venue_id" text,
    "category" text not null,
    "narrative" text not null,
    "evidence" jsonb not null default '[]'::jsonb,
    "case_status" public.feedback_safety_case_status not null default 'new'::public.feedback_safety_case_status,
    "assigned_to" uuid,
    "escalation_level" smallint not null default 0,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_safety_reports" enable row level security;


  create table "public"."feedback_signal_applicability" (
    "registry_version" integer not null,
    "signal_id" text not null,
    "target_type" public.feedback_target_type not null,
    "polarity" public.feedback_signal_polarity not null
      );


alter table "public"."feedback_signal_applicability" enable row level security;


  create table "public"."feedback_signal_registry_versions" (
    "version" integer not null,
    "is_active" boolean not null default false,
    "aggregate_threshold" integer not null default 10,
    "created_at" timestamp with time zone not null default now(),
    "retired_at" timestamp with time zone
      );


alter table "public"."feedback_signal_registry_versions" enable row level security;


  create table "public"."feedback_signal_selections" (
    "feedback_submission_id" uuid not null,
    "signal_id" text not null,
    "polarity" public.feedback_signal_polarity not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_signal_selections" enable row level security;


  create table "public"."feedback_signals" (
    "registry_version" integer not null,
    "signal_id" text not null,
    "label" text not null,
    "description" text,
    "sort_order" integer not null default 0
      );


alter table "public"."feedback_signals" enable row level security;


  create table "public"."feedback_submissions" (
    "id" uuid not null default gen_random_uuid(),
    "author_user_id" uuid not null,
    "event_id" text,
    "club_id" text,
    "organization_id" text,
    "related_event_id" text,
    "related_venue_id" text,
    "overall_sentiment" public.feedback_sentiment not null,
    "experience_scope" text not null,
    "visit_date" date,
    "attendance_count_range" text,
    "attendance_verification" public.feedback_attendance_verification not null default 'self_reported'::public.feedback_attendance_verification,
    "structured_status" public.feedback_structured_status not null default 'eligible'::public.feedback_structured_status,
    "withdrawn_at" timestamp with time zone,
    "signal_registry_version" integer not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_submissions" enable row level security;


  create table "public"."feedback_target_clubs" (
    "id" text not null,
    "organization_id" text,
    "primary_venue_id" text,
    "name" text not null,
    "source_ref" text,
    "status" public.feedback_target_record_status not null default 'active'::public.feedback_target_record_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_target_clubs" enable row level security;


  create table "public"."feedback_target_events" (
    "id" text not null,
    "club_id" text,
    "organization_id" text,
    "venue_id" text,
    "name" text not null,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "source_ref" text,
    "status" public.feedback_target_record_status not null default 'active'::public.feedback_target_record_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_target_events" enable row level security;


  create table "public"."feedback_target_venues" (
    "id" text not null,
    "name" text not null,
    "source_ref" text,
    "status" public.feedback_target_record_status not null default 'active'::public.feedback_target_record_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_target_venues" enable row level security;


  create table "public"."feedback_written_experiences" (
    "feedback_submission_id" uuid not null,
    "current_revision_id" uuid,
    "approved_revision_id" uuid,
    "current_draft_text" text,
    "approved_text" text,
    "moderation_status" public.feedback_written_moderation_status not null default 'none'::public.feedback_written_moderation_status,
    "submitted_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "moderation_reason_code" text,
    "moderated_by" uuid,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."feedback_written_experiences" enable row level security;


  create table "public"."feedback_written_revisions" (
    "id" uuid not null default gen_random_uuid(),
    "feedback_submission_id" uuid not null,
    "revision_number" integer not null,
    "text_content" text not null,
    "submitted_by" uuid not null,
    "submitted_at" timestamp with time zone not null default now(),
    "moderation_status" public.feedback_written_moderation_status not null default 'pending'::public.feedback_written_moderation_status,
    "moderated_by" uuid,
    "moderated_at" timestamp with time zone,
    "reason_code" text,
    "private_notes" text
      );


alter table "public"."feedback_written_revisions" enable row level security;

CREATE UNIQUE INDEX feedback_moderation_actions_pkey ON public.feedback_moderation_actions USING btree (id);

CREATE INDEX feedback_moderation_revision_idx ON public.feedback_moderation_actions USING btree (written_revision_id, created_at) WHERE (written_revision_id IS NOT NULL);

CREATE INDEX feedback_moderation_safety_idx ON public.feedback_moderation_actions USING btree (safety_report_id, created_at) WHERE (safety_report_id IS NOT NULL);

CREATE UNIQUE INDEX feedback_one_active_registry_idx ON public.feedback_signal_registry_versions USING btree (is_active) WHERE is_active;

CREATE UNIQUE INDEX feedback_one_club_visit_lifecycle_idx ON public.feedback_submissions USING btree (author_user_id, club_id, visit_date) WHERE (club_id IS NOT NULL);

CREATE UNIQUE INDEX feedback_one_event_lifecycle_idx ON public.feedback_submissions USING btree (author_user_id, event_id) WHERE (event_id IS NOT NULL);

CREATE UNIQUE INDEX feedback_one_org_lifecycle_idx ON public.feedback_submissions USING btree (author_user_id, organization_id) WHERE (organization_id IS NOT NULL);

CREATE INDEX feedback_safety_reporter_idx ON public.feedback_safety_reports USING btree (reporter_user_id, created_at DESC);

CREATE UNIQUE INDEX feedback_safety_reports_pkey ON public.feedback_safety_reports USING btree (id);

CREATE INDEX feedback_safety_status_idx ON public.feedback_safety_reports USING btree (case_status, created_at);

CREATE UNIQUE INDEX feedback_signal_applicability_pkey ON public.feedback_signal_applicability USING btree (registry_version, signal_id, target_type, polarity);

CREATE UNIQUE INDEX feedback_signal_registry_versions_pkey ON public.feedback_signal_registry_versions USING btree (version);

CREATE INDEX feedback_signal_selection_idx ON public.feedback_signal_selections USING btree (signal_id, polarity);

CREATE UNIQUE INDEX feedback_signal_selections_pkey ON public.feedback_signal_selections USING btree (feedback_submission_id, signal_id, polarity);

CREATE UNIQUE INDEX feedback_signals_pkey ON public.feedback_signals USING btree (registry_version, signal_id);

CREATE INDEX feedback_submissions_author_idx ON public.feedback_submissions USING btree (author_user_id, created_at DESC);

CREATE INDEX feedback_submissions_club_idx ON public.feedback_submissions USING btree (club_id, structured_status, signal_registry_version) WHERE (club_id IS NOT NULL);

CREATE INDEX feedback_submissions_event_idx ON public.feedback_submissions USING btree (event_id, structured_status, signal_registry_version) WHERE (event_id IS NOT NULL);

CREATE INDEX feedback_submissions_org_idx ON public.feedback_submissions USING btree (organization_id, structured_status, signal_registry_version) WHERE (organization_id IS NOT NULL);

CREATE UNIQUE INDEX feedback_submissions_pkey ON public.feedback_submissions USING btree (id);

CREATE UNIQUE INDEX feedback_target_clubs_pkey ON public.feedback_target_clubs USING btree (id);

CREATE UNIQUE INDEX feedback_target_clubs_source_ref_key ON public.feedback_target_clubs USING btree (source_ref);

CREATE UNIQUE INDEX feedback_target_events_pkey ON public.feedback_target_events USING btree (id);

CREATE UNIQUE INDEX feedback_target_events_source_ref_key ON public.feedback_target_events USING btree (source_ref);

CREATE UNIQUE INDEX feedback_target_venues_pkey ON public.feedback_target_venues USING btree (id);

CREATE UNIQUE INDEX feedback_target_venues_source_ref_key ON public.feedback_target_venues USING btree (source_ref);

CREATE UNIQUE INDEX feedback_written_experiences_pkey ON public.feedback_written_experiences USING btree (feedback_submission_id);

CREATE UNIQUE INDEX feedback_written_revisions_feedback_submission_id_revision__key ON public.feedback_written_revisions USING btree (feedback_submission_id, revision_number);

CREATE INDEX feedback_written_revisions_idx ON public.feedback_written_revisions USING btree (feedback_submission_id, revision_number DESC);

CREATE UNIQUE INDEX feedback_written_revisions_pkey ON public.feedback_written_revisions USING btree (id);

CREATE INDEX organization_members_invited_by_idx ON public.organization_members USING btree (invited_by);

CREATE INDEX organizations_created_by_idx ON public.organizations USING btree (created_by);

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_pkey" PRIMARY KEY using index "feedback_moderation_actions_pkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_pkey" PRIMARY KEY using index "feedback_safety_reports_pkey";

alter table "public"."feedback_signal_applicability" add constraint "feedback_signal_applicability_pkey" PRIMARY KEY using index "feedback_signal_applicability_pkey";

alter table "public"."feedback_signal_registry_versions" add constraint "feedback_signal_registry_versions_pkey" PRIMARY KEY using index "feedback_signal_registry_versions_pkey";

alter table "public"."feedback_signal_selections" add constraint "feedback_signal_selections_pkey" PRIMARY KEY using index "feedback_signal_selections_pkey";

alter table "public"."feedback_signals" add constraint "feedback_signals_pkey" PRIMARY KEY using index "feedback_signals_pkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_pkey" PRIMARY KEY using index "feedback_submissions_pkey";

alter table "public"."feedback_target_clubs" add constraint "feedback_target_clubs_pkey" PRIMARY KEY using index "feedback_target_clubs_pkey";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_pkey" PRIMARY KEY using index "feedback_target_events_pkey";

alter table "public"."feedback_target_venues" add constraint "feedback_target_venues_pkey" PRIMARY KEY using index "feedback_target_venues_pkey";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_pkey" PRIMARY KEY using index "feedback_written_experiences_pkey";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_pkey" PRIMARY KEY using index "feedback_written_revisions_pkey";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_action_check" CHECK ((action = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'needs_revision'::text, 'excluded'::text, 'restored_eligible'::text, 'triaged'::text, 'assigned'::text, 'escalated'::text, 'resolved'::text, 'closed'::text]))) not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_action_check";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_actor_user_id_fkey";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_check" CHECK ((((subject_type = 'written_revision'::text) AND (written_revision_id IS NOT NULL) AND (safety_report_id IS NULL)) OR ((subject_type = 'safety_report'::text) AND (safety_report_id IS NOT NULL) AND (written_revision_id IS NULL)) OR ((subject_type = 'structured_submission'::text) AND (feedback_submission_id IS NOT NULL) AND (written_revision_id IS NULL) AND (safety_report_id IS NULL)))) not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_check";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_feedback_submission_id_fkey" FOREIGN KEY (feedback_submission_id) REFERENCES public.feedback_submissions(id) ON DELETE RESTRICT not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_feedback_submission_id_fkey";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_safety_report_id_fkey" FOREIGN KEY (safety_report_id) REFERENCES public.feedback_safety_reports(id) ON DELETE RESTRICT not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_safety_report_id_fkey";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_subject_type_check" CHECK ((subject_type = ANY (ARRAY['written_revision'::text, 'safety_report'::text, 'structured_submission'::text]))) not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_subject_type_check";

alter table "public"."feedback_moderation_actions" add constraint "feedback_moderation_actions_written_revision_id_fkey" FOREIGN KEY (written_revision_id) REFERENCES public.feedback_written_revisions(id) ON DELETE RESTRICT not valid;

alter table "public"."feedback_moderation_actions" validate constraint "feedback_moderation_actions_written_revision_id_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_assigned_to_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_category_check" CHECK (((char_length(btrim(category)) >= 2) AND (char_length(btrim(category)) <= 80))) not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_category_check";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_check" CHECK ((num_nonnulls(event_id, club_id, organization_id) = 1)) not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_check";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_check1" CHECK (((case_status = ANY (ARRAY['resolved'::public.feedback_safety_case_status, 'closed'::public.feedback_safety_case_status])) = (resolved_at IS NOT NULL))) not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_check1";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.feedback_target_clubs(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_club_id_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_escalation_level_check" CHECK (((escalation_level >= 0) AND (escalation_level <= 5))) not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_escalation_level_check";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.feedback_target_events(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_event_id_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_evidence_check" CHECK ((jsonb_typeof(evidence) = ANY (ARRAY['array'::text, 'object'::text]))) not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_evidence_check";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_narrative_check" CHECK (((char_length(btrim(narrative)) >= 10) AND (char_length(btrim(narrative)) <= 10000))) not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_narrative_check";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_organization_id_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_related_event_id_fkey" FOREIGN KEY (related_event_id) REFERENCES public.feedback_target_events(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_related_event_id_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_related_venue_id_fkey" FOREIGN KEY (related_venue_id) REFERENCES public.feedback_target_venues(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_related_venue_id_fkey";

alter table "public"."feedback_safety_reports" add constraint "feedback_safety_reports_reporter_user_id_fkey" FOREIGN KEY (reporter_user_id) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_safety_reports" validate constraint "feedback_safety_reports_reporter_user_id_fkey";

alter table "public"."feedback_signal_applicability" add constraint "feedback_signal_applicability_registry_version_signal_id_fkey" FOREIGN KEY (registry_version, signal_id) REFERENCES public.feedback_signals(registry_version, signal_id) ON DELETE CASCADE not valid;

alter table "public"."feedback_signal_applicability" validate constraint "feedback_signal_applicability_registry_version_signal_id_fkey";

alter table "public"."feedback_signal_registry_versions" add constraint "feedback_signal_registry_versions_aggregate_threshold_check" CHECK (((aggregate_threshold >= 3) AND (aggregate_threshold <= 1000))) not valid;

alter table "public"."feedback_signal_registry_versions" validate constraint "feedback_signal_registry_versions_aggregate_threshold_check";

alter table "public"."feedback_signal_registry_versions" add constraint "feedback_signal_registry_versions_check" CHECK (((is_active AND (retired_at IS NULL)) OR (NOT is_active))) not valid;

alter table "public"."feedback_signal_registry_versions" validate constraint "feedback_signal_registry_versions_check";

alter table "public"."feedback_signal_registry_versions" add constraint "feedback_signal_registry_versions_version_check" CHECK ((version > 0)) not valid;

alter table "public"."feedback_signal_registry_versions" validate constraint "feedback_signal_registry_versions_version_check";

alter table "public"."feedback_signal_selections" add constraint "feedback_signal_selections_feedback_submission_id_fkey" FOREIGN KEY (feedback_submission_id) REFERENCES public.feedback_submissions(id) ON DELETE CASCADE not valid;

alter table "public"."feedback_signal_selections" validate constraint "feedback_signal_selections_feedback_submission_id_fkey";

alter table "public"."feedback_signals" add constraint "feedback_signals_label_check" CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 120))) not valid;

alter table "public"."feedback_signals" validate constraint "feedback_signals_label_check";

alter table "public"."feedback_signals" add constraint "feedback_signals_registry_version_fkey" FOREIGN KEY (registry_version) REFERENCES public.feedback_signal_registry_versions(version) ON DELETE RESTRICT not valid;

alter table "public"."feedback_signals" validate constraint "feedback_signals_registry_version_fkey";

alter table "public"."feedback_signals" add constraint "feedback_signals_signal_id_check" CHECK ((signal_id ~ '^[a-z0-9][a-z0-9._-]{1,79}$'::text)) not valid;

alter table "public"."feedback_signals" validate constraint "feedback_signals_signal_id_check";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_attendance_count_range_check" CHECK (((attendance_count_range IS NULL) OR ((char_length(btrim(attendance_count_range)) >= 1) AND (char_length(btrim(attendance_count_range)) <= 40)))) not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_attendance_count_range_check";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_author_user_id_fkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_check" CHECK ((num_nonnulls(event_id, club_id, organization_id) = 1)) not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_check";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_check1" CHECK (((event_id IS NULL) OR (related_event_id = event_id))) not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_check1";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_check2" CHECK (((club_id IS NULL) OR (visit_date IS NOT NULL))) not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_check2";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_check3" CHECK ((((structured_status = 'withdrawn'::public.feedback_structured_status) AND (withdrawn_at IS NOT NULL)) OR ((structured_status <> 'withdrawn'::public.feedback_structured_status) AND (withdrawn_at IS NULL)))) not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_check3";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.feedback_target_clubs(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_club_id_fkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.feedback_target_events(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_event_id_fkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_experience_scope_check" CHECK (((char_length(btrim(experience_scope)) >= 1) AND (char_length(btrim(experience_scope)) <= 80))) not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_experience_scope_check";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_organization_id_fkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_related_event_id_fkey" FOREIGN KEY (related_event_id) REFERENCES public.feedback_target_events(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_related_event_id_fkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_related_venue_id_fkey" FOREIGN KEY (related_venue_id) REFERENCES public.feedback_target_venues(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_related_venue_id_fkey";

alter table "public"."feedback_submissions" add constraint "feedback_submissions_signal_registry_version_fkey" FOREIGN KEY (signal_registry_version) REFERENCES public.feedback_signal_registry_versions(version) ON DELETE RESTRICT not valid;

alter table "public"."feedback_submissions" validate constraint "feedback_submissions_signal_registry_version_fkey";

alter table "public"."feedback_target_clubs" add constraint "feedback_target_clubs_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 160))) not valid;

alter table "public"."feedback_target_clubs" validate constraint "feedback_target_clubs_name_check";

alter table "public"."feedback_target_clubs" add constraint "feedback_target_clubs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_target_clubs" validate constraint "feedback_target_clubs_organization_id_fkey";

alter table "public"."feedback_target_clubs" add constraint "feedback_target_clubs_primary_venue_id_fkey" FOREIGN KEY (primary_venue_id) REFERENCES public.feedback_target_venues(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_target_clubs" validate constraint "feedback_target_clubs_primary_venue_id_fkey";

alter table "public"."feedback_target_clubs" add constraint "feedback_target_clubs_source_ref_key" UNIQUE using index "feedback_target_clubs_source_ref_key";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_check" CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))) not valid;

alter table "public"."feedback_target_events" validate constraint "feedback_target_events_check";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_club_id_fkey" FOREIGN KEY (club_id) REFERENCES public.feedback_target_clubs(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_target_events" validate constraint "feedback_target_events_club_id_fkey";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 200))) not valid;

alter table "public"."feedback_target_events" validate constraint "feedback_target_events_name_check";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_target_events" validate constraint "feedback_target_events_organization_id_fkey";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_source_ref_key" UNIQUE using index "feedback_target_events_source_ref_key";

alter table "public"."feedback_target_events" add constraint "feedback_target_events_venue_id_fkey" FOREIGN KEY (venue_id) REFERENCES public.feedback_target_venues(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."feedback_target_events" validate constraint "feedback_target_events_venue_id_fkey";

alter table "public"."feedback_target_venues" add constraint "feedback_target_venues_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 160))) not valid;

alter table "public"."feedback_target_venues" validate constraint "feedback_target_venues_name_check";

alter table "public"."feedback_target_venues" add constraint "feedback_target_venues_source_ref_key" UNIQUE using index "feedback_target_venues_source_ref_key";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_approved_revision_id_fkey" FOREIGN KEY (approved_revision_id) REFERENCES public.feedback_written_revisions(id) ON DELETE RESTRICT not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_approved_revision_id_fkey";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_check" CHECK (((current_revision_id IS NULL) = (current_draft_text IS NULL))) not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_check";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_check1" CHECK (((approved_revision_id IS NULL) = (approved_text IS NULL))) not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_check1";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_check2" CHECK (((moderation_status <> 'none'::public.feedback_written_moderation_status) OR (current_revision_id IS NULL))) not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_check2";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_current_revision_id_fkey" FOREIGN KEY (current_revision_id) REFERENCES public.feedback_written_revisions(id) ON DELETE RESTRICT not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_current_revision_id_fkey";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_feedback_submission_id_fkey" FOREIGN KEY (feedback_submission_id) REFERENCES public.feedback_submissions(id) ON DELETE CASCADE not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_feedback_submission_id_fkey";

alter table "public"."feedback_written_experiences" add constraint "feedback_written_experiences_moderated_by_fkey" FOREIGN KEY (moderated_by) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_written_experiences" validate constraint "feedback_written_experiences_moderated_by_fkey";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_check" CHECK ((((moderation_status = 'pending'::public.feedback_written_moderation_status) AND (moderated_by IS NULL) AND (moderated_at IS NULL)) OR ((moderation_status = ANY (ARRAY['approved'::public.feedback_written_moderation_status, 'rejected'::public.feedback_written_moderation_status, 'needs_revision'::public.feedback_written_moderation_status])) AND (moderated_by IS NOT NULL) AND (moderated_at IS NOT NULL)))) not valid;

alter table "public"."feedback_written_revisions" validate constraint "feedback_written_revisions_check";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_feedback_submission_id_fkey" FOREIGN KEY (feedback_submission_id) REFERENCES public.feedback_submissions(id) ON DELETE CASCADE not valid;

alter table "public"."feedback_written_revisions" validate constraint "feedback_written_revisions_feedback_submission_id_fkey";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_feedback_submission_id_revision__key" UNIQUE using index "feedback_written_revisions_feedback_submission_id_revision__key";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_moderated_by_fkey" FOREIGN KEY (moderated_by) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_written_revisions" validate constraint "feedback_written_revisions_moderated_by_fkey";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_revision_number_check" CHECK ((revision_number > 0)) not valid;

alter table "public"."feedback_written_revisions" validate constraint "feedback_written_revisions_revision_number_check";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."feedback_written_revisions" validate constraint "feedback_written_revisions_submitted_by_fkey";

alter table "public"."feedback_written_revisions" add constraint "feedback_written_revisions_text_content_check" CHECK (((char_length(btrim(text_content)) >= 10) AND (char_length(btrim(text_content)) <= 5000))) not valid;

alter table "public"."feedback_written_revisions" validate constraint "feedback_written_revisions_text_content_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.can_manage_organization(check_organization_id text, allowed_roles public.organization_member_role[] DEFAULT ARRAY['owner'::public.organization_member_role, 'manager'::public.organization_member_role, 'editor'::public.organization_member_role])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_active_admin((select auth.uid()))
    or coalesce(
      private.organization_member_role_for(check_organization_id, (select auth.uid())) = any(allowed_roles),
      false
    );
$function$
;

CREATE OR REPLACE FUNCTION private.feedback_backend_self_test()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid;
  v_suffix text:=replace(gen_random_uuid()::text,'-','');
  v_venue text:='test-venue-'||v_suffix;
  v_club text:='test-club-'||v_suffix;
  v_event text:='test-event-'||v_suffix;
  v_signal text:='test-signal-'||left(v_suffix,12);
  v_submission uuid;
  v_result jsonb;
  v_duplicate_blocked boolean:=false;
begin
  if has_table_privilege('anon','public.feedback_submissions','insert') then raise exception 'anon unexpectedly has feedback insert'; end if;
  if has_table_privilege('authenticated','public.feedback_submissions','insert') then raise exception 'authenticated unexpectedly has direct feedback insert'; end if;
  if not has_function_privilege('authenticated','public.feedback_create_submission(public.feedback_target_type,text,public.feedback_sentiment,text,date,text,public.feedback_attendance_verification,text,text,integer,jsonb)','execute') then raise exception 'authenticated lacks create RPC'; end if;
  if has_function_privilege('anon','public.feedback_create_submission(public.feedback_target_type,text,public.feedback_sentiment,text,date,text,public.feedback_attendance_verification,text,text,integer,jsonb)','execute') then raise exception 'anon unexpectedly has create RPC'; end if;
  if not has_function_privilege('anon','public.feedback_aggregate(public.feedback_target_type,text)','execute') then raise exception 'anon lacks aggregate RPC'; end if;

  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then return jsonb_build_object('passed',true,'writeTests','skipped_no_profiles'); end if;

  insert into public.feedback_target_venues(id,name) values(v_venue,'Temporary test venue');
  insert into public.feedback_target_clubs(id,primary_venue_id,name) values(v_club,v_venue,'Temporary test club');
  insert into public.feedback_target_events(id,club_id,venue_id,name,starts_at) values(v_event,v_club,v_venue,'Temporary test event',now());
  insert into public.feedback_signals(registry_version,signal_id,label) values(1,v_signal,'Temporary test signal');
  insert into public.feedback_signal_applicability(registry_version,signal_id,target_type,polarity) values(1,v_signal,'event','positive');
  insert into public.feedback_submissions(author_user_id,event_id,related_event_id,overall_sentiment,experience_scope,attendance_verification,structured_status,signal_registry_version)
  values(v_user,v_event,v_event,'positive','event','self_reported','eligible',1) returning id into v_submission;
  insert into public.feedback_signal_selections(feedback_submission_id,signal_id,polarity) values(v_submission,v_signal,'positive');

  begin
    insert into public.feedback_submissions(author_user_id,event_id,related_event_id,overall_sentiment,experience_scope,attendance_verification,structured_status,signal_registry_version)
    values(v_user,v_event,v_event,'mixed','event','self_reported','eligible',1);
  exception when unique_violation then v_duplicate_blocked:=true;
  end;
  if not v_duplicate_blocked then raise exception 'event lifecycle uniqueness failed'; end if;

  v_result:=public.feedback_aggregate('event',v_event);
  if coalesce((v_result->>'meetsThreshold')::boolean,true) then raise exception 'aggregate threshold leaked a small cohort'; end if;
  if v_result ? 'submissionCount' or v_result ? 'signals' or v_result ? 'sentimentPercentages' then raise exception 'small cohort aggregate leaked metrics'; end if;

  delete from public.feedback_submissions where id=v_submission;
  delete from public.feedback_signal_applicability where registry_version=1 and signal_id=v_signal;
  delete from public.feedback_signals where registry_version=1 and signal_id=v_signal;
  delete from public.feedback_target_events where id=v_event;
  delete from public.feedback_target_clubs where id=v_club;
  delete from public.feedback_target_venues where id=v_venue;
  return jsonb_build_object('passed',true,'grants',true,'uniqueness',true,'aggregateThreshold',true,'cleanup',true);
exception when others then
  delete from public.feedback_submissions where id=v_submission;
  delete from public.feedback_signal_applicability where registry_version=1 and signal_id=v_signal;
  delete from public.feedback_signals where registry_version=1 and signal_id=v_signal;
  delete from public.feedback_target_events where id=v_event;
  delete from public.feedback_target_clubs where id=v_club;
  delete from public.feedback_target_venues where id=v_venue;
  raise;
end $function$
;

CREATE OR REPLACE FUNCTION private.feedback_is_staff(check_user uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select coalesce(auth.role()='service_role',false) or private.is_active_admin(check_user) $function$
;

CREATE OR REPLACE FUNCTION private.feedback_submission_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object(
'id',s.id,'authorUserId',s.author_user_id,'targetType',private.feedback_target_type_for(s),'targetId',coalesce(s.event_id,s.club_id,s.organization_id),
'relatedEventId',s.related_event_id,'relatedVenueId',s.related_venue_id,'overallSentiment',s.overall_sentiment,'experienceScope',s.experience_scope,
'visitDate',s.visit_date,'attendanceCountRange',s.attendance_count_range,'attendanceVerification',s.attendance_verification,
'structuredStatus',s.structured_status,'withdrawnAt',s.withdrawn_at,'signalRegistryVersion',s.signal_registry_version,
'signals',coalesce((select jsonb_agg(jsonb_build_object('signalId',x.signal_id,'polarity',x.polarity) order by x.signal_id,x.polarity) from public.feedback_signal_selections x where x.feedback_submission_id=s.id),'[]'::jsonb),
'writtenExperience',case when w.feedback_submission_id is null then null else jsonb_build_object('currentDraftText',w.current_draft_text,'approvedText',w.approved_text,'moderationStatus',w.moderation_status,'submittedAt',w.submitted_at,'approvedAt',w.approved_at,'hasPendingRevision',(w.current_revision_id is distinct from w.approved_revision_id and w.moderation_status in ('pending','rejected','needs_revision'))) end,
'createdAt',s.created_at,'updatedAt',s.updated_at)
from public.feedback_submissions s left join public.feedback_written_experiences w on w.feedback_submission_id=s.id where s.id=p_id
$function$
;

CREATE OR REPLACE FUNCTION private.feedback_target_type_for(s public.feedback_submissions)
 RETURNS public.feedback_target_type
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select case when s.event_id is not null then 'event'::public.feedback_target_type when s.club_id is not null then 'club'::public.feedback_target_type else 'organization'::public.feedback_target_type end $function$
;

CREATE OR REPLACE FUNCTION private.feedback_validate_signal(p_version integer, p_target public.feedback_target_type, p_signal text, p_polarity public.feedback_signal_polarity)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
  if not exists(select 1 from public.feedback_signal_applicability a where a.registry_version=p_version and a.signal_id=p_signal and a.target_type=p_target and a.polarity=p_polarity) then
    raise exception 'Signal is not applicable to this target/polarity' using errcode='23514';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION private.is_active_admin(check_user uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = check_user
      and role = 'admin'
      and status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION private.organization_member_role_for(check_organization_id text, check_user uuid DEFAULT auth.uid())
 RETURNS public.organization_member_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select role
  from public.organization_members
  where organization_id = check_organization_id
    and user_id = check_user
    and status = 'active'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION private.protect_last_organization_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  active_owner_count integer;
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    select count(*) into active_owner_count
    from public.organization_members
    where organization_id = old.organization_id
      and role = 'owner'
      and status = 'active'
      and id <> old.id;

    if active_owner_count = 0 then
      raise exception 'An organization must retain at least one active owner.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.feedback_aggregate(p_target_type public.feedback_target_type, p_target_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_n integer; v_t integer; v_v integer; begin
select version,aggregate_threshold into v_v,v_t from public.feedback_signal_registry_versions where is_active limit 1;
select count(*) into v_n from public.feedback_submissions s where s.structured_status='eligible' and s.signal_registry_version=v_v and ((p_target_type='event' and s.event_id=p_target_id) or (p_target_type='club' and s.club_id=p_target_id) or (p_target_type='organization' and s.organization_id=p_target_id));
if v_n<v_t then return jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'threshold',v_t,'meetsThreshold',false); end if;
return jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'threshold',v_t,'meetsThreshold',true,'submissionCount',v_n,
'sentimentPercentages',(select jsonb_object_agg(overall_sentiment,round(100.0*c/v_n,1)) from (select overall_sentiment,count(*) c from public.feedback_submissions s where s.structured_status='eligible' and s.signal_registry_version=v_v and ((p_target_type='event' and s.event_id=p_target_id) or (p_target_type='club' and s.club_id=p_target_id) or (p_target_type='organization' and s.organization_id=p_target_id)) group by overall_sentiment) q),
'signals',coalesce((select jsonb_agg(jsonb_build_object('signalId',signal_id,'polarity',polarity,'count',c) order by c desc,signal_id) from (select x.signal_id,x.polarity,count(*) c from public.feedback_signal_selections x join public.feedback_submissions s on s.id=x.feedback_submission_id where s.structured_status='eligible' and s.signal_registry_version=v_v and ((p_target_type='event' and s.event_id=p_target_id) or (p_target_type='club' and s.club_id=p_target_id) or (p_target_type='organization' and s.organization_id=p_target_id)) group by x.signal_id,x.polarity) q),'[]'::jsonb)); end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_create_safety_report(p_target_type public.feedback_target_type, p_target_id text, p_category text, p_narrative text, p_related_event_id text DEFAULT NULL::text, p_related_venue_id text DEFAULT NULL::text, p_evidence jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if auth.uid() is null then raise exception 'Authentication required'; end if;
if p_target_type='event' and not exists(select 1 from public.feedback_target_events where id=p_target_id) then raise exception 'Unknown event'; end if;
if p_target_type='club' and not exists(select 1 from public.feedback_target_clubs where id=p_target_id) then raise exception 'Unknown club'; end if;
if p_target_type='organization' and not exists(select 1 from public.organizations where id=p_target_id) then raise exception 'Unknown organization'; end if;
insert into public.feedback_safety_reports(reporter_user_id,event_id,club_id,organization_id,related_event_id,related_venue_id,category,narrative,evidence) values(auth.uid(),case when p_target_type='event' then p_target_id end,case when p_target_type='club' then p_target_id end,case when p_target_type='organization' then p_target_id end,p_related_event_id,p_related_venue_id,btrim(p_category),btrim(p_narrative),coalesce(p_evidence,'[]'::jsonb)) returning id into v_id; return v_id; end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_create_submission(p_target_type public.feedback_target_type, p_target_id text, p_overall_sentiment public.feedback_sentiment, p_experience_scope text, p_visit_date date DEFAULT NULL::date, p_attendance_count_range text DEFAULT NULL::text, p_attendance_verification public.feedback_attendance_verification DEFAULT 'self_reported'::public.feedback_attendance_verification, p_related_event_id text DEFAULT NULL::text, p_related_venue_id text DEFAULT NULL::text, p_signal_registry_version integer DEFAULT 1, p_signals jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_user uuid:=auth.uid(); v_id uuid; v_item jsonb; v_signal text; v_pol public.feedback_signal_polarity;
begin
if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
if p_attendance_verification='platform_confirmed' then raise exception 'platform_confirmed is server-controlled'; end if;
if not exists(select 1 from public.feedback_signal_registry_versions where version=p_signal_registry_version and is_active) then raise exception 'Unsupported registry version'; end if;
if jsonb_typeof(coalesce(p_signals,'[]'::jsonb))<>'array' then raise exception 'signals must be an array'; end if;
if p_target_type='event' and not exists(select 1 from public.feedback_target_events where id=p_target_id and status='active') then raise exception 'Unknown active event'; end if;
if p_target_type='club' and not exists(select 1 from public.feedback_target_clubs where id=p_target_id and status='active') then raise exception 'Unknown active club'; end if;
if p_target_type='organization' and not exists(select 1 from public.organizations where id=p_target_id and status in ('approved','active')) then raise exception 'Unknown active organization'; end if;
if p_attendance_verification='linked_event' and coalesce(p_related_event_id,case when p_target_type='event' then p_target_id end) is null then raise exception 'linked_event requires an event'; end if;
insert into public.feedback_submissions(author_user_id,event_id,club_id,organization_id,related_event_id,related_venue_id,overall_sentiment,experience_scope,visit_date,attendance_count_range,attendance_verification,structured_status,signal_registry_version)
values(v_user,case when p_target_type='event' then p_target_id end,case when p_target_type='club' then p_target_id end,case when p_target_type='organization' then p_target_id end,case when p_target_type='event' then p_target_id else p_related_event_id end,p_related_venue_id,p_overall_sentiment,btrim(p_experience_scope),p_visit_date,p_attendance_count_range,p_attendance_verification,'eligible',p_signal_registry_version) returning id into v_id;
for v_item in select value from jsonb_array_elements(coalesce(p_signals,'[]'::jsonb)) loop
 v_signal:=v_item->>'signalId'; v_pol:=(v_item->>'polarity')::public.feedback_signal_polarity;
 perform private.feedback_validate_signal(p_signal_registry_version,p_target_type,v_signal,v_pol);
 if exists(select 1 from public.feedback_signal_selections where feedback_submission_id=v_id and signal_id=v_signal and polarity<>v_pol) then raise exception 'Signal cannot use both polarities'; end if;
 insert into public.feedback_signal_selections(feedback_submission_id,signal_id,polarity) values(v_id,v_signal,v_pol);
end loop;
return private.feedback_submission_json(v_id); end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_get_submission_by_id(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.feedback_submission_json(s.id) from public.feedback_submissions s where s.id=p_submission_id and (s.author_user_id=auth.uid() or private.feedback_is_staff()) $function$
;

CREATE OR REPLACE FUNCTION public.feedback_get_user_submission(p_target_type public.feedback_target_type, p_target_id text, p_visit_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.feedback_submission_json(s.id) from public.feedback_submissions s where s.author_user_id=auth.uid() and ((p_target_type='event' and s.event_id=p_target_id) or (p_target_type='club' and s.club_id=p_target_id and s.visit_date=p_visit_date) or (p_target_type='organization' and s.organization_id=p_target_id)) limit 1 $function$
;

CREATE OR REPLACE FUNCTION public.feedback_list_approved_written(p_target_type public.feedback_target_type, p_target_id text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(feedback_submission_id uuid, approved_text text, approved_at timestamp with time zone, overall_sentiment public.feedback_sentiment, experience_scope text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select s.id,w.approved_text,w.approved_at,s.overall_sentiment,s.experience_scope from public.feedback_submissions s join public.feedback_written_experiences w on w.feedback_submission_id=s.id where s.structured_status<>'withdrawn' and w.approved_text is not null and ((p_target_type='event' and s.event_id=p_target_id) or (p_target_type='club' and s.club_id=p_target_id) or (p_target_type='organization' and s.organization_id=p_target_id)) order by w.approved_at desc limit least(greatest(p_limit,1),50) offset greatest(p_offset,0) $function$
;

CREATE OR REPLACE FUNCTION public.feedback_list_for_target(p_target_type public.feedback_target_type, p_target_id text)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select private.feedback_submission_json(s.id) from public.feedback_submissions s where (s.author_user_id=auth.uid() or private.feedback_is_staff()) and ((p_target_type='event' and s.event_id=p_target_id) or (p_target_type='club' and s.club_id=p_target_id) or (p_target_type='organization' and s.organization_id=p_target_id)) order by s.created_at desc $function$
;

CREATE OR REPLACE FUNCTION public.feedback_moderate_written_revision(p_revision_id uuid, p_status public.feedback_written_moderation_status, p_reason_code text DEFAULT NULL::text, p_private_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_r public.feedback_written_revisions%rowtype; begin if not private.feedback_is_staff() then raise exception 'Staff required'; end if; if p_status not in ('approved','rejected','needs_revision') then raise exception 'Invalid status'; end if; select * into v_r from public.feedback_written_revisions where id=p_revision_id for update; if not found or v_r.moderation_status<>'pending' then raise exception 'Invalid revision transition'; end if; if exists(select 1 from public.feedback_submissions where id=v_r.feedback_submission_id and structured_status='withdrawn') then raise exception 'Withdrawn feedback is terminal'; end if; update public.feedback_written_revisions set moderation_status=p_status,moderated_by=auth.uid(),moderated_at=now(),reason_code=p_reason_code,private_notes=p_private_notes where id=p_revision_id; update public.feedback_written_experiences set moderation_status=p_status,moderation_reason_code=p_reason_code,moderated_by=auth.uid(),approved_revision_id=case when p_status='approved' then p_revision_id else approved_revision_id end,approved_text=case when p_status='approved' then v_r.text_content else approved_text end,approved_at=case when p_status='approved' then now() else approved_at end where feedback_submission_id=v_r.feedback_submission_id; insert into public.feedback_moderation_actions(subject_type,written_revision_id,feedback_submission_id,action,actor_user_id,reason_code,private_notes) values('written_revision',p_revision_id,v_r.feedback_submission_id,p_status::text,auth.uid(),p_reason_code,p_private_notes); return private.feedback_submission_json(v_r.feedback_submission_id); end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_set_attendance_verification(p_submission_id uuid, p_verification public.feedback_attendance_verification)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
  if not private.feedback_is_staff() then raise exception 'Staff required'; end if;
  if exists(select 1 from public.feedback_submissions where id=p_submission_id and structured_status='withdrawn') then raise exception 'Withdrawn feedback is terminal'; end if;
  update public.feedback_submissions set attendance_verification=p_verification where id=p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
  return private.feedback_submission_json(p_submission_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_set_structured_status(p_submission_id uuid, p_status public.feedback_structured_status, p_reason_code text DEFAULT NULL::text, p_private_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_old public.feedback_submissions%rowtype; begin if not private.feedback_is_staff() then raise exception 'Staff required'; end if; if p_status='withdrawn' then raise exception 'Use author withdrawal RPC'; end if; select * into v_old from public.feedback_submissions where id=p_submission_id for update; if not found or v_old.structured_status='withdrawn' then raise exception 'Invalid transition'; end if; update public.feedback_submissions set structured_status=p_status where id=p_submission_id; insert into public.feedback_moderation_actions(subject_type,feedback_submission_id,action,actor_user_id,reason_code,private_notes,before_state,after_state) values('structured_submission',p_submission_id,case when p_status='excluded' then 'excluded' else 'restored_eligible' end,auth.uid(),p_reason_code,p_private_notes,to_jsonb(v_old),jsonb_build_object('structured_status',p_status)); return private.feedback_submission_json(p_submission_id); end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_submit_written_revision(p_submission_id uuid, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_user uuid:=auth.uid(); v_num integer; v_rev uuid;
begin
if not exists(select 1 from public.feedback_submissions where id=p_submission_id and author_user_id=v_user and structured_status<>'withdrawn') then raise exception 'Active submission not found'; end if;
select coalesce(max(revision_number),0)+1 into v_num from public.feedback_written_revisions where feedback_submission_id=p_submission_id;
insert into public.feedback_written_revisions(feedback_submission_id,revision_number,text_content,submitted_by) values(p_submission_id,v_num,btrim(p_text),v_user) returning id into v_rev;
insert into public.feedback_written_experiences(feedback_submission_id,current_revision_id,current_draft_text,moderation_status,submitted_at) values(p_submission_id,v_rev,btrim(p_text),'pending',now()) on conflict(feedback_submission_id) do update set current_revision_id=excluded.current_revision_id,current_draft_text=excluded.current_draft_text,moderation_status='pending',submitted_at=excluded.submitted_at,moderation_reason_code=null,moderated_by=null;
return private.feedback_submission_json(p_submission_id); end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_update_safety_case(p_report_id uuid, p_status public.feedback_safety_case_status, p_assigned_to uuid DEFAULT NULL::uuid, p_escalation_level smallint DEFAULT 0, p_reason_code text DEFAULT NULL::text, p_private_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_before public.feedback_safety_reports%rowtype; v_action text; begin
  if not private.feedback_is_staff() then raise exception 'Staff required'; end if;
  select * into v_before from public.feedback_safety_reports where id=p_report_id for update;
  if not found then raise exception 'Safety report not found'; end if;
  update public.feedback_safety_reports set case_status=p_status,assigned_to=p_assigned_to,escalation_level=p_escalation_level,resolved_at=case when p_status in ('resolved','closed') then coalesce(resolved_at,now()) else null end where id=p_report_id;
  v_action:=case p_status when 'triaged' then 'triaged' when 'investigating' then 'assigned' when 'resolved' then 'resolved' when 'closed' then 'closed' else 'submitted' end;
  insert into public.feedback_moderation_actions(subject_type,safety_report_id,action,actor_user_id,reason_code,private_notes,before_state,after_state)
  values('safety_report',p_report_id,v_action,auth.uid(),p_reason_code,p_private_notes,to_jsonb(v_before),jsonb_build_object('case_status',p_status,'assigned_to',p_assigned_to,'escalation_level',p_escalation_level));
  return p_report_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_update_submission(p_submission_id uuid, p_overall_sentiment public.feedback_sentiment, p_experience_scope text, p_visit_date date DEFAULT NULL::date, p_attendance_count_range text DEFAULT NULL::text, p_attendance_verification public.feedback_attendance_verification DEFAULT 'self_reported'::public.feedback_attendance_verification, p_related_event_id text DEFAULT NULL::text, p_related_venue_id text DEFAULT NULL::text, p_signals jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_s public.feedback_submissions%rowtype; v_target public.feedback_target_type; v_item jsonb; v_signal text; v_pol public.feedback_signal_polarity;
begin
select * into v_s from public.feedback_submissions where id=p_submission_id and author_user_id=auth.uid() for update;
if not found then raise exception 'Submission not found'; end if; if v_s.structured_status='withdrawn' then raise exception 'Withdrawn feedback is terminal'; end if;
if p_attendance_verification='platform_confirmed' then raise exception 'platform_confirmed is server-controlled'; end if;
v_target:=private.feedback_target_type_for(v_s);
update public.feedback_submissions set overall_sentiment=p_overall_sentiment,experience_scope=btrim(p_experience_scope),visit_date=p_visit_date,attendance_count_range=p_attendance_count_range,attendance_verification=p_attendance_verification,related_event_id=case when event_id is not null then event_id else p_related_event_id end,related_venue_id=p_related_venue_id where id=p_submission_id;
delete from public.feedback_signal_selections where feedback_submission_id=p_submission_id;
for v_item in select value from jsonb_array_elements(coalesce(p_signals,'[]'::jsonb)) loop v_signal:=v_item->>'signalId'; v_pol:=(v_item->>'polarity')::public.feedback_signal_polarity; perform private.feedback_validate_signal(v_s.signal_registry_version,v_target,v_signal,v_pol); if exists(select 1 from public.feedback_signal_selections where feedback_submission_id=p_submission_id and signal_id=v_signal and polarity<>v_pol) then raise exception 'Signal cannot use both polarities'; end if; insert into public.feedback_signal_selections values(p_submission_id,v_signal,v_pol,now()); end loop;
return private.feedback_submission_json(p_submission_id); end $function$
;

CREATE OR REPLACE FUNCTION public.feedback_withdraw_submission(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
update public.feedback_submissions set structured_status='withdrawn',withdrawn_at=now() where id=p_submission_id and author_user_id=auth.uid() and structured_status<>'withdrawn';
if not found then raise exception 'Active submission not found'; end if; return private.feedback_submission_json(p_submission_id); end $function$
;

CREATE OR REPLACE FUNCTION public.generate_unique_profile_handle(preferred_name text, user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  base_handle text;
  candidate text;
  suffix text;
begin
  base_handle := public.slugify_profile_handle(preferred_name);
  if char_length(base_handle) < 3 then
    base_handle := 'user';
  end if;

  base_handle := left(base_handle, 30);
  candidate := base_handle;

  if not exists (select 1 from public.profiles where handle = candidate) then
    return candidate;
  end if;

  suffix := left(replace(user_id::text, '-', ''), 8);
  candidate := left(base_handle, 30) || '-' || suffix;

  if not exists (select 1 from public.profiles where handle = candidate) then
    return candidate;
  end if;

  return left(base_handle, 24) || '-' || suffix || '-' || substr(md5(random()::text), 1, 5);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.slugify_profile_handle(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(both '-' from regexp_replace(lower(coalesce(value, 'user')), '[^a-z0-9]+', '-', 'g'));
$function$
;

CREATE OR REPLACE FUNCTION public.sync_profile_email_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles
  set
    email_verified_at = new.email_confirmed_at,
    updated_at = now()
  where id = new.id;

  return new;
end;
$function$
;

grant select on table "public"."feedback_moderation_actions" to "authenticated";

grant delete on table "public"."feedback_moderation_actions" to "service_role";

grant insert on table "public"."feedback_moderation_actions" to "service_role";

grant references on table "public"."feedback_moderation_actions" to "service_role";

grant select on table "public"."feedback_moderation_actions" to "service_role";

grant trigger on table "public"."feedback_moderation_actions" to "service_role";

grant truncate on table "public"."feedback_moderation_actions" to "service_role";

grant update on table "public"."feedback_moderation_actions" to "service_role";

grant select on table "public"."feedback_safety_reports" to "authenticated";

grant delete on table "public"."feedback_safety_reports" to "service_role";

grant insert on table "public"."feedback_safety_reports" to "service_role";

grant references on table "public"."feedback_safety_reports" to "service_role";

grant select on table "public"."feedback_safety_reports" to "service_role";

grant trigger on table "public"."feedback_safety_reports" to "service_role";

grant truncate on table "public"."feedback_safety_reports" to "service_role";

grant update on table "public"."feedback_safety_reports" to "service_role";

grant select on table "public"."feedback_signal_applicability" to "anon";

grant select on table "public"."feedback_signal_applicability" to "authenticated";

grant delete on table "public"."feedback_signal_applicability" to "service_role";

grant insert on table "public"."feedback_signal_applicability" to "service_role";

grant references on table "public"."feedback_signal_applicability" to "service_role";

grant select on table "public"."feedback_signal_applicability" to "service_role";

grant trigger on table "public"."feedback_signal_applicability" to "service_role";

grant truncate on table "public"."feedback_signal_applicability" to "service_role";

grant update on table "public"."feedback_signal_applicability" to "service_role";

grant select on table "public"."feedback_signal_registry_versions" to "anon";

grant select on table "public"."feedback_signal_registry_versions" to "authenticated";

grant delete on table "public"."feedback_signal_registry_versions" to "service_role";

grant insert on table "public"."feedback_signal_registry_versions" to "service_role";

grant references on table "public"."feedback_signal_registry_versions" to "service_role";

grant select on table "public"."feedback_signal_registry_versions" to "service_role";

grant trigger on table "public"."feedback_signal_registry_versions" to "service_role";

grant truncate on table "public"."feedback_signal_registry_versions" to "service_role";

grant update on table "public"."feedback_signal_registry_versions" to "service_role";

grant select on table "public"."feedback_signal_selections" to "authenticated";

grant delete on table "public"."feedback_signal_selections" to "service_role";

grant insert on table "public"."feedback_signal_selections" to "service_role";

grant references on table "public"."feedback_signal_selections" to "service_role";

grant select on table "public"."feedback_signal_selections" to "service_role";

grant trigger on table "public"."feedback_signal_selections" to "service_role";

grant truncate on table "public"."feedback_signal_selections" to "service_role";

grant update on table "public"."feedback_signal_selections" to "service_role";

grant select on table "public"."feedback_signals" to "anon";

grant select on table "public"."feedback_signals" to "authenticated";

grant delete on table "public"."feedback_signals" to "service_role";

grant insert on table "public"."feedback_signals" to "service_role";

grant references on table "public"."feedback_signals" to "service_role";

grant select on table "public"."feedback_signals" to "service_role";

grant trigger on table "public"."feedback_signals" to "service_role";

grant truncate on table "public"."feedback_signals" to "service_role";

grant update on table "public"."feedback_signals" to "service_role";

grant select on table "public"."feedback_submissions" to "authenticated";

grant delete on table "public"."feedback_submissions" to "service_role";

grant insert on table "public"."feedback_submissions" to "service_role";

grant references on table "public"."feedback_submissions" to "service_role";

grant select on table "public"."feedback_submissions" to "service_role";

grant trigger on table "public"."feedback_submissions" to "service_role";

grant truncate on table "public"."feedback_submissions" to "service_role";

grant update on table "public"."feedback_submissions" to "service_role";

grant select on table "public"."feedback_target_clubs" to "anon";

grant select on table "public"."feedback_target_clubs" to "authenticated";

grant delete on table "public"."feedback_target_clubs" to "service_role";

grant insert on table "public"."feedback_target_clubs" to "service_role";

grant references on table "public"."feedback_target_clubs" to "service_role";

grant select on table "public"."feedback_target_clubs" to "service_role";

grant trigger on table "public"."feedback_target_clubs" to "service_role";

grant truncate on table "public"."feedback_target_clubs" to "service_role";

grant update on table "public"."feedback_target_clubs" to "service_role";

grant select on table "public"."feedback_target_events" to "anon";

grant select on table "public"."feedback_target_events" to "authenticated";

grant delete on table "public"."feedback_target_events" to "service_role";

grant insert on table "public"."feedback_target_events" to "service_role";

grant references on table "public"."feedback_target_events" to "service_role";

grant select on table "public"."feedback_target_events" to "service_role";

grant trigger on table "public"."feedback_target_events" to "service_role";

grant truncate on table "public"."feedback_target_events" to "service_role";

grant update on table "public"."feedback_target_events" to "service_role";

grant select on table "public"."feedback_target_venues" to "anon";

grant select on table "public"."feedback_target_venues" to "authenticated";

grant delete on table "public"."feedback_target_venues" to "service_role";

grant insert on table "public"."feedback_target_venues" to "service_role";

grant references on table "public"."feedback_target_venues" to "service_role";

grant select on table "public"."feedback_target_venues" to "service_role";

grant trigger on table "public"."feedback_target_venues" to "service_role";

grant truncate on table "public"."feedback_target_venues" to "service_role";

grant update on table "public"."feedback_target_venues" to "service_role";

grant select on table "public"."feedback_written_experiences" to "authenticated";

grant delete on table "public"."feedback_written_experiences" to "service_role";

grant insert on table "public"."feedback_written_experiences" to "service_role";

grant references on table "public"."feedback_written_experiences" to "service_role";

grant select on table "public"."feedback_written_experiences" to "service_role";

grant trigger on table "public"."feedback_written_experiences" to "service_role";

grant truncate on table "public"."feedback_written_experiences" to "service_role";

grant update on table "public"."feedback_written_experiences" to "service_role";

grant select on table "public"."feedback_written_revisions" to "authenticated";

grant delete on table "public"."feedback_written_revisions" to "service_role";

grant insert on table "public"."feedback_written_revisions" to "service_role";

grant references on table "public"."feedback_written_revisions" to "service_role";

grant select on table "public"."feedback_written_revisions" to "service_role";

grant trigger on table "public"."feedback_written_revisions" to "service_role";

grant truncate on table "public"."feedback_written_revisions" to "service_role";

grant update on table "public"."feedback_written_revisions" to "service_role";

grant delete on table "public"."media_assets" to "anon";

grant insert on table "public"."media_assets" to "anon";

grant update on table "public"."media_assets" to "anon";

grant delete on table "public"."media_assets" to "authenticated";

grant update on table "public"."media_assets" to "authenticated";

grant delete on table "public"."media_assets" to "service_role";

grant insert on table "public"."media_assets" to "service_role";

grant select on table "public"."media_assets" to "service_role";

grant update on table "public"."media_assets" to "service_role";

grant delete on table "public"."organization_members" to "anon";

grant insert on table "public"."organization_members" to "anon";

grant select on table "public"."organization_members" to "anon";

grant update on table "public"."organization_members" to "anon";

grant delete on table "public"."organization_members" to "service_role";

grant insert on table "public"."organization_members" to "service_role";

grant select on table "public"."organization_members" to "service_role";

grant update on table "public"."organization_members" to "service_role";

grant delete on table "public"."organizations" to "anon";

grant insert on table "public"."organizations" to "anon";

grant update on table "public"."organizations" to "anon";

grant delete on table "public"."organizations" to "authenticated";

grant delete on table "public"."organizations" to "service_role";

grant insert on table "public"."organizations" to "service_role";

grant select on table "public"."organizations" to "service_role";

grant update on table "public"."organizations" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


  create policy "staff read moderation actions"
  on "public"."feedback_moderation_actions"
  as permissive
  for select
  to authenticated
using (private.feedback_is_staff());



  create policy "reporters read safety reports"
  on "public"."feedback_safety_reports"
  as permissive
  for select
  to authenticated
using (((reporter_user_id = ( SELECT auth.uid() AS uid)) OR private.feedback_is_staff()));



  create policy "read feedback applicability"
  on "public"."feedback_signal_applicability"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "read feedback registry"
  on "public"."feedback_signal_registry_versions"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "authors read signal selections"
  on "public"."feedback_signal_selections"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.feedback_submissions s
  WHERE ((s.id = feedback_signal_selections.feedback_submission_id) AND ((s.author_user_id = ( SELECT auth.uid() AS uid)) OR private.feedback_is_staff())))));



  create policy "read feedback signals"
  on "public"."feedback_signals"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "authors read submissions"
  on "public"."feedback_submissions"
  as permissive
  for select
  to authenticated
using (((author_user_id = ( SELECT auth.uid() AS uid)) OR private.feedback_is_staff()));



  create policy "read active feedback clubs"
  on "public"."feedback_target_clubs"
  as permissive
  for select
  to anon, authenticated
using ((status = 'active'::public.feedback_target_record_status));



  create policy "read active feedback events"
  on "public"."feedback_target_events"
  as permissive
  for select
  to anon, authenticated
using ((status = 'active'::public.feedback_target_record_status));



  create policy "read active feedback venues"
  on "public"."feedback_target_venues"
  as permissive
  for select
  to anon, authenticated
using ((status = 'active'::public.feedback_target_record_status));



  create policy "authors read written projection"
  on "public"."feedback_written_experiences"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.feedback_submissions s
  WHERE ((s.id = feedback_written_experiences.feedback_submission_id) AND ((s.author_user_id = ( SELECT auth.uid() AS uid)) OR private.feedback_is_staff())))));



  create policy "authors read revisions"
  on "public"."feedback_written_revisions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.feedback_submissions s
  WHERE ((s.id = feedback_written_revisions.feedback_submission_id) AND ((s.author_user_id = ( SELECT auth.uid() AS uid)) OR private.feedback_is_staff())))));



  create policy "Users can read permitted media assets"
  on "public"."media_assets"
  as permissive
  for select
  to anon, authenticated
using (((status = 'approved'::text) OR ((created_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['pending_review'::text, 'rejected'::text, 'archived'::text])))));



  create policy "Authenticated users can create their own pending media assets"
  on "public"."media_assets"
  as permissive
  for insert
  to authenticated
with check (((status = 'pending_review'::text) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((owner_type <> 'user'::text) OR (owner_id = ( SELECT auth.uid() AS uid)))));



  create policy "Members can read their memberships"
  on "public"."organization_members"
  as permissive
  for select
  to authenticated
using (((user_id = ( SELECT auth.uid() AS uid)) OR private.is_active_admin(( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id, ARRAY['owner'::public.organization_member_role, 'manager'::public.organization_member_role])));



  create policy "Owners and admins can remove members"
  on "public"."organization_members"
  as permissive
  for delete
  to authenticated
using ((private.is_active_admin(( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id, ARRAY['owner'::public.organization_member_role])));



  create policy "Owners managers and admins can add members"
  on "public"."organization_members"
  as permissive
  for insert
  to authenticated
with check ((private.is_active_admin(( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id, ARRAY['owner'::public.organization_member_role, 'manager'::public.organization_member_role])));



  create policy "Owners managers and admins can update members"
  on "public"."organization_members"
  as permissive
  for update
  to authenticated
using ((private.is_active_admin(( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id, ARRAY['owner'::public.organization_member_role, 'manager'::public.organization_member_role])))
with check ((private.is_active_admin(( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id, ARRAY['owner'::public.organization_member_role, 'manager'::public.organization_member_role])));



  create policy "Admins can create organizations"
  on "public"."organizations"
  as permissive
  for insert
  to authenticated
with check (private.is_active_admin(( SELECT auth.uid() AS uid)));



  create policy "Organization team can update organizations"
  on "public"."organizations"
  as permissive
  for update
  to authenticated
using (private.can_manage_organization(id))
with check (private.can_manage_organization(id));



  create policy "Public can read active organizations"
  on "public"."organizations"
  as permissive
  for select
  to anon, authenticated
using (((status = ANY (ARRAY['approved'::text, 'active'::text])) OR private.can_manage_organization(id)));



  create policy "Users can update their own safe profile fields"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (((( SELECT auth.uid() AS uid) = id) AND (status = 'active'::public.account_status)))
with check (((( SELECT auth.uid() AS uid) = id) AND (status = 'active'::public.account_status) AND (role = ( SELECT existing.role
   FROM public.profiles existing
  WHERE (existing.id = ( SELECT auth.uid() AS uid))))));


CREATE TRIGGER feedback_safety_reports_updated BEFORE UPDATE ON public.feedback_safety_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER feedback_submissions_updated BEFORE UPDATE ON public.feedback_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER feedback_target_clubs_updated BEFORE UPDATE ON public.feedback_target_clubs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER feedback_target_events_updated BEFORE UPDATE ON public.feedback_target_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER feedback_target_venues_updated BEFORE UPDATE ON public.feedback_target_venues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER feedback_written_experiences_updated BEFORE UPDATE ON public.feedback_written_experiences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER organization_members_protect_last_owner BEFORE DELETE OR UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION private.protect_last_organization_owner();


