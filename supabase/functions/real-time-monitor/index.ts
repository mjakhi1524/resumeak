import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StablecoinTransfer {
  id: string;
  hash: string;
  timestamp: string;
  blockNumber: number;
  from: string;
  to: string;
  amount: number;
  currency: string;
  usdValue: number;
  isWhale: boolean;
  network: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'start_monitoring') {
      console.log('Starting real-time monitoring...');
      await startRealTimeMonitoring(supabase);
      
      return new Response(
        JSON.stringify({ success: true, message: 'Real-time monitoring started' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_recent_transfers') {
      const { data: transfers } = await supabase
        .from('real_time_transfers')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      return new Response(
        JSON.stringify({ transfers: transfers || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_whale_alerts') {
      const { data: whales } = await supabase
        .from('real_time_transfers')
        .select('*')
        .eq('is_whale', true)
        .order('timestamp', { ascending: false })
        .limit(50);

      return new Response(
        JSON.stringify({ whales: whales || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in real-time monitor:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function startRealTimeMonitoring(supabase: any) {
  const bitqueryToken = Deno.env.get('BITQUERY_TOKEN');
  if (!bitqueryToken) {
    throw new Error('BITQUERY_TOKEN not found');
  }

  // Fetch latest transfers every 10 seconds
  setInterval(async () => {
    try {
      console.log('Fetching latest transfers from Bitquery...');
      
      const graphqlQuery = {
        query: `{
          EVM(dataset: realtime, network: eth) {
            Transfers(
              where: {
                Transfer: {
                  Currency: {
                    SmartContract: {
                      in: [
                        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                        "0xdac17f958d2ee523a2206206994597c13d831ec7",
                        "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
                        "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
                        "0x4c9edd5852cd905f086c759e8383e09bff1e68b3"
                      ]
                    }
                  }
                  Amount: {gt: "1000"}
                }
              }
              limit: { count: 20 }
              orderBy: { descending: Block_Time }
            ) {
              Block {
                Time
                Number
              }
              Transaction {
                Hash
              }
              Transfer {
                Amount
                Currency {
                  Name
                  Symbol
                }
                Sender
                Receiver
              }
            }
          }
        }`
      };

      const response = await fetch('https://streaming.bitquery.io/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bitqueryToken}`
        },
        body: JSON.stringify(graphqlQuery)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Bitquery API error:', errorText);
        throw new Error(`Bitquery API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('Bitquery response received:', result);
      
      if (!result.data?.EVM?.Transfers) {
        console.log('No transfers found in response');
        return;
      }

      const transfers = result.data.EVM.Transfers;
      console.log(`Processing ${transfers.length} transfers`);

      for (const transfer of transfers) {
        const amount = parseFloat(transfer.Transfer.Amount);
        const usdValue = amount; // Assuming 1:1 for stablecoins
        const isWhale = usdValue >= 100000; // $100k+ is whale

        // Create a unique composite key for checking duplicates, but let the database generate the UUID
        const compositeKey = `${transfer.Transaction.Hash}-${transfer.Transfer.Sender}-${transfer.Transfer.Receiver}`;

        // Check if this transfer already exists
        const { data: existingTransfer } = await supabase
          .from('real_time_transfers')
          .select('id')
          .eq('hash', transfer.Transaction.Hash)
          .eq('from_address', transfer.Transfer.Sender)
          .eq('to_address', transfer.Transfer.Receiver)
          .eq('amount', amount)
          .single();

        if (existingTransfer) {
          console.log(`Transfer already exists, skipping: ${compositeKey}`);
          continue;
        }

        const transferData = {
          // Remove the id field - let the database generate it
          hash: transfer.Transaction.Hash,
          timestamp: new Date(transfer.Block.Time).toISOString(),
          block_number: transfer.Block.Number,
          from_address: transfer.Transfer.Sender,
          to_address: transfer.Transfer.Receiver,
          amount,
          currency: transfer.Transfer.Currency.Symbol,
          usd_value: usdValue,
          is_whale: isWhale,
          network: 'ethereum'
        };

        // Store in database with proper column names
        const { error } = await supabase
          .from('real_time_transfers')
          .insert(transferData);

        if (error) {
          console.error('Error storing transfer:', error);
        } else {
          console.log(`Stored transfer: ${transferData.currency} $${amount.toLocaleString()} ${isWhale ? '🐋' : ''}`);
        }
      }

    } catch (error) {
      console.error('Error fetching real-time transfers:', error);
    }
  }, 10000); // Every 10 seconds
}
