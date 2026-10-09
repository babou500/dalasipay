-- Annual billing foundation only: no existing subscription updates or production invoices.
BEGIN;
CREATE TABLE public.subscription_billing_controls(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false CONSTRAINT subscription_billing_disabled CHECK(enabled=false));
INSERT INTO public.subscription_billing_controls DEFAULT VALUES;
CREATE SEQUENCE public.subscription_invoice_number_seq;
CREATE SEQUENCE public.subscription_receipt_number_seq;
CREATE TABLE public.subscription_billing_invoices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),request_id uuid NOT NULL UNIQUE REFERENCES public.subscription_change_requests(id),invoice_number text NOT NULL UNIQUE,
 plan_id text NOT NULL CHECK(plan_id IN('standard','professional')),business_name text NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),currency_code text NOT NULL DEFAULT 'GMD' CHECK(currency_code='GMD'),billing_period_months integer NOT NULL DEFAULT 12 CHECK(billing_period_months=12),
 issued_on date NOT NULL DEFAULT current_date,due_on date NOT NULL,service_start date NOT NULL,service_end date NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
 CHECK(due_on>=issued_on),CHECK(service_end=(service_start+interval '12 months')::date));
CREATE TABLE public.subscription_billing_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid NOT NULL REFERENCES public.subscription_billing_invoices(id),idempotency_key uuid NOT NULL UNIQUE,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),status text NOT NULL CHECK(status IN('pending','paid')),reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 5 AND 200),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.subscription_billing_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_id uuid NOT NULL UNIQUE REFERENCES public.subscription_billing_payments(id),receipt_number text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.subscription_billing_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid NOT NULL REFERENCES public.subscription_billing_invoices(id),days_before integer NOT NULL CHECK(days_before IN(30,14,7)),scheduled_on date NOT NULL,status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','sent','skipped')),UNIQUE(invoice_id,days_before));
CREATE TABLE public.subscription_billing_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),invoice_id uuid NOT NULL REFERENCES public.subscription_billing_invoices(id),actor_user_id uuid NOT NULL REFERENCES auth.users(id),event_type text NOT NULL CHECK(event_type IN('invoice_issued','payment_recorded','payment_confirmed')),happened_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL);
DO $$ DECLARE tab text; BEGIN FOREACH tab IN ARRAY ARRAY['subscription_billing_controls','subscription_billing_invoices','subscription_billing_payments','subscription_billing_receipts','subscription_billing_reminders','subscription_billing_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tab);
 END LOOP; END $$;
REVOKE ALL ON SEQUENCE public.subscription_invoice_number_seq,public.subscription_receipt_number_seq,public.subscription_billing_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER subscription_billing_events_immutable BEFORE UPDATE OR DELETE ON public.subscription_billing_events FOR EACH ROW EXECUTE FUNCTION public.prevent_subscription_admin_event_modification();
CREATE TRIGGER subscription_billing_events_no_truncate BEFORE TRUNCATE ON public.subscription_billing_events FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_subscription_admin_event_modification();
CREATE TRIGGER subscription_billing_receipts_immutable BEFORE UPDATE OR DELETE ON public.subscription_billing_receipts FOR EACH ROW EXECUTE FUNCTION public.prevent_subscription_admin_event_modification();
CREATE TRIGGER subscription_billing_receipts_no_truncate BEFORE TRUNCATE ON public.subscription_billing_receipts FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_subscription_admin_event_modification();
CREATE FUNCTION public.subscription_billing_internal(p_subject text,p_action text,p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; invoice public.subscription_billing_invoices%rowtype; payment public.subscription_billing_payments%rowtype; req public.subscription_change_requests%rowtype; plan public.licensing_plan_drafts%rowtype; result jsonb; n bigint; total bigint; start_on date; due_on date; payment_status text;
BEGIN
 IF NOT public.platform_admin_identity_authorized_internal(p_subject) THEN RAISE EXCEPTION 'Administrator required' USING errcode='42501'; END IF;
 SELECT m.user_id INTO actor FROM public.platform_admin_access_identities m JOIN auth.users u ON u.id=m.user_id WHERE m.access_subject=p_subject AND m.approved AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now());
 IF actor IS NULL THEN RAISE EXCEPTION 'Active administrator required' USING errcode='42501'; END IF;
 IF p_action='overview' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO result FROM (SELECT i.*,coalesce((SELECT sum(p.amount_minor) FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='paid'),0) paid_minor,
   CASE WHEN coalesce((SELECT sum(p.amount_minor) FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='paid'),0)>=i.amount_minor THEN 'paid' WHEN EXISTS(SELECT 1 FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='pending') THEN 'pending' WHEN i.due_on<current_date THEN 'overdue' ELSE 'unpaid' END payment_status
   FROM public.subscription_billing_invoices i ORDER BY i.created_at DESC,i.id LIMIT 100) x;
  RETURN jsonb_build_object('rows',result,'billing',false,'collection_enabled',false,'reminders_enabled',false,'entitlement_changes',false);
 END IF;
 -- A database constraint forbids activation. A separately approved migration is
 -- required even for a privileged operator to enable these prepared workflows.
 IF NOT EXISTS(SELECT 1 FROM public.subscription_billing_controls WHERE singleton AND enabled) THEN RAISE EXCEPTION 'Commercial billing is disabled' USING errcode='42501'; END IF;
 IF p_action='issue_invoice' THEN
  SELECT * INTO req FROM public.subscription_change_requests WHERE id=(p_payload->>'request_id')::uuid FOR UPDATE;
  IF NOT FOUND OR req.status<>'approved' OR req.requested_by=req.reviewed_by OR req.reviewed_by IS NULL THEN RAISE EXCEPTION 'Independently approved request required' USING errcode='42501'; END IF;
  SELECT * INTO plan FROM public.licensing_plan_drafts WHERE plan_id=req.requested_plan FOR SHARE;
  IF NOT FOUND OR plan.annual_price_gmd<=0 THEN RAISE EXCEPTION 'Paid annual plan required' USING errcode='22023'; END IF;
  start_on:=(p_payload->>'service_start')::date;due_on:=(p_payload->>'due_on')::date;
  IF start_on IS NULL OR due_on IS NULL THEN RAISE EXCEPTION 'Period and due date required' USING errcode='22023'; END IF;
  n:=nextval('public.subscription_invoice_number_seq');
  INSERT INTO public.subscription_billing_invoices(organization_id,request_id,invoice_number,plan_id,business_name,amount_minor,due_on,service_start,service_end,created_by)
  VALUES(req.organization_id,req.id,'DP-SUB-'||extract(year from current_date)::text||'-'||lpad(n::text,greatest(6,length(n::text)),'0'),plan.plan_id,(SELECT name FROM public.organizations WHERE id=req.organization_id),plan.annual_price_gmd::bigint*100,due_on,start_on,(start_on+interval '12 months')::date,actor) RETURNING * INTO invoice;
  INSERT INTO public.subscription_billing_reminders(invoice_id,days_before,scheduled_on) SELECT invoice.id,d,invoice.service_end-d FROM unnest(ARRAY[30,14,7]) d;
  INSERT INTO public.subscription_billing_events(organization_id,invoice_id,actor_user_id,event_type,metadata) VALUES(invoice.organization_id,invoice.id,actor,'invoice_issued',jsonb_build_object('amount_minor',invoice.amount_minor,'subscription_changed',false));
  RETURN jsonb_build_object('invoice_id',invoice.id,'number',invoice.invoice_number,'subscriptionChanged',false);
 ELSIF p_action IN('record_payment','confirm_payment') THEN
  SELECT * INTO invoice FROM public.subscription_billing_invoices WHERE id=(p_payload->>'invoice_id')::uuid FOR UPDATE;
  IF NOT FOUND OR invoice.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Stale invoice' USING errcode='55000'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO total FROM public.subscription_billing_payments WHERE invoice_id=invoice.id AND status='paid';
  IF p_action='record_payment' THEN
   IF coalesce(p_payload->>'amount_minor','')!~'^[1-9][0-9]{0,11}$' OR p_payload->>'status' IS NULL OR p_payload->>'status' NOT IN('pending','paid') THEN RAISE EXCEPTION 'Invalid payment' USING errcode='22023'; END IF;
   IF total+(p_payload->>'amount_minor')::bigint>invoice.amount_minor THEN RAISE EXCEPTION 'Overpayment' USING errcode='22023'; END IF;
   INSERT INTO public.subscription_billing_payments(invoice_id,idempotency_key,amount_minor,status,reference,created_by) VALUES(invoice.id,(p_payload->>'idempotency_key')::uuid,(p_payload->>'amount_minor')::bigint,p_payload->>'status',p_payload->>'reference',actor) RETURNING * INTO payment;
  ELSE
   SELECT * INTO payment FROM public.subscription_billing_payments WHERE id=(p_payload->>'payment_id')::uuid AND invoice_id=invoice.id AND status='pending' FOR UPDATE;
   IF NOT FOUND OR total+payment.amount_minor>invoice.amount_minor THEN RAISE EXCEPTION 'Payment unavailable' USING errcode='55000'; END IF;
   UPDATE public.subscription_billing_payments SET status='paid' WHERE id=payment.id RETURNING * INTO payment;
  END IF;
  IF payment.status='paid' THEN
   n:=nextval('public.subscription_receipt_number_seq');
   INSERT INTO public.subscription_billing_receipts(payment_id,receipt_number) VALUES(payment.id,'DP-RCT-'||extract(year from current_date)::text||'-'||lpad(n::text,greatest(6,length(n::text)),'0'));
  END IF;
  UPDATE public.subscription_billing_invoices SET version=version+1 WHERE id=invoice.id;
  INSERT INTO public.subscription_billing_events(organization_id,invoice_id,actor_user_id,event_type,metadata) VALUES(invoice.organization_id,invoice.id,actor,CASE WHEN p_action='record_payment' THEN 'payment_recorded' ELSE 'payment_confirmed' END,jsonb_build_object('payment_id',payment.id,'amount_minor',payment.amount_minor,'status',payment.status,'subscription_changed',false));
  RETURN jsonb_build_object('saved',true,'payment_id',payment.id,'subscriptionChanged',false);
 ELSE RAISE EXCEPTION 'Unknown action' USING errcode='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.subscription_billing_internal(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_billing_internal(text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_licensing_manage_internal(p_subject text,p_action text,p_payload jsonb DEFAULT '{}'::jsonb,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid; target uuid; draft public.licensing_plan_drafts%rowtype; details public.licensing_workspace_details%rowtype; v_limits jsonb; v_features jsonb; k text; v jsonb; result jsonb; stamp integer;
BEGIN
 IF NOT public.platform_admin_identity_authorized_internal(p_subject) THEN RAISE EXCEPTION 'Administrator required' USING errcode='42501'; END IF;
 SELECT user_id INTO actor FROM public.platform_admin_access_identities WHERE access_subject=p_subject AND approved;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) THEN RAISE EXCEPTION 'Active administrator required' USING errcode='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Invalid input' USING errcode='22023'; END IF;
 IF p_action='businesses' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO result FROM (
   SELECT o.id,o.name,o.currency,o.industry,o.size_band,o.created_at,
   s.plan_id,s.status,s.professional_preview,d.renewal_date,
   (SELECT count(*) FROM public.organization_members m WHERE m.organization_id=o.id) member_count
   FROM public.organizations o LEFT JOIN public.workspace_subscriptions s ON s.organization_id=o.id
   LEFT JOIN public.licensing_workspace_details d ON d.organization_id=o.id ORDER BY o.id OFFSET p_offset LIMIT 101
  ) x; RETURN jsonb_build_object('rows',result);
 ELSIF p_action='business' THEN
  target:=(p_payload->>'id')::uuid;
  SELECT jsonb_build_object('profile',to_jsonb(o),'subscription',to_jsonb(s),'details',to_jsonb(d),
   'account',jsonb_build_object('email',u.email,'confirmed',u.email_confirmed_at IS NOT NULL),
   'members',(SELECT count(*) FROM public.organization_members m WHERE m.organization_id=o.id),
   'requests',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM (SELECT * FROM public.subscription_change_requests WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 100) r),'[]'),
   'history',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.happened_at DESC) FROM (SELECT id,event_type,happened_at,previous_plan,proposed_plan FROM public.subscription_admin_events WHERE organization_id=o.id ORDER BY happened_at DESC LIMIT 100) e),'[]'))
   INTO result FROM public.organizations o LEFT JOIN public.workspace_subscriptions s ON s.organization_id=o.id
   LEFT JOIN public.licensing_workspace_details d ON d.organization_id=o.id LEFT JOIN auth.users u ON u.id=o.created_by WHERE o.id=target;
  IF result IS NULL THEN RAISE EXCEPTION 'Business unavailable' USING errcode='22023'; END IF; RETURN result;
 ELSIF p_action='plans' THEN
  RETURN jsonb_build_object('rows',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.plan_id) FROM public.licensing_plan_drafts p),'enforcement',false,'billing',false);
 ELSIF p_action='requests' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO result FROM (SELECT r.*,o.name AS business_name FROM public.subscription_change_requests r JOIN public.organizations o ON o.id=r.organization_id ORDER BY r.created_at DESC,r.id OFFSET p_offset LIMIT 101) x; RETURN jsonb_build_object('rows',result,'actor_id',actor);
 ELSIF p_action='audit' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO result FROM (
   SELECT * FROM (
    SELECT 'subscription:'||e.id id,e.organization_id,o.name business_name,e.actor_user_id,e.event_type,e.happened_at,jsonb_build_object('previous_plan',e.previous_plan,'proposed_plan',e.proposed_plan,'request_id',e.request_id) details FROM public.subscription_admin_events e LEFT JOIN public.organizations o ON o.id=e.organization_id
    UNION ALL
    SELECT 'management:'||e.id,e.organization_id,o.name,e.actor_user_id,e.event_type,e.happened_at,e.metadata FROM public.licensing_management_events e LEFT JOIN public.organizations o ON o.id=e.organization_id
   ) history ORDER BY happened_at DESC,id OFFSET p_offset LIMIT 101
  ) x; RETURN jsonb_build_object('rows',result);
 ELSIF p_action='review' THEN
  PERFORM public.review_subscription_request_internal((p_payload->>'id')::uuid,actor,p_payload->>'decision',p_payload->>'note');
  RETURN jsonb_build_object('saved',true,'subscriptionChanged',false);
 ELSIF p_action='billing' THEN
  RETURN public.subscription_billing_internal(p_subject,'overview','{}'::jsonb);
 ELSIF p_action='save_price' THEN
  SELECT * INTO draft FROM public.licensing_plan_drafts WHERE plan_id=p_payload->>'plan_id' FOR UPDATE;
  IF NOT FOUND OR draft.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Stale price' USING errcode='55000'; END IF;
  IF p_payload->'confirmed' IS DISTINCT FROM 'true'::jsonb OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 10 AND 1000 OR coalesce(p_payload->>'annual_price_gmd','')!~'^[0-9]{1,7}$' OR p_payload->>'currency_code' IS DISTINCT FROM 'GMD' OR p_payload->>'billing_period_months' IS DISTINCT FROM '12' THEN RAISE EXCEPTION 'Explicit annual pricing authorization required' USING errcode='22023'; END IF;
  UPDATE public.licensing_plan_drafts SET annual_price_gmd=(p_payload->>'annual_price_gmd')::integer,version=version+1,updated_at=now() WHERE plan_id=draft.plan_id;
  INSERT INTO public.licensing_management_events(actor_user_id,event_type,metadata) VALUES(actor,'plan_draft_saved',jsonb_build_object('plan_id',draft.plan_id,'change','annual_price_draft_saved','before',to_jsonb(draft),'after',jsonb_build_object('annual_price_gmd',p_payload->>'annual_price_gmd','currency_code','GMD','billing_period_months',12),'reason',p_payload->>'reason','billing_enabled',false,'subscription_changed',false));
  RETURN jsonb_build_object('saved',true,'billing',false);
 ELSIF p_action='save_plan' THEN
  SELECT * INTO draft FROM public.licensing_plan_drafts WHERE plan_id=p_payload->>'plan_id' FOR UPDATE;
  IF NOT FOUND OR draft.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Stale draft' USING errcode='55000'; END IF;
  v_limits:=p_payload->'limits';v_features:=p_payload->'features';
  IF v_limits IS NULL OR jsonb_typeof(v_limits)<>'object' OR v_features IS NULL OR jsonb_typeof(v_features)<>'array' OR jsonb_array_length(v_features)>12 OR p_payload->>'label' IS NULL OR length(btrim(p_payload->>'label')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid catalogue' USING errcode='22023'; END IF;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements(v_features))<>jsonb_array_length(v_features) THEN RAISE EXCEPTION 'Duplicate features' USING errcode='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_limits))<>5 THEN RAISE EXCEPTION 'Invalid limits' USING errcode='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['companies','users','employees','invoicesPerMonth','supplierBillsPerMonth'] LOOP
   v:=v_limits->k;
   IF v IS NULL OR (v<>'null'::jsonb AND (jsonb_typeof(v)<>'number' OR v::text!~'^[0-9]{1,7}$')) THEN RAISE EXCEPTION 'Invalid limit' USING errcode='22023'; END IF;
  END LOOP;
  FOR v IN SELECT value FROM jsonb_array_elements(v_features) LOOP
   IF jsonb_typeof(v)<>'string' OR (v#>>'{}')<>ALL(ARRAY['coreAccounting','smallBusinessPayroll','recurringBilling','projects','budgets','advancedReports','fullPayroll','makerChecker','periodClose','advancedTaxCompliance','auditControls']) THEN RAISE EXCEPTION 'Invalid feature' USING errcode='22023'; END IF;
  END LOOP;
  UPDATE public.licensing_plan_drafts SET label=btrim(p_payload->>'label'),limits=v_limits,features=v_features,version=version+1,updated_at=now() WHERE plan_id=draft.plan_id;
  INSERT INTO public.licensing_management_events(actor_user_id,event_type,metadata) VALUES(actor,'plan_draft_saved',jsonb_build_object('plan_id',draft.plan_id,'before',to_jsonb(draft),'after',jsonb_build_object('label',p_payload->>'label','limits',v_limits,'features',v_features),'enforced',false));
  RETURN jsonb_build_object('saved',true,'enforcement',false);
 ELSIF p_action='save_details' THEN
  target:=(p_payload->>'id')::uuid;
  PERFORM 1 FROM public.organizations WHERE id=target FOR UPDATE;
  IF NOT FOUND OR length(coalesce(p_payload->>'notes',''))>2000 THEN RAISE EXCEPTION 'Invalid profile' USING errcode='22023'; END IF;
  SELECT * INTO details FROM public.licensing_workspace_details WHERE organization_id=target FOR UPDATE;
  IF coalesce(details.version,0) IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Stale profile' USING errcode='55000'; END IF;
  INSERT INTO public.licensing_workspace_details(organization_id,renewal_date,notes) VALUES(target,nullif(p_payload->>'renewal_date','')::date,coalesce(p_payload->>'notes','')) ON CONFLICT(organization_id) DO UPDATE SET renewal_date=excluded.renewal_date,notes=excluded.notes,version=licensing_workspace_details.version+1,updated_at=now();
  INSERT INTO public.licensing_management_events(organization_id,actor_user_id,event_type,metadata) VALUES(target,actor,'workspace_details_saved',jsonb_build_object('before',to_jsonb(details),'after',jsonb_build_object('renewal_date',p_payload->>'renewal_date','notes',p_payload->>'notes'),'subscription_changed',false));
  RETURN jsonb_build_object('saved',true);
 ELSE RAISE EXCEPTION 'Unknown action' USING errcode='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_licensing_manage_internal(text,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_licensing_manage_internal(text,text,jsonb,integer) TO service_role;


CREATE OR REPLACE FUNCTION public.customer_subscription_portal(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid();target uuid;req uuid;result jsonb; r public.subscription_change_requests%rowtype;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=actor AND (not_after IS NULL OR not_after>now())) THEN RAISE EXCEPTION 'Confirmed account required' USING errcode='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'created_at',o.created_at,'subscription',to_jsonb(s),'requests',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC) FROM (SELECT id,requested_plan,request_kind,reason,status,created_at,review_note FROM public.subscription_change_requests WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 100) q),'[]'))),'[]') INTO result
  FROM public.organizations o JOIN public.organization_members m ON m.organization_id=o.id AND m.user_id=actor AND m.role::text='owner' LEFT JOIN public.workspace_subscriptions s ON s.organization_id=o.id;
  RETURN jsonb_build_object('businesses',result,'plans',(SELECT jsonb_agg(jsonb_build_object('plan_id',plan_id,'label',label,'limits',limits,'features',features,'annual_price_gmd',annual_price_gmd,'currency_code',currency_code,'billing_period_months',billing_period_months) ORDER BY plan_id) FROM public.licensing_plan_drafts),'enforcement',false,'billing',false,'billing_history',coalesce((SELECT jsonb_agg(jsonb_build_object('number',i.invoice_number,'organization_id',i.organization_id,'plan_id',i.plan_id,'amount_minor',i.amount_minor,'currency','GMD','issued_on',i.issued_on,'due_on',i.due_on,'service_start',i.service_start,'service_end',i.service_end,'payment_status',CASE WHEN coalesce((SELECT sum(p.amount_minor) FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='paid'),0)>=i.amount_minor THEN 'paid' WHEN EXISTS(SELECT 1 FROM public.subscription_billing_payments p WHERE p.invoice_id=i.id AND p.status='pending') THEN 'pending' WHEN i.due_on<current_date THEN 'overdue' ELSE 'unpaid' END,'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('number',br.receipt_number,'amount_minor',p.amount_minor,'created_at',br.created_at)) FROM public.subscription_billing_receipts br JOIN public.subscription_billing_payments p ON p.id=br.payment_id WHERE p.invoice_id=i.id),'[]'::jsonb))) FROM public.subscription_billing_invoices i WHERE EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=i.organization_id AND m.user_id=actor AND m.role::text='owner')),'[]'::jsonb));
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
REVOKE ALL ON FUNCTION public.customer_subscription_portal(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_subscription_portal(text,jsonb) TO authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;
