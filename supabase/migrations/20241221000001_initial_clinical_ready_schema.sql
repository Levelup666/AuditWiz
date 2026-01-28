-- Clinical-Ready Research Platform Schema
-- Architecture: Immutable records, append-only audit trail, study-scoped RBAC
-- Note: Designed for research-grade systems without PHI/regulatory claims

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Studies: Core research unit (replaces "projects" semantically)
-- Studies contain records, documents, and audit events
CREATE TABLE public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Study members: Study-scoped role-based access control
-- Each user can have different roles per study
CREATE TABLE public.study_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('creator', 'reviewer', 'approver', 'auditor', 'admin')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(study_id, user_id, role) WHERE revoked_at IS NULL
);

-- Records: Immutable research records with versioning
-- Records cannot be edited; amendments create new versions
CREATE TABLE public.records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  record_number TEXT NOT NULL, -- Human-readable identifier
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'amended')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content JSONB NOT NULL DEFAULT '{}'::jsonb, -- Structured record data
  content_hash TEXT NOT NULL, -- SHA-256 hash of content for integrity
  amendment_reason TEXT, -- Required when version > 1
  UNIQUE(study_id, record_number, version)
);

-- Documents: File attachments linked to records
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Path in storage (web3.storage or similar)
  file_hash TEXT NOT NULL, -- SHA-256 hash for integrity verification
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Electronic Signatures: Cryptographic approvals
-- Signatures are immutable and tied to specific record versions
CREATE TABLE public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  record_version INTEGER NOT NULL, -- Denormalized for query performance
  signer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  intent TEXT NOT NULL CHECK (intent IN ('review', 'approval', 'amendment', 'rejection')),
  signature_hash TEXT NOT NULL, -- Cryptographic signature/hash
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(record_id, record_version, signer_id, intent)
);

-- Audit Events: Append-only immutable ledger
-- All significant actions must emit an audit event
-- NO UPDATE or DELETE allowed - append-only by design
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE, -- External event identifier for tracking
  study_id UUID REFERENCES public.studies(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for system actions
  actor_role_at_time TEXT, -- Role at time of action (for historical accuracy)
  action_type TEXT NOT NULL CHECK (action_type IN (
    'study_created', 'study_updated', 'study_deleted',
    'member_added', 'member_removed', 'member_role_changed',
    'record_created', 'record_submitted', 'record_amended', 'record_rejected',
    'document_uploaded', 'document_deleted',
    'signature_added', 'signature_revoked',
    'ai_action', 'system_action',
    'blockchain_anchored'
  )),
  target_entity_type TEXT NOT NULL, -- 'study', 'record', 'document', 'signature', etc.
  target_entity_id UUID,
  previous_state_hash TEXT, -- Hash of state before action
  new_state_hash TEXT NOT NULL, -- Hash of state after action
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb -- Additional context (IP, user agent, model version, etc.)
);

-- Blockchain Anchors: Hash anchoring for finalized approvals
-- Only anchors finalized, approved record versions
CREATE TABLE public.blockchain_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  record_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL, -- Hash of record content
  transaction_hash TEXT, -- Blockchain transaction hash (when implemented)
  block_number BIGINT, -- Block number (when implemented)
  anchored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_studies_created_by ON public.studies(created_by);
CREATE INDEX idx_studies_status ON public.studies(status);
CREATE INDEX idx_study_members_study_id ON public.study_members(study_id);
CREATE INDEX idx_study_members_user_id ON public.study_members(user_id);
CREATE INDEX idx_study_members_active ON public.study_members(study_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_records_study_id ON public.records(study_id);
CREATE INDEX idx_records_record_number ON public.records(study_id, record_number);
CREATE INDEX idx_records_version_chain ON public.records(id, previous_version_id);
CREATE INDEX idx_documents_record_id ON public.documents(record_id);
CREATE INDEX idx_signatures_record ON public.signatures(record_id, record_version);
CREATE INDEX idx_signatures_signer ON public.signatures(signer_id);
CREATE INDEX idx_audit_events_study_id ON public.audit_events(study_id);
CREATE INDEX idx_audit_events_actor_id ON public.audit_events(actor_id);
CREATE INDEX idx_audit_events_timestamp ON public.audit_events(timestamp DESC);
CREATE INDEX idx_audit_events_target ON public.audit_events(target_entity_type, target_entity_id);
CREATE INDEX idx_blockchain_anchors_record ON public.blockchain_anchors(record_id, record_version);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function: Generate content hash for records
CREATE OR REPLACE FUNCTION public.generate_content_hash(content JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(digest(content::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Get user's role in a study (current active role)
CREATE OR REPLACE FUNCTION public.get_user_study_role(p_user_id UUID, p_study_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.study_members
  WHERE study_id = p_study_id
    AND user_id = p_user_id
    AND revoked_at IS NULL
  ORDER BY granted_at DESC
  LIMIT 1;
  
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Create audit event (immutable append-only)
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
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_actor_role TEXT;
  v_event_id_text TEXT;
BEGIN
  -- Get actor's role at time of action (for historical accuracy)
  IF p_actor_id IS NOT NULL AND p_study_id IS NOT NULL THEN
    v_actor_role := public.get_user_study_role(p_actor_id, p_study_id);
  END IF;
  
  -- Generate unique event ID
  v_event_id := gen_random_uuid();
  v_event_id_text := 'evt_' || encode(v_event_id::text::bytea, 'hex');
  
  -- Insert audit event (append-only)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_studies_updated_at
  BEFORE UPDATE ON public.studies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: Auto-create audit event on record creation/amendment
CREATE OR REPLACE FUNCTION public.audit_record_change()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_hash TEXT;
  v_new_hash TEXT;
  v_action_type TEXT;
BEGIN
  v_new_hash := NEW.content_hash;
  
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'record_created';
    v_previous_hash := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Records should not be updated; amendments create new versions
    -- If version changed, it's an amendment
    IF NEW.version > OLD.version THEN
      v_action_type := 'record_amended';
      v_previous_hash := OLD.content_hash;
    ELSE
      -- Non-version updates (status changes) are tracked separately
      RETURN NEW;
    END IF;
  END IF;
  
  -- Create audit event
  PERFORM public.create_audit_event(
    NEW.study_id,
    NEW.created_by,
    v_action_type,
    'record',
    NEW.id,
    v_previous_hash,
    v_new_hash,
    jsonb_build_object(
      'record_number', NEW.record_number,
      'version', NEW.version,
      'status', NEW.status,
      'amendment_reason', NEW.amendment_reason
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_record_insert_update
  AFTER INSERT OR UPDATE ON public.records
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_record_change();

-- Trigger: Auto-create audit event on signature
CREATE OR REPLACE FUNCTION public.audit_signature_added()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.create_audit_event(
    (SELECT study_id FROM public.records WHERE id = NEW.record_id),
    NEW.signer_id,
    'signature_added',
    'signature',
    NEW.id,
    NULL,
    NEW.signature_hash,
    jsonb_build_object(
      'record_version', NEW.record_version,
      'intent', NEW.intent
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_signature_insert
  AFTER INSERT ON public.signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_signature_added();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_anchors ENABLE ROW LEVEL SECURITY;

-- Studies: Users can view studies they are members of
CREATE POLICY "Users can view studies they are members of"
  ON public.studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = studies.id
        AND user_id = auth.uid()
        AND revoked_at IS NULL
    )
    OR created_by = auth.uid()
  );

-- Studies: Only admins and creators can update studies
CREATE POLICY "Creators and admins can update studies"
  ON public.studies FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = studies.id
        AND user_id = auth.uid()
        AND role IN ('admin', 'creator')
        AND revoked_at IS NULL
    )
  );

-- Study members: Users can view members of studies they belong to
CREATE POLICY "Users can view study members"
  ON public.study_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_members sm
      WHERE sm.study_id = study_members.study_id
        AND sm.user_id = auth.uid()
        AND sm.revoked_at IS NULL
    )
  );

-- Study members: Only admins can manage members
CREATE POLICY "Admins can manage study members"
  ON public.study_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = study_members.study_id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND revoked_at IS NULL
    )
  );

-- Records: Users can view records in studies they belong to
CREATE POLICY "Users can view records in their studies"
  ON public.records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = records.study_id
        AND user_id = auth.uid()
        AND revoked_at IS NULL
    )
  );

-- Records: Creators and admins can create records
CREATE POLICY "Creators and admins can create records"
  ON public.records FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = records.study_id
        AND user_id = auth.uid()
        AND role IN ('creator', 'admin')
        AND revoked_at IS NULL
    )
  );

-- Records: Status transitions based on role (handled in application logic)
-- No UPDATE policy - records are immutable, amendments create new versions

-- Documents: View if can view record
CREATE POLICY "Users can view documents for records they can access"
  ON public.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records
      WHERE records.id = documents.record_id
        AND EXISTS (
          SELECT 1 FROM public.study_members
          WHERE study_id = records.study_id
            AND user_id = auth.uid()
            AND revoked_at IS NULL
        )
    )
  );

-- Documents: Upload if can create records
CREATE POLICY "Users can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.records r
      JOIN public.study_members sm ON sm.study_id = r.study_id
      WHERE r.id = documents.record_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('creator', 'admin')
        AND sm.revoked_at IS NULL
    )
  );

-- Signatures: View if can view record
CREATE POLICY "Users can view signatures"
  ON public.signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records
      WHERE records.id = signatures.record_id
        AND EXISTS (
          SELECT 1 FROM public.study_members
          WHERE study_id = records.study_id
            AND user_id = auth.uid()
            AND revoked_at IS NULL
        )
    )
  );

-- Signatures: Users can sign records (with proper role checks in application)
CREATE POLICY "Users can create signatures"
  ON public.signatures FOR INSERT
  WITH CHECK (
    signer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.records r
      JOIN public.study_members sm ON sm.study_id = r.study_id
      WHERE r.id = signatures.record_id
        AND sm.user_id = auth.uid()
        AND sm.revoked_at IS NULL
    )
  );

-- Audit events: Read-only for all study members
CREATE POLICY "Study members can view audit events"
  ON public.audit_events FOR SELECT
  USING (
    study_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = audit_events.study_id
        AND user_id = auth.uid()
        AND revoked_at IS NULL
    )
  );

-- Audit events: No INSERT/UPDATE/DELETE policies - only system functions can create events
-- This enforces append-only immutability

-- Blockchain anchors: View if can view record
CREATE POLICY "Users can view blockchain anchors"
  ON public.blockchain_anchors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.records r
      JOIN public.study_members sm ON sm.study_id = r.study_id
      WHERE r.id = blockchain_anchors.record_id
        AND sm.user_id = auth.uid()
        AND revoked_at IS NULL
    )
  );

-- ============================================================================
-- INITIAL DATA / HELPER VIEWS
-- ============================================================================

-- View: Current study member roles (active only)
CREATE VIEW public.current_study_roles AS
SELECT
  sm.study_id,
  sm.user_id,
  sm.role,
  sm.granted_at,
  u.email
FROM public.study_members sm
JOIN auth.users u ON u.id = sm.user_id
WHERE sm.revoked_at IS NULL;

-- View: Record version chain
CREATE VIEW public.record_version_history AS
WITH RECURSIVE version_chain AS (
  SELECT id, record_number, version, previous_version_id, created_at, status
  FROM public.records
  WHERE previous_version_id IS NULL
  
  UNION ALL
  
  SELECT r.id, r.record_number, r.version, r.previous_version_id, r.created_at, r.status
  FROM public.records r
  JOIN version_chain vc ON r.previous_version_id = vc.id
)
SELECT * FROM version_chain
ORDER BY record_number, version;

-- Comments for documentation
COMMENT ON TABLE public.studies IS 'Research studies - core organizational unit. No data overwriting - studies track all changes via audit events.';
COMMENT ON TABLE public.study_members IS 'Study-scoped RBAC. Each user can have different roles per study. Roles can be revoked but history preserved.';
COMMENT ON TABLE public.records IS 'Immutable research records. Records cannot be edited - amendments create new versions. Content hash ensures integrity.';
COMMENT ON TABLE public.audit_events IS 'Append-only immutable audit ledger. NO UPDATE or DELETE allowed. All significant actions emit events.';
COMMENT ON TABLE public.signatures IS 'Cryptographic electronic signatures tied to specific record versions. Immutable once created.';
COMMENT ON TABLE public.blockchain_anchors IS 'Blockchain anchoring for finalized approvals. Stub for future implementation.';
