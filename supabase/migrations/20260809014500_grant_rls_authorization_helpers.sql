-- RLS policies in the pulled production schema call these private boolean
-- authorization helpers directly. Authenticated users need EXECUTE permission
-- for policy evaluation; anonymous users do not. The private schema is not part
-- of the exposed PostgREST API surface, so these grants support RLS without
-- creating public RPC endpoints.

grant execute on function private.is_active_admin(uuid) to authenticated;
grant execute on function private.organization_member_role_for(text, uuid) to authenticated;
grant execute on function private.can_manage_organization(text, public.organization_member_role[]) to authenticated;

revoke all on function private.is_active_admin(uuid) from anon;
revoke all on function private.organization_member_role_for(text, uuid) from anon;
revoke all on function private.can_manage_organization(text, public.organization_member_role[]) from anon;
