
import React from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface AddressDisplayProps {
  address: string;
  truncate?: boolean;
  className?: string;
}

const AddressDisplay: React.FC<AddressDisplayProps> = ({ 
  address, 
  truncate = true, 
  className = "" 
}) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const truncateAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Address copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy address",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="font-mono text-sm">
        {truncate ? truncateAddress(address) : address}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={copyToClipboard}
        className="h-6 w-6 p-0 hover:bg-muted"
        title="Copy address"
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-500" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
};

export default AddressDisplay;
