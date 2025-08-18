
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { walletAddress, startDate, endDate, network = 'ethereum', limit = 100 } = await req.json()
    
    if (!walletAddress || !startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: 'walletAddress, startDate, and endDate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const networkConfig = SUPPORTED_NETWORKS[network];
    if (!networkConfig) {
      return new Response(
        JSON.stringify({ error: `Unsupported network: ${network}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // XRP requires different handling
    if (network === 'xrp') {
      return await handleXRPTransactions(walletAddress, startDate, endDate, limit);
    }

    const etherscanApiKey = Deno.env.get('ETHERSCAN_API_KEY')
    if (!etherscanApiKey) {
      return new Response(
        JSON.stringify({ error: 'Etherscan API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🔍 Fetching wallet history for: ${walletAddress} on ${network} from ${startDate} to ${endDate}`)

    // Convert dates to timestamps
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000)
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000)

    // Fetch normal transactions using network-specific endpoint
    const normalTxUrl = `${networkConfig.apiEndpoint}?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${etherscanApiKey}`
    
    console.log(`📡 Calling ${network} API for normal transactions`)
    const normalTxResponse = await fetch(normalTxUrl)
    const normalTxData = await normalTxResponse.json()

    if (normalTxData.status !== '1') {
      console.error(`${network} API error:`, normalTxData.message)
      return new Response(
        JSON.stringify({ error: normalTxData.message || 'Failed to fetch transactions' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter transactions by timestamp
    const filteredTransactions = normalTxData.result.filter(tx => {
      const txTimestamp = parseInt(tx.timeStamp)
      return txTimestamp >= startTimestamp && txTimestamp <= endTimestamp
    })

    // Transform to match our expected format
    const transformedTransactions = filteredTransactions.map(tx => ({
      Transaction: {
        Hash: tx.hash,
        From: tx.from,
        To: tx.to,
        Value: tx.value, // This is in Wei for EVM chains
        Gas: tx.gas,
        GasPrice: tx.gasPrice,
        Cost: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice)).toString()
      },
      Block: {
        Number: parseInt(tx.blockNumber),
        Time: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        Date: new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0]
      },
      Fee: {
        SenderFee: (parseInt(tx.gasUsed) * parseInt(tx.gasPrice)).toString()
      },
      TransactionStatus: {
        Success: tx.txreceipt_status === '1'
      }
    }))

    const transactionCount = transformedTransactions.length
    console.log(`✅ Fetched and filtered ${transactionCount} transactions from ${network}`)

    const result = {
      data: {
        EVM: {
          Transactions: transformedTransactions
        }
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleXRPTransactions(walletAddress: string, startDate: string, endDate: string, limit: number) {
  try {
    console.log(`🔍 Fetching XRP transactions for: ${walletAddress}`)
    
    // XRP Ledger API call
    const xrpApiUrl = `https://api.xrpscan.com/api/v1/account/${walletAddress}/transactions`
    const xrpResponse = await fetch(xrpApiUrl)
    const xrpData = await xrpResponse.json()

    if (!xrpData || !Array.isArray(xrpData)) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch XRP transactions' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter and transform XRP transactions
    const startTime = new Date(startDate).getTime()
    const endTime = new Date(endDate).getTime()

    const filteredXRPTransactions = xrpData
      .filter(tx => {
        const txTime = new Date(tx.date).getTime()
        return txTime >= startTime && txTime <= endTime
      })
      .slice(0, limit)
      .map(tx => ({
        Transaction: {
          Hash: tx.hash,
          From: tx.Account || walletAddress,
          To: tx.Destination || '',
          Value: tx.Amount ? (parseFloat(tx.Amount) * 1000000).toString() : '0', // Convert XRP to drops
          Gas: '0',
          GasPrice: '0',
          Cost: tx.Fee || '0'
        },
        Block: {
          Number: tx.ledger_index || 0,
          Time: tx.date,
          Date: tx.date ? tx.date.split('T')[0] : ''
        },
        Fee: {
          SenderFee: tx.Fee || '0'
        },
        TransactionStatus: {
          Success: tx.meta?.TransactionResult === 'tesSUCCESS'
        }
      }))

    console.log(`✅ Fetched ${filteredXRPTransactions.length} XRP transactions`)

    return new Response(
      JSON.stringify({
        data: {
          EVM: {
            Transactions: filteredXRPTransactions
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('XRP API Error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch XRP transactions' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
