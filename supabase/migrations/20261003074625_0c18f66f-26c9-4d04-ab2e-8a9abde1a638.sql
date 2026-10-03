CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','owner'))
$$;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_name text,
  section text NOT NULL,
  action text NOT NULL DEFAULT 'update',
  summary text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and owners can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins and owners can write their own audit entries" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_admin_or_owner(auth.uid()));
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);