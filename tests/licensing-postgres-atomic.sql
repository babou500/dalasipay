\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.subscription_platform_admins(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
CREATE TABLE public.subscription_change_requests(
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 requested_by uuid NOT NULL REFERENCES auth.users(id),requested_plan text NOT NULL,
 status text NOT NULL DEFAULT 'pending', reviewed_by uuid, reviewed_at timestamptz,
 review_note text,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.subscription_admin_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_user_id uuid,event_type text,previous_plan text,
 proposed_plan text,metadata jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION public.review_subscription_request_internal(
 p_request_id uuid,p_reviewer_id uuid,p_decision text,p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.subscription_change_requests%rowtype;
BEGIN
 IF p_decision NOT IN ('approved','rejected') OR p_note IS NULL
 OR char_length(trim(p_note))<10 OR char_length(p_note)>1000 THEN
 RAISE EXCEPTION 'Invalid review decision' USING errcode='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_platform_admins WHERE user_id=p_reviewer_id) THEN
 RAISE EXCEPTION 'Platform authorization required' USING errcode='42501'; END IF;
 SELECT * INTO r FROM public.subscription_change_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.requested_by=p_reviewer_id THEN
 RAISE EXCEPTION 'Review unavailable' USING errcode='55000'; END IF;
 UPDATE public.subscription_change_requests SET status=p_decision,reviewed_by=p_reviewer_id,
 reviewed_at=now(),review_note=p_note,updated_at=now() WHERE id=r.id AND status='pending';
 INSERT INTO public.subscription_admin_events(organization_id,request_id,actor_user_id,event_type,previous_plan,proposed_plan,metadata)
 VALUES(r.organization_id,r.id,p_reviewer_id,CASE WHEN p_decision='approved' THEN 'review_approved' ELSE 'review_rejected' END,NULL,r.requested_plan,'{}'::jsonb);
 RETURN true;
END $$;
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.organizations VALUES('33333333-3333-4333-8333-333333333333');
INSERT INTO public.subscription_platform_admins VALUES('22222222-2222-4222-8222-222222222222');
INSERT INTO public.subscription_change_requests(id,organization_id,requested_by,requested_plan)
VALUES('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','standard');
DO $$
BEGIN
 PERFORM public.review_subscription_request_internal('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','approved','Approved in isolated test');
 IF (SELECT status FROM public.subscription_change_requests WHERE id='44444444-4444-4444-8444-444444444444')<>'approved' THEN RAISE EXCEPTION 'Approval missing'; END IF;
 IF (SELECT count(*) FROM public.subscription_admin_events)<>1 THEN RAISE EXCEPTION 'Audit event missing'; END IF;
END $$;
UPDATE public.subscription_change_requests SET status='pending',reviewed_by=null,reviewed_at=null;
TRUNCATE public.subscription_admin_events;
CREATE FUNCTION public.test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
CREATE TRIGGER test_fail_audit BEFORE INSERT ON public.subscription_admin_events
FOR EACH ROW EXECUTE FUNCTION public.test_reject_audit();
DO $$
BEGIN
 BEGIN
  PERFORM public.review_subscription_request_internal('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','approved','This audit must fail');
  RAISE EXCEPTION 'Expected audit failure did not happen';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'injected audit failure' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.subscription_change_requests WHERE id='44444444-4444-4444-8444-444444444444')<>'pending' THEN RAISE EXCEPTION 'Rollback failed'; END IF;
 IF (SELECT count(*) FROM public.subscription_admin_events)<>0 THEN RAISE EXCEPTION 'Audit rollback failed'; END IF;
END $$;
DROP TRIGGER test_fail_audit ON public.subscription_admin_events;
SELECT 'PASS: atomic success and audit-failure rollback' AS result;
ALTER TABLE public.subscription_admin_events ADD COLUMN target_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.subscription_admin_events ADD CONSTRAINT admin_event_target_check
CHECK (event_type NOT IN ('platform_admin_appointed','platform_admin_revoked') OR target_user_id IS NOT NULL);
DO $
BEGIN
 BEGIN
  INSERT INTO public.subscription_admin_events(organization_id,request_id,event_type)
  VALUES('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','platform_admin_appointed');
  RAISE EXCEPTION 'Missing target accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM public.subscription_admin_events) THEN
   RAISE EXCEPTION 'Invalid admin event was inserted';
 END IF;
END $;
SELECT 'PASS: administrative audit event requires target identity' AS admin_audit_result;

