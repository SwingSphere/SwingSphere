-- Accounts without external profile media can proceed without a server-side
-- media-clearance call. Accounts with Cloudflare Images still require the
-- service-only confirmation path.

create or replace function private.account_deletion_zero_media_clearance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'requested' and new.media_count = 0 then
    new.status := 'media_cleared';
    new.media_cleared_at := coalesce(new.media_cleared_at, now());
  end if;
  return new;
end;
$$;

create trigger account_deletion_zero_media_clearance
  before insert or update of status, media_count on public.account_deletion_requests
  for each row execute procedure private.account_deletion_zero_media_clearance();

revoke all on function private.account_deletion_zero_media_clearance() from public, anon, authenticated;
