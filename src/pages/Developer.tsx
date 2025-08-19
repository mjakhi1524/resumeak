import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye, EyeOff, Key, Trash2, BookOpen, Code, Activity } from "lucide-react";
import { toast } from "sonner";
import { ApiDocumentation } from "@/components/ApiDocumentation";
import { ApiKeyManager } from "@/components/developer/ApiKeyManager";
import { ApiUsageDashboard } from "@/components/developer/ApiUsageDashboard";

interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

interface ApiUsage {
  id: string;
  endpoint: string;
  timestamp: string;
  response_time_ms: number;
  status_code: number;
  ip_address: string;
}

export default function Developer() {
  const { user, loading } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (user) {
      fetchApiKeys();
      fetchApiUsage();
    }
  }, [user]);

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to fetch API keys');
    }
  };

  const fetchApiUsage = async () => {
    try {
      const { data, error } = await supabase
        .from('api_usage')
        .select(`
          *,
          api_keys!inner(user_id)
        `)
        .eq('api_keys.user_id', user?.id)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setApiUsage(data || []);
    } catch (error) {
      console.error('Error fetching API usage:', error);
      toast.error('Failed to fetch API usage');
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for your API key');
      return;
    }

    setIsCreating(true);
    try {
      // Generate a new API key
      const { data: keyData, error: keyError } = await supabase
        .rpc('generate_api_key');

      if (keyError) throw keyError;

      const apiKey = keyData;
      
      // Hash the key for storage
      const { data: hashData, error: hashError } = await supabase
        .rpc('hash_api_key', { api_key: apiKey });

      if (hashError) throw hashError;

      // Store the hashed key
      const { error: insertError } = await supabase
        .from('api_keys')
        .insert({
          name: newKeyName.trim(),
          key_hash: hashData,
          user_id: user?.id
        });

      if (insertError) throw insertError;

      setNewApiKey(apiKey);
      setNewKeyName("");
      fetchApiKeys();
      toast.success('API key created successfully');
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteApiKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
      
      fetchApiKeys();
      toast.success('API key deleted successfully');
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
            <p className="text-muted-foreground">Please sign in to access the developer portal.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Code className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">API Reference</h1>
            </div>
          </div>
          <p className="text-lg text-muted-foreground">
            The Wallet Monitor API provides powerful tools for blockchain wallet analysis, balance tracking, and transaction monitoring.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="docs" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Documentation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Getting Started</CardTitle>
                  <CardDescription>
                    Learn how to integrate the Wallet Monitor API into your application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        1
                      </div>
                      <div>
                        <h4 className="font-medium">Create an API Key</h4>
                        <p className="text-sm text-muted-foreground">
                          Generate your first API key to authenticate requests
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        2
                      </div>
                      <div>
                        <h4 className="font-medium">Make Your First Request</h4>
                        <p className="text-sm text-muted-foreground">
                          Use your API key to call our wallet analysis endpoints
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        3
                      </div>
                      <div>
                        <h4 className="font-medium">Build Your Application</h4>
                        <p className="text-sm text-muted-foreground">
                          Integrate real-time wallet monitoring into your app
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Start</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-sm mb-2">Base URL</h4>
                      <code className="text-xs bg-muted p-2 rounded block">
                        https://tnwgnaneejkknokwpkwa.supabase.co/functions/v1
                      </code>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-2">Authentication</h4>
                      <code className="text-xs bg-muted p-2 rounded block">
                        x-api-key: YOUR_API_KEY
                      </code>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-2">Rate Limit</h4>
                      <p className="text-xs text-muted-foreground">
                        60 requests per minute
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Wallet Analysis</CardTitle>
                  <CardDescription>
                    Analyze wallet risk and transaction patterns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="mb-2">POST</Badge>
                  <code className="text-sm block mb-3">/api-analyze-wallet</code>
                  <p className="text-sm text-muted-foreground">
                    Get comprehensive risk analysis, transaction history, and wallet scoring.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Wallet Balances</CardTitle>
                  <CardDescription>
                    Real-time balance tracking for multiple addresses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="mb-2">POST</Badge>
                  <code className="text-sm block mb-3">/api-wallet-balances</code>
                  <p className="text-sm text-muted-foreground">
                    Track native and token balances across different networks.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Stablecoin Transfers</CardTitle>
                  <CardDescription>
                    Monitor recent stablecoin movements
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="mb-2">POST</Badge>
                  <code className="text-sm block mb-3">/api-stablecoin-transfers</code>
                  <p className="text-sm text-muted-foreground">
                    Get real-time stablecoin transfer data with pagination.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="keys">
            <ApiKeyManager />
          </TabsContent>

          <TabsContent value="usage">
            <ApiUsageDashboard />
          </TabsContent>

          <TabsContent value="docs">
            <ApiDocumentation />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}