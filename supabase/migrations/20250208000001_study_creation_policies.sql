-- Allow authenticated users to create studies (as creator)
CREATE POLICY "Authenticated users can create studies"
  ON public.studies FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Allow study creator to add themselves as first member (admin role)
CREATE POLICY "Study creator can add self as admin member"
  ON public.study_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND granted_by = auth.uid()
    AND study_id IN (SELECT id FROM public.studies WHERE created_by = auth.uid())
  );

-- Records: Allow status updates by reviewers/approvers (content and version remain immutable; app only updates status)
CREATE POLICY "Reviewers and approvers can update record status"
  ON public.records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.study_members
      WHERE study_id = records.study_id
        AND user_id = auth.uid()
        AND role IN ('reviewer', 'approver', 'admin')
        AND revoked_at IS NULL
    )
  );

-- Blockchain anchors: approvers and admins can insert anchors for records in their study
CREATE POLICY "Approvers and admins can insert blockchain anchors"
  ON public.blockchain_anchors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.records r
      JOIN public.study_members sm ON sm.study_id = r.study_id
      WHERE r.id = blockchain_anchors.record_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('approver', 'admin')
        AND sm.revoked_at IS NULL
    )
  );
