# Help Desk activation verification

The Help Desk email-draft feature is live. All tracked-ticket components are **dormant**.

## Mandatory staging checks before any activation

1. Apply `20261012170000_helpdesk_ticket_foundation.sql` only to staging first. Validate the migration, RLS grants and dependencies on `organizations`, `organization_members`, and `auth.users`.
2. Verify a signed-in user can create a ticket only as themselves for an organization of which they are currently a member.
3. Verify a user cannot create a ticket for another organization, create a ticket on another user's behalf, or set `status` or `resolved_at` during creation.
4. Verify users cannot read other users' tickets, even inside the same organization, and former members lose access. An anonymous client should not read or write tickets.
5. Verify authenticated users have no UPDATE or DELETE permissions, and that row-level policies remain effective for browser access.
6. Validate the Cloudflare handler against the staging database using real authenticated tokens. Verify cross-origin rejection, over-limit input rejection, and that no ticket is reported created when an insert fails.
7. Verify support-staff access through Cloudflare Access and a *separate private administrator authorization service*, not through customer membership or a browser-supplied role.
8. Introduce server-side staff-only ticket read/update operations and immutable audit records. Recheck creator/assignee permissions, transitions, and anti-spam limits.
9. Connect the Help Desk form and ticket history only after the backend passes integration tests. Provide errors on submission failure and avoid retaining sensitive request data in logs.
10. Integrate a verified email service with delivery/response handling, rate limits and suppression of confidential ticket details in email. Test delivery and failure handling before enabling notifications.

## Release controls

- Do **not** infer that merging or deploying dormant modules applies the SQL migration.
- Do **not** add `handleHelpdeskRequest` to the Worker router before the staging checks pass.
- Do **not** advertise a ticket as submitted unless database insertion actually succeeds.
- Keep the existing `mailto:` support form available as a fallback throughout rollout.
