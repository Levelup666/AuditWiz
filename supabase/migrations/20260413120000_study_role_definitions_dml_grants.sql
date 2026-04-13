-- study_role_definitions: allow study admins (RLS) to create/update custom roles via the app client.
GRANT INSERT, UPDATE ON public.study_role_definitions TO authenticated;
