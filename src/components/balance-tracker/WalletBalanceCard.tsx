import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, X, Coins } from 'lucide-react';
import { formatAddress, formatBalance } from '@/utils/formatters';
import AddressDisplay from '@/components/AddressDisplay';
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

interface WalletBalanceCardProps {
  wallet: WalletData;
  balance?: WalletBalance;
  onRemove: () => void;
}

const WalletBalanceCard: React.FC<WalletBalanceCardProps> = ({ 
  wallet, 
  balance, 
  onRemove 
}) => {
  const { address, name, network } = wallet;

  const getNativeTokenSymbol = (network: string) => {
    return SUPPORTED_NETWORKS[network]?.nativeCurrency.symbol || 'ETH';
  };

  const getNetworkColor = (network: string) => {
    switch (network) {
      case 'ethereum': return 'bg-blue-100 text-blue-800';
      case 'polygon': return 'bg-purple-100 text-purple-800';
      case 'avalanche': return 'bg-red-100 text-red-800';
      case 'arbitrum': return 'bg-cyan-100 text-cyan-800';
      case 'xrp': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">
              {name || formatAddress(address)}
            </h4>
            <AddressDisplay address={address} className="text-xs text-muted-foreground" />
            <Badge 
              variant="secondary" 
              className={`text-xs ${getNetworkColor(network)}`}
            >
              {SUPPORTED_NETWORKS[network]?.name || network.toUpperCase()}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {balance ? (
          <div className="space-y-3">
            {/* Native Token Balance */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">
                  {getNativeTokenSymbol(network)}
                </span>
              </div>
              <span className="font-mono text-sm font-semibold">
                {formatBalance(balance.native?.amount || '0')}
              </span>
            </div>

            {/* Token Balances */}
            {balance.tokens && balance.tokens.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tokens
                  </h5>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {balance.tokens.slice(0, 5).map((token, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {token.currency.symbol || 'Unknown'}
                        </span>
                        <span className="font-mono">
                          {formatBalance(token.amount)}
                        </span>
                      </div>
                    ))}
                    {balance.tokens.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{balance.tokens.length - 5} more tokens
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              Updated: {balance.lastUpdated ? 
                new Date(balance.lastUpdated).toLocaleTimeString() : 
                'Never'
              }
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <span className="text-sm text-muted-foreground">Loading balances...</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WalletBalanceCard;
