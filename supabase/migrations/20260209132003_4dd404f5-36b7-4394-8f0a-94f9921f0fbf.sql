
-- Employee Loans table
CREATE TABLE public.employee_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  monthly_deduction NUMERIC DEFAULT 0,
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'active',
  reason TEXT,
  notes TEXT,
  approved_by UUID,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read employee_loans" ON public.employee_loans FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage employee_loans" ON public.employee_loans FOR ALL USING (auth.uid() IS NOT NULL);

-- Employee Loan Payments table
CREATE TABLE public.employee_loan_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read employee_loan_payments" ON public.employee_loan_payments FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage employee_loan_payments" ON public.employee_loan_payments FOR ALL USING (auth.uid() IS NOT NULL);
