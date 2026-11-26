import { Check, Plus, Shield, Wallet, X } from "lucide-react";
import { SUPPORTED_WALLET_CONNECTORS, type WalletConnectorProfile } from "../data/protocolCatalog";

export interface ConnectedWallet extends WalletConnectorProfile {
  address: `0x${string}`;
  source: "injected" | "aggregated";
}

interface WalletAggregatorModalProps {
  open: boolean;
  onClose: () => void;
  connectedWallets: ConnectedWallet[];
  activeWalletId: string;
  onToggleWallet: (profile: WalletConnectorProfile) => void;
  onSelectActiveWallet: (id: string) => void;
  onConnectInjectedBrowserWallet: () => Promise<void>;
  browserWalletError: string | null;
}

export function WalletAggregatorModal({
  open,
  onClose,
  connectedWallets,
  activeWalletId,
  onToggleWallet,
  onSelectActiveWallet,
  onConnectInjectedBrowserWallet,
  browserWalletError,
}: WalletAggregatorModalProps) {
  if (!open) return null;

  const connectedIds = new Set(connectedWallets.map((w) => w.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-aggregator-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#0F1624] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 id="wallet-aggregator-title" className="font-display text-lg font-semibold text-slate-100">
              Multi-Wallet Aggregator
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Aggregate EOAs and ERC-7579 Smart Accounts for unified balances, stealth routing, and swap execution.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet aggregator"
            className="rounded-lg border border-slate-800 p-2 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#090D16] px-4 py-3">
          <div className="flex items-center gap-3">
            <Shield className="h-4 w-4 text-emerald-400" />
            <div className="text-sm text-slate-300">
              Detected browser provider (EIP-1193 / Wagmi compatible)
            </div>
          </div>
          <button
            type="button"
            onClick={onConnectInjectedBrowserWallet}
            className="whitespace-nowrap shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            Link Browser Provider
          </button>
        </div>

        {browserWalletError && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {browserWalletError}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUPPORTED_WALLET_CONNECTORS.map((connector) => {
            const isConnected = connectedIds.has(connector.id);
            const isActive = activeWalletId === connector.id;
            const liveWallet = connectedWallets.find((w) => w.id === connector.id);

            return (
              <div
                key={connector.id}
                className={`flex flex-col justify-between rounded-lg border p-4 transition-colors ${
                  isConnected
                    ? "border-emerald-500/40 bg-[#121C2D]"
                    : "border-slate-800 bg-[#0B111D]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-100">{connector.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {connector.kind} · {connector.balanceEth} ETH · {connector.balanceUsdc} USDC
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleWallet(connector)}
                    aria-label={isConnected ? `Disconnect ${connector.name}` : `Connect ${connector.name}`}
                    className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isConnected
                        ? "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                        : "bg-emerald-600 text-white hover:bg-emerald-500"
                    }`}
                  >
                    {isConnected ? "Disconnect" : "Connect"}
                  </button>
                </div>

                {isConnected && liveWallet && (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      {liveWallet.address.slice(0, 8)}...{liveWallet.address.slice(-6)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectActiveWallet(connector.id)}
                      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isActive ? (
                        <>
                          <Check className="h-3 w-3" /> Active Taker
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" /> Set Active
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
          <span>Self-custody invariant: private keys never leave your wallet signer.</span>
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap shrink-0 rounded-lg bg-slate-800 px-4 py-2 font-medium text-slate-100 hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
