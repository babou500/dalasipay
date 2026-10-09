-- Additive management layer. Does not write workspace_subscriptions or activate limits.
BEGIN;
ALTER TABLE public.subscription_change_requests ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'plan_change' CHECK(request_kind IN ('upgrade','renewal','plan_change'));
CREATE TABLE public.licensing_plan_drafts (
 plan_id text PRIMARY KEY CHECK(plan_id IN ('free','standard','professional')),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 limits jsonb NOT NULL CHECK(jsonb_typeof(limits)='object'),
 features jsonb NOT NULL CHECK(jsonb_typeof(features)='array'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.licensing_workspace_details (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 renewal_date date, notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.licensing_management_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid REFERENCES public.organizations(id), actor_user_id uuid NOT NULL REFERENCES auth.users(id),
 event_type text NOT NULL CHECK(event_type IN ('plan_draft_saved','workspace_details_saved')),
 happened_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL
);
ALTER TABLE public.licensing_plan_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licensing_workspace_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licensing_management_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.licensing_plan_drafts,public.licensing_workspace_details,public.licensing_management_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.licensing_management_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER licensing_management_events_immutable BEFORE UPDATE OR DELETE ON public.licensing_management_events FOR EACH ROW EXECUTE FUNCTION public.prevent_subscription_admin_event_modification();
CREATE TRIGGER licensing_management_events_no_truncate BEFORE TRUNCATE ON public.licensing_management_events FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_subscription_admin_event_modification();
-- Catalogue copied from the existing observational policy, never used for enforcement.
INSERT INTO public.licensing_plan_drafts(plan_id,label,limits,features) VALUES
('free','Free','{"companies":1,"users":2,"employees":5,"invoicesPerMonth":25,"supplierBillsPerMonth":25}','["coreAccounting","smallBusinessPayroll"]'),
('standard','Standard','{"companies":1,"users":5,"employees":25,"invoicesPerMonth":null,"supplierBillsPerMonth":null}','["coreAccounting","smallBusinessPayroll","recurringBilling","projects","budgets","advancedReports"]'),
('professional','Professional','{"companies":null,"users":null,"employees":null,"invoicesPerMonth":null,"supplierBillsPerMonth":null}','["coreAccounting","smallBusinessPayroll","recurringBilling","projects","budgets","advancedReports","fullPayroll","makerChecker","periodClose","advancedTaxCompliance","auditControls"]');

CREATE FUNCTION public.platform_licensing_manage_internal(p_subject text,p_action text,p_payload jsonb DEFAULT '{}'::jsonb,p_offset integer DEFAULT 0)
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

CREATE FUNCTION public.customer_subscription_portal(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid();target uuid;req uuid;result jsonb; r public.subscription_change_requests%rowtype;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=actor AND (not_after IS NULL OR not_after>now())) THEN RAISE EXCEPTION 'Confirmed account required' USING errcode='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'subscription',to_jsonb(s),'requests',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC) FROM (SELECT id,requested_plan,request_kind,reason,status,created_at,review_note FROM public.subscription_change_requests WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 100) q),'[]'))),'[]') INTO result
  FROM public.organizations o JOIN public.organization_members m ON m.organization_id=o.id AND m.user_id=actor AND m.role::text='owner' LEFT JOIN public.workspace_subscriptions s ON s.organization_id=o.id;
  RETURN jsonb_build_object('businesses',result,'plans',(SELECT jsonb_agg(jsonb_build_object('plan_id',plan_id,'label',label) ORDER BY plan_id) FROM public.licensing_plan_drafts),'enforcement',false,'billing',false);
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
