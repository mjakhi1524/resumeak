
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPPORTED_NETWORKS: Record<string, { apiEndpoint: string; explorerUrl: string; isEVM: boolean }> = {
  ethereum: {
    apiEndpoint: 'https://api.etherscan.io/api',
    explorerUrl: 'https://etherscan.io',
    isEVM: true,
  },
  polygon: {
    apiEndpoint: 'https://api.polygonscan.com/api',
    explorerUrl: 'https://polygonscan.com',
    isEVM: true,
  },
  avalanche: {
    apiEndpoint: 'https://api.snowtrace.io/api',
    explorerUrl: 'https://snowtrace.io',
    isEVM: true,
  },
  arbitrum: {
    apiEndpoint: 'https://api.arbiscan.io/api',
    explorerUrl: 'https://arbiscan.io',
    isEVM: true,
  },
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { walletAddress, network = 'ethereum' } = await req.json();
    
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported network: ${network}`);
    }

    // XRP requires different handling
    if (network === 'xrp') {
      return await handleXRPAnalysis(walletAddress);
    }

    const etherscanApiKey = Deno.env.get('ETHERSCAN_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!etherscanApiKey) {
      console.error('Missing ETHERSCAN_API_KEY environment variable');
      throw new Error('API configuration error - missing API key');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Database configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Analyzing wallet: ${walletAddress} on ${network}`);

    // Add delay to avoid rate limiting
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Use network-specific API endpoints with rate limiting protection
    const etherscanUrl = `${networkConfig.apiEndpoint}?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${etherscanApiKey}`;
    const balanceUrl = `${networkConfig.apiEndpoint}?module=account&action=balance&address=${walletAddress}&tag=latest&apikey=${etherscanApiKey}`;

    console.log(`Fetching transactions from: ${etherscanUrl}`);
    console.log(`Fetching balance from: ${balanceUrl}`);

    // Fetch with retry logic
    const fetchWithRetry = async (url: string, maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          console.log(`Attempt ${i + 1} for URL: ${url}`);
          const response = await fetch(url);
          
          if (!response.ok) {
            console.error(`HTTP ${response.status}: ${response.statusText}`);
            if (i === maxRetries - 1) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            await delay(1000 * (i + 1)); // Exponential backoff
            continue;
          }
          
          const data = await response.json();
          console.log(`API Response status: ${data.status}, message: ${data.message}`);
          
          if (data.status === '0' && data.message === 'No transactions found') {
            // This is a valid response for wallets with no transactions
            return { status: '1', result: [] };
          }
          
          if (data.status !== '1') {
            console.error(`API Error: ${data.message} (status: ${data.status})`);
            if (data.message?.includes('rate limit') && i < maxRetries - 1) {
              await delay(2000 * (i + 1)); // Longer delay for rate limits
              continue;
            }
            throw new Error(`${network} API error: ${data.message || 'Unknown error'}`);
          }
          
          return data;
        } catch (error) {
          console.error(`Fetch attempt ${i + 1} failed:`, error);
          if (i === maxRetries - 1) throw error;
          await delay(1000 * (i + 1));
        }
      }
    };

    // Fetch data with delays between requests
    const [etherscanData, balanceData] = await Promise.all([
      fetchWithRetry(etherscanUrl),
      (async () => {
        await delay(200); // Small delay between requests
        return fetchWithRetry(balanceUrl);
      })()
    ]);

    const transactions = etherscanData.result || [];
    const balance = balanceData.status === '1' ? (parseFloat(balanceData.result) / 1e18).toFixed(6) : '0';

    console.log(`Found ${transactions.length} transactions on ${network}`);

    // Process and format transactions
    const processedTransactions = transactions.map((tx: any) => ({
      hash: tx.hash,
      timestamp: new Date(parseInt(tx.timeStamp) * 1000),
      value: (parseFloat(tx.value) / 1e18).toFixed(6),
      from: tx.from,
      to: tx.to,
      isError: tx.isError === '1'
    }));

    // Calculate wallet risk metrics
    const totalTxs = transactions.length;
    const failedTxs = transactions.filter((tx: any) => tx.isError === '1').length;
    const failedRatio = totalTxs > 0 ? (failedTxs / totalTxs) : 0;
    
    // Get oldest transaction for wallet age
    const oldestTx = transactions.length > 0 ? transactions[transactions.length - 1] : null;
    const firstTxDate = oldestTx ? new Date(parseInt(oldestTx.timeStamp) * 1000) : null;
    const walletAgeDays = firstTxDate ? Math.floor((Date.now() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // Calculate risk score (1-10, where 10 is highest risk)
    let riskScore = 1;
    
    // Age factor (newer wallets are riskier)
    if (walletAgeDays < 30) riskScore += 3;
    else if (walletAgeDays < 90) riskScore += 2;
    else if (walletAgeDays < 365) riskScore += 1;
    
    // Transaction volume factor
    if (totalTxs < 10) riskScore += 2;
    else if (totalTxs < 50) riskScore += 1;
    
    // Failed transaction factor
    if (failedRatio > 0.1) riskScore += 2;
    else if (failedRatio > 0.05) riskScore += 1;
    
    // Cap at 10
    riskScore = Math.min(riskScore, 10);
    
    const riskLevel = riskScore <= 3 ? 'LOW' : riskScore <= 6 ? 'MEDIUM' : 'HIGH';

    // Store transactions in database with network info
    if (processedTransactions.length > 0) {
      const transactionsToInsert = processedTransactions.map((tx: any) => ({
        wallet_address: walletAddress.toLowerCase(),
        tx_hash: tx.hash,
        timestamp: tx.timestamp,
        value_eth: parseFloat(tx.value),
        from_address: tx.from,
        to_address: tx.to,
        is_error: tx.isError,
        network: network
      }));

      // Insert transactions (ignore conflicts)
      const { error: txError } = await supabase
        .from('wallet_transactions')
        .upsert(transactionsToInsert, { onConflict: 'tx_hash' });

      if (txError) {
        console.error('Error inserting transactions:', txError);
      }
    }

    // Store or update risk rating with network info
    const riskData = {
      wallet_address: walletAddress.toLowerCase(),
      first_tx_date: firstTxDate,
      total_transactions: totalTxs,
      failed_transactions: failedTxs,
      wallet_age_days: walletAgeDays,
      failed_tx_ratio: failedRatio,
      risk_score: riskScore,
      risk_level: riskLevel,
      network: network,
      last_updated: new Date()
    };

    const { error: riskError } = await supabase
      .from('wallet_risk_ratings')
      .upsert(riskData, { onConflict: 'wallet_address' });

    if (riskError) {
      console.error('Error inserting risk rating:', riskError);
    }

    return new Response(JSON.stringify({
      walletAddress,
      network,
      transactions: processedTransactions,
      balance: balance,
      internalTransactions: [], // Simplified for now
      tokenTransfers: [], // Simplified for now
      riskAnalysis: {
        totalTransactions: totalTxs,
        failedTransactions: failedTxs,
        failedTransactionRatio: failedRatio,
        walletAgeDays,
        riskScore,
        riskLevel
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-wallet function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'An unknown error occurred',
      details: 'Please check if the wallet address is valid and try again. If the problem persists, the API may be experiencing rate limits.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleXRPAnalysis(walletAddress: string) {
  try {
    console.log(`Analyzing XRP wallet: ${walletAddress}`);
    
    // XRP Ledger API calls
    const accountInfoUrl = `https://api.xrpscan.com/api/v1/account/${walletAddress}`;
    const transactionsUrl = `https://api.xrpscan.com/api/v1/account/${walletAddress}/transactions`;

    const [accountResponse, transactionsResponse] = await Promise.all([
      fetch(accountInfoUrl),
      fetch(transactionsUrl)
    ]);

    const [accountData, transactionsData] = await Promise.all([
      accountResponse.json(),
      transactionsResponse.json()
    ]);

    const transactions = Array.isArray(transactionsData) ? transactionsData : [];
    const balance = accountData?.Balance ? (parseFloat(accountData.Balance) / 1000000).toFixed(6) : '0';

    // Process transactions for XRP
    const processedTransactions = transactions.slice(0, 100).map((tx: any) => ({
      hash: tx.hash,
      timestamp: new Date(tx.date),
      value: tx.Amount ? (parseFloat(tx.Amount) / 1000000).toFixed(6) : '0',
      from: tx.Account || walletAddress,
      to: tx.Destination || '',
      isError: tx.meta?.TransactionResult !== 'tesSUCCESS'
    }));

    // Calculate risk metrics for XRP
    const totalTxs = transactions.length;
    const failedTxs = transactions.filter((tx: any) => tx.meta?.TransactionResult !== 'tesSUCCESS').length;
    const failedRatio = totalTxs > 0 ? (failedTxs / totalTxs) : 0;
    
    const oldestTx = transactions.length > 0 ? transactions[transactions.length - 1] : null;
    const firstTxDate = oldestTx ? new Date(oldestTx.date) : null;
    const walletAgeDays = firstTxDate ? Math.floor((Date.now() - firstTxDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    let riskScore = 1;
    if (walletAgeDays < 30) riskScore += 3;
    else if (walletAgeDays < 90) riskScore += 2;
    else if (walletAgeDays < 365) riskScore += 1;
    
    if (totalTxs < 10) riskScore += 2;
    else if (totalTxs < 50) riskScore += 1;
    
    if (failedRatio > 0.1) riskScore += 2;
    else if (failedRatio > 0.05) riskScore += 1;
    
    riskScore = Math.min(riskScore, 10);
    const riskLevel = riskScore <= 3 ? 'LOW' : riskScore <= 6 ? 'MEDIUM' : 'HIGH';

    return new Response(JSON.stringify({
      walletAddress,
      network: 'xrp',
      transactions: processedTransactions,
      balance: balance,
      internalTransactions: [],
      tokenTransfers: [],
      riskAnalysis: {
        totalTransactions: totalTxs,
        failedTransactions: failedTxs,
        failedTransactionRatio: failedRatio,
        walletAgeDays,
        riskScore,
        riskLevel
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error analyzing XRP wallet:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to analyze XRP wallet',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
