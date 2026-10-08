# DalasiPay first platform administrator: controlled bootstrap

Status: PROCEDURE DRAFT ONLY. No executable production grant, endpoint or appointment.

## Prerequisites
1. The platform operator establishes the candidate's identity through a trusted independent channel and confirms that the candidate controls their Supabase Auth account.
2. A separate authorized person approves the appointment and retains the approval record.
3. Verify the exact immutable Supabase Auth user UUID independently; never rely on an email address supplied in a request alone.
4. Confirm no duplicate administrator entry exists and record the current allowlist count.
5. Ensure the security reviewer can revoke the appointment if account access is compromised.

## Production change gate
The initial bootstrap cannot use an existing platform-admin approval because there are initially no platform administrators. It requires an explicit, separately audited exceptional process performed by an authorized infrastructure/database operator. Record the approver, operator, target Auth UUID, justification, date and outcome. Use a narrowly scoped privileged database session; never expose a bootstrap endpoint to browsers and never grant EXECUTE on the dormant plan-review function to ordinary users or service_role.

## Transaction and audit requirements
The actual appointment and its audit evidence must commit together or not at all. Existing subscription_admin_events event types currently do not include an administrator-appointed event; **extend and test the event schema and audit authorization first**, or use an independently controlled administrative security log. Do not record an appointment using a misleading plan_changed event. Avoid writing identities to public application logs.

## Aftercare
Verify exactly one expected administrator, run a second-person review of the record, and test the emergency revocation procedure in an isolated environment. No payment or plan enforcement changes accompany bootstrap.

## Unfinished
No operator identified, no approval received, no trusted UUID established, no admin inserted, no administration API enabled.

## Audit event schema prepared (2026-10-08)

The `subscription_admin_events` table now accepts `platform_admin_appointed` and `platform_admin_revoked` event types and requires a non-null `target_user_id` for those events. Existing audit history remains append-only. This is schema preparation only: it does not grant anyone administrator privileges, create an appointment, or enable an API. A disposable PostgreSQL constraint test has been added to `tests/licensing-postgres-atomic.sql`; successful CI execution is pending.
