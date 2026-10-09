// Real isolated PostgreSQL (PGlite), never a production database connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';
import staging from '../cloudflare-admin-worker/staging-entry.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
const bootstrap=await readFile(new URL('../cloudflare-admin-worker/bootstrap-first-admin.sql',import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111';
const organization='22222222-2222-4222-8222-222222222222';
const subject='verified-bootstrap-subject';
const values={access_subject:subject,target_user_id:user,organization_id:organization,approver:'independent-approver',operator:'database-operator',approval_reference:'approval-123',reason:'Approved first administrator setup'};
function sql(overrides={}){
 const params={...values,...overrides};
 return bootstrap.replace(/^\\set.*$/gm,'').replace(/\\gset/g,';').replace(/:'([a-z_]+)'/g,(_,name)=>"'"+params[name].replaceAll("'","''")+"'");
}
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA auth;
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz);
 CREATE TABLE public.organizations(id uuid PRIMARY KEY);
 CREATE TABLE public.subscription_platform_admins(user_id uuid PRIMARY KEY REFERENCES auth.users(id),granted_at timestamptz DEFAULT now());
 CREATE TABLE public.platform_admin_access_identities(access_subject text PRIMARY KEY CHECK(length(access_subject) BETWEEN 8 AND 256),user_id uuid REFERENCES auth.users(id),approved boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now());
 ALTER TABLE public.subscription_platform_admins ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.platform_admin_access_identities ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.subscription_platform_admins,public.platform_admin_access_identities FROM PUBLIC,anon,authenticated,service_role;
 CREATE TABLE public.subscription_admin_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),actor_user_id uuid REFERENCES auth.users(id),target_user_id uuid REFERENCES auth.users(id),event_type text NOT NULL CHECK(event_type IN ('platform_admin_appointed','platform_admin_revoked')),metadata jsonb NOT NULL DEFAULT '{}',CHECK(target_user_id IS NOT NULL));
 CREATE TABLE public.workspace_subscriptions(organization_id uuid PRIMARY KEY,plan_id text,status text,professional_preview boolean,updated_at timestamptz);
 INSERT INTO auth.users VALUES ('${user}',NULL);
 INSERT INTO public.organizations VALUES ('${organization}');
 INSERT INTO public.workspace_subscriptions VALUES ('${organization}','professional','professional_preview',true,now());
 CREATE FUNCTION public.platform_admin_identity_authorized_internal(p_subject text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT EXISTS(SELECT 1 FROM public.platform_admin_access_identities m JOIN public.subscription_platform_admins a ON a.user_id=m.user_id WHERE m.access_subject=p_subject AND m.approved IS TRUE) $$;
 REVOKE ALL ON FUNCTION public.platform_admin_identity_authorized_internal(text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.platform_admin_identity_authorized_internal(text) TO service_role;
 GRANT SELECT ON public.workspace_subscriptions TO service_role;`);
 return db;
}
async function counts(db){return (await db.query('SELECT (SELECT count(*)::int FROM subscription_platform_admins) AS admins,(SELECT count(*)::int FROM platform_admin_access_identities) AS identities,(SELECT count(*)::int FROM subscription_admin_events) AS events')).rows[0];}
test('bootstrap commits exact-subject membership and audited appointment together; repeat rejected',async()=>{
 const db=await fixture();try{
  const before=(await db.query('SELECT * FROM workspace_subscriptions')).rows;
  await db.exec(sql());assert.deepEqual(await counts(db),{admins:1,identities:1,events:1});
  const event=(await db.query('SELECT * FROM subscription_admin_events')).rows[0];assert.equal(event.target_user_id,user);assert.equal(event.metadata.approval_reference,values.approval_reference);assert.equal(event.metadata.access_subject,subject);
  assert.equal((await db.query('SELECT platform_admin_identity_authorized_internal($1) AS allowed',[subject])).rows[0].allowed,true);
  assert.equal((await db.query('SELECT platform_admin_identity_authorized_internal($1) AS allowed',['same-email-different-subject'])).rows[0].allowed,false);
  await assert.rejects(db.exec(sql()),/already used/);await db.exec('ROLLBACK');assert.deepEqual(await counts(db),{admins:1,identities:1,events:1});assert.deepEqual((await db.query('SELECT * FROM workspace_subscriptions')).rows,before);
 }finally{await db.close();}
});
test('invalid approval, missing Auth UUID and whitespace subject leave no appointment',async()=>{
 for(const override of [{approver:values.operator},{target_user_id:'33333333-3333-4333-8333-333333333333'},{access_subject:'subject with space'},{organization_id:'33333333-3333-4333-8333-333333333333'}]){
  const db=await fixture();try{await assert.rejects(db.exec(sql(override)));await db.exec('ROLLBACK');assert.deepEqual(await counts(db),{admins:0,identities:0,events:0});}finally{await db.close();}
 }
});
test('audit failure rolls back both allowlist and approved identity mapping',async()=>{
 const db=await fixture();try{await db.exec("ALTER TABLE subscription_admin_events ADD CONSTRAINT fail_audit CHECK (false)");await assert.rejects(db.exec(sql()),/fail_audit/);await db.exec('ROLLBACK');assert.deepEqual(await counts(db),{admins:0,identities:0,events:0});}finally{await db.close();}
});
test('browser roles cannot execute lookup; service role sees boolean but no roster; revocation denies',async()=>{
 const db=await fixture();try{
  await db.exec(sql());
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT platform_admin_identity_authorized_internal($1)',[subject]),/permission denied/);await db.exec('RESET ROLE');}
  await db.exec('SET ROLE service_role');assert.equal((await db.query('SELECT platform_admin_identity_authorized_internal($1) AS allowed',[subject])).rows[0].allowed,true);await assert.rejects(db.query('SELECT * FROM subscription_platform_admins'),/permission denied/);await db.exec('RESET ROLE');
  await db.exec('UPDATE platform_admin_access_identities SET approved=false');assert.equal((await db.query('SELECT platform_admin_identity_authorized_internal($1) AS allowed',[subject])).rows[0].allowed,false);
  await db.exec('UPDATE platform_admin_access_identities SET approved=true; DELETE FROM subscription_platform_admins');assert.equal((await db.query('SELECT platform_admin_identity_authorized_internal($1) AS allowed',[subject])).rows[0].allowed,false);
 }finally{await db.close();}
});
test('two Worker entry points plus real PostgreSQL: signed JWT to membership to subscription HTML',async()=>{
 const db=await fixture();try{
  await db.exec(sql());
  const source=await readFile(new URL('../cloudflare-admin-worker/worker-paste-private.js',import.meta.url),'utf8');
  const {createPrivateWorker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const key={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'db-test-key'};
  const issuer='https://postgres-fixture.cloudflareaccess.com';const aud='admin-fixture';const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const input=encode({alg:'RS256',kid:key.kid})+'.'+encode({iss:issuer,aud:[aud],sub:subject,iat:1000,exp:2000});const jwt=input+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');
  let queries=0;
  const privateWorker=createPrivateWorker({cryptoImpl:webcrypto,now:()=>1500,fetchImpl:async(target,options)=>{
   const url=new URL(target);if(url.pathname==='/cdn-cgi/access/certs')return Response.json({keys:[key]});queries++;
   await db.exec('SET ROLE service_role');try{
    if(url.pathname.includes('/rpc/'))return Response.json((await db.query('SELECT platform_admin_identity_authorized_internal($1) AS allowed',[JSON.parse(options.body).p_subject])).rows[0].allowed);
    assert.equal(options.method,'GET');return Response.json((await db.query('SELECT organization_id,plan_id,status,professional_preview,updated_at::text FROM workspace_subscriptions ORDER BY organization_id LIMIT 101')).rows);
   }finally{await db.exec('RESET ROLE');}
  }});
  const binding={fetch:r=>privateWorker.fetch(r,{ACCESS_ISSUER:issuer,ACCESS_AUDIENCE:aud,DALASIPAY_SUPABASE_URL:'https://zdpmlzmljozcmqndyfog.supabase.co',DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:'fixture-only'})};
  const request=()=>new Request('https://fixture.internal/',{headers:{'cf-access-jwt-assertion':jwt}});
  const response=await staging.fetch(request(),{ADMIN_MEMBERSHIP_SERVICE:binding});assert.equal(response.status,200);assert.match(await response.text(),/professional_preview/);assert.equal(queries,2);
  await db.exec('UPDATE platform_admin_access_identities SET approved=false');assert.equal((await staging.fetch(request(),{ADMIN_MEMBERSHIP_SERVICE:binding})).status,403);assert.equal(queries,3);
 }finally{await db.close();}
});
