-- Fix unique constraint issue for stablecoin_transfers
ALTER TABLE public.stablecoin_transfers 
ADD CONSTRAINT unique_transfer_hash_sender UNIQUE (block_time, sender_address, receiver_address, amount, token_symbol);

-- Fix unique constraint issue for real_time_transfers  
ALTER TABLE public.real_time_transfers 
ADD CONSTRAINT unique_realtime_transfer UNIQUE (hash, from_address, to_address, timestamp);