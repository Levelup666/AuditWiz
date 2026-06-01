-- Notifications v2: dedupe_key for idempotent inserts (cron reminders, etc.)

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Optional key to prevent duplicate notifications for the same user and event (e.g. task due reminders).';
