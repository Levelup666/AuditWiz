-- Keyset pagination for audit hub queries; SECURITY INVOKER so RLS on audit_events applies.
-- Composite index supports study-scoped, time-ordered reads.

CREATE INDEX IF NOT EXISTS idx_audit_events_study_timestamp_id
  ON public.audit_events (study_id, "timestamp" DESC, id DESC)
  WHERE study_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_events_page_for_viewer(
  p_cutoff timestamptz,
  p_study_ids uuid[],
  p_target_entity_type text,
  p_cursor_ts timestamptz,
  p_cursor_id uuid,
  p_limit int
)
RETURNS SETOF public.audit_events
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ae.*
  FROM public.audit_events ae
  WHERE ae.timestamp >= p_cutoff
    AND ae.study_id = ANY (p_study_ids)
    AND (
      p_target_entity_type IS NULL
      OR btrim(p_target_entity_type) = ''
      OR ae.target_entity_type = p_target_entity_type
    )
    AND (
      (p_cursor_ts IS NULL AND p_cursor_id IS NULL)
      OR (
        p_cursor_ts IS NOT NULL
        AND p_cursor_id IS NOT NULL
        AND (
          ae.timestamp < p_cursor_ts
          OR (ae.timestamp = p_cursor_ts AND ae.id < p_cursor_id)
        )
      )
    )
  ORDER BY ae.timestamp DESC, ae.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 40), 100))
$$;

REVOKE ALL ON FUNCTION public.audit_events_page_for_viewer(timestamptz, uuid[], text, timestamptz, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_events_page_for_viewer(timestamptz, uuid[], text, timestamptz, uuid, int) TO authenticated;
