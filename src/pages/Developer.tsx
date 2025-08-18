import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye, EyeOff, Key, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiDocumentation } from "@/components/ApiDocumentation";

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
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Developer Portal</h1>
        <p className="text-muted-foreground">Manage your API keys and access our wallet monitoring API</p>
      </div>

      <Tabs defaultValue="keys" className="space-y-6">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-6">
          {newApiKey && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800">API Key Created</CardTitle>
                <CardDescription className="text-green-600">
                  Copy this key now - you won't be able to see it again!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Input
                    value={showKey ? newApiKey : "wm_" + "•".repeat(40)}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(newApiKey)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  className="mt-4" 
                  onClick={() => setNewApiKey(null)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Create New API Key</CardTitle>
              <CardDescription>
                Generate a new API key to access our wallet monitoring endpoints
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Production App, Development"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <Button onClick={createApiKey} disabled={isCreating}>
                <Key className="h-4 w-4 mr-2" />
                {isCreating ? 'Creating...' : 'Create API Key'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your API Keys</CardTitle>
              <CardDescription>Manage your existing API keys</CardDescription>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <p className="text-muted-foreground">No API keys created yet</p>
              ) : (
                <div className="space-y-4">
                  {apiKeys.map((key) => (
                    <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-medium">{key.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Created {new Date(key.created_at).toLocaleDateString()}
                        </p>
                        {key.last_used_at && (
                          <p className="text-sm text-muted-foreground">
                            Last used {new Date(key.last_used_at).toLocaleDateString()}
                          </p>
                        )}
                        <div className="flex items-center space-x-2 mt-2">
                          <Badge variant={key.is_active ? "default" : "secondary"}>
                            {key.is_active ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">
                            {key.rate_limit_per_minute} req/min
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => deleteApiKey(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Usage</CardTitle>
              <CardDescription>Monitor your API usage and performance</CardDescription>
            </CardHeader>
            <CardContent>
              {apiUsage.length === 0 ? (
                <p className="text-muted-foreground">No API usage yet</p>
              ) : (
                <div className="space-y-2">
                  {apiUsage.map((usage) => (
                    <div key={usage.id} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <span className="font-medium">{usage.endpoint}</span>
                        <p className="text-sm text-muted-foreground">
                          {new Date(usage.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={usage.status_code < 400 ? "default" : "destructive"}>
                          {usage.status_code}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {usage.response_time_ms}ms
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <ApiDocumentation />
        </TabsContent>
      </Tabs>
    </div>
  );
}