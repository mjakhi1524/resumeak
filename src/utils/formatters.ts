
export const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const formatBalance = (balance: string | number): string => {
  if (!balance || balance === '0') return '0.00';
  
  const num = typeof balance === 'string' ? parseFloat(balance) : balance;
  
  if (isNaN(num)) return '0.00';
  
  // Handle very small numbers
  if (num < 0.000001 && num > 0) {
    return num.toExponential(2);
  }
  
  // Handle large numbers
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  
  // Handle regular numbers
  if (num >= 1) {
    return num.toFixed(4);
  }
  
  return num.toFixed(6);
};

export const formatCurrency = (amount: string | number, symbol: string = ''): string => {
  const formattedAmount = formatBalance(amount);
  return symbol ? `${formattedAmount} ${symbol}` : formattedAmount;
};

export const formatTimestamp = (timestamp: string | Date): string => {
  return new Date(timestamp).toLocaleString();
};
