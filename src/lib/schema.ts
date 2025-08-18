
// Basic schema definitions for Bitquery GraphQL operations
// This is a placeholder for the generated schema from graphql-codegen

export const RecentStablecoinTransfersDocument = `
  query RecentStablecoinTransfers($limit: Int!, $network: String!) {
    EVM(dataset: combined, network: $network) {
      Transfers(
        limit: { count: $limit }
        orderBy: { descending: Block_Time }
        where: {
          Transfer: {
            Currency: {
              SmartContract: {
                is: "0xA0b86a33E6417BEA375C8bB0F14E5EcC38b3EB5b"
              }
            }
          }
        }
      ) {
        Transfer {
          Amount
          Sender
          Receiver
          Currency {
            Symbol
            Name
          }
        }
        Block {
          Time
        }
        Transaction {
          Hash
        }
      }
    }
  }
`;

export const AnalyzeWalletDocument = `
  query AnalyzeWallet($address: String!, $network: String!) {
    EVM(dataset: combined, network: $network) {
      Transactions(
        where: {
          Transaction: {
            From: { is: $address }
          }
        }
        limit: { count: 100 }
        orderBy: { descending: Block_Time }
      ) {
        Transaction {
          Hash
          From
          To
          Value
        }
        Block {
          Time
        }
      }
    }
  }
`;

export type RecentStablecoinTransfersQuery = {
  EVM?: {
    Transfers?: Array<{
      Transfer?: {
        Amount?: string;
        Sender?: string;
        Receiver?: string;
        Currency?: {
          Symbol?: string;
          Name?: string;
        };
      };
      Block?: {
        Time?: string;
      };
      Transaction?: {
        Hash?: string;
      };
    }>;
  };
};

export type RecentStablecoinTransfersQueryVariables = {
  limit: number;
  network: string;
};

export type AnalyzeWalletQuery = {
  EVM?: {
    Transactions?: Array<{
      Transaction?: {
        Hash?: string;
        From?: string;
        To?: string;
        Value?: string;
      };
      Block?: {
        Time?: string;
      };
    }>;
  };
};

export type AnalyzeWalletQueryVariables = {
  address: string;
  network: string;
};
