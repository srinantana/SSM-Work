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
