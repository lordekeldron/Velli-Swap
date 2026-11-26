import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import type {
  PoIProofRecord,
  SmartAccountRotationState,
  StealthAddressBundle,
} from "../shared/protocolTypes";
import { obfuscateIdentifierClient, useVisualObfuscation } from "../utils/visualObfuscation";

interface StealthVaultViewProps {
  obfuscationEnabled: boolean;
  onToggleObfuscation: () => void;
}

export function StealthVaultView({
  obfuscationEnabled,
  onToggleObfuscation,
}: StealthVaultViewProps) {
  const [metaAddress, setMetaAddress] = useState(
    "st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2"
  );
  const [paymasterSponsored, setPaymasterSponsored] = useState(true);
  const [stealthHistory, setStealthHistory] = useState<StealthAddressBundle[]>([]);
  const [rotationState, setRotationState] = useState<SmartAccountRotationState | null>(null);
  const [poiRecords, setPoiRecords] = useState<PoIProofRecord[]>([]);
  const [paymasterProvider, setPaymasterProvider] = useState("Pimlico ERC-4337 Sandbox");
  const [newSignerInput, setNewSignerInput] = useState(
    "0x7777888899990000111122223333444455556666"
  );
  const [simulateTimelockElapsed, setSimulateTimelockElapsed] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const tick = useVisualObfuscation(obfuscationEnabled);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/stealth/state");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load stealth state");
      setRotationState(data.rotationState);
      setStealthHistory(data.stealthHistory);
      setPoiRecords(data.poiRecords);
      setPaymasterProvider(data.paymasterProvider);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load vault state.");
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeriveStealth = async () => {
    setBusyAction("derive");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/stealth/derive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaAddress, paymasterSponsored }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Derivation failed");
      setStealthHistory((prev) => [data as StealthAddressBundle, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to derive stealth address.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRotationAction = async (
    endpoint: "initiate" | "approve" | "cancel" | "execute"
  ) => {
    setBusyAction(endpoint);
    setErrorMsg(null);
    try {
      const body =
        endpoint === "initiate"
          ? { newSigner: newSignerInput }
          : endpoint === "execute"
            ? { simulateTimelockElapsed }
            : {};

      const res = await fetch(`/api/stealth/rotation/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Rotation ${endpoint} failed`);
      setRotationState(data as SmartAccountRotationState);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Rotation action failed.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleGeneratePoI = async () => {
    setBusyAction("poi");
    setErrorMsg(null);
    try {
      const target = stealthHistory[0]?.stealthAddress;
      const res = await fetch("/api/zk/poi/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stealthRecipient: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PoI generation failed");
      setPoiRecords((prev) => [data as PoIProofRecord, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate Noir PoI.");
    } finally {
      setBusyAction(null);
    }
  };

  const formatIdent = (val: string) =>
    obfuscationEnabled ? obfuscateIdentifierClient(val, tick) : val;

  const formatCompactIdent = (val: string) => {
    if (obfuscationEnabled) return obfuscateIdentifierClient(val, tick);
    if (val.length > 18) return `${val.slice(0, 10)}...${val.slice(-6)}`;
    return val;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
            02. Autocustody Stealth &amp; ZK Vault
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            EIP-5564 / EIP-6538 ephemeral addresses, ERC-7579 timelocked signer rotation, Pimlico Paymaster, and Noir Proof of Innocence.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleObfuscation}
          className={`inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
            obfuscationEnabled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          {obfuscationEnabled ? (
            <>
              <EyeOff className="h-3.5 w-3.5" /> 1s Visual Obfuscation Active
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Enable 1s Visual Obfuscation
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* EIP-5564 Dynamic Address Generator */}
        <section className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                EIP-5564 Dynamic Stealth Addresses
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Single-use receiving addresses derived client/ephemerally; spending key stays self-custodied.
              </p>
            </div>
            <span className="whitespace-nowrap shrink-0 text-xs text-emerald-400">{paymasterProvider}</span>
          </div>

          <div className="space-y-3">
            <label htmlFor="stealth-meta-input" className="block text-xs font-medium text-slate-300">
              Stealth Meta-Address (EIP-6538 Registry)
            </label>
            <div className="flex gap-2">
              <input
                id="stealth-meta-input"
                type="text"
                value={obfuscationEnabled ? formatIdent(metaAddress) : metaAddress}
                onChange={(e) => {
                  if (!obfuscationEnabled) setMetaAddress(e.target.value);
                }}
                readOnly={obfuscationEnabled}
                className="w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleCopy(metaAddress, "meta")}
                aria-label="Copy real stealth meta-address"
                className="whitespace-nowrap shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                {copiedId === "meta" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            {obfuscationEnabled && (
              <p className="text-xs text-amber-300/90">
                Anti-shoulder-surfing active: displayed glyphs rotate every second while copying preserves the real address.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#090D16] px-4 py-3">
            <div className="text-xs text-slate-300">
              Sponsor stealth sweep gas via Pimlico Paymaster (avoids linking primary gas wallet)
            </div>
            <input
              type="checkbox"
              aria-label="Sponsor stealth sweep gas via Pimlico Paymaster"
              checked={paymasterSponsored}
              onChange={(e) => setPaymasterSponsored(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </div>

          <button
            type="button"
            disabled={busyAction === "derive"}
            onClick={handleDeriveStealth}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Generate Fresh Stealth Address
          </button>

          <div className="border-t border-slate-800 pt-4">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
              <span>Generated Ephemeral Addresses</span>
              <span>{stealthHistory.length} addresses</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {stealthHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div
                      data-testid="stealth-address-display"
                      className="truncate font-mono text-xs font-medium text-slate-100 tabular-nums"
                    >
                      {formatIdent(item.stealthAddress)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      ViewTag {item.viewTag} · Scheme {item.schemeId} ·{" "}
                      {item.paymasterSponsored ? "Paymaster Gas" : "Self-Funded"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(item.stealthAddress, item.id)}
                    aria-label={`Copy stealth address ${item.id}`}
                    className="shrink-0 rounded border border-slate-800 p-1.5 text-slate-400 hover:text-slate-100"
                  >
                    {copiedId === item.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ERC-7579 Smart Account Rotation & Timelock */}
        <section className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                ERC-7579 Signer Rotation &amp; Guardian Timelock
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Rotate compromised signers while preserving Smart Account vault funds, guarded by timelock + veto.
              </p>
            </div>
            {rotationState && (
              <span
                data-testid="rotation-status-label"
                className={`whitespace-nowrap shrink-0 text-xs font-medium ${
                  rotationState.status === "executed"
                    ? "text-emerald-400"
                    : rotationState.status === "timelock_pending" ||
                        rotationState.status === "ready_to_execute"
                      ? "text-amber-400"
                      : rotationState.status === "cancelled"
                        ? "text-red-400"
                        : "text-slate-400"
                }`}
              >
                Status: {rotationState.status.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {rotationState && (
            <dl className="grid grid-cols-1 gap-4 rounded-lg border border-slate-800 bg-[#090D16] p-4 text-xs sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-slate-400">Smart Account Vault</dt>
                <dd
                  title={rotationState.smartAccountAddress}
                  className="mt-0.5 truncate font-mono text-slate-200 tabular-nums"
                >
                  {formatCompactIdent(rotationState.smartAccountAddress)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-400">Active Signer (Nonce {rotationState.nonce})</dt>
                <dd
                  data-testid="active-signer-display"
                  title={rotationState.activeSigner}
                  className="mt-0.5 truncate font-mono text-emerald-400 tabular-nums"
                >
                  {formatCompactIdent(rotationState.activeSigner)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-400">Guardian Address</dt>
                <dd
                  title={rotationState.guardianAddress}
                  className="mt-0.5 truncate font-mono text-slate-300 tabular-nums"
                >
                  {formatCompactIdent(rotationState.guardianAddress)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-400">Enforced Timelock</dt>
                <dd className="mt-0.5 truncate font-mono text-slate-200 tabular-nums">
                  {Math.round(rotationState.timelockSeconds / 3600)}h ({rotationState.timelockSeconds}s)
                </dd>
              </div>
              {rotationState.proposedSigner && (
                <div className="min-w-0 sm:col-span-2 border-t border-slate-800 pt-2">
                  <dt className="text-amber-300">Queued Replacement Signer</dt>
                  <dd className="mt-0.5 truncate font-mono text-slate-100 tabular-nums">
                    {formatCompactIdent(rotationState.proposedSigner)} · Guardian Approved:{" "}
                    {rotationState.guardianApproved ? "Yes" : "Pending"}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="space-y-2">
            <label htmlFor="new-signer-input" className="block text-xs font-medium text-slate-300">
              Proposed New Signer Address
            </label>
            <input
              id="new-signer-input"
              type="text"
              value={newSignerInput}
              onChange={(e) => setNewSignerInput(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 font-mono text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={simulateTimelockElapsed}
                onChange={(e) => setSimulateTimelockElapsed(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              <span>Fast-forward 24h Anvil timelock when executing</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleRotationAction("initiate")}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              <KeyRound className="h-3.5 w-3.5" /> 1. Initiate Rotation
            </button>
            <button
              type="button"
              disabled={busyAction !== null || rotationState?.status !== "timelock_pending"}
              onClick={() => handleRotationAction("approve")}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> 2. Guardian Approve
            </button>
            <button
              type="button"
              disabled={busyAction !== null || rotationState?.status !== "ready_to_execute"}
              onClick={() => handleRotationAction("execute")}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              3. Execute Rotation
            </button>
            <button
              type="button"
              disabled={
                busyAction !== null ||
                (rotationState?.status !== "timelock_pending" &&
                  rotationState?.status !== "ready_to_execute")
              }
              onClick={() => handleRotationAction("cancel")}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Guardian Veto
            </button>
          </div>
        </section>
      </div>

      {/* Noir ZK Proof of Innocence */}
      <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Noir Zero-Knowledge Proof of Innocence (PoI)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Proves association-set eligibility and anti-replay nullifier validity via <code className="text-slate-200">circuits/poi/src/main.nr</code> without exposing transaction history.
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction === "poi"}
            onClick={handleGeneratePoI}
            className="whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Generate &amp; Verify Noir PoI
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2 font-medium">Proof ID</th>
                <th className="pb-2 font-medium">Association Root</th>
                <th className="pb-2 font-medium">Nullifier</th>
                <th className="pb-2 font-medium">UltraHonk Proof</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {poiRecords.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 font-mono text-slate-200">{rec.id}</td>
                  <td className="py-2.5 font-mono text-slate-400 tabular-nums">
                    {rec.associationRoot.slice(0, 12)}...{rec.associationRoot.slice(-6)}
                  </td>
                  <td className="py-2.5 font-mono text-slate-400 tabular-nums">
                    {rec.nullifier.slice(0, 12)}...{rec.nullifier.slice(-6)}
                  </td>
                  <td className="py-2.5 font-mono text-slate-400 tabular-nums">
                    {rec.proofHex.slice(0, 14)}...
                  </td>
                  <td className="py-2.5 text-right font-medium text-emerald-400">
                    {rec.verified ? "Verified On-Chain" : "Pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
