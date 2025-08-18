export interface NetworkConfig {
  id: string;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  apiEndpoint: string;
  explorerUrl: string;
  isEVM: boolean;
  // Add BitQuery network identifier for balance queries
  bitqueryId: string;
}

export const SUPPORTED_NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    apiEndpoint: 'https://api.etherscan.io/api',
    explorerUrl: 'https://etherscan.io',
    isEVM: true,
    bitqueryId: 'eth',
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    nativeCurrency: {
      name: 'Polygon',
      symbol: 'MATIC',
      decimals: 18,
    },
    apiEndpoint: 'https://api.polygonscan.com/api',
    explorerUrl: 'https://polygonscan.com',
    isEVM: true,
    bitqueryId: 'polygon',
  },
  avalanche: {
    id: 'avalanche',
    name: 'Avalanche',
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18,
    },
    apiEndpoint: 'https://api.snowtrace.io/api',
    explorerUrl: 'https://snowtrace.io',
    isEVM: true,
    bitqueryId: 'avalanche',
  },
  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    apiEndpoint: 'https://api.arbiscan.io/api',
    explorerUrl: 'https://arbiscan.io',
    isEVM: true,
    bitqueryId: 'arbitrum',
  },
  xrp: {
    id: 'xrp',
    name: 'XRP Ledger',
    nativeCurrency: {
      name: 'XRP',
      symbol: 'XRP',
      decimals: 6,
    },
    apiEndpoint: 'https://api.xrpscan.com/api/v1',
    explorerUrl: 'https://xrpscan.com',
    isEVM: false,
    bitqueryId: 'xrp',
  },
};

// Network-specific stablecoin contract addresses
export const STABLECOIN_CONTRACTS: Record<string, Record<string, string>> = {
  ethereum: {
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    PYUSD: '0x6c3ea9036406852006290770bedfcaba0e23a0e8',
    USDe: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',
    RLUSD: '0x0000000000000000000000000000000000000000', // Placeholder - need actual address
  },
  polygon: {
    USDC: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  },
  avalanche: {
    USDC: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
    USDT: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  },
  xrp: {
    // XRP uses different token format - will handle separately
  },
};

export const getNetworkConfig = (networkId: string): NetworkConfig | null => {
  return SUPPORTED_NETWORKS[networkId] || null;
};

export const getStablecoinContracts = (networkId: string): string[] => {
  const contracts = STABLECOIN_CONTRACTS[networkId];
  return contracts ? Object.values(contracts).filter(addr => addr !== '0x0000000000000000000000000000000000000000') : [];
};
