-- Shared customer catalogue metadata; no backfill or existing entitlement updates.
BEGIN;
CREATE OR REPLACE FUNCTION public.customer_subscription_portal(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid();target uuid;req uuid;result jsonb; r public.subscription_change_requests%rowtype;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=actor AND (not_after IS NULL OR not_after>now())) THEN RAISE EXCEPTION 'Confirmed account required' USING errcode='42501'; END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'created_at',o.created_at,'subscription',to_jsonb(s),'requests',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC) FROM (SELECT id,requested_plan,request_kind,reason,status,created_at,review_note FROM public.subscription_change_requests WHERE organization_id=o.id ORDER BY created_at DESC LIMIT 100) q),'[]'))),'[]') INTO result
  FROM public.organizations o JOIN public.organization_members m ON m.organization_id=o.id AND m.user_id=actor AND m.role::text='owner' LEFT JOIN public.workspace_subscriptions s ON s.organization_id=o.id;
  RETURN jsonb_build_object('businesses',result,'plans',(SELECT jsonb_agg(jsonb_build_object('plan_id',plan_id,'label',label,'limits',limits,'features',features) ORDER BY plan_id) FROM public.licensing_plan_drafts),'enforcement',false,'billing',false);
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

-- The existing client model defaults new workspaces to Free. This records that
-- informational assignment for future workspaces only. Enforcement remains off.
CREATE FUNCTION public.initialize_new_workspace_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.workspace_subscriptions(organization_id,plan_id,status,professional_preview,source)
 VALUES(NEW.id,'free','active',false,'new_workspace_default') ON CONFLICT(organization_id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO public.subscription_admin_events(organization_id,actor_user_id,event_type,previous_plan,proposed_plan,metadata)
  VALUES(NEW.id,NEW.created_by,'plan_changed',NULL,'free',jsonb_build_object('initial_assignment',true,'enforcement',false,'billing',false));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.initialize_new_workspace_subscription() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER initialize_new_workspace_subscription AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.initialize_new_workspace_subscription();
NOTIFY pgrst,'reload schema';
COMMIT;
