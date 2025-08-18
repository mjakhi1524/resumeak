
import React, { useState, useEffect } from 'react';
import { useRealTimeBalance } from '@/hooks/useRealTimeBalance';
import { useWalletStorage } from '@/hooks/useWalletStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wallet, TrendingUp, Radio } from 'lucide-react';
import { SUPPORTED_NETWORKS } from '@/lib/networks';
import WalletBalanceCard from './WalletBalanceCard';
import AddWalletForm from './AddWalletForm';

interface WalletData {
  id: string;
  address: string;
  name?: string;
  network: string;
}

const BalanceTracker = () => {
  const [selectedNetwork, setSelectedNetwork] = useState('ethereum');
  const { 
    wallets, 
    addWallet, 
    removeWallet, 
    loading: storageLoading 
  } = useWalletStorage();
  
  const { 
    balances, 
    isConnected, 
    lastUpdate,
    startTracking,
    stopTracking 
  } = useRealTimeBalance(wallets, selectedNetwork);

  // Start tracking when wallets are loaded
  useEffect(() => {
    if (wallets.length > 0) {
      startTracking();
    }
    return () => stopTracking();
  }, [wallets, selectedNetwork, startTracking, stopTracking]);

  const handleAddWallet = async (walletData: Omit<WalletData, 'id'>) => {
    await addWallet({
      ...walletData,
      network: selectedNetwork
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Real-Time Balance Tracker
              </CardTitle>
              <CardDescription>
                Monitor wallet balances across multiple networks in real-time
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {lastUpdate && (
                <span className="text-xs text-muted-foreground">
                  Last update: {new Date(lastUpdate).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Network:</label>
              <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            <AddWalletForm onAddWallet={handleAddWallet} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {storageLoading ? (
              <div className="col-span-full flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Loading wallets...</span>
              </div>
            ) : wallets.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">No wallets being tracked</p>
                <p className="text-sm text-muted-foreground">
                  Add a wallet address to start monitoring balances
                </p>
              </div>
            ) : (
              wallets.map(wallet => (
                <WalletBalanceCard
                  key={`${wallet.address}-${wallet.network}`}
                  wallet={wallet}
                  balance={balances[wallet.address]}
                  onRemove={() => removeWallet(wallet.id)}
                />
              ))
            )}
          </div>

          <div className="flex items-center gap-6 pt-4 border-t">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tracked Wallets:</span>
              <Badge variant="secondary">{wallets.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Network:</span>
              <Badge variant="outline">
                {SUPPORTED_NETWORKS[selectedNetwork]?.name || selectedNetwork.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Active Balances:</span>
              <Badge variant="secondary">{Object.keys(balances).length}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BalanceTracker;
