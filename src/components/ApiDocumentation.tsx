import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const API_BASE_URL = "https://tnwgnaneejkknokwpkwa.supabase.co/functions/v1";

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
};

export function ApiDocumentation() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wallet Monitor API Documentation</CardTitle>
          <CardDescription>
            Access real-time wallet monitoring and analysis through our REST API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Base URL</h4>
              <div className="flex items-center space-x-2">
                <code className="bg-muted px-2 py-1 rounded text-sm flex-1">
                  {API_BASE_URL}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(API_BASE_URL)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Authentication</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Include your API key in the <code>x-api-key</code> header
              </p>
              <code className="bg-muted px-2 py-1 rounded text-sm block">
                x-api-key: YOUR_API_KEY
              </code>
            </div>

            <div>
              <h4 className="font-medium mb-2">Rate Limits</h4>
              <p className="text-sm text-muted-foreground">
                Default: 60 requests per minute per API key
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="analyze" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analyze">Wallet Analysis</TabsTrigger>
          <TabsTrigger value="balances">Wallet Balances</TabsTrigger>
          <TabsTrigger value="transfers">Stablecoin Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Badge variant="default">POST</Badge>
                <span>/api-analyze-wallet</span>
              </CardTitle>
              <CardDescription>
                Analyze wallet risk and transaction patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Request Body</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`{
  "address": "0x742E3A5...9E8c2"
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Response</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "risk_rating": {
      "risk_score": 25,
      "risk_level": "Low",
      "total_transactions": 150,
      "failed_transactions": 5,
      "wallet_age_days": 365
    },
    "transactions": [...]
  },
  "usage": {
    "requests_remaining": 59,
    "rate_limit_reset": "2024-01-01T12:01:00Z"
  }
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">cURL Example</h4>
                <div className="flex items-start space-x-2">
                  <pre className="bg-muted p-4 rounded text-sm overflow-x-auto flex-1">
{`curl -X POST ${API_BASE_URL}/api-analyze-wallet \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"address":"0x742E3A5...9E8c2"}'`}
                  </pre>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(`curl -X POST ${API_BASE_URL}/api-analyze-wallet \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -d '{"address":"0x742E3A5...9E8c2"}'`)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Badge variant="default">POST</Badge>
                <span>/api-wallet-balances</span>
              </CardTitle>
              <CardDescription>
                Get real-time wallet balances for multiple addresses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Request Body</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`{
  "addresses": [
    "0x742E3A5...9E8c2",
    "0x8ba1f10...7Ac9D"
  ],
  "network": "eth"
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Response</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "0x742e3a5...9e8c2": {
      "address": "0x742e3a5...9e8c2",
      "native": {
        "amount": "1.25",
        "currency": {
          "Name": "Ethereum",
          "Symbol": "ETH"
        }
      },
      "tokens": [
        {
          "amount": "1000.0",
          "currency": {
            "Name": "USD Coin",
            "Symbol": "USDC"
          }
        }
      ]
    }
  }
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Parameters</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <code>addresses</code>
                    <span className="text-sm text-muted-foreground">Array of wallet addresses (required)</span>
                  </div>
                  <div className="flex justify-between">
                    <code>network</code>
                    <span className="text-sm text-muted-foreground">Network (eth, bsc, polygon) - default: eth</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Badge variant="default">POST</Badge>
                <span>/api-stablecoin-transfers</span>
              </CardTitle>
              <CardDescription>
                Get recent stablecoin transfer data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Request Body</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`{
  "page": 1,
  "limit": 50,
  "network": "ethereum"
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Response</h4>
                <pre className="bg-muted p-4 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "data": {
    "transfers": [
      {
        "sender_address": "0x123...",
        "receiver_address": "0x456...",
        "amount": "1000.0",
        "token_symbol": "USDC",
        "token_name": "USD Coin",
        "block_time": "2024-01-01T12:00:00Z",
        "network": "ethereum"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1000
    }
  }
}`}
                </pre>
              </div>

              <div>
                <h4 className="font-medium mb-2">Parameters</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <code>page</code>
                    <span className="text-sm text-muted-foreground">Page number - default: 1</span>
                  </div>
                  <div className="flex justify-between">
                    <code>limit</code>
                    <span className="text-sm text-muted-foreground">Results per page (1-100) - default: 50</span>
                  </div>
                  <div className="flex justify-between">
                    <code>network</code>
                    <span className="text-sm text-muted-foreground">Network - default: ethereum</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Error Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Authentication Error (401)</h4>
              <pre className="bg-muted p-4 rounded text-sm">
{`{
  "success": false,
  "error": "Invalid API key"
}`}
              </pre>
            </div>

            <div>
              <h4 className="font-medium mb-2">Rate Limit Error (429)</h4>
              <pre className="bg-muted p-4 rounded text-sm">
{`{
  "success": false,
  "error": "Rate limit exceeded",
  "usage": {
    "requests_remaining": 0,
    "rate_limit_reset": "2024-01-01T12:01:00Z"
  }
}`}
              </pre>
            </div>

            <div>
              <h4 className="font-medium mb-2">Validation Error (400)</h4>
              <pre className="bg-muted p-4 rounded text-sm">
{`{
  "success": false,
  "error": "Wallet address is required"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}