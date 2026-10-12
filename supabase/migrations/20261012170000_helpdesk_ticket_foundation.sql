-- DalasiPay help desk phase 2: private, tenant-scoped ticket storage only.
-- No live form, email dispatch, or staff dashboard is enabled by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  category text NOT NULL CHECK (category IN ('Technical problem','Accounting or reports','Invoices and payments','Payroll','Tax and GRA','Subscription or login','Other question')),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 5 AND 120),
  details text NOT NULL CHECK (char_length(btrim(details)) BETWEEN 10 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting_for_customer','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS helpdesk_tickets_owner_created_idx
  ON public.helpdesk_tickets (organization_id, created_by, created_at DESC);
ALTER TABLE public.helpdesk_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_tickets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.helpdesk_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.helpdesk_tickets TO authenticated;
-- A member can see only tickets they themselves created for a workspace they still belong to.
CREATE POLICY helpdesk_ticket_read_own ON public.helpdesk_tickets FOR SELECT TO authenticated
 USING (created_by=(SELECT auth.uid()) AND EXISTS (
   SELECT 1 FROM public.organization_members m
   WHERE m.organization_id=helpdesk_tickets.organization_id AND m.user_id=(SELECT auth.uid())
 ));
-- Never trust a supplied created_by or workspace ID unless the authenticated actor is a member.
CREATE POLICY helpdesk_ticket_create_own ON public.helpdesk_tickets FOR INSERT TO authenticated
 WITH CHECK (created_by=(SELECT auth.uid()) AND status='open' AND resolved_at IS NULL
 AND EXISTS (
   SELECT 1 FROM public.organization_members m
   WHERE m.organization_id=helpdesk_tickets.organization_id AND m.user_id=(SELECT auth.uid())
 ));
-- No customer UPDATE/DELETE grants. Staff support and email notifications require a separate review.
COMMENT ON TABLE public.helpdesk_tickets IS 'Private support-ticket foundation. Not activated in customer UI; no outbound email integration.';
COMMIT;
