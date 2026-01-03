-- ============================================================
-- FIX PROFILES TABLE RLS - Remove Overly Permissive Policy
-- ============================================================

-- Drop the overly permissive policy that exposes all user emails
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;