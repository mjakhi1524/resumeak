import { useState, useEffect, useCallback, useRef } from 'react';
import { bitqueryBalanceService } from '@/lib/bitquery-balance';
import { SUPPORTED_NETWORKS } from '@/lib/networks';

interface TokenBalance {
  amount: string;
  currency: {
    symbol?: string;
    name?: string;
    smartContract?: string;
    decimals?: number;
  };
}

interface WalletBalance {
  address: string;
  native: {
    amount: string;
    currency?: any;
  };
  tokens: TokenBalance[];
  lastUpdated: string;
}

interface WalletData {
  id: string;
  address: string;
  name?: string;
  network: string;
}

export const useRealTimeBalance = (wallets: WalletData[], network: string) => {
  const [balances, setBalances] = useState<Record<string, WalletBalance>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const subscriptionRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBalances = useCallback(async () => {
    if (wallets.length === 0) return;

    try {
      console.log('🔍 Fetching balances for wallets:', wallets.map(w => w.address));
      // Use the BitQuery network ID instead of the frontend network ID
      const bitqueryNetworkId = SUPPORTED_NETWORKS[network]?.bitqueryId || 'eth';
      const balanceData = await bitqueryBalanceService.getCurrentBalances(wallets, bitqueryNetworkId);
      setBalances(balanceData);
      setLastUpdate(new Date());
      console.log('✅ Balances updated:', balanceData);
    } catch (error) {
      console.error('❌ Failed to fetch balances:', error);
    }
  }, [wallets, network]);

  const handleBalanceUpdate = useCallback((updateData: any) => {
    console.log('📊 Real-time balance update received:', updateData);
    
    setBalances(prev => ({
      ...prev,
      [updateData.address]: {
        ...prev[updateData.address],
        lastUpdated: new Date().toISOString()
      }
    }));
    
    setLastUpdate(new Date());
  }, []);

  const startTracking = useCallback(async () => {
    if (wallets.length === 0) return;

    try {
      console.log('🚀 Starting balance tracking...');
      
      // Initialize WebSocket connection (currently a placeholder)
      await bitqueryBalanceService.initWebSocket();
      setIsConnected(true);

      // Add balance update listener
      bitqueryBalanceService.addBalanceListener(handleBalanceUpdate);

      // Subscribe to real-time updates (currently a placeholder) - use BitQuery network ID
      const bitqueryNetworkId = SUPPORTED_NETWORKS[network]?.bitqueryId || 'eth';
      subscriptionRef.current = bitqueryBalanceService.subscribeToBalanceUpdates(wallets, bitqueryNetworkId);

      // Fetch initial balances
      await fetchBalances();

      // Set up periodic refresh (every 30 seconds)
      intervalRef.current = setInterval(fetchBalances, 30000);

      console.log('✅ Balance tracking started');
    } catch (error) {
      console.error('❌ Failed to start balance tracking:', error);
      setIsConnected(false);
    }
  }, [wallets, network, fetchBalances, handleBalanceUpdate]);

  const stopTracking = useCallback(() => {
    console.log('🛑 Stopping balance tracking...');
    
    if (subscriptionRef.current) {
      bitqueryBalanceService.unsubscribe(subscriptionRef.current);
      subscriptionRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    bitqueryBalanceService.removeBalanceListener(handleBalanceUpdate);
    setIsConnected(false);
  }, [handleBalanceUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    balances,
    isConnected,
    lastUpdate,
    startTracking,
    stopTracking,
    fetchBalances
  };
};
