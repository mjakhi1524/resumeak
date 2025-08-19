import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, Clock, AlertCircle } from "lucide-react";

interface ApiUsage {
  id: string;
  endpoint: string;
  timestamp: string;
  response_time_ms: number;
  status_code: number;
  ip_address: string;
}

export function ApiUsageDashboard() {
  const { user } = useAuth();
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchApiUsage();
    }
  }, [user]);

  const fetchApiUsage = async () => {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return "default";
    if (status >= 400 && status < 500) return "destructive";
    if (status >= 500) return "destructive";
    return "secondary";
  };

  const calculateStats = () => {
    const total = apiUsage.length;
    const successful = apiUsage.filter(u => u.status_code >= 200 && u.status_code < 400).length;
    const avgResponseTime = apiUsage.length > 0 
      ? Math.round(apiUsage.reduce((acc, u) => acc + u.response_time_ms, 0) / apiUsage.length)
      : 0;
    const errorRate = total > 0 ? ((total - successful) / total * 100).toFixed(1) : '0';

    return { total, successful, avgResponseTime, errorRate };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{((stats.successful / stats.total) * 100 || 0).toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Response</p>
                <p className="text-2xl font-bold">{stats.avgResponseTime}ms</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Error Rate</p>
                <p className="text-2xl font-bold">{stats.errorRate}%</p>
              </div>
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent API Requests</CardTitle>
          <CardDescription>Your latest API activity and response times</CardDescription>
        </CardHeader>
        <CardContent>
          {apiUsage.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No API requests yet</p>
              <p className="text-sm text-muted-foreground">Start making requests to see your usage analytics</p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiUsage.slice(0, 20).map((usage) => (
                <div key={usage.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {usage.endpoint.split('/').pop()?.toUpperCase()}
                    </Badge>
                    <div>
                      <p className="font-mono text-sm">{usage.endpoint}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(usage.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={getStatusColor(usage.status_code)}>
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
    </div>
  );
}