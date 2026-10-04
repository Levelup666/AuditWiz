-- Human-readable study codes (STD-0042) and study-scoped audit event IDs
-- (STD-0042-EVT-00001). Internal UUID primary keys are unchanged.
-- Existing audit_events.event_id values are NOT updated (append-only ledger).

-- ---------------------------------------------------------------------------
-- Format helpers (keep in lockstep with lib/audit/public-ids.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.format_study_public_code(p_n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT 'STD-' || CASE
    WHEN p_n < 10000 THEN lpad(p_n::text, 4, '0')
    ELSE p_n::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.format_audit_event_public_id(p_study_code TEXT, p_n INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_study_code IS NULL OR btrim(p_study_code) = '' THEN
      'SYS-EVT-' || CASE
        WHEN p_n < 100000 THEN lpad(p_n::text, 5, '0')
        ELSE p_n::text
      END
    ELSE
      p_study_code || '-EVT-' || CASE
        WHEN p_n < 100000 THEN lpad(p_n::text, 5, '0')
        ELSE p_n::text
      END
  END;
$$;

REVOKE ALL ON FUNCTION public.format_study_public_code(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.format_audit_event_public_id(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- studies.public_code
-- ---------------------------------------------------------------------------
CREATE SEQUENCE public.study_public_code_seq AS BIGINT START WITH 1 INCREMENT BY 1;

ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS public_code TEXT;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.studies
  WHERE public_code IS NULL
)
UPDATE public.studies s
SET public_code = public.format_study_public_code(numbered.n)
FROM numbered
WHERE s.id = numbered.id;

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.studies WHERE public_code IS NOT NULL;
  IF v_count = 0 THEN
    PERFORM setval('public.study_public_code_seq', 1, false);
  ELSE
    PERFORM setval('public.study_public_code_seq', v_count, true);
  END IF;
END $$;

ALTER TABLE public.studies
  ALTER COLUMN public_code SET NOT NULL;

ALTER TABLE public.studies
  ADD CONSTRAINT studies_public_code_unique UNIQUE (public_code);

ALTER TABLE public.studies
  ADD CONSTRAINT studies_public_code_format
  CHECK (public_code ~ '^STD-[0-9]+$');

COMMENT ON COLUMN public.studies.public_code IS
  'Immutable human-readable study identifier (STD-0042). Distinct from UUID primary key.';

CREATE OR REPLACE FUNCTION public.assign_study_public_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.public_code := public.format_study_public_code(nextval('public.study_public_code_seq'));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_study_public_code_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_code IS DISTINCT FROM OLD.public_code THEN
    RAISE EXCEPTION 'study public_code is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_study_public_code ON public.studies;
CREATE TRIGGER trg_assign_study_public_code
  BEFORE INSERT ON public.studies
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_study_public_code();

DROP TRIGGER IF EXISTS trg_prevent_study_public_code_change ON public.studies;
CREATE TRIGGER trg_prevent_study_public_code_change
  BEFORE UPDATE ON public.studies
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_study_public_code_change();

REVOKE ALL ON FUNCTION public.assign_study_public_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_study_public_code_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.study_public_code_seq FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-study (and system) event sequence counters
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_event_counters (
  study_id UUID PRIMARY KEY REFERENCES public.studies(id) ON DELETE CASCADE,
  last_n INTEGER NOT NULL DEFAULT 0 CHECK (last_n >= 0)
);

CREATE TABLE public.audit_event_system_counter (
  lock CHAR(1) PRIMARY KEY DEFAULT 'X' CHECK (lock = 'X'),
  last_n INTEGER NOT NULL DEFAULT 0 CHECK (last_n >= 0)
);

INSERT INTO public.audit_event_system_counter (lock, last_n)
VALUES ('X', 0)
ON CONFLICT (lock) DO NOTHING;

COMMENT ON TABLE public.audit_event_counters IS
  'Study-scoped sequence for public audit event IDs. Written only by create_audit_event.';
COMMENT ON TABLE public.audit_event_system_counter IS
  'Singleton sequence for audit events with no study_id (SYS-EVT-NNNNN).';

ALTER TABLE public.audit_event_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_event_system_counter ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audit_event_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_event_system_counter FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_audit_event: sequential public IDs going forward
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_audit_event(
  p_study_id UUID,
  p_actor_id UUID,
  p_action_type TEXT,
  p_target_entity_type TEXT,
  p_target_entity_id UUID,
  p_previous_state_hash TEXT,
  p_new_state_hash TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_actor_role TEXT;
  v_event_id_text TEXT;
  v_study_code TEXT;
  v_n INTEGER;
  v_jwt_role TEXT := COALESCE((SELECT auth.jwt()) ->> 'role', '');
BEGIN
  IF v_jwt_role <> 'service_role' THEN
    IF (SELECT auth.uid()) IS NULL THEN
      RAISE EXCEPTION 'authentication required';
    END IF;
    IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'actor must match authenticated user';
    END IF;
  END IF;

  IF p_actor_id IS NOT NULL AND p_study_id IS NOT NULL THEN
    v_actor_role := public.get_user_study_role(p_actor_id, p_study_id);
  END IF;

  v_event_id := gen_random_uuid();

  IF p_study_id IS NOT NULL THEN
    SELECT public_code INTO v_study_code
    FROM public.studies
    WHERE id = p_study_id;

    IF v_study_code IS NULL THEN
      RAISE EXCEPTION 'study not found';
    END IF;

    INSERT INTO public.audit_event_counters (study_id, last_n)
    VALUES (p_study_id, 1)
    ON CONFLICT (study_id) DO UPDATE
      SET last_n = public.audit_event_counters.last_n + 1
    RETURNING last_n INTO v_n;

    v_event_id_text := public.format_audit_event_public_id(v_study_code, v_n);
  ELSE
    UPDATE public.audit_event_system_counter
    SET last_n = last_n + 1
    WHERE lock = 'X'
    RETURNING last_n INTO v_n;

    IF v_n IS NULL THEN
      RAISE EXCEPTION 'system audit event counter is missing';
    END IF;

    v_event_id_text := public.format_audit_event_public_id(NULL, v_n);
  END IF;

  INSERT INTO public.audit_events (
    id, event_id, study_id, actor_id, actor_role_at_time,
    action_type, target_entity_type, target_entity_id,
    previous_state_hash, new_state_hash, metadata
  ) VALUES (
    v_event_id, v_event_id_text, p_study_id, p_actor_id, v_actor_role,
    p_action_type, p_target_entity_type, p_target_entity_id,
    p_previous_state_hash, p_new_state_hash, p_metadata
  );

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_audit_event(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, JSONB
) TO authenticated, service_role;
