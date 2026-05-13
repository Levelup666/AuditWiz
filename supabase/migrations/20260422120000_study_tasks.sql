-- Study-scoped coordination tasks: leaders assign; completion links a record (assignee-created).

CREATE TABLE public.study_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_record_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_study_tasks_study_id ON public.study_tasks(study_id);
CREATE INDEX idx_study_tasks_study_status ON public.study_tasks(study_id, status);

CREATE TABLE public.study_task_assignees (
  task_id UUID NOT NULL REFERENCES public.study_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_study_task_assignees_user_id ON public.study_task_assignees(user_id);

COMMENT ON TABLE public.study_tasks IS 'Study coordination tasks; completion requires linking an assignee-created record.';
COMMENT ON TABLE public.study_task_assignees IS 'Users assigned to fulfill a study task (any assignee may link one record).';

ALTER TABLE public.study_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Study members can view study_tasks"
  ON public.study_tasks FOR SELECT
  USING (public.is_study_member_can_view(study_id, auth.uid()));

CREATE POLICY "Study leaders manage study_tasks"
  ON public.study_tasks FOR INSERT
  WITH CHECK (public.study_user_can_manage_members(study_id, auth.uid()));

CREATE POLICY "Study leaders update study_tasks"
  ON public.study_tasks FOR UPDATE
  USING (public.study_user_can_manage_members(study_id, auth.uid()))
  WITH CHECK (public.study_user_can_manage_members(study_id, auth.uid()));

CREATE POLICY "Study leaders delete study_tasks"
  ON public.study_tasks FOR DELETE
  USING (public.study_user_can_manage_members(study_id, auth.uid()));

CREATE POLICY "Study members can view study_task_assignees"
  ON public.study_task_assignees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.study_tasks t
      WHERE t.id = study_task_assignees.task_id
        AND public.is_study_member_can_view(t.study_id, auth.uid())
    )
  );

CREATE POLICY "Study leaders manage study_task_assignees"
  ON public.study_task_assignees FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_tasks t
      WHERE t.id = study_task_assignees.task_id
        AND public.study_user_can_manage_members(t.study_id, auth.uid())
    )
  );

CREATE POLICY "Study leaders delete study_task_assignees"
  ON public.study_task_assignees FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.study_tasks t
      WHERE t.id = study_task_assignees.task_id
        AND public.study_user_can_manage_members(t.study_id, auth.uid())
    )
  );

-- Assignee completes task by linking a record they created (bypasses leader-only UPDATE on completion fields).
CREATE OR REPLACE FUNCTION public.complete_study_task_after_record(
  p_task_id UUID,
  p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.study_tasks t
  SET
    status = 'completed',
    fulfilled_record_id = p_record_id,
    completed_by = auth.uid(),
    completed_at = now()
  WHERE t.id = p_task_id
    AND t.status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.study_task_assignees a
      WHERE a.task_id = t.id AND a.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = p_record_id
        AND r.study_id = t.study_id
        AND r.created_by = auth.uid()
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'task completion denied';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_study_task_after_record(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_study_task_after_record(UUID, UUID) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_tasks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.study_task_assignees TO authenticated;
