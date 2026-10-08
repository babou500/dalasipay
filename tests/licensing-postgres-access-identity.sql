\set ON_ERROR_STOP on
-- Disposable-only exact Cloudflare Access subject mapping: no production writes.
CREATE TABLE public.test_access_operator_mappings(
 access_subject text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 approved boolean NOT NULL DEFAULT false,
 CONSTRAINT subject_shape CHECK (length(access_subject) BETWEEN 8 AND 256)
);
REVOKE ALL ON public.test_access_operator_mappings FROM PUBLIC;
REVOKE ALL ON public.test_access_operator_mappings FROM browser_auth_test;
REVOKE ALL ON public.test_access_operator_mappings FROM admin_lookup_executor;
INSERT INTO public.test_access_operator_mappings(access_subject,user_id,approved)
VALUES ('cloudflare-operator-verified', '22222222-2222-4222-8222-222222222222',true),
       ('cloudflare-other-user', '11111111-1111-4111-8111-111111111111',true),
       ('cloudflare-unapproved-user','22222222-2222-4222-8222-222222222222',false);
CREATE FUNCTION public.test_is_approved_access_operator(p_subject text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(
 SELECT 1 FROM public.test_access_operator_mappings m
 INNER JOIN public.subscription_platform_admins a ON a.user_id=m.user_id
 WHERE m.access_subject=p_subject AND m.approved IS TRUE
 )
$fn$;
REVOKE ALL ON FUNCTION public.test_is_approved_access_operator(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_is_approved_access_operator(text) FROM browser_auth_test;
GRANT EXECUTE ON FUNCTION public.test_is_approved_access_operator(text) TO admin_lookup_executor;
DO $test$
BEGIN
 IF has_table_privilege('browser_auth_test','public.test_access_operator_mappings','SELECT')
 OR has_function_privilege('browser_auth_test','public.test_is_approved_access_operator(text)','EXECUTE') THEN
 RAISE EXCEPTION 'Browser user unexpectedly permitted to inspect operator mappings';
 END IF;
END $test$;
SET ROLE admin_lookup_executor;
SELECT CASE WHEN public.test_is_approved_access_operator('cloudflare-operator-verified')
 AND NOT public.test_is_approved_access_operator('cloudflare-other-user')
 AND NOT public.test_is_approved_access_operator('cloudflare-unapproved-user')
 AND NOT public.test_is_approved_access_operator('unknown-cloudflare-subject')
 THEN 'true' ELSE 'false' END AS mappings_secure \gset
\if :mappings_secure
\else
\echo 'FAIL: access subject mapping privileges or membership'
\quit 1
\endif
RESET ROLE;
SELECT 'PASS: disposable exact-subject administrator mapping' AS result;
