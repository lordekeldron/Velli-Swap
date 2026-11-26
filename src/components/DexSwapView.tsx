import { useCallback, useEffect, useState } from "react";
import { ArrowDownUp, Lock, ShieldCheck, Wallet } from "lucide-react";
import { ARBITRUM_TOKENS, CHAIN_CONFIGS } from "../data/protocolCatalog";
import type { SupportedChainId, SwapQuoteResult } from "../shared/protocolTypes";
import type { ConnectedWallet } from "./WalletAggregatorModal";
import { obfuscateIdentifierClient, useVisualObfuscation } from "../utils/visualObfuscation";

interface ExecutedSwapRecord {
  id: string;
  timestamp: string;
  chainName: string;
  pair: string;
  sellAmount: string;
  buyAmount: string;
  route: string;
  txHash: string;
  privacyMode: boolean;
}

interface DexSwapViewProps {
  chainId: SupportedChainId;
  activeWallet: ConnectedWallet | undefined;
  connectedWallets: ConnectedWallet[];
  obfuscationEnabled: boolean;
  onOpenWalletModal: () => void;
}

export function DexSwapView({
  chainId,
  activeWallet,
  connectedWallets,
  obfuscationEnabled,
  onOpenWalletModal,
}: DexSwapViewProps) {
  const [sellSymbol, setSellSymbol] = useState<"ETH" | "USDC" | "ARB" | "WBTC">("ETH");
  const [buySymbol, setBuySymbol] = useState<"ETH" | "USDC" | "ARB" | "WBTC">("USDC");
  const [sellAmount, setSellAmount] = useState("1.5");
  const [usePrivacyHook, setUsePrivacyHook] = useState(true);
  const [quote, setQuote] = useState<SwapQuoteResult | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [swapHistory, setSwapHistory] = useState<ExecutedSwapRecord[]>([
    {
      id: "swp_901",
      timestamp: "2 mins ago",
      chainName: "Arbitrum Sepolia",
      pair: "ETH -> USDC",
      sellAmount: "0.80 ETH",
      buyAmount: "2,732.16 USDC",
      route: "InfinityPrivacyHook (PoI + EIP-5564)",
      txHash: "0x8b4d92e0a11f4c8d77a9e013f44b2c1a9930e8a1",
      privacyMode: true,
    },
  ]);

  const tick = useVisualObfuscation(obfuscationEnabled);
  const activeChain = CHAIN_CONFIGS.find((c) => c.chainId === chainId) ?? CHAIN_CONFIGS[1];

  const fetchQuote = useCallback(async () => {
    const parsed = Number(sellAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setQuote(null);
      setQuoteError("Enter a positive sell amount.");
      return;
    }
    if (sellSymbol === buySymbol) {
      setQuote(null);
      setQuoteError("Select two different tokens.");
      return;
    }

    setLoadingQuote(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          sellSymbol,
          buySymbol,
          sellAmountHuman: sellAmount,
          taker: activeWallet?.address ?? "0x5aFe009911223344556677889900aAbBcCdDeEfF",
          usePrivacyHook,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Quote failed");
      }
      setQuote(data as SwapQuoteResult);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Failed to load quote.");
    } finally {
      setLoadingQuote(false);
    }
  }, [chainId, sellSymbol, buySymbol, sellAmount, activeWallet?.address, usePrivacyHook]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      fetchQuote();
    }, 220);
    return () => window.clearTimeout(handle);
  }, [fetchQuote]);

  const handleFlipTokens = () => {
    setSellSymbol(buySymbol);
    setBuySymbol(sellSymbol);
  };

  const handleExecuteSwap = () => {
    if (!quote) return;
    const randomHex = Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const record: ExecutedSwapRecord = {
      id: `swp_${Date.now().toString().slice(-4)}`,
      timestamp: "Just now",
      chainName: activeChain.name,
      pair: `${quote.sellToken} -> ${quote.buyToken}`,
      sellAmount: `${quote.sellAmountHuman} ${quote.sellToken}`,
      buyAmount: `${quote.buyAmountFormatted} ${quote.buyToken}`,
      route: quote.hookUsed,
      txHash: `0x${randomHex}`,
      privacyMode: quote.gasSponsoredByPaymaster,
    };
    setSwapHistory((prev) => [record, ...prev]);
  };

  const displayAddress = activeWallet
    ? obfuscationEnabled
      ? obfuscateIdentifierClient(activeWallet.address, tick)
      : activeWallet.address
    : "No wallet connected";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
            01. Swap &amp; Liquidity Router
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Concentrated liquidity powered by InfinityCore Hooks and server-proxied 0x Swap API v2 on {activeChain.name}.
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>Active Taker ({activeWallet?.name ?? "None"})</div>
          <div className="mt-0.5 font-mono text-slate-200 tabular-nums">{displayAddress}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Swap Ticket */}
        <section className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0F1624] p-6">
          <div className="flex items-center justify-between pb-4">
            <h2 className="font-display text-base font-semibold text-slate-100">Swap Order</h2>
            <span className="text-xs text-slate-400">
              {activeChain.name} · Chain {activeChain.chainId}
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-800 bg-[#090D16] p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <label htmlFor="sell-amount-input">You sell</label>
                <span>Aggregated balance available</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="sell-amount-input"
                  type="number"
                  min="0"
                  step="any"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-2xl font-semibold text-slate-100 tabular-nums focus:outline-none"
                  placeholder="0.00"
                />
                <select
                  aria-label="Sell token"
                  value={sellSymbol}
                  onChange={(e) => setSellSymbol(e.target.value as "ETH" | "USDC" | "ARB" | "WBTC")}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  {ARBITRUM_TOKENS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleFlipTokens}
                aria-label="Flip sell and buy tokens"
                className="rounded-lg border border-slate-800 bg-[#0F1624] p-2 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-100"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#090D16] p-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>You receive (estimated)</span>
                <span>{quote ? `1 ${sellSymbol} = ${quote.executionPrice} ${buySymbol}` : "Calculating"}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-full font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
                  {loadingQuote ? "..." : quote ? quote.buyAmountFormatted : "0.00"}
                </div>
                <select
                  aria-label="Buy token"
                  value={buySymbol}
                  onChange={(e) => setBuySymbol(e.target.value as "ETH" | "USDC" | "ARB" | "WBTC")}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  {ARBITRUM_TOKENS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-[#090D16] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Lock className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="text-sm font-medium text-slate-200">
                  InfinityPrivacyHook + Stealth Settlement
                </div>
                <div className="text-xs text-slate-400">
                  Verifies Noir Proof of Innocence &amp; sponsors gas via Pimlico
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              aria-label="Enable InfinityPrivacyHook and Stealth Settlement"
              checked={usePrivacyHook}
              onChange={(e) => setUsePrivacyHook(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </div>

          {quoteError && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {quoteError}
            </div>
          )}

          {quote && (
            <dl className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Route Engine</dt>
                <dd className="font-mono text-slate-200">{quote.hookUsed}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Price Impact</dt>
                <dd className="font-mono text-slate-200 tabular-nums">{quote.priceImpactBps} bps</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Gas Sponsorship</dt>
                <dd className="text-emerald-400">
                  {quote.gasSponsoredByPaymaster ? "Pimlico Paymaster Sponsored" : "Standard EOA Gas"}
                </dd>
              </div>
              <div className="pt-1 text-slate-400">{quote.routeNote}</div>
            </dl>
          )}

          <div className="mt-5 flex gap-3">
            {activeWallet ? (
              <button
                type="button"
                disabled={!quote || loadingQuote}
                onClick={handleExecuteSwap}
                className="w-full whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {usePrivacyHook ? "Execute Private Swap" : "Execute Swap"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenWalletModal}
                className="w-full whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Connect Wallet to Swap
              </button>
            )}
          </div>
        </section>

        {/* Aggregated Liquidity & Execution Ledger */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Aggregated Wallet Portfolio
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {connectedWallets.length} connected wallets across EOAs and ERC-7579 Smart Accounts
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenWalletModal}
                className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Wallet className="h-3.5 w-3.5" /> Manage Wallets
              </button>
            </div>

            {connectedWallets.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No wallets aggregated yet. Connect MetaMask, Coinbase, Binance, or Safe ERC-7579 Vault.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400">
                      <th className="pb-2 font-medium">Wallet</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Address</th>
                      <th className="pb-2 text-right font-medium">ETH</th>
                      <th className="pb-2 text-right font-medium">USDC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {connectedWallets.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 font-medium text-slate-200">{w.name}</td>
                        <td className="py-2.5 text-xs text-slate-400">{w.kind}</td>
                        <td className="py-2.5 font-mono text-xs text-slate-300 tabular-nums">
                          {obfuscationEnabled
                            ? obfuscateIdentifierClient(w.address, tick)
                            : `${w.address.slice(0, 8)}...${w.address.slice(-6)}`}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-200 tabular-nums">
                          {w.balanceEth}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-200 tabular-nums">
                          {w.balanceUsdc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="font-display text-base font-semibold text-slate-100">
                Recent Settlement Ledger
              </h2>
              <span className="text-xs text-slate-400">{swapHistory.length} executions</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="pb-2 font-medium">Pair</th>
                    <th className="pb-2 font-medium">Route</th>
                    <th className="pb-2 text-right font-medium">Sold</th>
                    <th className="pb-2 text-right font-medium">Received</th>
                    <th className="pb-2 text-right font-medium">Privacy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {swapHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5">
                        <div className="font-medium text-slate-200">{item.pair}</div>
                        <div className="text-xs text-slate-400">
                          {item.chainName} · {item.timestamp}
                        </div>
                      </td>
                      <td className="py-2.5 font-mono text-xs text-slate-300">{item.route}</td>
                      <td className="py-2.5 whitespace-nowrap text-right font-mono text-slate-300 tabular-nums">
                        {item.sellAmount}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-right font-mono text-emerald-400 tabular-nums">
                        {item.buyAmount}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-right">
                        {item.privacyMode ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-emerald-400">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Stealth + PoI
                          </span>
                        ) : (
                          <span className="whitespace-nowrap text-xs text-slate-400">Standard</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
