// Isolated disposable PostgreSQL fixture. Never connects to Supabase or production.
import {pathToFileURL} from 'node:url';
export const org='11111111-1111-4111-8111-111111111111',maker='22222222-2222-4222-8222-222222222222',checker='33333333-3333-4333-8333-333333333333',hr='44444444-4444-4444-8444-444444444444',outsider='55555555-5555-4555-8555-555555555555';
export async function createProcurementDatabase(){
 const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA private;
 CREATE TYPE public.org_role AS ENUM('owner','payroll_admin','hr','viewer');CREATE TABLE public.organizations(id uuid PRIMARY KEY);
 INSERT INTO public.organizations VALUES('${org}');CREATE TABLE private.members(user_id uuid,organization_id uuid,role public.org_role);
 INSERT INTO private.members VALUES('${maker}','${org}','owner'),('${checker}','${org}','payroll_admin'),('${hr}','${org}','hr');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('fixture.user',true),'')::uuid $$;
 CREATE FUNCTION private.has_org_role(target uuid,roles public.org_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM private.members WHERE user_id=auth.uid() AND organization_id=target AND role=ANY(roles)) $$;
 GRANT USAGE ON SCHEMA auth,private TO authenticated;
 CREATE TABLE public.organization_app_state(organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),schema_version text,revision bigint,state jsonb,updated_by uuid,updated_at timestamptz);
 ALTER TABLE public.organization_app_state ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE ON public.organization_app_state TO authenticated;
 CREATE POLICY app_state_select ON public.organization_app_state FOR SELECT TO authenticated USING(private.has_org_role(organization_id,ARRAY['owner','payroll_admin','hr']::public.org_role[]));
 CREATE POLICY app_state_insert ON public.organization_app_state FOR INSERT TO authenticated WITH CHECK(private.has_org_role(organization_id,ARRAY['owner','payroll_admin','hr']::public.org_role[]) AND updated_by=auth.uid());
 CREATE POLICY app_state_update ON public.organization_app_state FOR UPDATE TO authenticated USING(private.has_org_role(organization_id,ARRAY['owner','payroll_admin','hr']::public.org_role[])) WITH CHECK(private.has_org_role(organization_id,ARRAY['owner','payroll_admin','hr']::public.org_role[]) AND updated_by=auth.uid());
 -- Mirrors the inspected deployed SECURITY INVOKER CAS/upsert RPC.
 CREATE FUNCTION public.save_organization_app_state(target_org uuid,expected_revision bigint,new_schema_version text,new_state jsonb) RETURNS TABLE(revision bigint,updated_at timestamptz,conflict boolean) LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
 DECLARE saved_revision bigint;saved_at timestamptz;current_revision bigint;BEGIN
 INSERT INTO public.organization_app_state(organization_id,schema_version,revision,state,updated_by,updated_at) VALUES(target_org,new_schema_version,1,new_state,auth.uid(),now())
 ON CONFLICT(organization_id) DO UPDATE SET schema_version=excluded.schema_version,revision=public.organization_app_state.revision+1,state=excluded.state,updated_by=auth.uid(),updated_at=now() WHERE public.organization_app_state.revision=expected_revision
 RETURNING public.organization_app_state.revision,public.organization_app_state.updated_at INTO saved_revision,saved_at;
 IF saved_revision IS NOT NULL THEN RETURN QUERY SELECT saved_revision,saved_at,false;RETURN;END IF;
 SELECT s.revision INTO current_revision FROM public.organization_app_state s WHERE s.organization_id=target_org;
 RETURN QUERY SELECT coalesce(current_revision,0),now(),true;END $$;`);

 return db;
}
