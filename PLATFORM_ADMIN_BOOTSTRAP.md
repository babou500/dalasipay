# DalasiPay first platform administrator

The current authorized procedure supports a legitimate sole-owner first appointment.
The owner requested this exception on 2026-10-09; no fictitious second approver is
required. Appointment remains conditional on authenticated ownership evidence and
verification of the actual signed Cloudflare Access JWT subject.

See [the controlled procedure](cloudflare-admin-worker/README.md),
[the atomic one-time SQL](cloudflare-admin-worker/bootstrap-owner.sql), and
[actual verification results](cloudflare-admin-worker/VERIFICATION.md).

The procedure creates no public bootstrap endpoint. Existing appointment audit
history permanently consumes eligibility, even after revocation. Membership,
identity mapping, and honest owner-authorization evidence commit together.
No subscription, billing, accounting, or payroll change accompanies appointment.

Status: ownership and actual signed Access identity verified. The atomic owner
appointment committed with audit event 1. Live authorization and the read-only
dashboard passed, displaying all 13 unchanged Professional Preview subscriptions.
A second live bootstrap attempt was rejected. Initial bootstrap is consumed.
