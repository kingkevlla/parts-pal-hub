-- Enable RLS on roles table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Create policies for roles table
CREATE POLICY "Admins can manage roles"
ON public.roles
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view roles"
ON public.roles
FOR SELECT
USING (true);