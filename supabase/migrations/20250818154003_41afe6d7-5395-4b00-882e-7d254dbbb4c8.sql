-- Fix function search path security warnings
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_prefix TEXT := 'wm_';
  random_part TEXT;
  full_key TEXT;
BEGIN
  -- Generate random 32 character string
  random_part := encode(gen_random_bytes(24), 'base64');
  -- Remove special characters and make it URL safe
  random_part := replace(replace(replace(random_part, '+', ''), '/', ''), '=', '');
  full_key := key_prefix || random_part;
  RETURN full_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.hash_api_key(api_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(sha256(api_key::bytea), 'hex');
END;
$$;