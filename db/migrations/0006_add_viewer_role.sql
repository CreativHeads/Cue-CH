-- Add viewer role for agency owner / read-only access
alter type staff_role add value if not exists 'viewer';
