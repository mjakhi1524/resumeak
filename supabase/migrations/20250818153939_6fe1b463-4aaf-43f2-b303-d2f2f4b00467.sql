-- Create API keys table for developer authentication
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create API usage tracking table
CREATE TABLE public.api_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  response_time_ms INTEGER,
  status_code INTEGER,
  ip_address TEXT
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for api_keys
CREATE POLICY "Users can manage their own API keys" 
ON public.api_keys 
FOR ALL 
USING (auth.uid() = user_id);

-- RLS policies for api_usage  
CREATE POLICY "Users can view their own API usage" 
ON public.api_usage 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.api_keys 
  WHERE api_keys.id = api_usage.api_key_id 
  AND api_keys.user_id = auth.uid()
));

-- Create function to generate API key
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create function to hash API key
CREATE OR REPLACE FUNCTION public.hash_api_key(api_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(sha256(api_key::bytea), 'hex');
END;
$$;

-- Create index for faster lookups
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_usage_timestamp ON public.api_usage(timestamp);
CREATE INDEX idx_api_usage_api_key_id ON public.api_usage(api_key_id);