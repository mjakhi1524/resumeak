import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

const API_BASE_URL = "https://tnwgnaneejkknokwpkwa.supabase.co/functions/v1";

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
};

export function ApiDocumentation() {
  return (
    <div className="space-y-8">
      {/* Introduction */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Introduction
            </CardTitle>
            <CardDescription>
              The Wallet Monitor API is organized around REST. Our API has predictable resource-oriented URLs, accepts form-encoded request bodies, returns JSON-encoded responses, and uses standard HTTP response codes, authentication, and verbs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-lg">Base URL</h4>
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                  <code className="text-sm font-mono flex-1">
                    {API_BASE_URL}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(API_BASE_URL)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3 text-lg">Authentication</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  The Wallet Monitor API uses API keys to authenticate requests. You can view and manage your API keys in the Developer Portal.
                </p>
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                  <code className="text-sm font-mono">
                    x-api-key: YOUR_API_KEY
                  </code>
                </div>
              </div>
            </div>

            <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-lg">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-blue-600" />
                <h4 className="font-medium text-blue-900">Rate Limiting</h4>
              </div>
              <p className="text-sm text-blue-800">
                All API requests are rate limited to 60 requests per minute per API key. Rate limit information is included in response headers.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Authentication Details */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            The Wallet Monitor API uses API keys to authenticate requests. You can view and manage your API keys in the Developer Portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Your API keys carry many privileges, so be sure to keep them secure! Do not share your secret API keys in publicly accessible areas such as GitHub, client-side code, and so forth.
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              Authentication to the API is performed via HTTP header. Provide your API key as the value of the <code className="bg-muted px-1 rounded">x-api-key</code> header.
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">Example authenticated request:</p>
              <pre className="text-sm">
{`curl ${API_BASE_URL}/api-analyze-wallet \\
  -H "x-api-key: wm_test_4eC39HqLyjWDarjtT1zdp7dc" \\
  -H "Content-Type: application/json" \\
  -d '{"address": "0x742d35Cc6634C0532925a3b8D"}'`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Endpoints */}
      <Tabs defaultValue="analyze" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analyze">Wallet Analysis</TabsTrigger>
          <TabsTrigger value="balances">Wallet Balances</TabsTrigger>
          <TabsTrigger value="transfers">Stablecoin Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Badge variant="secondary" className="font-mono">POST</Badge>
                <span className="font-mono">/api-analyze-wallet</span>
              </CardTitle>
              <CardDescription>
                Analyze wallet risk patterns, transaction history, and generate comprehensive risk scores for any Ethereum address.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Parameters */}
              <div>
                <h4 className="font-semibold mb-3">Parameters</h4>
                <div className="border rounded-lg">
                  <div className="border-b p-4">
                    <div className="flex items-center justify-between">
                      <code className="font-mono">address</code>
                      <Badge variant="destructive" className="text-xs">required</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      string • The Ethereum wallet address to analyze
                    </p>
                  </div>
                </div>
              </div>

              {/* Request Example */}
              <div>
                <h4 className="font-semibold mb-3">Request</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Example request</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(`{
  "address": "0x742d35Cc6634C0532925a3b8D"
}`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <pre className="text-sm">
{`{
  "address": "0x742d35Cc6634C0532925a3b8D"
}`}
                  </pre>
                </div>
              </div>

              {/* Response Example */}
              <div>
                <h4 className="font-semibold mb-3">Response</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Example response</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(`{
  "success": true,
  "data": {
    "risk_rating": {
      "risk_score": 25,
      "risk_level": "Low",
      "total_transactions": 1547,
      "failed_transactions": 23,
      "wallet_age_days": 892
    },
    "transactions": [
      {
        "hash": "0xabcd...",
        "value": "0.5",
        "timestamp": "2024-01-15T10:30:00Z",
        "is_error": false
      }
    ]
  },
  "usage": {
    "requests_remaining": 59,
    "rate_limit_reset": "2024-01-15T11:00:00Z"
  }
}`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <pre className="text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "risk_rating": {
      "risk_score": 25,
      "risk_level": "Low",
      "total_transactions": 1547,
      "failed_transactions": 23,
      "wallet_age_days": 892
    },
    "transactions": [
      {
        "hash": "0xabcd...",
        "value": "0.5",
        "timestamp": "2024-01-15T10:30:00Z",
        "is_error": false
      }
    ]
  },
  "usage": {
    "requests_remaining": 59,
    "rate_limit_reset": "2024-01-15T11:00:00Z"
  }
}`}
                  </pre>
                </div>
              </div>

              {/* cURL Example */}
              <div>
                <h4 className="font-semibold mb-3">cURL</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Command line example</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(`curl -X POST ${API_BASE_URL}/api-analyze-wallet \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"address": "0x742d35Cc6634C0532925a3b8D"}'`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <pre className="text-sm overflow-x-auto">
{`curl -X POST ${API_BASE_URL}/api-analyze-wallet \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"address": "0x742d35Cc6634C0532925a3b8D"}'`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Badge variant="secondary" className="font-mono">POST</Badge>
                <span className="font-mono">/api-wallet-balances</span>
              </CardTitle>
              <CardDescription>
                Retrieve real-time native token and ERC-20 token balances for multiple wallet addresses across different networks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Parameters</h4>
                <div className="border rounded-lg">
                  <div className="border-b p-4">
                    <div className="flex items-center justify-between">
                      <code className="font-mono">addresses</code>
                      <Badge variant="destructive" className="text-xs">required</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      array • Array of wallet addresses to check balances for
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <code className="font-mono">network</code>
                      <Badge variant="outline" className="text-xs">optional</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      string • Network to check (eth, bsc, polygon). Default: eth
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Request</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm">
{`{
  "addresses": [
    "0x742d35Cc6634C0532925a3b8D",
    "0x8ba1f109551bD432803012645Hac9D"
  ],
  "network": "eth"
}`}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Response</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "0x742d35cc6634c0532925a3b8d": {
      "address": "0x742d35cc6634c0532925a3b8d",
      "native": {
        "amount": "2.547831",
        "currency": {
          "Name": "Ethereum",
          "Symbol": "ETH"
        }
      },
      "tokens": [
        {
          "amount": "1500.0",
          "currency": {
            "Name": "USD Coin",
            "Symbol": "USDC"
          }
        },
        {
          "amount": "0.25",
          "currency": {
            "Name": "Wrapped Bitcoin",
            "Symbol": "WBTC"
          }
        }
      ]
    }
  }
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Badge variant="secondary" className="font-mono">POST</Badge>
                <span className="font-mono">/api-stablecoin-transfers</span>
              </CardTitle>
              <CardDescription>
                Get recent stablecoin transfer data with pagination support. Monitor USDC, USDT, DAI, and other stablecoin movements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Parameters</h4>
                <div className="border rounded-lg">
                  <div className="border-b p-4">
                    <div className="flex items-center justify-between">
                      <code className="font-mono">page</code>
                      <Badge variant="outline" className="text-xs">optional</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      integer • Page number for pagination. Default: 1
                    </p>
                  </div>
                  <div className="border-b p-4">
                    <div className="flex items-center justify-between">
                      <code className="font-mono">limit</code>
                      <Badge variant="outline" className="text-xs">optional</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      integer • Number of results per page (1-100). Default: 50
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <code className="font-mono">network</code>
                      <Badge variant="outline" className="text-xs">optional</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      string • Network to filter by. Default: ethereum
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Request</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm">
{`{
  "page": 1,
  "limit": 25,
  "network": "ethereum"
}`}
                  </pre>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Response</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "transfers": [
      {
        "sender_address": "0x123abc...",
        "receiver_address": "0x456def...",
        "amount": "10000.0",
        "token_symbol": "USDC",
        "token_name": "USD Coin",
        "block_time": "2024-01-15T14:30:22Z",
        "network": "ethereum"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 15420,
      "total_pages": 617
    }
  }
}`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Errors
          </CardTitle>
          <CardDescription>
            The Wallet Monitor API uses conventional HTTP response codes to indicate the success or failure of an API request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="destructive">401</Badge>
                <span className="font-medium">Unauthorized</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">No valid API key provided.</p>
              <div className="bg-muted p-3 rounded">
                <pre className="text-sm">
{`{
  "success": false,
  "error": "Invalid API key"
}`}
                </pre>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="destructive">429</Badge>
                <span className="font-medium">Too Many Requests</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">Too many requests hit the API too quickly.</p>
              <div className="bg-muted p-3 rounded">
                <pre className="text-sm">
{`{
  "success": false,
  "error": "Rate limit exceeded",
  "usage": {
    "requests_remaining": 0,
    "rate_limit_reset": "2024-01-15T15:00:00Z"
  }
}`}
                </pre>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="destructive">400</Badge>
                <span className="font-medium">Bad Request</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">The request was unacceptable, often due to missing a required parameter.</p>
              <div className="bg-muted p-3 rounded">
                <pre className="text-sm">
{`{
  "success": false,
  "error": "Wallet address is required"
}`}
                </pre>
              </div>
            </div>
          </div>

          <div className="border-l-4 border-amber-500 bg-amber-50 p-4 rounded-r-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-amber-900">HTTP Status Code Summary</h4>
            </div>
            <div className="text-sm text-amber-800 space-y-1">
              <p><strong>200 - OK:</strong> Everything worked as expected.</p>
              <p><strong>400 - Bad Request:</strong> The request was unacceptable.</p>
              <p><strong>401 - Unauthorized:</strong> No valid API key provided.</p>
              <p><strong>429 - Too Many Requests:</strong> Too many requests hit the API too quickly.</p>
              <p><strong>500 - Server Error:</strong> Something went wrong on our end.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}