
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, AlertTriangle, TrendingUp, Radio, Wallet, History } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import RealTimeMonitor from "@/components/RealTimeMonitor";
import StablecoinTransfersTab from "@/components/StablecoinTransfersTab";
import BalanceTracker from "@/components/balance-tracker/BalanceTracker";
import HistoryCheck from "@/components/HistoryCheck";
import AddressDisplay from "@/components/AddressDisplay";
import NetworkSelector from "@/components/NetworkSelector";
import { SUPPORTED_NETWORKS } from '@/lib/networks';

interface Transaction {
  hash: string;
  timestamp: Date;
  value: string;
  from: string;
  to: string;
  isError: boolean;
}

interface TokenTransfer {
  hash: string;
  tokenName: string;
  tokenSymbol: string;
  value: string;
  from: string;
  to: string;
  timeStamp: string;
}

interface InternalTransaction {
  hash: string;
  value: string;
  from: string;
  to: string;
  timeStamp: string;
  isError: string;
}

interface RiskAnalysis {
  totalTransactions: number;
  failedTransactions: number;
  failedTransactionRatio: number;
  walletAgeDays: number;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

const Index = () => {
  const [network, setNetwork] = useState("ethereum");
  const [walletAddress, setWalletAddress] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tokenTransfers, setTokenTransfers] = useState<TokenTransfer[]>([]);
  const [internalTransactions, setInternalTransactions] = useState<InternalTransaction[]>([]);
  const [walletBalance, setWalletBalance] = useState<string>("");
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [isAnalyzingWallet, setIsAnalyzingWallet] = useState(false);
  const { toast } = useToast();

  const analyzeWallet = async () => {
    if (!walletAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter a wallet address",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzingWallet(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-wallet', {
        body: { walletAddress: walletAddress.trim(), network }
      });
      
      if (error) throw error;
      
      setTransactions(data.transactions || []);
      setTokenTransfers(data.tokenTransfers || []);
      setInternalTransactions(data.internalTransactions || []);
      setWalletBalance(data.balance || "0");
      setRiskAnalysis(data.riskAnalysis);
      toast({
        title: "Analysis Complete",
        description: `Analyzed ${data.transactions?.length || 0} transactions, ${data.tokenTransfers?.length || 0} token transfers on ${SUPPORTED_NETWORKS[network]?.name || network}`,
      });
    } catch (error) {
      console.error('Error analyzing wallet:', error);
      toast({
        title: "Error",
        description: `Failed to analyze wallet on ${SUPPORTED_NETWORKS[network]?.name || network}`,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingWallet(false);
    }
  };

  const getRiskBadgeVariant = (level: string) => {
    switch (level) {
      case 'LOW': return 'default';
      case 'MEDIUM': return 'secondary';
      case 'HIGH': return 'destructive';
      default: return 'outline';
    }
  };

  const formatTimestamp = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleString();
  };

  const getNativeSymbol = () => {
    return SUPPORTED_NETWORKS[network]?.nativeCurrency.symbol || 'TOKEN';
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Stablecoin AML Tracker
            </h1>
            <p className="text-muted-foreground text-lg">
              Track stablecoin transfers and analyze wallet risk in real-time across multiple blockchains
            </p>
          </header>

          <Tabs defaultValue="transfers" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="transfers" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Stablecoin Transfers
              </TabsTrigger>
              <TabsTrigger value="wallet" className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Wallet Analysis
              </TabsTrigger>
              <TabsTrigger value="monitor" className="flex items-center gap-2">
                <Radio className="w-4 h-4" />
                Real-Time Monitor
              </TabsTrigger>
              <TabsTrigger value="balances" className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Balance Tracker
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="w-4 h-4" />
                History Check
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transfers" className="space-y-6">
              <StablecoinTransfersTab />
            </TabsContent>

            <TabsContent value="wallet" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Wallet Risk Analysis</CardTitle>
                  <CardDescription>
                    Analyze wallets for AML compliance and risk factors across multiple blockchains
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

                  <Button 
                    onClick={analyzeWallet}
                    disabled={isAnalyzingWallet}
                    className="w-full"
                  >
                    {isAnalyzingWallet ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing on {SUPPORTED_NETWORKS[network]?.name}...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4 mr-2" />
                        Analyze Wallet
                      </>
                    )}
                  </Button>

                  {riskAnalysis && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Risk Level</span>
                          </div>
                          <Badge 
                            variant={getRiskBadgeVariant(riskAnalysis.riskLevel)}
                            className="mt-2"
                          >
                            {riskAnalysis.riskLevel} ({riskAnalysis.riskScore}/10)
                          </Badge>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">{getNativeSymbol()} Balance</div>
                          <div className="text-2xl font-bold">
                            {parseFloat(walletBalance).toFixed(4)} {getNativeSymbol()}
                          </div>
                          <div className="text-xs text-muted-foreground">{SUPPORTED_NETWORKS[network]?.name}</div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Wallet Age</div>
                          <div className="text-2xl font-bold">
                            {riskAnalysis.walletAgeDays} days
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Total Transactions</div>
                          <div className="text-2xl font-bold">
                            {riskAnalysis.totalTransactions.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Failed TX Ratio</div>
                          <div className="text-2xl font-bold">
                            {(riskAnalysis.failedTransactionRatio * 100).toFixed(1)}%
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div className="space-y-6">
                    {transactions.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Recent Transactions (Last 100) - {SUPPORTED_NETWORKS[network]?.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="max-h-96 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Hash</TableHead>
                                  <TableHead>Value ({getNativeSymbol()})</TableHead>
                                  <TableHead>From</TableHead>
                                  <TableHead>To</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Timestamp</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {transactions.map((tx) => (
                                  <TableRow key={tx.hash}>
                                    <TableCell>
                                      <AddressDisplay address={tx.hash} />
                                    </TableCell>
                                    <TableCell className="font-mono">
                                      {parseFloat(tx.value).toFixed(6)}
                                    </TableCell>
                                    <TableCell>
                                      <AddressDisplay address={tx.from} />
                                    </TableCell>
                                    <TableCell>
                                      <AddressDisplay address={tx.to} />
                                    </TableCell>
                                    <TableCell>
                                      {tx.isError ? (
                                        <Badge variant="destructive">
                                          <AlertTriangle className="w-3 h-3 mr-1" />
                                          Failed
                                        </Badge>
                                      ) : (
                                        <Badge variant="default">Success</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {formatTimestamp(tx.timestamp)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {tokenTransfers.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Token Transfers - {SUPPORTED_NETWORKS[network]?.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Token</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead>To</TableHead>
                                <TableHead>Timestamp</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tokenTransfers.map((transfer, index) => (
                                <TableRow key={`${transfer.hash}-${index}`}>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {transfer.tokenSymbol || 'Unknown'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {parseFloat(transfer.value).toLocaleString()}
                                  </TableCell>
                                  <TableCell>
                                    <AddressDisplay address={transfer.from} />
                                  </TableCell>
                                  <TableCell>
                                    <AddressDisplay address={transfer.to} />
                                  </TableCell>
                                  <TableCell>
                                    {formatTimestamp(transfer.timeStamp)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}

                    {internalTransactions.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Internal Transactions - {SUPPORTED_NETWORKS[network]?.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Hash</TableHead>
                                <TableHead>Value ({getNativeSymbol()})</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead>To</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {internalTransactions.map((tx, index) => (
                                <TableRow key={`${tx.hash}-${index}`}>
                                  <TableCell>
                                    <AddressDisplay address={tx.hash} />
                                  </TableCell>
                                  <TableCell className="font-mono">
                                    {(parseFloat(tx.value) / 1e18).toFixed(6)}
                                  </TableCell>
                                  <TableCell>
                                    <AddressDisplay address={tx.from} />
                                  </TableCell>
                                  <TableCell>
                                    <AddressDisplay address={tx.to} />
                                  </TableCell>
                                  <TableCell>
                                    {tx.isError === '1' ? (
                                      <Badge variant="destructive">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Failed
                                      </Badge>
                                    ) : (
                                      <Badge variant="default">Success</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monitor" className="space-y-6">
              <RealTimeMonitor />
            </TabsContent>

            <TabsContent value="balances" className="space-y-6">
              <BalanceTracker />
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <HistoryCheck />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Index;
