import type { ChainConfig, TokenAsset } from "../shared/protocolTypes";

export const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: 42161,
    name: "Arbitrum One",
    shortName: "ARB",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    isTestnet: false,
    blockExplorer: "https://arbiscan.io",
    zeroXSupported: true,
  },
  {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    shortName: "ARB-SEP",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    isTestnet: true,
    blockExplorer: "https://sepolia.arbiscan.io",
    zeroXSupported: false,
  },
  {
    chainId: 31337,
    name: "Anvil Local",
    shortName: "ANVIL",
    rpcUrl: "http://127.0.0.1:8545",
    isTestnet: true,
    blockExplorer: "http://127.0.0.1:8545",
    zeroXSupported: false,
  },
];

export const ARBITRUM_TOKENS: TokenAsset[] = [
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    referencePriceUsd: 3420,
    addresses: {
      42161: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      421614: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      31337: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    },
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    referencePriceUsd: 1,
    addresses: {
      42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      421614: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      31337: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    },
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    decimals: 18,
    referencePriceUsd: 1.18,
    addresses: {
      42161: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      421614: "0x0000000000000000000000000000000000000001",
      31337: "0x0000000000000000000000000000000000000001",
    },
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    referencePriceUsd: 94200,
    addresses: {
      42161: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      421614: "0x0000000000000000000000000000000000000002",
      31337: "0x0000000000000000000000000000000000000002",
    },
  },
];

export interface WalletConnectorProfile {
  id: "metamask" | "coinbase" | "binance" | "trust" | "walletconnect" | "safe_7579";
  name: string;
  kind: "EOA" | "Smart Account" | "Bridge";
  defaultAddress: `0x${string}`;
  balanceEth: string;
  balanceUsdc: string;
}

export const SUPPORTED_WALLET_CONNECTORS: WalletConnectorProfile[] = [
  {
    id: "metamask",
    name: "MetaMask",
    kind: "EOA",
    defaultAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    balanceEth: "2.48",
    balanceUsdc: "4,820.00",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    kind: "EOA",
    defaultAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    balanceEth: "1.15",
    balanceUsdc: "2,150.00",
  },
  {
    id: "binance",
    name: "Binance Wallet",
    kind: "EOA",
    defaultAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    balanceEth: "0.84",
    balanceUsdc: "6,400.00",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    kind: "EOA",
    defaultAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    balanceEth: "0.42",
    balanceUsdc: "980.00",
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    kind: "Bridge",
    defaultAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    balanceEth: "1.90",
    balanceUsdc: "3,120.00",
  },
  {
    id: "safe_7579",
    name: "Safe ERC-7579 Vault",
    kind: "Smart Account",
    defaultAddress: "0x5aFe009911223344556677889900aAbBcCdDeEfF",
    balanceEth: "5.60",
    balanceUsdc: "18,450.00",
  },
];

export interface ArchitecturePhase {
  phase: string;
  title: string;
  target: string;
  deliverables: string[];
}

export const MODULARIZATION_PLAN: ArchitecturePhase[] = [
  {
    phase: "Phase 01",
    title: "Foundry Core & Local Anvil Sandbox",
    target: "MVP Foundation",
    deliverables: [
      "Deploy InfinityPrivacyHook.sol + PoIRegistry.sol on Anvil (31337) and Arbitrum Sepolia (421614)",
      "Verify StealthSignerRotationModule.sol timelock (>= 1h) and guardian veto invariants in Forge",
      "Connect 0x Swap API v2 AllowanceHolder proxy via server-side ZERO_X_API_KEY",
    ],
  },
  {
    phase: "Phase 02",
    title: "Noir ZK Proof of Innocence & Pimlico Gas Abstraction",
    target: "Privacy Layer",
    deliverables: [
      "Compile circuits/poi/src/main.nr with Nargo and export UltraHonk Solidity verifier",
      "Sponsor stealth address sweeping UserOperations via Pimlico ERC-4337 Paymaster",
      "Enable EIP-5564 / EIP-6538 ephemeral stealth scanning with 1s UI visual obfuscation",
    ],
  },
  {
    phase: "Phase 03",
    title: "Idempotent Payment Gateway, SDK & MCP",
    target: "Merchant & AI Tooling",
    deliverables: [
      "Reconcile pending, confirming, paid, underpaid, overpaid, expired, and failed states",
      "Sign outbound webhooks with HMAC-SHA256 (X-VeilSwap-Signature) and Idempotency-Key",
      "Ship TypeScript VeilPayClient SDK, openapi.yaml, AGENTS.md, and MCP server for Gemini/Claude/Cursor",
    ],
  },
];
