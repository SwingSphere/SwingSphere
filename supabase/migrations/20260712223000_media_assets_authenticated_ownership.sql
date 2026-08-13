-- Allow authenticated users to complete direct uploads while keeping pending media private.

alter table public.media_assets enable row level security;

drop policy if exists "Authenticated users can create pending media assets" on public.media_assets;
create policy "Authenticated users can create their own pending media assets"
on public.media_assets
for insert
to authenticated
with check (
  status = 'pending_review'
  and created_by = auth.uid()
  and (owner_type <> 'user' or owner_id = auth.uid())
);

drop policy if exists "Owners can read their pending media assets" on public.media_assets;
create policy "Owners can read their pending media assets"
on public.media_assets
for select
to authenticated
using (
  created_by = auth.uid()
  and status in ('pending_review', 'approved', 'rejected', 'archived')
);
