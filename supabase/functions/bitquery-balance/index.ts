
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { addresses, network = 'eth' } = await req.json()
    
    if (!addresses || !Array.isArray(addresses)) {
      return new Response(
        JSON.stringify({ error: 'addresses array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const bitqueryToken = Deno.env.get('BITQUERY_TOKEN')
    if (!bitqueryToken) {
      return new Response(
        JSON.stringify({ error: 'Bitquery token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const query = `
      query GetWalletBalances($addresses: [String!]!) {
        EVM(network: ${network}, dataset: combined) {
          BalanceUpdates(
            where: {
              BalanceUpdate: {
                Address: { in: $addresses }
              }
            }
            limit: { count: 1000 }
          ) {
            BalanceUpdate {
              Address
              Amount
            }
            Currency {
              Name
              Symbol
              SmartContract
              Decimals
            }
            sum: sum(of: BalanceUpdate_Amount)
          }
        }
      }
    `

    const response = await fetch('https://streaming.bitquery.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': bitqueryToken,
        'Authorization': `Bearer ${bitqueryToken}`
      },
      body: JSON.stringify({
        query,
        variables: { addresses: addresses.map(addr => addr.toLowerCase()) }
      })
    })

    const result = await response.json()
    
    if (result.errors) {
      console.error('Bitquery errors:', result.errors)
      return new Response(
        JSON.stringify({ error: result.errors[0].message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process balance data
    const balancesByAddress = {}
    const balanceUpdates = result.data?.EVM?.BalanceUpdates || []

    balanceUpdates.forEach(update => {
      const address = update.BalanceUpdate.Address.toLowerCase()
      const isNative = !update.Currency.SmartContract
      
      if (!balancesByAddress[address]) {
        balancesByAddress[address] = {
          address,
          native: { amount: '0' },
          tokens: [],
          lastUpdated: new Date().toISOString()
        }
      }

      if (isNative) {
        balancesByAddress[address].native = {
          amount: update.sum || '0',
          currency: update.Currency
        }
      } else {
        const existingTokenIndex = balancesByAddress[address].tokens
          .findIndex(t => t.currency.smartContract === update.Currency.SmartContract)

        const tokenBalance = {
          amount: update.sum || '0',
          currency: update.Currency
        }

        if (existingTokenIndex >= 0) {
          balancesByAddress[address].tokens[existingTokenIndex] = tokenBalance
        } else {
          balancesByAddress[address].tokens.push(tokenBalance)
        }
      }
    })

    return new Response(
      JSON.stringify(balancesByAddress),
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
