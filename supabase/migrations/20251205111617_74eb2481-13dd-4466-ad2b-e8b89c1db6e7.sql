-- Create employees table with full HR system support
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date DATE,
  department TEXT,
  position TEXT,
  employment_type TEXT DEFAULT 'full_time',
  salary NUMERIC DEFAULT 0,
  salary_type TEXT DEFAULT 'monthly',
  status TEXT DEFAULT 'active',
  avatar_url TEXT,
  address TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create employee attendance table
CREATE TABLE public.employee_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  status TEXT DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create employee leave table
CREATE TABLE public.employee_leave (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create employee payroll table
CREATE TABLE public.employee_payroll (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  deductions NUMERIC DEFAULT 0,
  bonuses NUMERIC DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE,
  payment_method TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create performance reviews table
CREATE TABLE public.employee_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reviewer_id UUID,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  strengths TEXT,
  improvements TEXT,
  goals TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create expense categories table
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create expenses table with full accounting support
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.expense_categories(id),
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  vendor TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency TEXT,
  next_occurrence DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create expense reports table
CREATE TABLE public.expense_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create budgets table
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.expense_categories(id),
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create reimbursements table
CREATE TABLE public.reimbursements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id),
  expense_id UUID REFERENCES public.expenses(id),
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_date DATE,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;

-- RLS policies for employees
CREATE POLICY "Admins and managers can manage employees" ON public.employees FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view employees" ON public.employees FOR SELECT USING (true);

-- RLS policies for attendance
CREATE POLICY "Admins and managers can manage attendance" ON public.employee_attendance FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view attendance" ON public.employee_attendance FOR SELECT USING (true);

-- RLS policies for leave
CREATE POLICY "Admins and managers can manage leave" ON public.employee_leave FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view leave" ON public.employee_leave FOR SELECT USING (true);

-- RLS policies for payroll
CREATE POLICY "Admins can manage payroll" ON public.employee_payroll FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view payroll" ON public.employee_payroll FOR SELECT USING (has_role(auth.uid(), 'manager'));

-- RLS policies for reviews
CREATE POLICY "Admins and managers can manage reviews" ON public.employee_reviews FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view reviews" ON public.employee_reviews FOR SELECT USING (true);

-- RLS policies for expense categories
CREATE POLICY "Admins and managers can manage expense categories" ON public.expense_categories FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view expense categories" ON public.expense_categories FOR SELECT USING (true);

-- RLS policies for expenses
CREATE POLICY "Admins and managers can manage expenses" ON public.expenses FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create expenses" ON public.expenses FOR INSERT WITH CHECK (true);

-- RLS policies for expense reports
CREATE POLICY "Admins and managers can manage expense reports" ON public.expense_reports FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authenticated users can view expense reports" ON public.expense_reports FOR SELECT USING (true);

-- RLS policies for budgets
CREATE POLICY "Admins can manage budgets" ON public.budgets FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view budgets" ON public.budgets FOR SELECT USING (has_role(auth.uid(), 'manager'));

-- RLS policies for reimbursements
CREATE POLICY "Admins can manage reimbursements" ON public.reimbursements FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can view reimbursements" ON public.reimbursements FOR SELECT USING (true);

-- Add triggers for updated_at
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();