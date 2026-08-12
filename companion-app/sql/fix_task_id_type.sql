-- Fix: change task_id column from UUID to TEXT
-- Run this in Supabase SQL Editor if you get "invalid input syntax for type uuid"

ALTER TABLE publish_jobs
  ALTER COLUMN task_id TYPE TEXT USING task_id::TEXT;

-- Also add mistral_api_key to profiles if it doesn't exist
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mistral_api_key TEXT;
