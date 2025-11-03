-- Insert owner role
INSERT INTO public.roles (name) 
VALUES ('owner')
ON CONFLICT DO NOTHING;