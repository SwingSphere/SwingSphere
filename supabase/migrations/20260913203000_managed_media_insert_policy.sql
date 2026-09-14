-- Allow trusted managed media uploads to be inserted as approved while
-- preserving the existing pending-review path for ordinary authenticated uploads.

alter table public.media_assets enable row level security;

drop policy if exists "Authenticated users can create their own pending media assets" on public.media_assets;
drop policy if exists "Authenticated users can create permitted media assets" on public.media_assets;

create policy "Authenticated users can create permitted media assets"
on public.media_assets
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (owner_type <> 'user' or owner_id = auth.uid())
  and (
    status = 'pending_review'
    or (
      status = 'approved'
      and public.can_publish_managed_media(owner_type, owner_id::text)
    )
  )
);

comment on policy "Authenticated users can create permitted media assets" on public.media_assets is
  'Allows normal authenticated uploads as pending_review and trusted managed club/event/organization uploads as approved after server-side authority verification.';
