
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, RefreshCw } from "lucide-react";
import AddressDisplay from "@/components/AddressDisplay";
import { SUPPORTED_NETWORKS } from '@/lib/networks';

interface Transfer {
  tokenSymbol: string;
  tokenName: string;
  amount: string;
  senderAddress: string;
  receiverAddress: string;
  timestamp: string;
  network: string;
}

const StablecoinTransfersTab = () => {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { toast } = useToast();

  const fetchAllNetworkTransfers = async () => {
    setIsLoadingTransfers(true);
    const allTransfers: Transfer[] = [];
    
    try {
      console.log('🔍 Fetching stablecoin transfers from all networks...');
      
      // Get all supported networks (excluding XRP as it uses different format)
      const networks = Object.keys(SUPPORTED_NETWORKS).filter(net => net !== 'xrp');
      
      const transferPromises = networks.map(async (networkKey) => {
        try {
          const network = SUPPORTED_NETWORKS[networkKey];
          const { data, error } = await supabase.functions.invoke('fetch-stablecoin-transfers', {
            body: { network: network.bitqueryId }
          });
          
          if (error) {
            console.error(`Error fetching transfers for ${network.name}:`, error);
            return [];
          }
          
          const networkTransfers = Array.isArray(data?.transfers) ? data.transfers : [];
          return networkTransfers.map((transfer: any) => ({
            ...transfer,
            network: networkKey // Use the frontend network key
          }));
          
        } catch (error) {
          console.error(`Failed to fetch transfers for ${networkKey}:`, error);
          return [];
        }
      });

      const results = await Promise.all(transferPromises);
      const combinedTransfers = results.flat();
      
      // Sort by timestamp (most recent first) and limit to 100
      const sortedTransfers = combinedTransfers
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 100);
      
      allTransfers.push(...sortedTransfers);
      setTransfers(allTransfers);
      setLastUpdate(new Date());
      
      console.log(`✅ Fetched ${allTransfers.length} transfers from ${networks.length} networks`);
      
    } catch (error) {
      console.error('Error fetching transfers from all networks:', error);
      toast({
        title: "Error",
        description: "Failed to fetch stablecoin transfers from networks",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTransfers(false);
    }
  };

  // Auto-fetch on mount and every 15 seconds
  useEffect(() => {
    fetchAllNetworkTransfers();
    
    const interval = setInterval(() => {
      fetchAllNetworkTransfers();
    }, 15000); // 15 seconds

    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recent Stablecoin Transfers
            </div>
            <div className="flex items-center gap-4">
              {lastUpdate && (
                <div className="text-sm text-muted-foreground">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
              <Button 
                onClick={fetchAllNetworkTransfers}
                disabled={isLoadingTransfers}
                size="sm"
                variant="outline"
              >
                {isLoadingTransfers ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Live tracking of stablecoin transfers across all supported blockchains (auto-updates every 15 seconds)
          </CardDescription>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer, index) => (
                  <TableRow key={`${transfer.network}-${index}`}>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {SUPPORTED_NETWORKS[transfer.network]?.name || transfer.network}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{transfer.tokenSymbol}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {parseFloat(transfer.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <AddressDisplay address={transfer.senderAddress} />
                    </TableCell>
                    <TableCell>
                      <AddressDisplay address={transfer.receiverAddress} />
                    </TableCell>
                    <TableCell>
                      {formatTimestamp(transfer.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
                {transfers.length === 0 && !isLoadingTransfers && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No transfers found across all networks. Transfers will auto-refresh every 15 seconds.
                    </TableCell>
                  </TableRow>
                )}
                {isLoadingTransfers && transfers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-muted-foreground">Fetching transfers from all networks...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StablecoinTransfersTab;
