-- Account setup tracking and email notification preferences (profiles)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_email_invites boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_email_study_activity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS account_setup_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.notification_email_invites IS 'Opt-in for transactional emails about invites and institution membership.';
COMMENT ON COLUMN public.profiles.notification_email_study_activity IS 'Opt-in for emails about study activity when the app sends them.';
COMMENT ON COLUMN public.profiles.account_setup_completed_at IS 'Set when the user finishes the account setup wizard (password/prefs); null means optional wizard not completed.';

-- Existing rows: do not force legacy users through the new wizard
UPDATE public.profiles
SET account_setup_completed_at = COALESCE(account_setup_completed_at, created_at, now())
WHERE account_setup_completed_at IS NULL;
