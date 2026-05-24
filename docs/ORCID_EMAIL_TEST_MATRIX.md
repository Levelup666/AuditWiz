# ORCID email & invite manual test matrix

Run after applying migration `20260513120000_profiles_orcid_email_locked.sql` and configuring Supabase custom ORCID OIDC.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Public ORCID email | Sign in with ORCID whose record has a **public** primary email | `auth.users.email` set; JWT email matches after callback refresh; profile shows locked ORCID email |
| 2 | Private ORCID email (Public API) | Sign in with ORCID with **no public** email | Redirect to account setup; enter email manually, check attestation box, save; email locked on profile |
| 3 | Study invite by ORCID iD | Admin invites by ORCID only (no email) | Pending invite created; admin message explains sign in with ORCID + share link |
| 4 | Study invite by ORCID + email | Admin invites with ORCID and email | Email sent when mail configured; accept after ORCID sign-in + matching email |
| 5 | ORCID-primary invite accept | Accept study invite via account setup with invite token | No sign-out / password redirect; lands on study |
| 6 | Email invite RLS | ORCID user with locked email; email-based pending invite | Invite visible on `/invites` (JWT email matches) |
| 7 | Global gate | ORCID-primary without email navigates to `/studies` | Redirect to `/account/setup?orcid_email_required=1` |
| 8 | Member API (optional) | Set `ORCID_MEMBER_CLIENT_ID` + `ORCID_MEMBER_CLIENT_SECRET` | OAuth scopes include `/read-limited`; private emails may sync when authorized |
