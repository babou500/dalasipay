-- DalasiPay owner-approved annual pricing DRAFTS only (2026-10-09).
-- Does not collect money, enable enforcement, set expiry, or change any workspace entitlement.
BEGIN;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.licensing_plan_drafts) <> 3
     OR (SELECT count(*) FROM public.licensing_plan_drafts WHERE plan_id IN ('free','standard','professional')) <> 3
  THEN RAISE EXCEPTION 'Expected exactly the three existing pricing draft plans'; END IF;
  IF (SELECT count(*) FROM public.subscription_platform_admins) <> 1
  THEN RAISE EXCEPTION 'Expected an established sole platform administrator for audit attribution'; END IF;
END $guard$;

ALTER TABLE public.licensing_plan_drafts
  ADD COLUMN annual_price_gmd integer NOT NULL DEFAULT 0,
  ADD COLUMN currency_code text NOT NULL DEFAULT 'GMD',
  ADD COLUMN billing_period_months integer NOT NULL DEFAULT 12;

-- Preserve the pre-change state as immutable management history.
INSERT INTO public.licensing_management_events(actor_user_id,event_type,metadata)
SELECT a.user_id,'plan_draft_saved',jsonb_build_object(
    'plan_id',p.plan_id,
    'change','annual_pricing_draft_initialized',
    'before',jsonb_build_object('annual_price_gmd',NULL,'currency_code',NULL,'billing_period_months',NULL),
    'after',jsonb_build_object('annual_price_gmd',v.annual_price_gmd,'currency_code','GMD','billing_period_months',12),
    'features_unchanged',true,'limits_unchanged',true,
    'billing_enabled',false,'enforcement_enabled',false,'customer_subscription_changed',false)
FROM public.subscription_platform_admins a
CROSS JOIN public.licensing_plan_drafts p
JOIN (VALUES ('free',0),('standard',12500),('professional',25000))
     AS v(plan_id,annual_price_gmd) ON v.plan_id=p.plan_id;

UPDATE public.licensing_plan_drafts p
SET annual_price_gmd=v.annual_price_gmd,
    version=p.version+1,
    updated_at=now()
FROM (VALUES ('free',0),('standard',12500),('professional',25000))
     AS v(plan_id,annual_price_gmd)
WHERE p.plan_id=v.plan_id;

ALTER TABLE public.licensing_plan_drafts
  ADD CONSTRAINT licensing_plan_drafts_annual_pricing_valid CHECK (
    annual_price_gmd >= 0
    AND currency_code = 'GMD'
    AND billing_period_months = 12
    AND ((plan_id = 'free' AND annual_price_gmd = 0)
      OR (plan_id <> 'free' AND annual_price_gmd > 0))
  );

NOTIFY pgrst,'reload schema';
COMMIT;
