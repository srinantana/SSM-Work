# SSM Work

Next.js starter for SSM Work with Supabase email/password authentication. The original repository was empty; the Site Expense modules have not yet been migrated from Base44.

## Run locally

Requires Node.js 24.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The example environment points to the existing **SSMWork** Supabase project. It contains only the project URL and a public publishable key; no service-role or secret key is required.

## Accounts

Email/password authentication is already enabled on the connected Supabase project. Create the first approved account in [Supabase Auth → Users](https://supabase.com/dashboard/project/otsidhsoazlznniqyamo/auth/users). Choose **Add user → Create new user**, set an email and password, and confirm the email through the administrator UI if appropriate. No invitation or email is sent by this implementation.

There is no public signup form. Supabase currently has public signup enabled; the absence of a signup page does **not** prevent signup through its API. For an internal employee app, disable **Allow new users to sign up** in the project’s Auth settings before production use and provision approved accounts through the dashboard. This repository implements authentication, not employee membership or admin/approver authorization.

## Routes and security

- `/login`: public sign-in page.
- `/dashboard`: server-protected starter workspace.
- `/api/me`: returns only the authenticated user's ID and email, otherwise HTTP 401.
- All other matched routes require authentication by default. Put future application pages under `app/(protected)/`.

Proxy validates tokens with `getClaims()` and preserves refreshed cookies. Protected layouts/pages and API handlers also call `getUser()` to verify the user with Supabase. Anonymous Supabase users are rejected. Authenticated responses are never publicly cached. Login/logout use POST Server Actions with Next.js origin checking; logout affects the current session.

Every future Server Action and API handler that reads or changes application data must authenticate independently. Use `requireUser()` in actions/pages or `currentUser()` plus a 401 response in APIs. Route protection does not replace database authorization. There are currently no public application tables: enable RLS and define project membership/role policies before adding expense data. Never authorize using editable `user_metadata` or expose secret/service-role keys.

## Vercel setup

Import this repository as a Next.js project and set these variables for each deployment environment from `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The password login flow needs no email callback route. Set Supabase Auth's Site URL to the production origin before adding invitations, recovery or OAuth; then allow only the exact callback origins you use. Password recovery, signup, OAuth and business roles are outside this starter.

## Verification

```sh
npm run typecheck
npm run build
npm test
```

Integration tests run against the production server and verify public login, anonymous redirects, direct API rejection and forged-cookie rejection. GitHub Actions runs the same checks. A real account is still required to manually verify successful login, dashboard access, refresh, logout and subsequent rejection; no test users were created in the live project.

The font is IBM Plex Sans Thai. The starter uses a provisional green palette; it does not claim to reproduce the verified RAK brand palette.
