# Auth setup and trial access

## Current state

The existing `feat/supabase-auth` branch now includes email signup/verification, password recovery, pending membership and RLS-protected trial data access. The existing login, logout, proxy token validation, protected layouts, cookie refresh and `/api/me` endpoint are preserved.

Supabase `SSMWork` has email login and signup enabled, email confirmation required, and anonymous sign-in disabled. `database/auth_access.sql` has been applied to the live project. It adds an administrator-managed private email allowlist and a membership claim RPC. The RPC checks `auth.uid()` against the actual verified, non-anonymous Auth user, then permits that user to claim only their approved READY batch memberships. There is no automatic first-user-admin behavior. A signup alone grants no data access.

No first owner email has been supplied yet. No password or account was created and no email was sent by the agent. Actual customer names, imported prices, approved emails and privileged credentials must not be committed to this public repository.

## Finish setup

1. Confirm the first owner's email. Substitute it in `database/approve_email.sql` and execute as the database administrator. This does not send an email or mark an unverified email confirmed. Never commit the actual allowlisted address.
2. Deploy this Next.js branch to the intended Vercel project. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_ORIGIN` to the exact deployed HTTPS origin. `APP_ORIGIN` has no trailing slash or path and is server-only. Secret/service-role keys are not used.
3. Set Supabase Auth Site URL to that same origin. Allow the exact callback URLs `<origin>/auth/confirm` and `<origin>/auth/confirm?flow=recovery` before using email confirmation/password recovery. Only explicit staging/local origins should be added, never an unrestricted wildcard.
4. For reliable cross-device email confirmation, set the signup email template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`. For recovery, use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. The callback also accepts the normal PKCE `code` flow in the browser that initiated the request. It does not accept arbitrary redirect destinations.
5. Configure company SMTP in Supabase if the default mail delivery restrictions prevent employee email delivery. Keep SMTP credentials out of this repository.
6. The owner signs up and verifies email, then logs in. Until their email is approved, they see `/pending` and no company data. After approval, `/dashboard` shows real trial prices and a calculator.

Vercel deployment is blocked because the current connection cannot access the existing `rak-site-expense` project under its recorded team. No alternative team or new project has been silently selected. Reconnect Vercel with access to that project/team, or provide the intended accessible project.

## Access boundaries

`currentUser()` requires a server-confirmed, non-anonymous user with a confirmed email. `requireTrialAccess()` checks membership for data pages. Each trial API checks independently, and Supabase RLS remains the database authorization boundary. The private allowlist cannot be read or written by clients. Claiming membership does not re-enable an existing disabled membership.

To revoke access, execute `database/revoke_email.sql` with the approved email. It disables future claims and existing memberships in one transaction. Existing downloaded information cannot be recalled; subsequent data API requests are denied.

`/dashboard` reads the 2,100 historical rates with filters and pagination. The calculator validates inputs server-side and invokes the existing deterministic Supabase trial function. Missing prices and salary rates marked `not use` are rejected. Prices remain unapproved; supplied periods are explicit and do not resolve working-day policy, FX, taxes or approval totals. The six Base44 expense modules are still separate design work and are not migrated by this Auth change.

## Verification

`npm run typecheck`, `npm run build`, and `npm test` check the application. Integration tests cover public login/signup/recovery, protected pages, direct API rejection, forged sessions, anonymous trial calls and unsafe callback redirection. Live SQL confirms anonymous claim rejection and private allowlist/member-write restrictions.

Positive owner login, confirmation, recovery and access to the data must still be tested with the real account after the email approval and hosted URL setup. Never send a password through chat.
