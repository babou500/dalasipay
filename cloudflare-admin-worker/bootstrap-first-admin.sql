-- OFFLINE ONLY. Run with psql as the authorized database operator.
-- Supply variables via a protected local input file; never paste JWTs or keys here.
-- Required: access_subject, target_user_id, organization_id, approver, operator,
-- approval_reference, reason. The subject must come from a VERIFIED Access JWT.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.subscription_platform_admins IN EXCLUSIVE MODE;
LOCK TABLE public.platform_admin_access_identities IN EXCLUSIVE MODE;
SELECT jsonb_build_array(set_config('bootstrap.subject', :'access_subject', true),
 set_config('bootstrap.user_id', :'target_user_id', true),
 set_config('bootstrap.organization_id', :'organization_id', true),
 set_config('bootstrap.approver', :'approver', true),
 set_config('bootstrap.operator', :'operator', true),
 set_config('bootstrap.approval_reference', :'approval_reference', true),
 set_config('bootstrap.reason', :'reason', true)) AS bootstrap_settings \gset
DO $bootstrap$
DECLARE
 subject text := current_setting('bootstrap.subject');
 target uuid := current_setting('bootstrap.user_id')::uuid;
 organization uuid := current_setting('bootstrap.organization_id')::uuid;
 approver text := btrim(current_setting('bootstrap.approver'));
 operator_name text := btrim(current_setting('bootstrap.operator'));
 approval_reference text := btrim(current_setting('bootstrap.approval_reference'));
 reason text := btrim(current_setting('bootstrap.reason'));
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Offline database operator required'; END IF;
 IF length(subject) NOT BETWEEN 8 AND 256 OR subject ~ '[[:space:]]' THEN RAISE EXCEPTION 'Invalid verified subject'; END IF;
 IF approver = '' OR operator_name = '' OR approver = operator_name OR approval_reference = '' OR length(reason) < 10 THEN
  RAISE EXCEPTION 'Independent documented approval required';
 END IF;
 IF EXISTS (SELECT 1 FROM public.subscription_platform_admins) OR EXISTS (SELECT 1 FROM public.platform_admin_access_identities) THEN
  RAISE EXCEPTION 'First-administrator bootstrap already used or identity state is not empty';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Target Auth UUID not active'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = organization) THEN RAISE EXCEPTION 'Audit organization not found'; END IF;
 INSERT INTO public.subscription_platform_admins(user_id) VALUES (target);
 INSERT INTO public.platform_admin_access_identities(access_subject,user_id,approved) VALUES (subject,target,true);
 INSERT INTO public.subscription_admin_events(organization_id,actor_user_id,target_user_id,event_type,metadata)
 VALUES (organization,NULL,target,'platform_admin_appointed',jsonb_build_object(
  'scope','platform','method','offline_first_administrator','approver',approver,'operator',operator_name,
  'approval_reference',approval_reference,'reason',reason,'access_subject',subject));
 IF NOT public.platform_admin_identity_authorized_internal(subject) THEN RAISE EXCEPTION 'Post-appointment authorization failed'; END IF;
END $bootstrap$;
COMMIT;
