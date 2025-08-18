-- Create table for real-time transfers
CREATE TABLE public.real_time_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hash TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  block_number INTEGER NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ETH',
  usd_value NUMERIC NOT NULL DEFAULT 0,
  is_whale BOOLEAN NOT NULL DEFAULT FALSE,
  network TEXT NOT NULL DEFAULT 'ethereum',
  gas_price NUMERIC,
  gas_used NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.real_time_transfers ENABLE ROW LEVEL SECURITY;

-- Create policies for real-time transfers
CREATE POLICY "Allow public read access to real_time_transfers" 
ON public.real_time_transfers 
FOR SELECT 
USING (true);

CREATE POLICY "Allow service role full access to real_time_transfers" 
ON public.real_time_transfers 
FOR ALL 
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create indexes for better performance
CREATE INDEX idx_real_time_transfers_timestamp ON public.real_time_transfers(timestamp DESC);
CREATE INDEX idx_real_time_transfers_whale ON public.real_time_transfers(is_whale) WHERE is_whale = true;
CREATE INDEX idx_real_time_transfers_amount ON public.real_time_transfers(amount DESC);

-- Enable realtime for this table
ALTER TABLE public.real_time_transfers REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.real_time_transfers;