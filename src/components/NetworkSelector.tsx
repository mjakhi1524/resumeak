
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_NETWORKS } from '@/lib/networks';

interface NetworkSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({ 
  value, 
  onValueChange, 
  className = "" 
}) => {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select Network" />
      </SelectTrigger>
      <SelectContent>
        {Object.values(SUPPORTED_NETWORKS).map((network) => (
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
  );
};

export default NetworkSelector;
