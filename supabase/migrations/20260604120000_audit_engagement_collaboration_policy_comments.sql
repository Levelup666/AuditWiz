-- Document policy separation: study collaboration (study_members) vs audit engagements.
-- No RLS or behavior changes.

COMMENT ON FUNCTION public.institution_external_collaborator_rows(uuid) IS
  'Institution admins: active study_members in org studies who are not institution members. '
  'Used when tightening allow_external_collaborators. Audit engagement viewers (audit_engagements) '
  'are not study collaborators and are excluded by design.';

COMMENT ON TABLE public.audit_engagements IS
  'Time-boxed read-only audit grants issued by institution admins. Valid regardless of '
  'institutions.metadata.allow_external_collaborators; auditors are not added to study_members.';
