
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Radio, Waves, AlertTriangle, Bell, BellOff, Filter } from "lucide-react";
import { SUPPORTED_NETWORKS } from '@/lib/networks';

interface RealTimeTransfer {
  id: string;
  hash: string;
  timestamp: string;
  block_number: number;
  from_address: string;
  to_address: string;
  amount: number;
  currency: string;
  usd_value: number;
  is_whale: boolean;
  network: string;
}

const RealTimeMonitor = () => {
  const [allTransfers, setAllTransfers] = useState<RealTimeTransfer[]>([]);
  const [allWhaleAlerts, setAllWhaleAlerts] = useState<RealTimeTransfer[]>([]);
  const [filterNetwork, setFilterNetwork] = useState<string>("all");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [monitoringInterval, setMonitoringInterval] = useState<NodeJS.Timeout | null>(null);
  const [stats, setStats] = useState({
    totalTransfers: 0,
    totalVolume: 0,
    whaleCount: 0,
    avgTransferSize: 0
  });
  const { toast } = useToast();

  // Get filtered data based on selected network
  const getFilteredTransfers = () => {
    if (filterNetwork === "all") return allTransfers;
    return allTransfers.filter(transfer => transfer.network === filterNetwork);
  };

  const getFilteredWhaleAlerts = () => {
    if (filterNetwork === "all") return allWhaleAlerts;
    return allWhaleAlerts.filter(alert => alert.network === filterNetwork);
  };

  const fetchAllNetworksData = async () => {
    if (!isConnected) return;
    
    const networks = Object.keys(SUPPORTED_NETWORKS);
    
    try {
      console.log('📡 Fetching whale transfers from all networks...');
      
      // Fetch transfers from all networks
      const transferPromises = networks.map(async (network) => {
        try {
          const { data } = await supabase.functions.invoke('real-time-monitor', {
            body: { action: 'get_recent_transfers', network }
          });
          return data?.transfers || [];
        } catch (error) {
          console.error(`Error fetching transfers for ${network}:`, error);
          return [];
        }
      });

      // Fetch whale alerts from all networks
      const whalePromises = networks.map(async (network) => {
        try {
          const { data } = await supabase.functions.invoke('real-time-monitor', {
            body: { action: 'get_whale_alerts', network }
          });
          return data?.whales || [];
        } catch (error) {
          console.error(`Error fetching whales for ${network}:`, error);
          return [];
        }
      });

      const [allTransferResults, allWhaleResults] = await Promise.all([
        Promise.all(transferPromises),
        Promise.all(whalePromises)
      ]);

      // Combine and sort all transfers
      const combinedTransfers = allTransferResults
        .flat()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 200); // Limit to 200 most recent

      const combinedWhales = allWhaleResults
        .flat()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 100); // Limit to 100 most recent

      setAllTransfers(combinedTransfers);
      setAllWhaleAlerts(combinedWhales);
      updateStats(combinedTransfers);

      console.log(`✅ Fetched ${combinedTransfers.length} transfers and ${combinedWhales.length} whale alerts`);

    } catch (error) {
      console.error('Error fetching data from all networks:', error);
    }
  };

  const startMonitoring = async () => {
    setIsLoading(true);
    try {
      console.log('🚀 Starting continuous monitoring for all networks...');
      
      // Start monitoring for all supported networks
      const networks = Object.keys(SUPPORTED_NETWORKS);
      const monitoringPromises = networks.map(async (network) => {
        try {
          const { error } = await supabase.functions.invoke('real-time-monitor', {
            body: { action: 'start_monitoring', network }
          });
          
          if (error) {
            console.error(`Error starting monitoring for ${network}:`, error);
            return { network, success: false, error };
          }
          
          return { network, success: true };
        } catch (error) {
          console.error(`Failed to start monitoring for ${network}:`, error);
          return { network, success: false, error };
        }
      });

      const results = await Promise.all(monitoringPromises);
      const successfulNetworks = results.filter(r => r.success).map(r => r.network);

      if (successfulNetworks.length > 0) {
        setIsConnected(true);
        
        toast({
          title: "Continuous Monitoring Started",
          description: `Monitoring ${successfulNetworks.length} blockchain${successfulNetworks.length > 1 ? 's' : ''} for whale transfers`,
        });

        // Fetch initial data
        await fetchAllNetworksData();
        
        // Set up continuous monitoring - fetch every 10 seconds
        const interval = setInterval(() => {
          fetchAllNetworksData();
        }, 10000);
        
        setMonitoringInterval(interval);
      }

    } catch (error) {
      console.error('Error starting continuous monitoring:', error);
      toast({
        title: "Error",
        description: "Failed to start continuous monitoring",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopMonitoring = () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      setMonitoringInterval(null);
    }
    
    setIsConnected(false);
    setAllTransfers([]);
    setAllWhaleAlerts([]);
    
    toast({
      title: "Monitoring Stopped",
      description: "Continuous whale transfer monitoring has been stopped",
    });
  };

  const updateStats = (transfers: RealTimeTransfer[]) => {
    if (!Array.isArray(transfers) || transfers.length === 0) {
      setStats({
        totalTransfers: 0,
        totalVolume: 0,
        whaleCount: 0,
        avgTransferSize: 0
      });
      return;
    }

    const totalVolume = transfers.reduce((sum, t) => sum + (t.usd_value || 0), 0);
    const whaleCount = transfers.filter(t => t.is_whale).length;
    
    setStats({
      totalTransfers: transfers.length,
      totalVolume,
      whaleCount,
      avgTransferSize: transfers.length > 0 ? totalVolume / transfers.length : 0
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      if (permission === 'granted') {
        toast({
          title: "Notifications Enabled",
          description: "You will receive whale alerts for large transfers",
        });
      }
    }
  };

  const toggleNotifications = () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      toast({
        title: "Notifications Disabled",
        description: "Whale alerts are now disabled",
      });
    } else {
      requestNotificationPermission();
    }
  };

  // Set up real-time subscriptions for all networks
  useEffect(() => {
    if (!isConnected) return;

    console.log('Setting up real-time subscriptions...');
    
    const channels = Object.keys(SUPPORTED_NETWORKS).map(network => {
      return supabase
        .channel(`real-time-transfers-${network}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'real_time_transfers',
            filter: `network=eq.${network}`
          },
          (payload) => {
            console.log(`New transfer received for ${network}:`, payload);
            const newTransfer = payload.new as RealTimeTransfer;
            
            setAllTransfers(prev => [newTransfer, ...prev].slice(0, 200));
            
            if (newTransfer.is_whale) {
              setAllWhaleAlerts(prev => [newTransfer, ...prev].slice(0, 100));
              
              // Show notification for whale transfers
              if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
                new Notification(`🐋 Whale Alert on ${SUPPORTED_NETWORKS[network]?.name}!`, {
                  body: `${formatUSD(newTransfer.usd_value)} ${newTransfer.currency} transfer detected`,
                  icon: '/favicon.ico'
                });
              }
              
              // Show toast notification
              toast({
                title: `🐋 Whale Alert on ${SUPPORTED_NETWORKS[network]?.name}!`,
                description: `${formatUSD(newTransfer.usd_value)} ${newTransfer.currency} transfer detected`,
              });
            }
          }
        )
        .subscribe();
    });

    return () => {
      console.log('Cleaning up real-time subscriptions...');
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [isConnected, notificationsEnabled, toast]);

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Update stats when filter changes
  useEffect(() => {
    const filteredTransfers = getFilteredTransfers();
    updateStats(filteredTransfers);
  }, [filterNetwork, allTransfers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
      }
    };
  }, [monitoringInterval]);

  const filteredTransfers = getFilteredTransfers();
  const filteredWhaleAlerts = getFilteredWhaleAlerts();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5" />
              Real-Time Whale Transfer Monitor
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Continuous Monitoring Active' : 'Disconnected'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleNotifications}
                className="flex items-center gap-2"
              >
                {notificationsEnabled ? (
                  <>
                    <Bell className="w-4 h-4" />
                    Notifications On
                  </>
                ) : (
                  <>
                    <BellOff className="w-4 h-4" />
                    Enable Alerts
                  </>
                )}
              </Button>
              <Button 
                onClick={isConnected ? stopMonitoring : startMonitoring}
                disabled={isLoading}
                size="sm"
                variant={isConnected ? "destructive" : "default"}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isConnected ? (
                  <>
                    <Waves className="w-4 h-4 mr-2" />
                    Stop Monitoring
                  </>
                ) : (
                  <>
                    <Waves className="w-4 h-4 mr-2" />
                    Start Monitoring
                  </>
                )}
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Continuous tracking of whale cryptocurrency transfers across all supported blockchains
          </CardDescription>
        </CardHeader>
      </Card>

      {isConnected && (
        <>
          {/* Network Filter */}
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <label className="text-sm font-medium">Filter by Network:</label>
              <Select value={filterNetwork} onValueChange={setFilterNetwork}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <span>All Networks</span>
                    </div>
                  </SelectItem>
                  {Object.values(SUPPORTED_NETWORKS).map(network => (
                    <SelectItem key={network.id} value={network.id}>
                      <div className="flex items-center gap-2">
                        <span>{network.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({network.nativeCurrency.symbol})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Transfers</div>
                <div className="text-2xl font-bold">{stats.totalTransfers}</div>
                <div className="text-xs text-muted-foreground">
                  {filterNetwork === "all" ? "All Networks" : SUPPORTED_NETWORKS[filterNetwork]?.name}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Volume</div>
                <div className="text-2xl font-bold">{formatUSD(stats.totalVolume)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Whale Transfers</div>
                <div className="text-2xl font-bold text-orange-500">{stats.whaleCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Avg Transfer</div>
                <div className="text-2xl font-bold">{formatUSD(stats.avgTransferSize)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Whale Alerts */}
          {filteredWhaleAlerts.length > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="w-5 h-5" />
                  🐋 Recent Whale Alerts {filterNetwork !== "all" && `- ${SUPPORTED_NETWORKS[filterNetwork]?.name}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredWhaleAlerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-orange-300">
                          {alert.currency}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {SUPPORTED_NETWORKS[alert.network]?.name || alert.network}
                        </Badge>
                        <span className="font-mono text-lg font-bold">
                          {formatUSD(alert.usd_value)}
                        </span>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <div>{truncateAddress(alert.from_address)} → {truncateAddress(alert.to_address)}</div>
                        <div>{formatTimestamp(alert.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transfer Tables */}
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all">All Transfers</TabsTrigger>
              <TabsTrigger value="whales">Whale Transfers Only</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Live Transfer Feed {filterNetwork !== "all" && `- ${SUPPORTED_NETWORKS[filterNetwork]?.name}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Network</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>From</TableHead>
                          <TableHead>To</TableHead>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransfers.map((transfer) => (
                          <TableRow key={transfer.id}>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {SUPPORTED_NETWORKS[transfer.network]?.name || transfer.network}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{transfer.currency}</Badge>
                            </TableCell>
                            <TableCell className="font-mono">
                              {formatUSD(transfer.usd_value)}
                            </TableCell>
                            <TableCell className="font-mono">
                              {truncateAddress(transfer.from_address)}
                            </TableCell>
                            <TableCell className="font-mono">
                              {truncateAddress(transfer.to_address)}
                            </TableCell>
                            <TableCell>
                              {formatTimestamp(transfer.timestamp)}
                            </TableCell>
                            <TableCell>
                              {transfer.is_whale && (
                                <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                                  🐋 Whale
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredTransfers.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              {allTransfers.length === 0 
                                ? "No transfers found. Monitoring will update live as transfers occur."
                                : `No transfers found for ${filterNetwork === "all" ? "selected filter" : SUPPORTED_NETWORKS[filterNetwork]?.name}.`
                              }
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="whales">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Whale Transfers ($100k+) {filterNetwork !== "all" && `- ${SUPPORTED_NETWORKS[filterNetwork]?.name}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Network</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWhaleAlerts.map((whale) => (
                        <TableRow key={whale.id}>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {SUPPORTED_NETWORKS[whale.network]?.name || whale.network}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{whale.currency}</Badge>
                          </TableCell>
                          <TableCell className="font-mono font-bold text-orange-600">
                            {formatUSD(whale.usd_value)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {truncateAddress(whale.from_address)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {truncateAddress(whale.to_address)}
                          </TableCell>
                          <TableCell>
                            {formatTimestamp(whale.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredWhaleAlerts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {allWhaleAlerts.length === 0
                              ? "No whale transfers detected yet. Monitoring will update live as whale transfers occur."
                              : `No whale transfers found for ${filterNetwork === "all" ? "selected filter" : SUPPORTED_NETWORKS[filterNetwork]?.name}.`
                            }
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default RealTimeMonitor;
