# Help Desk ticket activation: routing blocker

The main `dalasipay` Cloudflare Worker currently serves static assets only (`cloudflare-main/wrangler.toml`). The ticket handler lives in a *different*, isolated Worker (`cloudflare-licensing-worker/index.mjs`).

**Do not enable** `DALASIPAY_HELPDESK_TICKETS_ENABLED` in production yet. The UI expects a same-origin HTTPS API URL. The current static Worker has no verified `/helpdesk/api` route to the separate ticket Worker. Switching the flag without providing a real route would make customer submissions fail.

Before production activation:

1. Test a dedicated staging host/route for the ticket Worker without changing the existing static application's custom domain. Verify Cloudflare origin, CORS, HTTPS, token validation and the feature flag with real browser requests.
2. Choose a route architecture that does not displace the static Worker's existing `dalasipay.bebusinesssolutionsgm.com` custom domain. For a different origin, explicitly design and test narrow CORS and update the client only after review.
3. Apply the Help Desk SQL migration to disposable and staging environments only, and verify cross-tenant RLS and session lifetimes. No production SQL until authorized.
4. Configure the ticket UI URL and enable flag only after test submissions and listings succeed with separately confirmed users and companies.
5. Continue showing the existing email-draft support form throughout rollout and maintain a server-side kill switch.

Nothing in this document grants customer submission access, sends email or deploys a new Worker.
