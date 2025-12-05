-- Create loan_payments table to track payment history
CREATE TABLE public.loan_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for loan_payments
CREATE POLICY "Authenticated users can view loan payments"
ON public.loan_payments
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create loan payments"
ON public.loan_payments
FOR INSERT
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_loan_payments_loan_id ON public.loan_payments(loan_id);
CREATE INDEX idx_loan_payments_created_at ON public.loan_payments(created_at DESC);