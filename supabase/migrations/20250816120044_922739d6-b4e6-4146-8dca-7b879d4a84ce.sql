-- Create table for stablecoin transfers
CREATE TABLE public.stablecoin_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  block_time TIMESTAMP WITH TIME ZONE NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'ethereum',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for wallet transactions
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  value_eth DECIMAL NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  is_error BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for wallet risk ratings
CREATE TABLE public.wallet_risk_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  first_tx_date TIMESTAMP WITH TIME ZONE,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  failed_transactions INTEGER NOT NULL DEFAULT 0,
  wallet_age_days INTEGER,
  failed_tx_ratio DECIMAL,
  risk_score INTEGER CHECK (risk_score >= 1 AND risk_score <= 10),
  risk_level TEXT CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.stablecoin_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_risk_ratings ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (since this is public data)
CREATE POLICY "Allow public read access to stablecoin transfers" 
ON public.stablecoin_transfers 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public read access to wallet transactions" 
ON public.wallet_transactions 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public read access to wallet risk ratings" 
ON public.wallet_risk_ratings 
FOR SELECT 
USING (true);

-- Create policies for service role access (for edge functions)
CREATE POLICY "Allow service role full access to stablecoin transfers" 
ON public.stablecoin_transfers 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Allow service role full access to wallet transactions" 
ON public.wallet_transactions 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Allow service role full access to wallet risk ratings" 
ON public.wallet_risk_ratings 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

-- Create indexes for better performance
CREATE INDEX idx_stablecoin_transfers_block_time ON public.stablecoin_transfers(block_time DESC);
CREATE INDEX idx_stablecoin_transfers_token_symbol ON public.stablecoin_transfers(token_symbol);
CREATE INDEX idx_wallet_transactions_wallet_address ON public.wallet_transactions(wallet_address);
CREATE INDEX idx_wallet_transactions_timestamp ON public.wallet_transactions(timestamp DESC);
CREATE INDEX idx_wallet_risk_ratings_wallet_address ON public.wallet_risk_ratings(wallet_address);