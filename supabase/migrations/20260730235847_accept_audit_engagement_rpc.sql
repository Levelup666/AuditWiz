-- Column-safe accept: invitees cannot UPDATE audit_engagements directly.
-- Accept goes through SECURITY DEFINER RPC that requires credentials + COI fields.

CREATE OR REPLACE FUNCTION public.accept_audit_engagement(
  p_engagement_id uuid,
  p_organization_name text,
  p_title text,
  p_reference_id text,
  p_attestation_text_hash text,
  p_coi_statement_hash text,
  p_coi_has_conflict boolean,
  p_coi_disclosure text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row public.audit_engagements%ROWTYPE;
  v_now timestamptz := now();
  v_org text := nullif(trim(p_organization_name), '');
  v_title text := nullif(trim(p_title), '');
  v_ref text := nullif(trim(p_reference_id), '');
  v_att_hash text := nullif(trim(p_attestation_text_hash), '');
  v_coi_hash text := nullif(trim(p_coi_statement_hash), '');
  v_disclosure text := nullif(trim(p_coi_disclosure), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;
  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RAISE EXCEPTION 'email_required' USING ERRCODE = '42501';
  END IF;

  IF v_org IS NULL OR char_length(v_org) < 2 OR char_length(v_org) > 200 THEN
    RAISE EXCEPTION 'organization_required' USING ERRCODE = '22023';
  END IF;
  IF v_att_hash IS NULL OR char_length(v_att_hash) < 16 THEN
    RAISE EXCEPTION 'attestation_required' USING ERRCODE = '22023';
  END IF;
  IF v_coi_hash IS NULL OR char_length(v_coi_hash) < 16 THEN
    RAISE EXCEPTION 'coi_required' USING ERRCODE = '22023';
  END IF;
  IF p_coi_has_conflict IS NULL THEN
    RAISE EXCEPTION 'coi_required' USING ERRCODE = '22023';
  END IF;
  IF p_coi_has_conflict AND (v_disclosure IS NULL OR char_length(v_disclosure) < 8) THEN
    RAISE EXCEPTION 'coi_disclosure_required' USING ERRCODE = '22023';
  END IF;
  IF NOT p_coi_has_conflict THEN
    v_disclosure := NULL;
  END IF;
  IF v_title IS NOT NULL AND char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'title_too_long' USING ERRCODE = '22023';
  END IF;
  IF v_ref IS NOT NULL AND char_length(v_ref) > 120 THEN
    RAISE EXCEPTION 'reference_too_long' USING ERRCODE = '22023';
  END IF;
  IF v_disclosure IS NOT NULL AND char_length(v_disclosure) > 2000 THEN
    RAISE EXCEPTION 'disclosure_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.audit_engagements e
  WHERE e.id = p_engagement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'revoked' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.accepted_at IS NOT NULL THEN
    IF v_row.auditor_user_id = v_uid THEN
      RETURN v_row.id;
    END IF;
    RAISE EXCEPTION 'already_accepted' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.expires_at <= v_now THEN
    RAISE EXCEPTION 'expired' USING ERRCODE = 'P0001';
  END IF;

  IF lower(trim(v_row.auditor_email)) <> lower(trim(v_email)) THEN
    RAISE EXCEPTION 'email_mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.audit_engagements
  SET
    accepted_at = v_now,
    auditor_user_id = v_uid,
    auditor_organization_name = v_org,
    auditor_title = v_title,
    auditor_reference_id = v_ref,
    attested_at = v_now,
    attestation_text_hash = v_att_hash,
    coi_declared_at = v_now,
    coi_statement_hash = v_coi_hash,
    coi_has_conflict = p_coi_has_conflict,
    coi_disclosure = v_disclosure
  WHERE id = p_engagement_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > v_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN p_engagement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_audit_engagement(
  uuid, text, text, text, text, text, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_audit_engagement(
  uuid, text, text, text, text, text, boolean, text
) TO authenticated;

COMMENT ON FUNCTION public.accept_audit_engagement(
  uuid, text, text, text, text, text, boolean, text
) IS
  'Invitee-only accept: sets auditor_user_id + credentials + COI atomically. No client UPDATE on engagements.';

-- Remove broad invitee UPDATE (accept via RPC only).
DROP POLICY IF EXISTS "Invitee can accept own pending engagement" ON public.audit_engagements;
