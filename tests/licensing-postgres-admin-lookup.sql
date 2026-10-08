\set ON_ERROR_STOP on
-- Disposable PostgreSQL ONLY: runs after licensing-postgres-atomic.sql.
-- No production Supabase connection or secrets.
CREATE ROLE admin_lookup_executor NOLOGIN;
CREATE ROLE browser_auth_test NOLOGIN;
CREATE OR REPLACE FUNCTION public.is_platform_admin_internal(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path=pg_catalog,public AS $body$
 SELECT EXISTS(SELECT 1 FROM public.subscription_platform_admins WHERE user_id=p_user_id)
$body$;
REVOKE ALL ON FUNCTION public.is_platform_admin_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin_internal(uuid) FROM browser_auth_test;
GRANT USAGE ON SCHEMA public TO admin_lookup_executor;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_internal(uuid) TO admin_lookup_executor;
DO $checks$
BEGIN
 IF has_function_privilege('browser_auth_test','public.is_platform_admin_internal(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser role can execute protected lookup';
 END IF;
 IF NOT has_function_privilege('admin_lookup_executor','public.is_platform_admin_internal(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Dedicated executor lacks lookup access';
 END IF;
END $checks$;
SET ROLE admin_lookup_executor;
SELECT CASE WHEN public.is_platform_admin_internal('22222222-2222-4222-8222-222222222222') THEN 'true' ELSE 'false' END AS active_operator_check \gset
\if :active_operator_check
\else
\echo 'FAIL: appointed administrator not recognized'
\quit 1
\endif
SELECT CASE WHEN NOT public.is_platform_admin_internal('11111111-1111-4111-8111-111111111111') THEN 'true' ELSE 'false' END AS non_operator_check \gset
\if :non_operator_check
\else
\echo 'FAIL: ordinary user recognized as platform administrator'
\quit 1
\endif
RESET ROLE;
DO $checks$
BEGIN
 IF (SELECT count(*) FROM public.subscription_platform_admins)<>1 THEN
  RAISE EXCEPTION 'Membership lookup changed the allowlist';
 END IF;
END $checks$;
SELECT 'PASS: read-only, dedicated-role admin lookup' AS result;
