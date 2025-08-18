
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WalletData {
  id: string;
  address: string;
  name?: string;
  network: string;
  created_at?: string;
}

export const useWalletStorage = () => {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Generate a proper UUID
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Fetch wallets from localStorage initially, then from Supabase
  const fetchWallets = async () => {
    try {
      // Try to get from localStorage first for immediate loading
      const storedWallets = localStorage.getItem('tracked-wallets');
      if (storedWallets) {
        const parsedWallets = JSON.parse(storedWallets);
        setWallets(parsedWallets);
      }

      // Then fetch from Supabase (if available)
      const { data, error } = await supabase
        .from('tracked_wallets')
        .select('id, address, name, network, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase not available, using localStorage only:', error);
        setLoading(false);
        return;
      }

      if (data) {
        setWallets(data);
        // Sync with localStorage
        localStorage.setItem('tracked-wallets', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const addWallet = async (walletData: Omit<WalletData, 'id' | 'created_at'>) => {
    try {
      // Check if wallet already exists
      const exists = wallets.some(w => 
        w.address.toLowerCase() === walletData.address.toLowerCase() && 
        w.network === walletData.network
      );

      if (exists) {
        toast({
          title: "Wallet Already Exists",
          description: "This wallet is already being tracked on this network",
          variant: "destructive",
        });
        return;
      }

      const newWallet: WalletData = {
        id: generateUUID(),
        ...walletData,
        created_at: new Date().toISOString()
      };

      // Add to local state
      const updatedWallets = [newWallet, ...wallets];
      setWallets(updatedWallets);

      // Save to localStorage
      localStorage.setItem('tracked-wallets', JSON.stringify(updatedWallets));

      // Try to save to Supabase
      try {
        const { error } = await supabase
          .from('tracked_wallets')
          .insert([{
            id: newWallet.id,
            address: newWallet.address,
            name: newWallet.name,
            network: newWallet.network
          }]);

        if (error) {
          console.warn('Failed to save to Supabase, using localStorage only:', error);
        }
      } catch (supabaseError) {
        console.warn('Supabase not available, using localStorage only:', supabaseError);
      }

    } catch (error) {
      console.error('Error adding wallet:', error);
      throw error;
    }
  };

  const removeWallet = async (walletId: string) => {
    try {
      // Remove from local state
      const updatedWallets = wallets.filter(w => w.id !== walletId);
      setWallets(updatedWallets);

      // Update localStorage
      localStorage.setItem('tracked-wallets', JSON.stringify(updatedWallets));

      // Try to remove from Supabase
      try {
        const { error } = await supabase
          .from('tracked_wallets')
          .delete()
          .eq('id', walletId);

        if (error) {
          console.warn('Failed to remove from Supabase, using localStorage only:', error);
        }
      } catch (supabaseError) {
        console.warn('Supabase not available, using localStorage only:', supabaseError);
      }

      toast({
        title: "Wallet Removed",
        description: "Wallet has been removed from tracking",
      });
    } catch (error) {
      console.error('Error removing wallet:', error);
      toast({
        title: "Error",
        description: "Failed to remove wallet",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  return {
    wallets,
    loading,
    addWallet,
    removeWallet,
    refetch: fetchWallets
  };
};
