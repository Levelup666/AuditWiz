-- ORCID-primary accounts: contact email is sourced from ORCID and must not be edited in-app.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS orcid_email_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.orcid_email_locked IS
  'When true, auth email was set from ORCID and cannot be changed via AuditWiz profile or account setup.';
