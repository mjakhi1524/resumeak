import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    requests_remaining: number;
    rate_limit_reset: string;
  };
}

async function validateApiKey(apiKey: string, supabase: any) {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  // Hash the provided API key
  const keyHash = await crypto.subtle.digest(
    'SHA-256', 
    new TextEncoder().encode(apiKey)
  );
  const keyHashHex = Array.from(new Uint8Array(keyHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Check if API key exists and is active
  const { data: apiKeyData, error } = await supabase
    .from('api_keys')
    .select('id, rate_limit_per_minute, is_active, expires_at')
    .eq('key_hash', keyHashHex)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !apiKeyData) {
    return { valid: false, error: 'Invalid API key' };
  }

  // Check if key is expired
  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    return { valid: false, error: 'API key has expired' };
  }

  // Check rate limiting (basic implementation)
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { count } = await supabase
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyData.id)
    .gte('timestamp', oneMinuteAgo);

  if (count >= apiKeyData.rate_limit_per_minute) {
    return { 
      valid: false, 
      error: 'Rate limit exceeded',
      rate_limit_reset: new Date(Date.now() + 60000).toISOString()
    };
  }

  return { valid: true, apiKeyId: apiKeyData.id, remaining: apiKeyData.rate_limit_per_minute - count };
}

async function logApiUsage(supabase: any, apiKeyId: string, endpoint: string, startTime: number, statusCode: number, req: Request) {
  const responseTime = Date.now() - startTime;
  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  await supabase.from('api_usage').insert({
    api_key_id: apiKeyId,
    endpoint,
    response_time_ms: responseTime,
    status_code: statusCode,
    ip_address: clientIP
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Validate API key
    const apiKey = req.headers.get('x-api-key');
    const validation = await validateApiKey(apiKey || '', supabase);
    
    if (!validation.valid) {
      const response: ApiResponse<null> = {
        success: false,
        error: validation.error
      };
      
      if (validation.rate_limit_reset) {
        response.usage = {
          requests_remaining: 0,
          rate_limit_reset: validation.rate_limit_reset
        };
      }

      return new Response(JSON.stringify(response), {
        status: validation.error === 'Rate limit exceeded' ? 429 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { page = 1, limit = 50, network = 'ethereum' } = await req.json();

    // Call the existing fetch-stablecoin-transfers function
    const { data: transferData, error: transferError } = await supabase.functions.invoke('fetch-stablecoin-transfers', {
      body: { page, limit, network }
    });

    if (transferError) {
      await logApiUsage(supabase, validation.apiKeyId, 'stablecoin-transfers', startTime, 500, req);
      const response: ApiResponse<null> = {
        success: false,
        error: 'Failed to fetch stablecoin transfers'
      };
      
      return new Response(JSON.stringify(response), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await logApiUsage(supabase, validation.apiKeyId, 'stablecoin-transfers', startTime, 200, req);
    
    const response: ApiResponse<any> = {
      success: true,
      data: transferData,
      usage: {
        requests_remaining: validation.remaining - 1,
        rate_limit_reset: new Date(Date.now() + 60000).toISOString()
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in api-stablecoin-transfers:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal server error'
    };
    
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});