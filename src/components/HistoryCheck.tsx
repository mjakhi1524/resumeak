import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, CalendarIcon, Loader2, ExternalLink, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import AddressDisplay from "@/components/AddressDisplay";
import NetworkSelector from "@/components/NetworkSelector";
import { SUPPORTED_NETWORKS } from '@/lib/networks';

interface Transaction {
  Transaction: {
    Hash: string;
    From: string;
    To: string;
    Value: string;
    Gas: string;
    GasPrice: string;
    Cost: string;
  };
  Block: {
    Number: number;
    Time: string;
    Date: string;
  };
  Fee: {
    SenderFee: string;
  };
  TransactionStatus: {
    Success: boolean;
  };
}

interface Analytics {
  totalTransactions: number;
  sentTransactions: number;
  receivedTransactions: number;
  totalSent: number;
  totalReceived: number;
  totalFees: number;
  netFlow: number;
  avgTransactionValue: number;
}

const HistoryCheck = () => {
  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState("ethereum");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const setPresetRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setStartDate(start);
    setEndDate(end);
  };

  const fetchWalletHistory = async () => {
    if (!walletAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    if (!startDate || !endDate) {
      toast({
        title: "Error", 
        description: "Please select start and end dates",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log(`🔍 Fetching wallet history for: ${walletAddress} on ${network}`);
      console.log('📅 Date range:', { startDate, endDate });

      const { data, error } = await supabase.functions.invoke('wallet-history', {
        body: {
          walletAddress: walletAddress.trim(),
          network,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          limit: 1000
        }
      });

      if (error) throw error;

      const txData = data?.data?.EVM?.Transactions || [];
      console.log(`✅ Fetched transactions from ${network}:`, txData.length);
      
      setTransactions(txData);
      calculateAnalytics(txData, walletAddress.trim());

      toast({
        title: "Success",
        description: `Fetched ${txData.length} transactions from ${SUPPORTED_NETWORKS[network]?.name || network} for analysis`,
      });
    } catch (error) {
      console.error(`❌ Failed to fetch wallet history from ${network}:`, error);
      toast({
        title: "Error",
        description: `Failed to fetch wallet history from ${SUPPORTED_NETWORKS[network]?.name || network}: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAnalytics = (txData: Transaction[], address: string) => {
    if (txData.length === 0) {
      setAnalytics(null);
      return;
    }

    const sent = txData.filter(tx => 
      tx.Transaction.From.toLowerCase() === address.toLowerCase()
    );
    const received = txData.filter(tx => 
      tx.Transaction.To?.toLowerCase() === address.toLowerCase()
    );

    // Convert Wei to native token properly (XRP uses different decimal places)
    const decimals = network === 'xrp' ? 1000000 : 1e18;
    const totalSent = sent.reduce((sum, tx) => 
      sum + parseFloat(tx.Transaction.Value || '0') / decimals, 0
    );
    const totalReceived = received.reduce((sum, tx) => 
      sum + parseFloat(tx.Transaction.Value || '0') / decimals, 0
    );
    const totalFees = sent.reduce((sum, tx) => 
      sum + parseFloat(tx.Fee?.SenderFee || '0') / decimals, 0
    );

    const analyticsData: Analytics = {
      totalTransactions: txData.length,
      sentTransactions: sent.length,
      receivedTransactions: received.length,
      totalSent,
      totalReceived,
      totalFees,
      netFlow: totalReceived - totalSent - totalFees,
      avgTransactionValue: txData.length > 0 ? 
        (totalSent + totalReceived) / txData.length : 0
    };

    setAnalytics(analyticsData);
  };

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatToken = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (typeof value === 'string' && value.length > 10) {
      // Convert from smallest unit to main token
      const decimals = network === 'xrp' ? 1000000 : 1e18;
      return (numValue / decimals).toFixed(6);
    }
    return numValue.toFixed(6);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getExplorerUrl = (hash: string) => {
    const networkConfig = SUPPORTED_NETWORKS[network];
    return networkConfig ? `${networkConfig.explorerUrl}/tx/${hash}` : '#';
  };

  const getNativeSymbol = () => {
    return SUPPORTED_NETWORKS[network]?.nativeCurrency.symbol || 'TOKEN';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Wallet Historical Analysis
          </CardTitle>
          <CardDescription>
            Analyze complete transaction history for any wallet address within a specific time period across multiple blockchains
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Wallet Address</label>
              <Input
                placeholder="Enter wallet address (0x... or XRP address)"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Network</label>
              <NetworkSelector
                value={network}
                onValueChange={setNetwork}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) =>
                      date > new Date() || (endDate && date > endDate)
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) =>
                      date > new Date() || (startDate && date < startDate)
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPresetRange(7)}>
              Last 7 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetRange(30)}>
              Last 30 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetRange(90)}>
              Last 90 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetRange(365)}>
              Last Year
            </Button>
          </div>

          <Button 
            onClick={fetchWalletHistory}
            disabled={isLoading || !walletAddress.trim() || !startDate || !endDate}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing History on {SUPPORTED_NETWORKS[network]?.name}...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                Analyze Wallet History
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
            <CardDescription>
              Transaction analysis for <AddressDisplay address={walletAddress} /> on {SUPPORTED_NETWORKS[network]?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Total Transactions</span>
                  </div>
                  <div className="text-2xl font-bold mt-2">
                    {analytics.totalTransactions.toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">Sent</span>
                  </div>
                  <div className="text-2xl font-bold mt-2">
                    {analytics.sentTransactions.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatToken(analytics.totalSent)} {getNativeSymbol()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Received</span>
                  </div>
                  <div className="text-2xl font-bold mt-2">
                    {analytics.receivedTransactions.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatToken(analytics.totalReceived)} {getNativeSymbol()}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Net Flow</div>
                  <div className={`text-2xl font-bold mt-2 ${analytics.netFlow >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {analytics.netFlow >= 0 ? '+' : ''}{formatToken(analytics.netFlow)} {getNativeSymbol()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Fees: {formatToken(analytics.totalFees)} {getNativeSymbol()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              {transactions.length} transactions found on {SUPPORTED_NETWORKS[network]?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hash</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Value ({getNativeSymbol()})</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <AddressDisplay address={tx.Transaction.Hash} />
                      </TableCell>
                      <TableCell>
                        {formatTimestamp(tx.Block.Time)}
                      </TableCell>
                      <TableCell>
                        <AddressDisplay address={tx.Transaction.From} />
                      </TableCell>
                      <TableCell>
                        <AddressDisplay address={tx.Transaction.To || ''} />
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatToken(parseFloat(tx.Transaction.Value || '0'))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tx.TransactionStatus?.Success ? "default" : "destructive"}>
                          {tx.TransactionStatus?.Success ? 'Success' : 'Failed'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={getExplorerUrl(tx.Transaction.Hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default HistoryCheck;
