
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface WalletData {
  address: string;
  name?: string;
}

interface AddWalletFormProps {
  onAddWallet: (walletData: WalletData) => Promise<void>;
}

const AddWalletForm: React.FC<AddWalletFormProps> = ({ onAddWallet }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    address: '',
    name: ''
  });
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const validateAddress = (address: string) => {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateAddress(formData.address)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid wallet address format (0x...)",
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);

    try {
      await onAddWallet({
        address: formData.address.toLowerCase(),
        name: formData.name || undefined
      });

      // Reset form
      setFormData({ address: '', name: '' });
      setIsOpen(false);
      
      toast({
        title: "Wallet Added",
        description: "Wallet has been added to tracking list",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to add wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleCancel = () => {
    setFormData({ address: '', name: '' });
    setIsOpen(false);
  };

  return (
    <div className="space-y-4">
      {!isOpen ? (
        <Button onClick={() => setIsOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Wallet
        </Button>
      ) : (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Wallet Address *</Label>
                <Input
                  id="address"
                  type="text"
                  placeholder="0x..."
                  value={formData.address}
                  onChange={(e) => setFormData({
                    ...formData, 
                    address: e.target.value
                  })}
                  required
                  className="font-mono"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name">Wallet Name (Optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="My Wallet"
                  value={formData.name}
                  onChange={(e) => setFormData({
                    ...formData, 
                    name: e.target.value
                  })}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={isValidating}
                  className="flex-1"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    'Add Wallet'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AddWalletForm;
