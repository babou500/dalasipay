-- Wave is the sole subscription payment method. Commercial gate remains closed.
BEGIN;
ALTER TABLE public.subscription_billing_controls ADD COLUMN wave_phone text,
 ADD COLUMN wave_account_name text, ADD COLUMN wave_config_version integer NOT NULL DEFAULT 0,
 ADD COLUMN wave_owner_id uuid REFERENCES auth.users(id), ADD COLUMN wave_updated_at timestamptz,
 ADD CONSTRAINT wave_recipient_valid CHECK ((wave_phone IS NULL AND wave_account_name IS NULL) OR
 (wave_phone ~ '^\+[1-9][0-9]{7,14}$' AND length(btrim(wave_account_name)) BETWEEN 2 AND 100));
DO $$ DECLARE owner_id uuid; BEGIN
 IF (SELECT count(*) FROM public.subscription_admin_events WHERE event_type='platform_admin_appointed' AND metadata->>'method'='single_owner_initial_bootstrap' AND metadata->>'bootstrap_consumed'='true')<>1 THEN RAISE EXCEPTION 'Verified owner bootstrap audit required'; END IF;
 SELECT target_user_id INTO owner_id FROM public.subscription_admin_events WHERE event_type='platform_admin_appointed' AND metadata->>'method'='single_owner_initial_bootstrap' AND metadata->>'bootstrap_consumed'='true';
 IF NOT EXISTS(SELECT 1 FROM public.subscription_platform_admins WHERE user_id=owner_id) THEN RAISE EXCEPTION 'Established owner appointment required'; END IF;
 UPDATE public.subscription_billing_controls SET wave_owner_id=owner_id;
END $$;
ALTER TABLE public.licensing_management_events DROP CONSTRAINT licensing_management_events_event_type_check;
ALTER TABLE public.licensing_management_events ADD CONSTRAINT licensing_management_events_event_type_check CHECK(event_type IN('plan_draft_saved','workspace_details_saved','wave_settings_saved'));
ALTER TABLE public.subscription_billing_events DROP CONSTRAINT subscription_billing_events_event_type_check;
ALTER TABLE public.subscription_billing_events ADD CONSTRAINT subscription_billing_events_event_type_check CHECK(event_type IN('invoice_issued','payment_recorded','payment_confirmed','wave_submitted','wave_evidence_attached','wave_verified','wave_rejected'));
ALTER TABLE public.subscription_billing_payments DROP CONSTRAINT subscription_billing_payments_status_check;
ALTER TABLE public.subscription_billing_payments ADD CONSTRAINT subscription_billing_payments_status_check CHECK(status IN('pending','paid','rejected'));
ALTER TABLE public.subscription_billing_payments ADD COLUMN method text NOT NULL DEFAULT 'wave' CHECK(method='wave'),
 ADD COLUMN submitted_by uuid REFERENCES auth.users(id), ADD COLUMN reviewed_by uuid REFERENCES auth.users(id),
 ADD COLUMN reviewed_at timestamptz, ADD COLUMN review_note text, ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN wave_reference_key text, ADD COLUMN evidence_path text UNIQUE, ADD COLUMN evidence_attached boolean NOT NULL DEFAULT false,
 ADD COLUMN recipient_version integer, ADD CONSTRAINT wave_reference_valid CHECK(wave_reference_key IS NULL OR wave_reference_key ~ '^[A-Z0-9]{5,80}$');
-- No payment backfill. Existing ledger must be empty before this development migration.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.subscription_billing_payments) THEN RAISE EXCEPTION 'Review existing payments before Wave-only migration'; END IF; END $$;
CREATE UNIQUE INDEX subscription_wave_reference_unique ON public.subscription_billing_payments(wave_reference_key) WHERE wave_reference_key IS NOT NULL;
CREATE UNIQUE INDEX subscription_wave_invoice_active ON public.subscription_billing_payments(invoice_id) WHERE status IN('pending','paid');
CREATE INDEX subscription_wave_customer ON public.subscription_billing_payments(submitted_by,created_at DESC);

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('subscription-wave-evidence','subscription-wave-evidence',false,5242880,ARRAY['image/jpeg','image/png']);
CREATE FUNCTION public.wave_evidence_upload_allowed(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.subscription_billing_payments p JOIN public.subscription_billing_invoices i ON i.id=p.invoice_id JOIN public.organization_members m ON m.organization_id=i.organization_id AND m.user_id=auth.uid() AND m.role::text='owner'
 JOIN auth.users u ON u.id=m.user_id JOIN public.subscription_billing_controls c ON c.singleton AND c.enabled
 WHERE p.evidence_path=p_path AND p.submitted_by=auth.uid() AND p.status='pending' AND NOT p.evidence_attached
 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
 AND EXISTS(SELECT 1 FROM auth.sessions WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=u.id AND (not_after IS NULL OR not_after>now())))
$$;
REVOKE ALL ON FUNCTION public.wave_evidence_upload_allowed(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.wave_evidence_upload_allowed(text) TO authenticated;
CREATE POLICY wave_evidence_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='subscription-wave-evidence' AND owner_id=auth.uid()::text AND public.wave_evidence_upload_allowed(name));
-- Restrictive guards prevent other present/future permissive bucket policies
-- from giving customer sessions read, replacement or deletion access to evidence.
CREATE POLICY wave_evidence_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'subscription-wave-evidence');
CREATE POLICY wave_evidence_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'subscription-wave-evidence') WITH CHECK(bucket_id<>'subscription-wave-evidence');
CREATE POLICY wave_evidence_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'subscription-wave-evidence');
CREATE POLICY wave_evidence_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'subscription-wave-evidence' OR (owner_id=auth.uid()::text AND public.wave_evidence_upload_allowed(name)));

ALTER FUNCTION public.subscription_billing_internal(text,text,jsonb) RENAME TO subscription_billing_annual_internal;
REVOKE ALL ON FUNCTION public.subscription_billing_annual_internal(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.subscription_billing_internal(p_subject text,p_action text,p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; controls public.subscription_billing_controls%rowtype; payment public.subscription_billing_payments%rowtype; invoice public.subscription_billing_invoices%rowtype; result jsonb; recipient jsonb; n bigint;
BEGIN
 -- The existing function validates the signed-subject appointment and active Auth user.
 result:=public.subscription_billing_annual_internal(p_subject,'overview','{}');
 SELECT user_id INTO actor FROM public.platform_admin_access_identities WHERE access_subject=p_subject AND approved;
 SELECT * INTO controls FROM public.subscription_billing_controls WHERE singleton;
 IF p_action='wave_settings' THEN
  RETURN jsonb_build_object('billing',false,'method','wave','owner_can_configure',actor=controls.wave_owner_id,'version',controls.wave_config_version,'phone',CASE WHEN actor=controls.wave_owner_id THEN controls.wave_phone END,'account_name',CASE WHEN actor=controls.wave_owner_id THEN controls.wave_account_name END);
 ELSIF p_action='save_wave_settings' THEN
  SELECT * INTO controls FROM public.subscription_billing_controls WHERE singleton FOR UPDATE;
  IF actor IS DISTINCT FROM controls.wave_owner_id THEN RAISE EXCEPTION 'Verified platform owner required' USING errcode='42501'; END IF;
  IF controls.wave_config_version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Stale Wave settings' USING errcode='55000'; END IF;
  IF p_payload->'confirmed' IS DISTINCT FROM 'true'::jsonb OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 10 AND 1000 OR coalesce(p_payload->>'phone','')!~'^\+[1-9][0-9]{7,14}$' OR length(btrim(coalesce(p_payload->>'account_name',''))) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'Invalid owner authorization or recipient' USING errcode='22023'; END IF;
  recipient:=jsonb_build_object('phone',controls.wave_phone,'account_name',controls.wave_account_name,'version',controls.wave_config_version);
  UPDATE public.subscription_billing_controls SET wave_phone=p_payload->>'phone',wave_account_name=btrim(p_payload->>'account_name'),wave_config_version=wave_config_version+1,wave_updated_at=now() WHERE singleton;
  INSERT INTO public.licensing_management_events(actor_user_id,event_type,metadata) VALUES(actor,'wave_settings_saved',jsonb_build_object('before',recipient,'after',jsonb_build_object('phone',p_payload->>'phone','account_name',btrim(p_payload->>'account_name'),'version',controls.wave_config_version+1),'reason',p_payload->>'reason','billing_enabled',false,'subscription_changed',false));
  RETURN jsonb_build_object('saved',true,'billing',false);
 ELSIF p_action='overview' THEN
  RETURN result||jsonb_build_object('method','wave','payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',i.id,'invoice_number',i.invoice_number,'business_name',i.business_name,'organization_id',i.organization_id,'amount_minor',p.amount_minor,'reference',p.reference,'status',CASE p.status WHEN 'paid' THEN 'Verified' WHEN 'rejected' THEN 'Rejected' ELSE 'Pending Verification' END,'submitted_by',p.submitted_by,'version',p.version,'review_note',p.review_note,'evidence_attached',p.evidence_attached,'receipt_number',r.receipt_number) ORDER BY p.created_at DESC) FROM public.subscription_billing_payments p JOIN public.subscription_billing_invoices i ON i.id=p.invoice_id LEFT JOIN public.subscription_billing_receipts r ON r.payment_id=p.id),'[]'::jsonb),'actor_id',actor,'review_enabled',controls.enabled,'events',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT id,organization_id,invoice_id,actor_user_id,event_type,happened_at,metadata FROM public.subscription_billing_events ORDER BY id DESC LIMIT 100) e),'[]'::jsonb));
 ELSIF p_action IN('evidence','receipt') THEN
  SELECT * INTO payment FROM public.subscription_billing_payments WHERE id=(p_payload->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment unavailable' USING errcode='42501'; END IF;
  IF p_action='evidence' THEN
   IF NOT payment.evidence_attached THEN RAISE EXCEPTION 'Evidence unavailable' USING errcode='42501'; END IF;
   RETURN jsonb_build_object('path',payment.evidence_path);
  END IF;
  IF payment.status<>'paid' THEN RAISE EXCEPTION 'Receipt unavailable' USING errcode='42501'; END IF;
  SELECT * INTO invoice FROM public.subscription_billing_invoices WHERE id=payment.invoice_id;
  RETURN jsonb_build_object('invoice',to_jsonb(invoice),'receipt',(SELECT to_jsonb(r)||jsonb_build_object('amount_minor',payment.amount_minor,'method','wave','reference',payment.reference) FROM public.subscription_billing_receipts r WHERE r.payment_id=payment.id));
 ELSIF p_action='review_wave_payment' THEN
  IF NOT controls.enabled THEN RAISE EXCEPTION 'Commercial billing is disabled' USING errcode='42501'; END IF;
  -- Lock invoice before payment, matching issuance/submission lock order.
  SELECT i.* INTO invoice FROM public.subscription_billing_invoices i JOIN public.subscription_billing_payments p ON p.invoice_id=i.id WHERE p.id=(p_payload->>'id')::uuid FOR UPDATE OF i;
  SELECT * INTO payment FROM public.subscription_billing_payments WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR payment.status<>'pending' OR payment.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Payment already reviewed or stale' USING errcode='55000'; END IF;
  IF payment.submitted_by IS NULL OR payment.submitted_by=actor THEN RAISE EXCEPTION 'Independent administrator review required' USING errcode='42501'; END IF;
  IF p_payload->>'decision' IS NULL OR p_payload->>'decision' NOT IN('verified','rejected') OR length(btrim(coalesce(p_payload->>'note',''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Review reason required' USING errcode='22023'; END IF;
  IF p_payload->>'decision'='verified' THEN
   IF p_payload->'history_checked' IS DISTINCT FROM 'true'::jsonb OR regexp_replace(upper(coalesce(p_payload->>'checked_reference','')),'[^A-Z0-9]','','g') IS DISTINCT FROM payment.wave_reference_key OR (p_payload->>'checked_amount_minor')::bigint IS DISTINCT FROM payment.amount_minor THEN RAISE EXCEPTION 'Independent Wave transaction history confirmation required' USING errcode='22023'; END IF;
   IF EXISTS(SELECT 1 FROM public.subscription_billing_payments WHERE invoice_id=invoice.id AND status='paid') THEN RAISE EXCEPTION 'Invoice already verified' USING errcode='55000'; END IF;
   n:=nextval('public.subscription_receipt_number_seq');
   INSERT INTO public.subscription_billing_receipts(payment_id,receipt_number) VALUES(payment.id,'DP-RCT-'||extract(year from current_date)::text||'-'||lpad(n::text,greatest(6,length(n::text)),'0'));
  END IF;
  UPDATE public.subscription_billing_payments SET status=CASE WHEN p_payload->>'decision'='verified' THEN 'paid' ELSE 'rejected' END,reviewed_by=actor,reviewed_at=now(),review_note=btrim(p_payload->>'note'),version=version+1 WHERE id=payment.id;
  UPDATE public.subscription_billing_invoices SET version=version+1 WHERE id=invoice.id;
  INSERT INTO public.subscription_billing_events(organization_id,invoice_id,actor_user_id,event_type,metadata) VALUES(invoice.organization_id,invoice.id,actor,CASE WHEN p_payload->>'decision'='verified' THEN 'wave_verified' ELSE 'wave_rejected' END,jsonb_build_object('payment_id',payment.id,'method','wave','decision',p_payload->>'decision','note',p_payload->>'note','wave_history_independently_checked',p_payload->>'decision'='verified','amount_minor',payment.amount_minor,'subscription_changed',false));
  RETURN jsonb_build_object('saved',true,'billing',false,'subscriptionChanged',false);
 ELSIF p_action='issue_invoice' THEN
  RETURN public.subscription_billing_annual_internal(p_subject,p_action,p_payload);
 ELSE RAISE EXCEPTION 'Only the manual Wave workflow is supported' USING errcode='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.subscription_billing_internal(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_billing_internal(text,text,jsonb) TO service_role;

ALTER FUNCTION public.platform_licensing_manage_internal(text,text,jsonb,integer) RENAME TO platform_licensing_annual_internal;
REVOKE ALL ON FUNCTION public.platform_licensing_annual_internal(text,text,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.platform_licensing_manage_internal(p_subject text,p_action text,p_payload jsonb DEFAULT '{}'::jsonb,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_action IN('wave_settings','save_wave_settings','review_wave_payment') THEN RETURN public.subscription_billing_internal(p_subject,p_action,p_payload); END IF;
 RETURN public.platform_licensing_annual_internal(p_subject,p_action,p_payload,p_offset);
END $$;
REVOKE ALL ON FUNCTION public.platform_licensing_manage_internal(text,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_licensing_manage_internal(text,text,jsonb,integer) TO service_role;

ALTER FUNCTION public.customer_subscription_portal(text,jsonb) RENAME TO customer_subscription_annual_internal;
REVOKE ALL ON FUNCTION public.customer_subscription_annual_internal(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.customer_subscription_annual_internal(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid();target uuid;req uuid;result jsonb; r public.subscription_change_requests%rowtype;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=actor AND (not_after IS NULL OR not_after>now())) THEN RAISE EXCEPTION 'Confirmed account required' USING errcode='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'created_at',o.created_at,'subscription',to_jsonb(s),'requests',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC) FROM (SELECT id,requested_plan,request_kind,reason,status,created_at,review_note FROM public.subscription_change_requests WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 100) q),'[]'))),'[]') INTO result
  FROM public.organizations o JOIN public.organization_members m ON m.organization_id=o.id AND m.user_id=actor AND m.role::text='owner' LEFT JOIN public.workspace_subscriptions s ON s.organization_id=o.id;
  RETURN jsonb_build_object('businesses',result,'plans',(SELECT jsonb_agg(jsonb_build_object('plan_id',plan_id,'label',label,'limits',limits,'features',features,'annual_price_gmd',annual_price_gmd,'currency_code',currency_code,'billing_period_months',billing_period_months) ORDER BY plan_id) FROM public.licensing_plan_drafts),'enforcement',false,'billing',false,'billing_history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'organization_id',i.organization_id,'plan_id',i.plan_id,'amount_minor',i.amount_minor,'currency','GMD','issued_on',i.issued_on,'due_on',i.due_on,'service_start',i.service_start,'service_end',i.service_end,'payment_status',CASE WHEN coalesce((SELECT sum(p.amount_minor) FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='paid'),0)>=i.amount_minor THEN 'paid' WHEN EXISTS(SELECT 1 FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='pending') THEN 'pending' WHEN i.due_on<current_date THEN 'overdue' ELSE 'unpaid' END,'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('number',br.receipt_number,'amount_minor',p.amount_minor,'created_at',br.created_at)) FROM public.subscription_billing_receipts br JOIN public.subscription_billing_payments p ON p.id=br.payment_id WHERE p.invoice_id=i.id),'[]'::jsonb))) FROM public.subscription_billing_invoices i WHERE EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=i.organization_id AND m.user_id=actor AND m.role::text='owner')),'[]'::jsonb));
 ELSIF p_action='submit' THEN
  target:=(p_payload->>'organization_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=target AND user_id=actor AND role::text='owner') THEN RAISE EXCEPTION 'Workspace owner required' USING errcode='42501'; END IF;
  IF p_payload->>'kind' IS NULL OR p_payload->>'kind'<>ALL(ARRAY['upgrade','renewal','plan_change']) OR p_payload->>'plan_id' IS NULL OR p_payload->>'plan_id'<>ALL(ARRAY['free','standard','professional']) OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Invalid request' USING errcode='22023'; END IF;
  -- Serialize submissions within the workspace to enforce one pending request.
  PERFORM 1 FROM public.organizations WHERE id=target FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.subscription_change_requests WHERE organization_id=target AND status='pending') THEN RAISE EXCEPTION 'Pending request already exists' USING errcode='55000'; END IF;
  INSERT INTO public.subscription_change_requests(organization_id,requested_by,requested_plan,reason,request_kind) VALUES(target,actor,p_payload->>'plan_id',btrim(p_payload->>'reason'),p_payload->>'kind') RETURNING id INTO req;
  INSERT INTO public.subscription_admin_events(organization_id,request_id,actor_user_id,event_type,previous_plan,proposed_plan,metadata) VALUES(target,req,actor,'request_submitted',(SELECT plan_id FROM public.workspace_subscriptions WHERE organization_id=target),p_payload->>'plan_id',jsonb_build_object('kind',p_payload->>'kind','subscription_changed',false));
  RETURN jsonb_build_object('saved',true,'request_id',req,'subscriptionChanged',false);
 ELSIF p_action='cancel' THEN
  SELECT * INTO r FROM public.subscription_change_requests WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR r.requested_by<>actor OR r.status<>'pending' OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=r.organization_id AND user_id=actor AND role::text='owner') THEN RAISE EXCEPTION 'Request unavailable' USING errcode='42501'; END IF;
  UPDATE public.subscription_change_requests SET status='cancelled',updated_at=now() WHERE id=r.id;
  INSERT INTO public.subscription_admin_events(organization_id,request_id,actor_user_id,event_type,metadata) VALUES(r.organization_id,r.id,actor,'request_cancelled','{"subscription_changed":false}');
  RETURN jsonb_build_object('saved',true);
 ELSE RAISE EXCEPTION 'Unknown action' USING errcode='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.customer_subscription_annual_internal(text,jsonb) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.customer_subscription_annual_internal(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;



CREATE FUNCTION public.customer_subscription_portal(p_action text,p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); result jsonb; controls public.subscription_billing_controls%rowtype; invoice public.subscription_billing_invoices%rowtype; payment public.subscription_billing_payments%rowtype; ref_key text; path text; file_id uuid;
BEGIN
 -- Preserve current live-session, confirmation and account revocation checks.
 result:=public.customer_subscription_annual_internal(CASE WHEN p_action LIKE 'wave_%' THEN 'list' ELSE p_action END,p_payload);
 SELECT * INTO controls FROM public.subscription_billing_controls WHERE singleton;
 IF p_action='list' THEN
  RETURN result||jsonb_build_object('wave',jsonb_build_object('method','wave','enabled',controls.enabled,'phone',CASE WHEN controls.enabled THEN controls.wave_phone END,'account_name',CASE WHEN controls.enabled THEN controls.wave_account_name END),'wave_payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',i.id,'upload_path',CASE WHEN p.submitted_by=actor AND p.status='pending' AND NOT p.evidence_attached THEN p.evidence_path END,'number',i.invoice_number,'organization_id',i.organization_id,'amount_minor',p.amount_minor,'reference',p.reference,'status',CASE p.status WHEN 'paid' THEN 'Verified' WHEN 'rejected' THEN 'Rejected' ELSE 'Pending Verification' END,'created_at',p.created_at,'review_note',p.review_note,'receipt_number',r.receipt_number) ORDER BY p.created_at DESC) FROM public.subscription_billing_payments p JOIN public.subscription_billing_invoices i ON i.id=p.invoice_id JOIN public.organization_members m ON m.organization_id=i.organization_id AND m.user_id=actor AND m.role::text='owner' LEFT JOIN public.subscription_billing_receipts r ON r.payment_id=p.id),'[]'::jsonb));
 ELSIF p_action IN('wave_submit','wave_attach') THEN
  IF NOT controls.enabled OR controls.wave_phone IS NULL OR controls.wave_account_name IS NULL THEN RAISE EXCEPTION 'Manual Wave payments are disabled' USING errcode='42501'; END IF;
  IF p_action='wave_submit' THEN
   SELECT * INTO invoice FROM public.subscription_billing_invoices WHERE id=(p_payload->>'invoice_id')::uuid FOR UPDATE;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=invoice.organization_id AND user_id=actor AND role::text='owner') THEN RAISE EXCEPTION 'Owned invoice required' USING errcode='42501'; END IF;
   ref_key:=regexp_replace(upper(btrim(coalesce(p_payload->>'reference',''))),'[^A-Z0-9]','','g');
   IF ref_key!~'^[A-Z0-9]{5,80}$' OR length(btrim(p_payload->>'reference'))>100 THEN RAISE EXCEPTION 'Invalid Wave transaction reference' USING errcode='22023'; END IF;
   IF p_payload->>'screenshot_type' IS NOT NULL THEN
    IF p_payload->>'screenshot_type' NOT IN('image/png','image/jpeg') THEN RAISE EXCEPTION 'PNG or JPEG evidence only' USING errcode='22023'; END IF;
    file_id:=gen_random_uuid();path:=invoice.organization_id::text||'/'||invoice.id::text||'/'||file_id::text||CASE WHEN p_payload->>'screenshot_type'='image/png' THEN '.png' ELSE '.jpg' END;
   END IF;
   INSERT INTO public.subscription_billing_payments(invoice_id,idempotency_key,amount_minor,status,reference,created_by,submitted_by,wave_reference_key,evidence_path,recipient_version)
    VALUES(invoice.id,(p_payload->>'idempotency_key')::uuid,invoice.amount_minor,'pending',btrim(p_payload->>'reference'),actor,actor,ref_key,path,controls.wave_config_version) RETURNING * INTO payment;
   INSERT INTO public.subscription_billing_events(organization_id,invoice_id,actor_user_id,event_type,metadata) VALUES(invoice.organization_id,invoice.id,actor,'wave_submitted',jsonb_build_object('payment_id',payment.id,'method','wave','amount_minor',invoice.amount_minor,'recipient_version',controls.wave_config_version,'subscription_changed',false));
   RETURN jsonb_build_object('saved',true,'payment_id',payment.id,'evidence_path',path,'subscriptionChanged',false);
  END IF;
  SELECT p.* INTO payment FROM public.subscription_billing_payments p JOIN public.subscription_billing_invoices i ON i.id=p.invoice_id JOIN public.organization_members m ON m.organization_id=i.organization_id AND m.user_id=actor AND m.role::text='owner' WHERE p.id=(p_payload->>'id')::uuid AND p.submitted_by=actor FOR UPDATE OF p;
  IF NOT FOUND OR payment.status<>'pending' OR payment.evidence_attached OR payment.evidence_path IS NULL THEN RAISE EXCEPTION 'Evidence unavailable' USING errcode='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='subscription-wave-evidence' AND o.name=payment.evidence_path AND o.owner_id=actor::text AND o.metadata->>'mimetype' IN('image/png','image/jpeg') AND (o.metadata->>'size')::bigint BETWEEN 1 AND 5242880) THEN RAISE EXCEPTION 'Valid uploaded evidence required' USING errcode='22023'; END IF;
  UPDATE public.subscription_billing_payments SET evidence_attached=true,version=version+1 WHERE id=payment.id;
  SELECT * INTO invoice FROM public.subscription_billing_invoices WHERE id=payment.invoice_id;
  INSERT INTO public.subscription_billing_events(organization_id,invoice_id,actor_user_id,event_type,metadata) VALUES(invoice.organization_id,invoice.id,actor,'wave_evidence_attached',jsonb_build_object('payment_id',payment.id,'subscription_changed',false));
  RETURN jsonb_build_object('saved',true,'subscriptionChanged',false);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.customer_subscription_portal(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_subscription_portal(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
