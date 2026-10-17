# SSM Work

SSM Work with Supabase Auth and membership-protected real Sheet trial data. See [AUTH_SETUP.md](AUTH_SETUP.md) for current setup, verification and remaining account/deployment steps.

## Run locally

Requires Node.js 24.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The example environment points to the existing **SSMWork** Supabase project. It contains only the project URL and a public publishable key; no service-role or secret key is required.

## Accounts, data access and deployment

See [AUTH_SETUP.md](AUTH_SETUP.md). Signup requires email verification and administrator-approved membership before company data is visible. The private allowlist migration is applied to Supabase, but no first owner email has been approved. Do not create a shared password or grant access to the first signup automatically.

The Next.js proxy protects routes and refreshes cookies. Server pages and APIs verify the user independently. Trial pages and APIs additionally require membership and use Supabase RLS. Signup, password recovery and email confirmation are implemented; business approval roles and Base44 expense modules are not migrated here.

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN` in each deployment environment. Supabase Auth callback URL/email template configuration is required before release. Use only a publishable client key; never expose secret/service-role keys.

## Verification

```sh
npm run typecheck
npm run build
npm test
```

Integration tests run against the production server and verify public login, anonymous redirects, direct API rejection and forged-cookie rejection. GitHub Actions runs the same checks. A real account is still required to manually verify successful login, dashboard access, refresh, logout and subsequent rejection; no test users were created in the live project.

The font is IBM Plex Sans Thai, with the navy/red palette used in the RAK Site Expense design.


## Six-category Draft estimates

Open a saved project → Estimate Studio (`/projects/[id]/expenses`). The original V02 categories are Manpower, Subcontract, Accommodation, Travel, Transport and Site Expense. Shared people/rooms/vehicles and project calendar dates supply editable defaults. Automatic days are inclusive calendar days; automatic hotel nights are elapsed nights. Travel days are shown separately and never implicitly added. Hourly OT, half-day counts, monthly stays, trip counts and rates without an active Master remain explicit inputs.

The authenticated owner can save incomplete drafts. `ssm_project_estimates` stores the document, a per-line Master snapshot, revision, known subtotal, incomplete count and a nullable complete total. The database trigger resolves authorized Master rows and recomputes decimal amounts; client-supplied totals/snapshots are ignored. Manual pricing requires a source/reason to count as complete. Each line rounds half-up to two decimals. Excluded sections retain their lines without contributing to the estimate. No VAT, FX, contingency, holiday multiplier or approval rules are assumed.

Deploy `database/project_estimates.sql` before the application. It adds an RLS-protected table and an invoker trigger without changing existing projects or imported rates. Saves use optimistic revisions; the trigger locks and checks the parent project revision to prevent concurrent project-date edits. Review changed project dates explicitly in the editor before saving.

Validation: `tests/estimate.test.mjs` checks calendar, units, overrides, missing/expired pricing, excluded categories and decimal rounding. `database/tests/project_estimates.sql` is a transaction-only rollback suite for authorized owner access, trusted snapshots, totals, stale writes, project races and denied access. It requires the existing named test-project fixture and does not retain test records.
