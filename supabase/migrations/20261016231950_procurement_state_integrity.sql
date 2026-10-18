-- Proposed only: apply after staging acceptance. No customer backfill.
BEGIN;
CREATE TABLE public.procurement_state_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actor_user_id uuid NOT NULL, revision bigint NOT NULL,
 collection text NOT NULL, changes jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_state_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.procurement_state_events FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX procurement_events_org_revision ON public.procurement_state_events(organization_id,revision,id);
GRANT SELECT ON public.procurement_state_events TO authenticated;
CREATE POLICY procurement_events_read ON public.procurement_state_events FOR SELECT TO authenticated
 USING (private.has_org_role(organization_id,ARRAY['owner','payroll_admin']::public.org_role[]));

CREATE FUNCTION private.guard_procurement_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $$
DECLARE key text; prior jsonb; rows jsonb; row jsonb; previous jsonb; other jsonb;
 changes jsonb; actor uuid:=auth.uid(); status text; old_status text; ref text;
 bill jsonb; settled numeric; credits numeric; debits numeric; closed jsonb; request jsonb; prior_request jsonb;
BEGIN
 FOREACH key IN ARRAY ARRAY['business-expenses','purchase-orders','business-bills','business-payments','reversal-requests'] LOOP
  prior:=CASE WHEN TG_OP='INSERT' THEN '[]'::jsonb ELSE coalesce(OLD.state->'data'->key,'[]') END;
  rows:=coalesce(NEW.state->'data'->key,'[]');
  IF rows=prior THEN CONTINUE; END IF;
  IF actor IS NULL OR NOT private.has_org_role(NEW.organization_id,ARRAY['owner','payroll_admin']::public.org_role[]) THEN
   RAISE EXCEPTION 'Procurement access denied' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(rows)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) n WHERE n->>'id'=p->>'id')) THEN
   RAISE EXCEPTION 'Procurement records must be retained';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) n GROUP BY n->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate record ID'; END IF;
  changes:='[]';
  FOR row IN SELECT value FROM jsonb_array_elements(rows) LOOP
   SELECT value INTO previous FROM jsonb_array_elements(prior) WHERE value->>'id'=row->>'id';
   IF row=previous THEN CONTINUE; END IF;
   status:=coalesce(row->>'status','Draft');old_status:=coalesce(previous->>'status','Draft');
   IF nullif(row->>'id','') IS NULL OR (row ? 'organizationId' AND row->>'organizationId'<>NEW.organization_id::text) THEN RAISE EXCEPTION 'Wrong procurement workspace'; END IF;
   IF previous IS NULL THEN
    IF row->>'organizationId' IS DISTINCT FROM NEW.organization_id::text OR row->>'createdByUserId' IS DISTINCT FROM actor::text OR status<>(CASE WHEN key='reversal-requests' THEN 'Pending' ELSE 'Draft' END) THEN RAISE EXCEPTION 'New procurement must be an owned draft'; END IF;
   ELSE
    IF key='reversal-requests' AND old_status IN('Approved','Rejected') THEN RAISE EXCEPTION 'Decided reversal requests are immutable'; END IF;
    IF key='reversal-requests' AND (row-ARRAY['status','approvedAt','approvedBy','approvedByUserId','rejectedAt','rejectedBy','rejectedByUserId','rejectionReason'])<>(previous-ARRAY['status','approvedAt','approvedBy','approvedByUserId','rejectedAt','rejectedBy','rejectedByUserId','rejectionReason']) THEN RAISE EXCEPTION 'Reversal request facts are immutable'; END IF;
    IF previous->>'createdByUserId' IS DISTINCT FROM row->>'createdByUserId' OR previous->>'organizationId' IS DISTINCT FROM row->>'organizationId' THEN RAISE EXCEPTION 'Record ownership is immutable'; END IF;
    IF status='Pending approval' AND old_status NOT IN('Draft','Pending approval') THEN RAISE EXCEPTION 'Invalid procurement transition'; END IF;
    IF key='purchase-orders' THEN
     IF status='Ordered' AND old_status NOT IN('Approved','Ordered') OR status='Received' AND old_status NOT IN('Ordered','Received') OR status='Closed' AND old_status NOT IN('Received','Closed') THEN RAISE EXCEPTION 'Purchase approval and receiving sequence required'; END IF;
     IF old_status IN('Received','Closed') AND (row-ARRAY['status','linkedBillId','linkedInvoiceNo','updatedAt','updatedBy','closedAt'])<>(previous-ARRAY['status','linkedBillId','linkedInvoiceNo','updatedAt','updatedBy','closedAt']) THEN RAISE EXCEPTION 'Received purchase facts are immutable'; END IF;
    END IF;
    IF key<>'business-bills' AND old_status='Paid' AND (status<>'Reversed' OR nullif(row->>'reversalRequestId','') IS NULL OR nullif(row->>'reversalReason','') IS NULL OR
       (row-ARRAY['status','reversedAt','reversedBy','reversalReason','reversalRequestId','reversalCashTransactionId','updatedAt','updatedBy'])<>(previous-ARRAY['status','reversedAt','reversedBy','reversalReason','reversalRequestId','reversalCashTransactionId','updatedAt','updatedBy'])) THEN RAISE EXCEPTION 'Paid records require a controlled reversal'; END IF;
    IF key='business-bills' AND old_status IN('Approved','Part paid','Paid') AND
      (status NOT IN('Approved','Part paid','Paid') OR (row-ARRAY['status','paidAt','paymentId','updatedAt','updatedBy'])<>(previous-ARRAY['status','paidAt','paymentId','updatedAt','updatedBy'])) THEN RAISE EXCEPTION 'Posted bill is immutable'; END IF;
    IF status='Pending approval' AND old_status<>'Pending approval' AND row->>'submittedByUserId' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'Verified submitter required'; END IF;
    IF old_status<>'Draft' AND previous->>'submittedByUserId' IS DISTINCT FROM row->>'submittedByUserId' THEN RAISE EXCEPTION 'Submitter identity is immutable'; END IF;
    IF status='Approved' AND old_status<>'Approved' AND NOT(key='business-bills' AND old_status IN('Part paid','Paid')) THEN
     IF old_status<>(CASE WHEN key='reversal-requests' THEN 'Pending' ELSE 'Pending approval' END) OR
       coalesce(previous->>'createdByUserId',previous->>'submittedByUserId') IS NULL OR
       row->>'createdByUserId'=actor::text OR previous->>'submittedByUserId'=actor::text OR row->>'approvedByUserId' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'Independent approval required'; END IF;
    END IF;
    IF status='Paid' AND old_status NOT IN('Approved','Part paid') THEN RAISE EXCEPTION 'Approval required before settlement'; END IF;
   END IF;
   IF key IN('business-payments','business-expenses') AND old_status='Paid' AND status='Reversed' THEN
    SELECT value INTO request FROM jsonb_array_elements(coalesce(NEW.state->'data'->'reversal-requests','[]')) WHERE value->>'id'=row->>'reversalRequestId';
    SELECT value INTO prior_request FROM jsonb_array_elements(coalesce(OLD.state->'data'->'reversal-requests','[]')) WHERE value->>'id'=row->>'reversalRequestId';
    IF request IS NULL OR prior_request IS NULL OR prior_request->>'status'<>'Pending' OR request->>'status'<>'Approved' OR request->>'sourceId'<>row->>'id' OR request->>'approvedByUserId' IS DISTINCT FROM actor::text OR request->>'requestedByUserId'=actor::text THEN RAISE EXCEPTION 'Verified independent reversal request required'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(coalesce(NEW.state->'data'->'cash-transactions','[]')) t
     WHERE t->>'sourceKey'='reverse:'||(CASE key WHEN 'business-payments' THEN 'business-payment:' ELSE 'expense:' END)||(row->>'id')||':out'
      AND t->>'accountId'=row->>'accountId' AND t->>'direction'='in' AND (t->>'amount')::numeric=(row->>'amount')::numeric)<>1 THEN RAISE EXCEPTION 'Exactly one matching cash reversal required'; END IF;
   END IF;
   IF key<>'purchase-orders' AND (coalesce((row->>'amount')::numeric,0)<=0 OR (row->>'amount')::numeric IN('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) THEN RAISE EXCEPTION 'Invalid procurement amount'; END IF;
   IF key='business-payments' AND nullif(row->>'billId','') IS NOT NULL THEN
    SELECT value INTO bill FROM jsonb_array_elements(coalesce(NEW.state->'data'->'business-bills','[]')) WHERE value->>'id'=row->>'billId';
    IF bill IS NULL OR bill->>'status' NOT IN('Approved','Part paid','Paid') THEN RAISE EXCEPTION 'Approve supplier bill before payment'; END IF;
   END IF;
   IF key IN('business-payments','business-expenses') AND status='Paid' THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.state->'data'->'cash-accounts','[]')) a WHERE a->>'id'=row->>'accountId' AND coalesce(a->>'status','Active')='Active') THEN RAISE EXCEPTION 'Active payment account required'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(coalesce(NEW.state->'data'->'cash-transactions','[]')) t
      WHERE t->>'sourceKey'=(CASE key WHEN 'business-payments' THEN 'business-payment:' ELSE 'expense:' END)|| (row->>'id')||':out'
       AND t->>'accountId'=row->>'accountId' AND t->>'direction'='out' AND abs((t->>'amount')::numeric)=(row->>'amount')::numeric)<>1 THEN RAISE EXCEPTION 'Exactly one matching cash settlement required'; END IF;
   END IF;
   -- Closed periods cannot be bypassed by direct workspace RPC calls. Reversals
   -- use today's period; original posting dates remain immutable.
   FOR closed IN SELECT value FROM jsonb_array_elements(coalesce(NEW.state->'data'->'month-end-closes','[]')) LOOP
    IF closed->>'status'='Closed' AND closed->>'period'=left(CASE WHEN status IN('Paid','Reversed') THEN current_date::text ELSE coalesce(row->>'invoiceDate',row->>'expenseDate',row->>'requestDate',row->>'dueDate') END,7) THEN RAISE EXCEPTION 'Accounting period is closed'; END IF;
   END LOOP;
   ref:=regexp_replace(lower(coalesce(row->>'invoiceNo',row->>'reference','')),'[^a-z0-9]','','g');
   IF ref<>'' THEN
    FOR other IN SELECT value FROM jsonb_array_elements(rows) WHERE value->>'id'<>row->>'id' LOOP
     IF regexp_replace(lower(coalesce(other->>'invoiceNo',other->>'reference','')),'[^a-z0-9]','','g')=ref AND
      coalesce(other->>'beneficiaryId',other->>'supplierId',lower(other->>'supplier'),lower(other->>'merchant'),lower(other->>'supplierName'),lower(other->>'payee'),'')=
      coalesce(row->>'beneficiaryId',row->>'supplierId',lower(row->>'supplier'),lower(row->>'merchant'),lower(row->>'supplierName'),lower(row->>'payee'),'') THEN RAISE EXCEPTION 'Duplicate supplier reference'; END IF;
    END LOOP;
   END IF;
   changes:=changes||jsonb_build_array(jsonb_build_object('id',row->>'id','previous_status',previous->>'status','status',status,'amount',row->>'amount','reference',ref));
  END LOOP;
  INSERT INTO public.procurement_state_events(organization_id,actor_user_id,revision,collection,changes) VALUES(NEW.organization_id,actor,NEW.revision,key,changes);
 END LOOP;
 -- Check every posted supplier settlement against the authoritative bill,
 -- credit/debit notes and all paid settlements in this same atomic snapshot.
 IF TG_OP='INSERT' OR NEW.state->'data'->'business-payments' IS DISTINCT FROM OLD.state->'data'->'business-payments' THEN
  FOR bill IN SELECT value FROM jsonb_array_elements(coalesce(NEW.state->'data'->'business-bills','[]')) LOOP
   SELECT coalesce(sum((value->>'amount')::numeric),0) INTO settled FROM jsonb_array_elements(coalesce(NEW.state->'data'->'business-payments','[]')) WHERE value->>'billId'=bill->>'id' AND value->>'status'='Paid';
   SELECT coalesce(sum((value->>'amount')::numeric),0) INTO credits FROM jsonb_array_elements(coalesce(NEW.state->'data'->'supplier-credit-notes','[]')) WHERE value->>'billId'=bill->>'id' AND coalesce(value->>'status','')<>'Void';
   SELECT coalesce(sum((value->>'amount')::numeric),0) INTO debits FROM jsonb_array_elements(coalesce(NEW.state->'data'->'supplier-debit-notes','[]')) WHERE value->>'billId'=bill->>'id' AND coalesce(value->>'status','')<>'Void';
   IF settled>(bill->>'amount')::numeric+debits-credits+.004 THEN RAISE EXCEPTION 'Supplier bill is overpaid'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_procurement_state() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER procurement_state_integrity AFTER INSERT OR UPDATE ON public.organization_app_state
 FOR EACH ROW EXECUTE FUNCTION private.guard_procurement_state();
COMMIT;
