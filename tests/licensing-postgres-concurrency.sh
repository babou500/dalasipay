#!/usr/bin/env bash
set -euo pipefail
test "${PGDATABASE:-}" = "licensing_test"
# Previous atomic test script creates disposable schema and records.
psql -v ON_ERROR_STOP=1 -c "DROP TRIGGER IF EXISTS test_fail_audit ON public.subscription_admin_events"
psql -v ON_ERROR_STOP=1 -c "UPDATE public.subscription_change_requests SET status='pending',reviewed_by=NULL,reviewed_at=NULL,review_note=NULL"
psql -v ON_ERROR_STOP=1 -c "TRUNCATE public.subscription_admin_events"
a=$(mktemp); b=$(mktemp)
cleanup(){ rm -f "$a" "$b"; }; trap cleanup EXIT
# Both sessions race against the same pending request.
psql -X -v ON_ERROR_STOP=1 -At -c "SELECT public.review_subscription_request_internal('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','approved','First concurrent review')" >"$a" 2>&1 &
pid1=$!
psql -X -v ON_ERROR_STOP=1 -At -c "SELECT public.review_subscription_request_internal('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','rejected','Second concurrent review')" >"$b" 2>&1 &
pid2=$!
set +e
wait "$pid1"; s1=$?
wait "$pid2"; s2=$?
set -e
if ! { [ "$s1" -eq 0 ] && [ "$s2" -ne 0 ]; } && ! { [ "$s2" -eq 0 ] && [ "$s1" -ne 0 ]; }; then
 echo "FAIL: expected exactly one successful reviewer"; cat "$a" "$b"; exit 1
fi
psql -v ON_ERROR_STOP=1 -At -c "SELECT CASE WHEN (SELECT count(*) FROM public.subscription_admin_events)=1 AND (SELECT count(*) FROM public.subscription_change_requests WHERE status IN ('approved','rejected'))=1 THEN 'PASS' ELSE 'FAIL' END" | grep -qx PASS
echo "PASS: concurrent approval produced one review and one audit event"
