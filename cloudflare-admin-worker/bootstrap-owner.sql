-- OFFLINE ONLY. The trusted infrastructure operator must first verify ownership
-- through authenticated APIs and the actual JWT through verify-bootstrap-subject.
-- Evidence is not accepted from a browser or treated as a bearer credential.
-- Required psql variables: target_user_id, organization_id, owner_email,
-- identity_evidence, ownership_evidence, authorization_reference, authorization_text.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.subscription_platform_admins IN EXCLUSIVE MODE;
LOCK TABLE public.platform_admin_access_identities IN EXCLUSIVE MODE;
LOCK TABLE public.subscription_admin_events IN SHARE ROW EXCLUSIVE MODE;
-- Freeze the membership facts for this brief transaction; normal reads continue.
LOCK TABLE public.organization_members IN SHARE MODE;
SELECT jsonb_build_array(
 set_config('bootstrap.user_id', :'target_user_id', true),
 set_config('bootstrap.organization_id', :'organization_id', true),
 set_config('bootstrap.owner_email', :'owner_email', true),
 set_config('bootstrap.identity_evidence', :'identity_evidence', true),
 set_config('bootstrap.ownership_evidence', :'ownership_evidence', true),
 set_config('bootstrap.authorization_reference', :'authorization_reference', true),
 set_config('bootstrap.authorization_text', :'authorization_text', true)
) AS bootstrap_settings \gset
DO $owner_bootstrap$
DECLARE
 target uuid := current_setting('bootstrap.user_id')::uuid;
 organization uuid := current_setting('bootstrap.organization_id')::uuid;
 owner_email text := lower(btrim(current_setting('bootstrap.owner_email')));
 identity jsonb := current_setting('bootstrap.identity_evidence')::jsonb;
 ownership jsonb := current_setting('bootstrap.ownership_evidence')::jsonb;
 reference text := btrim(current_setting('bootstrap.authorization_reference'));
 declaration text := btrim(current_setting('bootstrap.authorization_text'));
 subject text := identity->>'subject';
 expected_issuer text := 'https://throbbing-salad-ace9.cloudflareaccess.com';
 expected_audience text := '2d449e11a99981d10cac40746e34cfb3208ec2161a769855db0c402875ea5602';
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Offline database operator required'; END IF;
 PERFORM 1 FROM auth.users WHERE id=target FOR UPDATE;
 PERFORM 1 FROM public.organizations WHERE id=organization FOR UPDATE;
 -- Append-only appointment history is the durable consumed marker. Removing or
 -- revoking membership cannot reset bootstrap eligibility.
 IF EXISTS (SELECT 1 FROM public.subscription_platform_admins)
 OR EXISTS (SELECT 1 FROM public.platform_admin_access_identities)
 OR EXISTS (SELECT 1 FROM public.subscription_admin_events WHERE event_type='platform_admin_appointed') THEN
  RAISE EXCEPTION 'Owner bootstrap already consumed or administrator state is not empty';
 END IF;
 IF reference='' OR length(declaration)<40 THEN RAISE EXCEPTION 'Explicit owner authorization required'; END IF;
 IF subject IS NULL OR length(subject) NOT BETWEEN 8 AND 256 OR subject ~ '[[:space:]]'
 OR identity->>'signatureVerified' IS DISTINCT FROM 'true'
 OR identity->>'issuer' IS DISTINCT FROM expected_issuer
 OR identity->>'audience' IS DISTINCT FROM expected_audience
 OR lower(identity->>'email') IS DISTINCT FROM owner_email
 OR NOT coalesce(identity->>'jwtSha256' ~ '^[a-f0-9]{64}$',false)
 OR NOT coalesce((identity->>'verifiedAt')::timestamptz BETWEEN now()-interval '10 minutes' AND now()+interval '30 seconds',false)
 OR NOT coalesce((identity->>'expiresAt')::timestamptz > now(),false) THEN
  RAISE EXCEPTION 'Fresh cryptographically verified owner Access identity required';
 END IF;
 IF ownership->>'githubRepository' IS DISTINCT FROM 'babou500/dalasipay'
 OR ownership->>'githubAdmin' IS DISTINCT FROM 'true'
 OR ownership->>'cloudflareAccountId' IS DISTINCT FROM '40e35bbd6d3097406a7c8f6e5e9bd4c8'
 OR lower(ownership->>'cloudflareAccountEmail') IS DISTINCT FROM owner_email
 OR ownership->>'supabaseProject' IS DISTINCT FROM 'zdpmlzmljozcmqndyfog'
 OR ownership->>'source' IS DISTINCT FROM 'authenticated_infrastructure_and_database_checks' THEN
  RAISE EXCEPTION 'Trusted infrastructure ownership evidence required';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=target AND lower(email)=owner_email
  AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) THEN
  RAISE EXCEPTION 'Confirmed active owner Auth UUID required';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=organization AND created_by=target)
 OR (SELECT count(*) FROM public.organization_members WHERE organization_id=organization)<>1
 OR NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=organization AND user_id=target AND role::text='owner') THEN
  RAISE EXCEPTION 'Verified sole owner and organization creator required';
 END IF;
 INSERT INTO public.subscription_platform_admins(user_id) VALUES (target);
 INSERT INTO public.platform_admin_access_identities(access_subject,user_id,approved) VALUES (subject,target,true);
 INSERT INTO public.subscription_admin_events(organization_id,actor_user_id,target_user_id,event_type,metadata)
 VALUES (organization,target,target,'platform_admin_appointed',jsonb_build_object(
  'scope','platform','method','single_owner_initial_bootstrap','bootstrap_consumed',true,
  'authorization_reference',reference,'owner_authorization',declaration,
  'operator','authenticated infrastructure operator executing the sole owner request',
  'identity_evidence',identity,'ownership_evidence',ownership));
 IF NOT public.platform_admin_identity_authorized_internal(subject) THEN RAISE EXCEPTION 'Post-appointment authorization failed'; END IF;
END $owner_bootstrap$;
COMMIT;
