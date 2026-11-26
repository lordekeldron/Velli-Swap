import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, ShieldCheck } from "lucide-react";
import type {
  PaymentIntent,
  PaymentIntentStatus,
  SettlementMode,
  SupportedChainId,
  WebhookDeliveryLog,
} from "../shared/protocolTypes";

const STATUS_FILTERS: Array<{ id: "all" | PaymentIntentStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Pending" },
  { id: "underpaid", label: "Underpaid" },
  { id: "overpaid", label: "Overpaid" },
  { id: "expired", label: "Expired" },
];

export function PaymentGatewayView() {
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookDeliveryLog[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentIntentStatus>("all");

  // Form inputs
  const [amountExpected, setAmountExpected] = useState("250.00");
  const [tokenSymbol, setTokenSymbol] = useState<"USDC" | "ETH" | "ARB" | "WBTC">("USDC");
  const [recipientAddress, setRecipientAddress] = useState(
    "st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2"
  );
  const [settlementMode, setSettlementMode] = useState<SettlementMode>("stealth");
  const [chainId, setChainId] = useState<SupportedChainId>(421614);
  const [idempotencyKey, setIdempotencyKey] = useState(`ord_${Date.now().toString().slice(-6)}`);
  const [customReceivedAmount, setCustomReceivedAmount] = useState("250.00");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [hmacVerifyResult, setHmacVerifyResult] = useState<string | null>(null);

  const loadGatewayData = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/intents");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load gateway intents");
      const loadedIntents = data.intents as PaymentIntent[];
      setIntents(loadedIntents);
      setWebhooks(data.webhooks as WebhookDeliveryLog[]);
      if (!selectedIntentId && loadedIntents.length > 0) {
        setSelectedIntentId(loadedIntents[0].id);
        setCustomReceivedAmount(loadedIntents[0].amountExpected);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load gateway.");
    }
  }, [selectedIntentId]);

  useEffect(() => {
    loadGatewayData();
  }, [loadGatewayData]);

  const handleCreateIntent = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await fetch("/api/gateway/intents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          amountExpected,
          tokenSymbol,
          recipientAddress,
          settlementMode,
          chainId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create intent");
      const created = data.intent as PaymentIntent;
      setSelectedIntentId(created.id);
      setCustomReceivedAmount(created.amountExpected);
      setFeedbackMsg(
        data.idempotentReplay
          ? `Idempotent replay matched existing intent ${created.id}.`
          : `Created intent ${created.id} (${created.settlementMode} settlement).`
      );
      setIdempotencyKey(`ord_${Math.random().toString(36).slice(2, 8)}`);
      await loadGatewayData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create payment intent.");
    }
  };

  const handleReconcile = async (
    intent: PaymentIntent,
    override?: { receivedAmount: string; confirmations?: number; forceExpire?: boolean; forceFail?: boolean }
  ) => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/gateway/intents/${intent.id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          override ?? {
            receivedAmount: customReceivedAmount,
            confirmations: 2,
          }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reconciliation failed");
      setFeedbackMsg(
        `Intent ${intent.id} transitioned to "${data.intent.status}" and dispatched signed HMAC webhook.`
      );
      await loadGatewayData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Reconciliation error.");
    }
  };

  const handleVerifyWebhook = async (log: WebhookDeliveryLog) => {
    try {
      const res = await fetch("/api/gateway/webhooks/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawBody: log.payloadJson,
          signatureHeader: log.signatureHeader,
          timestamp: log.timestamp,
        }),
      });
      const data = await res.json();
      setHmacVerifyResult(
        data.valid
          ? `Signature ${log.id} verified via timingSafeEqual HMAC-SHA256.`
          : `Signature ${log.id} failed verification.`
      );
    } catch {
      setHmacVerifyResult("Failed to verify signature.");
    }
  };

  const selectedIntent = intents.find((i) => i.id === selectedIntentId) ?? intents[0] ?? null;
  const filteredIntents =
    statusFilter === "all" ? intents : intents.filter((i) => i.status === statusFilter);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
            03. Crypto Payment Gateway &amp; Reconciliation
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Idempotent payment intents, stealth or smart-account settlement, edge-case reconciliation, and HMAC-SHA256 webhooks.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMsg}
        </div>
      )}
      {feedbackMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {feedbackMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Create Payment Intent Form */}
        <form
          onSubmit={handleCreateIntent}
          className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-100">
            Create Payment Intent
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gw-amount" className="block text-xs font-medium text-slate-300">
                Expected Amount
              </label>
              <input
                id="gw-amount"
                type="text"
                required
                value={amountExpected}
                onChange={(e) => setAmountExpected(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="gw-token" className="block text-xs font-medium text-slate-300">
                Asset
              </label>
              <select
                id="gw-token"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value as "USDC" | "ETH" | "ARB" | "WBTC")}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="USDC">USDC</option>
                <option value="ETH">ETH</option>
                <option value="ARB">ARB</option>
                <option value="WBTC">WBTC</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gw-mode" className="block text-xs font-medium text-slate-300">
                Settlement Mode
              </label>
              <select
                id="gw-mode"
                value={settlementMode}
                onChange={(e) => setSettlementMode(e.target.value as SettlementMode)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="stealth">EIP-5564 Stealth</option>
                <option value="smart_account">ERC-7579 Smart Account</option>
                <option value="direct">Direct Address</option>
              </select>
            </div>
            <div>
              <label htmlFor="gw-chain" className="block text-xs font-medium text-slate-300">
                Network
              </label>
              <select
                id="gw-chain"
                value={chainId}
                onChange={(e) => setChainId(Number(e.target.value) as SupportedChainId)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value={421614}>Arbitrum Sepolia (421614)</option>
                <option value={42161}>Arbitrum One (42161)</option>
                <option value={31337}>Anvil Local (31337)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="gw-recipient" className="block text-xs font-medium text-slate-300">
              Merchant Meta-Address or Treasury
            </label>
            <input
              id="gw-recipient"
              type="text"
              required
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="gw-idem" className="block text-xs font-medium text-slate-300">
              Idempotency-Key Header
            </label>
            <input
              id="gw-idem"
              type="text"
              required
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" /> Create Payment Intent
          </button>
        </form>

        {/* Live Checkout & Edge-Case Reconciliation Simulator */}
        <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Checkout &amp; Reconciliation Inspector
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Simulate on-chain confirmations, underpayments, overpayments, and expiration.
              </p>
            </div>
            {selectedIntent && (
              <span className="font-mono text-xs text-slate-300">{selectedIntent.id}</span>
            )}
          </div>

          {selectedIntent ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-800 bg-[#090D16] p-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-slate-400">Status</div>
                  <div
                    data-testid="selected-intent-status"
                    className={`mt-1 text-sm font-semibold capitalize ${
                      selectedIntent.status === "paid"
                        ? "text-emerald-400"
                        : selectedIntent.status === "underpaid" || selectedIntent.status === "overpaid"
                          ? "text-amber-400"
                          : selectedIntent.status === "expired" || selectedIntent.status === "failed"
                            ? "text-red-400"
                            : "text-slate-200"
                    }`}
                  >
                    {selectedIntent.status}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Expected / Received</div>
                  <div className="mt-1 font-mono text-xs text-slate-100 tabular-nums whitespace-nowrap">
                    {selectedIntent.amountExpected} / {selectedIntent.amountReceived} {selectedIntent.tokenSymbol}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Delta</div>
                  <div className="mt-1 font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
                    {selectedIntent.deltaAmount} {selectedIntent.tokenSymbol}
                  </div>
                </div>
                <div className="sm:col-span-3 border-t border-slate-800 pt-3">
                  <div className="text-xs text-slate-400">
                    Derived Settlement Address ({selectedIntent.settlementMode})
                  </div>
                  <div className="mt-1 font-mono text-xs text-emerald-300 break-all">
                    {selectedIntent.settlementAddress}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[160px]">
                  <label htmlFor="sim-received" className="block text-xs text-slate-400">
                    Custom Received Amount ({selectedIntent.tokenSymbol})
                  </label>
                  <input
                    id="sim-received"
                    type="text"
                    value={customReceivedAmount}
                    onChange={(e) => setCustomReceivedAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-xs text-slate-100 tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleReconcile(selectedIntent)}
                  className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                >
                  Reconcile Custom
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleReconcile(selectedIntent, {
                      receivedAmount: selectedIntent.amountExpected,
                      confirmations: 3,
                    })
                  }
                  className="whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Exact Paid
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleReconcile(selectedIntent, {
                      receivedAmount: (Number(selectedIntent.amountExpected) * 0.6).toFixed(2),
                      confirmations: 2,
                    })
                  }
                  className="whitespace-nowrap rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                >
                  Underpaid
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleReconcile(selectedIntent, {
                      receivedAmount: (Number(selectedIntent.amountExpected) * 1.15).toFixed(2),
                      confirmations: 2,
                    })
                  }
                  className="whitespace-nowrap rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
                >
                  Overpaid
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleReconcile(selectedIntent, {
                      receivedAmount: "0",
                      forceExpire: true,
                    })
                  }
                  className="whitespace-nowrap rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
                >
                  Expired
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleReconcile(selectedIntent, {
                      receivedAmount: "0",
                      forceFail: true,
                    })
                  }
                  className="whitespace-nowrap rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
                >
                  Failed
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              Create your first payment intent to inspect checkout reconciliation.
            </div>
          )}
        </section>
      </div>

      {/* Intents Ledger + Filter */}
      <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Payment Intents Ledger
          </h2>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#090D16] p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === f.id
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2 font-medium">Intent</th>
                <th className="pb-2 font-medium">Mode</th>
                <th className="pb-2 font-medium">Settlement Address</th>
                <th className="pb-2 text-right font-medium">Expected</th>
                <th className="pb-2 text-right font-medium">Received</th>
                <th className="pb-2 text-right font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredIntents.map((intent) => (
                <tr key={intent.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 font-mono text-slate-200">{intent.id}</td>
                  <td className="py-2.5 text-slate-300">{intent.settlementMode}</td>
                  <td className="py-2.5 font-mono text-slate-400 tabular-nums">
                    {intent.settlementAddress.slice(0, 10)}...{intent.settlementAddress.slice(-6)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-200 tabular-nums">
                    {intent.amountExpected} {intent.tokenSymbol}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-200 tabular-nums">
                    {intent.amountReceived} {intent.tokenSymbol}
                  </td>
                  <td className="py-2.5 text-right font-medium capitalize text-slate-200">
                    {intent.status}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIntentId(intent.id);
                        setCustomReceivedAmount(intent.amountExpected);
                      }}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Signed HMAC Webhook Delivery Log */}
      <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Idempotent HMAC-SHA256 Webhook Log
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Signed via <code className="text-slate-300">X-VeilSwap-Signature: t=...,v1=...</code> using server-side secret.
            </p>
          </div>
          {hmacVerifyResult && (
            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> {hmacVerifyResult}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#090D16] p-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium text-slate-200">
                  <span>{wh.event}</span>
                  <span className="text-slate-500">·</span>
                  <span className="font-mono text-slate-400">{wh.intentId}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-slate-400">
                  {wh.signatureHeader}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleVerifyWebhook(wh)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Verify HMAC
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
