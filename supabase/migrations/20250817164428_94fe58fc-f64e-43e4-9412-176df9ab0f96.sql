
-- Create a table for tracked wallets
CREATE TABLE public.tracked_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  name TEXT,
  network TEXT NOT NULL DEFAULT 'eth',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security (RLS) - making it publicly readable for now
ALTER TABLE public.tracked_wallets ENABLE ROW LEVEL SECURITY;

-- Create policy that allows public read access
CREATE POLICY "Allow public read access to tracked wallets" 
  ON public.tracked_wallets 
  FOR SELECT 
  USING (true);

-- Create policy that allows public insert access
CREATE POLICY "Allow public insert access to tracked wallets" 
  ON public.tracked_wallets 
  FOR INSERT 
  WITH CHECK (true);

-- Create policy that allows public update access
CREATE POLICY "Allow public update access to tracked wallets" 
  ON public.tracked_wallets 
  FOR UPDATE 
  USING (true);

-- Create policy that allows public delete access
CREATE POLICY "Allow public delete access to tracked wallets" 
  ON public.tracked_wallets 
  FOR DELETE 
  USING (true);

-- Create unique constraint to prevent duplicate wallet/network combinations
CREATE UNIQUE INDEX unique_wallet_network ON public.tracked_wallets (address, network);
