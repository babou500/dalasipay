\set ON_ERROR_STOP on
-- Disposable PostgreSQL database only. Never run against production.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.organization_members(organization_id uuid NOT NULL REFERENCES public.organizations(id),user_id uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(organization_id,user_id));
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.organizations VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.organization_members VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
-- Limited fixture grants: RLS on helpdesk_tickets still enforces row restrictions.
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
\ir ../supabase/migrations/20261012170000_helpdesk_ticket_foundation.sql
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
INSERT INTO public.helpdesk_tickets (organization_id,created_by,category,subject,details) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Technical problem','Test report','Test problem details');
DO $$BEGIN
 IF (SELECT count(*) FROM public.helpdesk_tickets)<>1 THEN RAISE EXCEPTION 'owner cannot read own ticket'; END IF;
END$$;
-- Failed inserts are isolated in savepoints to keep assertions transaction-safe.
SAVEPOINT cross_workspace;
DO $$BEGIN
 BEGIN
  INSERT INTO public.helpdesk_tickets (organization_id,created_by,category,subject,details) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','Technical problem','Invalid org','Expected RLS denial');
  RAISE EXCEPTION 'cross-organization insert unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END$$;
RELEASE SAVEPOINT cross_workspace;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $$BEGIN
 IF (SELECT count(*) FROM public.helpdesk_tickets)<>0 THEN RAISE EXCEPTION 'other user can read tickets'; END IF;
END$$;
RESET ROLE;
-- This entire test runs against an isolated disposable PostgreSQL service.
