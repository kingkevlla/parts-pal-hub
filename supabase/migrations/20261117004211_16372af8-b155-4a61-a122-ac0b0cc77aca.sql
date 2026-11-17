CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;
CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','owner','manager')) $$;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid), public.is_manager(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid), public.is_manager(uuid) TO authenticated;

DO $$
DECLARE r record; t text;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN
    ('budgets','categories','customers','employee_attendance','employee_leave','employee_loan_payments','employee_loans','employee_payroll','employees','expense_categories','expenses','inventory','loan_payments','loans','pending_bill_items','pending_bills','products','stock_movements','suppliers','system_settings','transaction_items','transactions','user_roles','warehouses','support_tickets','profiles')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename); END LOOP;

  FOREACH t IN ARRAY ARRAY['budgets','employee_attendance','employee_leave','employee_loan_payments','employee_loans','employee_payroll','employees','expense_categories','expenses','suppliers'] LOOP
    EXECUTE format('CREATE POLICY "Managers manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()))', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['categories','customers','inventory','loan_payments','loans','pending_bill_items','pending_bills','products','stock_movements','transaction_items','transactions','warehouses'] LOOP
    EXECUTE format('CREATE POLICY "Staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Staff add %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Staff update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Managers delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.is_manager(auth.uid()))', t);
  END LOOP;
END $$;

-- pending bills are deleted/edited by cashiers in POS flow
CREATE POLICY "Staff delete pending_bills" ON public.pending_bills FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff delete pending_bill_items" ON public.pending_bill_items FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff read settings" ON public.system_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Read own role or admin" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin_or_owner(auth.uid())) WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Read own profile or admin" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own profile or admin" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Staff read tickets" ON public.support_tickets FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff create tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creator or admin update tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (created_by = auth.uid() OR assigned_to = auth.uid() OR public.is_admin_or_owner(auth.uid())) WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid() OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Creator or admin delete tickets" ON public.support_tickets FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()));

DROP POLICY "Authenticated upload product images" ON storage.objects;
DROP POLICY "Authenticated update product images" ON storage.objects;
DROP POLICY "Authenticated delete product images" ON storage.objects;
CREATE POLICY "Managers upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.is_manager(auth.uid()));
CREATE POLICY "Managers update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.is_manager(auth.uid())) WITH CHECK (bucket_id = 'product-images' AND public.is_manager(auth.uid()));
CREATE POLICY "Managers delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.is_manager(auth.uid()));