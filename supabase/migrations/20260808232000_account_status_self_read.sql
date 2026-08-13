-- Allow an authenticated member to read their own profile even when the
-- account has been suspended or marked deleted. Public reads remain governed
-- by the existing active-profile/privacy policies, and profile writes still
-- require an active account.
--
-- This keeps the application able to distinguish a disabled account from a
-- missing profile so route guards can deny privileged/member access cleanly.

drop policy if exists "Members can read their own profile" on public.profiles;

create policy "Members can read their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());
