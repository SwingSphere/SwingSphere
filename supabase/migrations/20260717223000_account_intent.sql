-- Capture signup intent without granting promoter privileges client-side.

alter table public.profiles
  add column if not exists account_intent text not null default 'explore'
  check (account_intent in ('explore', 'promote'));

comment on column public.profiles.account_intent is
  'Signup intent only. A promote selection does not grant the promoter role; verification and organization assignment remain required.';

grant update (account_intent) on public.profiles to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_display_name text;
  requested_account_intent text;
  generated_handle text;
begin
  requested_display_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  requested_display_name := coalesce(requested_display_name, split_part(new.email, '@', 1), 'SwingSphere User');
  requested_account_intent := case
    when new.raw_user_meta_data ->> 'account_intent' = 'promote' then 'promote'
    else 'explore'
  end;
  generated_handle := public.generate_unique_profile_handle(requested_display_name, new.id);

  insert into public.profiles (
    id,
    display_name,
    handle,
    role,
    status,
    account_intent,
    email_verified_at
  ) values (
    new.id,
    requested_display_name,
    generated_handle,
    'user',
    'active',
    requested_account_intent,
    new.email_confirmed_at
  );

  return new;
end;
$$;
