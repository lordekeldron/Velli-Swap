/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { ArrowLeftRight, Code2, CreditCard, Eye, EyeOff, Lock, Shield, Wallet } from "lucide-react";
import {
  CHAIN_CONFIGS,
  SUPPORTED_WALLET_CONNECTORS,
  type WalletConnectorProfile,
} from "./data/protocolCatalog";
import type { SupportedChainId } from "./shared/protocolTypes";
import { DexSwapView } from "./components/DexSwapView";
import { StealthVaultView } from "./components/StealthVaultView";
import { PaymentGatewayView } from "./components/PaymentGatewayView";
import { DevTerminalView } from "./components/DevTerminalView";
import { PrivateArchitectView } from "./components/PrivateArchitectView";
import {
  WalletAggregatorModal,
  type ConnectedWallet,
} from "./components/WalletAggregatorModal";

type WorkspaceTab = "swap" | "vault" | "gateway" | "terminal" | "architect";

const NAV_ITEMS: Array<{ id: WorkspaceTab; shortLabel: string; sidebarLabel: string; icon: typeof ArrowLeftRight }> = [
  { id: "swap", shortLabel: "Swap", sidebarLabel: "01. Swap & Liquidity", icon: ArrowLeftRight },
  { id: "vault", shortLabel: "Stealth Vault", sidebarLabel: "02. Stealth & ZK Vault", icon: Shield },
  { id: "gateway", shortLabel: "Gateway", sidebarLabel: "03. Payment Gateway", icon: CreditCard },
  { id: "terminal", shortLabel: "Dev Terminal", sidebarLabel: "04. Dev Terminal & MCP", icon: Code2 },
  { id: "architect", shortLabel: "Architect", sidebarLabel: "05. Private Architect", icon: Lock },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("swap");
  const [chainId, setChainId] = useState<SupportedChainId>(421614);
  const [obfuscationEnabled, setObfuscationEnabled] = useState<boolean>(false);
  const [walletModalOpen, setWalletModalOpen] = useState<boolean>(false);
  const [browserWalletError, setBrowserWalletError] = useState<string | null>(null);

  const [connectedWallets, setConnectedWallets] = useState<ConnectedWallet[]>([
    {
      ...SUPPORTED_WALLET_CONNECTORS[0],
      address: SUPPORTED_WALLET_CONNECTORS[0].defaultAddress,
      source: "aggregated",
    },
    {
      ...SUPPORTED_WALLET_CONNECTORS[5],
      address: SUPPORTED_WALLET_CONNECTORS[5].defaultAddress,
      source: "aggregated",
    },
  ]);
  const [activeWalletId, setActiveWalletId] = useState<string>("safe_7579");

  const activeWallet =
    connectedWallets.find((w) => w.id === activeWalletId) ?? connectedWallets[0];

  const handleToggleWallet = (profile: WalletConnectorProfile) => {
    setConnectedWallets((prev) => {
      const exists = prev.some((w) => w.id === profile.id);
      if (exists) {
        const next = prev.filter((w) => w.id !== profile.id);
        if (activeWalletId === profile.id && next.length > 0) {
          setActiveWalletId(next[0].id);
        }
        return next;
      }
      const added: ConnectedWallet = {
        ...profile,
        address: profile.defaultAddress,
        source: "aggregated",
      };
      if (prev.length === 0) {
        setActiveWalletId(added.id);
      }
      return [...prev, added];
    });
  };

  const handleConnectInjectedBrowserWallet = async () => {
    setBrowserWalletError(null);
    const ethProvider = (window as unknown as {
      ethereum?: { request: (args: { method: string }) => Promise<string[]> };
    }).ethereum;

    if (!ethProvider) {
      setBrowserWalletError(
        "No EIP-1193 browser extension detected in this preview frame. Use the multi-wallet connectors below."
      );
      return;
    }

    try {
      const accounts = await ethProvider.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        setBrowserWalletError("No account returned by browser wallet.");
        return;
      }
      const addr = accounts[0] as `0x${string}`;
      setConnectedWallets((prev) => {
        const filtered = prev.filter((w) => w.id !== "metamask");
        return [
          {
            ...SUPPORTED_WALLET_CONNECTORS[0],
            address: addr,
            source: "injected",
          },
          ...filtered,
        ];
      });
      setActiveWalletId("metamask");
    } catch (err) {
      setBrowserWalletError(
        err instanceof Error ? err.message : "Browser wallet connection rejected."
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Header Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b border-slate-800 bg-[#090D16]/95 px-6 py-3.5 backdrop-blur-sm">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("swap");
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          VeilSwap Protocol
        </a>

        <nav aria-label="Primary sections" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 border-b-2 pb-1 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-emerald-500 text-slate-100"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setWalletModalOpen(true)}
            className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            <Wallet className="h-3.5 w-3.5" />
            {connectedWallets.length > 0
              ? `${connectedWallets.length} Wallets Connected`
              : "Connect Wallet"}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Strip (visible below md) */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto border-b border-slate-800 bg-[#0C121E] px-4 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
              activeTab === item.id
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {item.shortLabel}
          </button>
        ))}
      </div>

      {/* Main Workspace Canvas: Sidebar + Viewport */}
      <div className="flex flex-1">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-slate-800 bg-[#0B101B] p-5">
          <div className="space-y-6">
            <div>
              <label
                htmlFor="network-select"
                className="block text-xs font-medium text-slate-400"
              >
                Execution Network
              </label>
              <select
                id="network-select"
                value={chainId}
                onChange={(e) => setChainId(Number(e.target.value) as SupportedChainId)}
                className="mt-1.5 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-xs font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {CHAIN_CONFIGS.map((chain) => (
                  <option key={chain.chainId} value={chain.chainId}>
                    {chain.name} ({chain.chainId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <div className="px-2 pb-1 text-xs font-medium text-slate-400">
                Workspace Modules
              </div>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.sidebarLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={() => setObfuscationEnabled((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-xs text-slate-300 hover:border-slate-700"
            >
              <span className="inline-flex items-center gap-2">
                {obfuscationEnabled ? (
                  <EyeOff className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                )}
                1s UI Obfuscation
              </span>
              <span className={obfuscationEnabled ? "text-emerald-400" : "text-slate-400"}>
                {obfuscationEnabled ? "On" : "Off"}
              </span>
            </button>
            <div className="text-[11px] leading-relaxed text-slate-400">
              Non-custodial architecture. API secrets remain strictly server-side.
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-x-hidden p-6 lg:p-10">
          <div className="mx-auto max-w-6xl">
            {activeTab === "swap" && (
              <DexSwapView
                chainId={chainId}
                activeWallet={activeWallet}
                connectedWallets={connectedWallets}
                obfuscationEnabled={obfuscationEnabled}
                onOpenWalletModal={() => setWalletModalOpen(true)}
              />
            )}
            {activeTab === "vault" && (
              <StealthVaultView
                obfuscationEnabled={obfuscationEnabled}
                onToggleObfuscation={() => setObfuscationEnabled((v) => !v)}
              />
            )}
            {activeTab === "gateway" && <PaymentGatewayView />}
            {activeTab === "terminal" && <DevTerminalView />}
            {activeTab === "architect" && <PrivateArchitectView />}
          </div>
        </main>
      </div>

      <WalletAggregatorModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        connectedWallets={connectedWallets}
        activeWalletId={activeWalletId}
        onToggleWallet={handleToggleWallet}
        onSelectActiveWallet={(id) => setActiveWalletId(id)}
        onConnectInjectedBrowserWallet={handleConnectInjectedBrowserWallet}
        browserWalletError={browserWalletError}
      />
    </div>
  );
}
