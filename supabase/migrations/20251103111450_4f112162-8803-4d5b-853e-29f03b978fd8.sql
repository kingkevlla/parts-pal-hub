-- Add unique constraint on user_roles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_roles_user_id_role_id_key'
  ) THEN
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_role_id_key UNIQUE (user_id, role_id);
  END IF;
END $$;

-- Delete existing staff role for admin user
DELETE FROM user_roles 
WHERE user_id = 'fcf26342-cf65-4aa9-9705-1cd73d6831ca' 
AND role_id = (SELECT id FROM roles WHERE name = 'staff');

-- Assign admin role to the user
INSERT INTO user_roles (user_id, role_id)
VALUES (
  'fcf26342-cf65-4aa9-9705-1cd73d6831ca',
  (SELECT id FROM roles WHERE name = 'admin')
);