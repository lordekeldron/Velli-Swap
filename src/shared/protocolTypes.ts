export type SupportedChainId = 42161 | 421614 | 31337;

export interface ChainConfig {
  chainId: SupportedChainId;
  name: string;
  shortName: string;
  rpcUrl: string;
  isTestnet: boolean;
  blockExplorer: string;
  zeroXSupported: boolean;
}

export interface TokenAsset {
  symbol: "ETH" | "USDC" | "ARB" | "WBTC";
  name: string;
  decimals: number;
  addresses: Record<SupportedChainId, `0x${string}`>;
  referencePriceUsd: number;
}

export interface SwapQuoteResult {
  source: "0x_v2_allowance_holder" | "infinity_core_pool";
  chainId: SupportedChainId;
  sellToken: string;
  buyToken: string;
  sellAmountHuman: string;
  buyAmountHuman: string;
  buyAmountFormatted: string;
  executionPrice: string;
  priceImpactBps: number;
  hookUsed: string;
  gasSponsoredByPaymaster: boolean;
  transaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
  };
  routeNote: string;
}

export interface StealthAddressBundle {
  id: string;
  metaAddress: string;
  ephemeralPubKey: `0x${string}`;
  stealthAddress: `0x${string}`;
  viewTag: `0x${string}`;
  schemeId: number;
  paymasterSponsored: boolean;
  createdAt: string;
}

export type RotationStatus = "idle" | "timelock_pending" | "ready_to_execute" | "executed" | "cancelled";

export interface SmartAccountRotationState {
  smartAccountAddress: `0x${string}`;
  activeSigner: `0x${string}`;
  guardianAddress: `0x${string}`;
  timelockSeconds: number;
  nonce: number;
  status: RotationStatus;
  proposedSigner: `0x${string}` | null;
  guardianApproved: boolean;
  executableAt: string | null;
  lastUpdatedAt: string;
}

export interface PoIProofRecord {
  id: string;
  associationRoot: `0x${string}`;
  nullifier: `0x${string}`;
  recipientCommitment: `0x${string}`;
  proofHex: `0x${string}`;
  verified: boolean;
  circuit: "veilswap_poi_noir_v1";
  verifiedAt: string;
}

export type PaymentIntentStatus =
  | "pending"
  | "confirming"
  | "paid"
  | "underpaid"
  | "overpaid"
  | "expired"
  | "failed";

export type SettlementMode = "stealth" | "smart_account" | "direct";

export interface WebhookDeliveryLog {
  id: string;
  intentId: string;
  event: string;
  idempotencyKey: string;
  signatureHeader: string;
  timestamp: number;
  payloadJson: string;
  verifiedLocally: boolean;
  dispatchedAt: string;
}

export interface PaymentIntent {
  id: string;
  idempotencyKey: string;
  status: PaymentIntentStatus;
  amountExpected: string;
  amountReceived: string;
  deltaAmount: string;
  tokenSymbol: "USDC" | "ETH" | "ARB" | "WBTC";
  chainId: SupportedChainId;
  recipientAddress: string;
  settlementAddress: `0x${string}`;
  settlementMode: SettlementMode;
  confirmations: number;
  txHash: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
