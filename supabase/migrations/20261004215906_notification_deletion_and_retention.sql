-- User-deletable notifications + automatic retention purge.
-- Notifications are personal inbox items, not the audit ledger; audit_events are untouched.
-- Retention (90 days) must stay in lockstep with NOTIFICATION_RETENTION_DAYS in lib/notifications.ts.

-- ---------------------------------------------------------------------------
-- 1. Users may hard-delete only their own notifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT DELETE ON public.notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Index for the global age-based purge (per-user index leads with user_id)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at);

-- ---------------------------------------------------------------------------
-- 3. Purge function (server-only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_notifications(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 1 THEN
    RAISE EXCEPTION 'retention days must be a positive integer';
  END IF;

  DELETE FROM public.notifications
  WHERE created_at < now() - make_interval(days => p_retention_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_notifications(INTEGER) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.purge_expired_notifications(INTEGER) IS
  'Hard-deletes notifications older than the retention window. Scheduled daily via pg_cron.';

-- ---------------------------------------------------------------------------
-- 4. Daily schedule (03:17 UTC) via pg_cron
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

SELECT cron.schedule(
  'purge-expired-notifications',
  '17 3 * * *',
  $$SELECT public.purge_expired_notifications(90);$$
);
