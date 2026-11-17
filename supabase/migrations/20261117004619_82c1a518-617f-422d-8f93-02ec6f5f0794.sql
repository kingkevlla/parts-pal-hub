CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;
CREATE OR REPLACE FUNCTION private.is_manager(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','owner','manager')) $$;
CREATE OR REPLACE FUNCTION private.is_admin_or_owner(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','owner')) $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM public, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;

DO $$
DECLARE r record; q text; c text; stmt text;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
    WHERE coalesce(qual,'') ~ 'is_(staff|manager|admin_or_owner)\(' OR coalesce(with_check,'') ~ 'is_(staff|manager|admin_or_owner)\('
  LOOP
    q := regexp_replace(r.qual, '(public\.)?is_(staff|manager|admin_or_owner)\(', 'private.is_\2(', 'g');
    c := regexp_replace(r.with_check, '(public\.)?is_(staff|manager|admin_or_owner)\(', 'private.is_\2(', 'g');
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
    IF c IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', c); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;

DROP FUNCTION public.is_staff(uuid);
DROP FUNCTION public.is_manager(uuid);
DROP FUNCTION public.is_admin_or_owner(uuid);

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;