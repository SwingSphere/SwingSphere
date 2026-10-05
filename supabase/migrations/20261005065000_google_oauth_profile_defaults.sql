-- Keep Google OAuth identity data private by default.
-- Google users finish public profile setup inside SwingSphere after authentication.

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
  auth_provider text;
begin
  auth_provider := coalesce(new.raw_app_meta_data ->> 'provider', '');

  requested_display_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  requested_display_name := coalesce(
    requested_display_name,
    case
      when auth_provider = 'google' then 'SwingSphere User'
      else split_part(new.email, '@', 1)
    end,
    'SwingSphere User'
  );

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

comment on function public.handle_new_auth_user() is
  'Creates the SwingSphere profile for a new Auth user. OAuth providers such as Google do not publish provider profile names or email-local-parts by default.';
