-- DESIGN ONLY. DO NOT APPLY TO PRODUCTION.
-- Future platform admin membership lookup requires a trusted server identity.
-- The service_role must NOT receive direct SELECT on the administrator allowlist.
-- A production deployment needs an authenticated, narrowly scoped execution
-- principal and a separate review of token-to-identity binding and grants.
--
-- An allowlist check returns BOOLEAN ONLY; no administrator roster or email.
-- This sketch intentionally grants EXECUTE to nobody.
CREATE OR REPLACE FUNCTION public.is_platform_admin_internal(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscription_platform_admins a
    WHERE a.user_id = p_user_id
  )
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin_internal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_platform_admin_internal(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin_internal(uuid) FROM service_role;
-- Do NOT GRANT EXECUTE here. In a controlled rollout the invoker MUST be
-- independently validated and the RPC must not trust a user_id from clients.
