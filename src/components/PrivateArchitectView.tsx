import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Lock, Send, Shield } from "lucide-react";
import { MODULARIZATION_PLAN } from "../data/protocolCatalog";

type AuthMode = "loading" | "needs_setup" | "claimed" | "env_configured";
type FocusArea = "architecture_plan" | "infinity_issues" | "security_audit" | "backend_refactor";

const QUICK_PROMPTS: Array<{ label: string; focusArea: FocusArea; prompt: string }> = [
  {
    label: "Triage InfinityCore Hooks & PoI Gas",
    focusArea: "infinity_issues",
    prompt:
      "Analyze InfinityPrivacyHook.sol against PancakeSwap infinity-core Singleton Vault hook gas limits and propose a modularization plan to keep beforeSwap + Noir PoI verification under Arbitrum L2 gas budgets.",
  },
  {
    label: "Audit ERC-7579 Rotation & Paymaster",
    focusArea: "security_audit",
    prompt:
      "Review StealthSignerRotationModule.sol and gatewayEngine.ts for front-running, timelock bypass, or webhook replay vectors. List prioritized hardening checks.",
  },
  {
    label: "Backend Refactor Plan (MVP -> Prod)",
    focusArea: "backend_refactor",
    prompt:
      "Propose a clean modular refactoring roadmap from our current in-memory Express prototype to production Arbitrum One deployment with PostgreSQL/Redis idempotency and Pimlico bundler.",
  },
];

export function PrivateArchitectView() {
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [focusArea, setFocusArea] = useState<FocusArea>("architecture_plan");
  const [prompt, setPrompt] = useState(QUICK_PROMPTS[0].prompt);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/status");
      const data = await res.json();
      setAuthMode(data.mode as AuthMode);
    } catch {
      setAuthMode("needs_setup");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = authMode === "needs_setup" ? "/api/admin/claim" : "/api/admin/login";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      setSessionToken(data.token as string);
      setPasscode("");
      await checkStatus();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed.");
    }
  };

  const handleRunArchitect = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    setSubmitting(true);
    setAgentError(null);
    try {
      const res = await fetch("/api/admin/architect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ prompt, focusArea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Architect request failed");
      setResponseText(data.text as string);
      setModelUsed(data.model as string);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Failed to query Gemini Architect.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
            05. Private Architect Agent (Creator Only)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Restricted internal Gemini architect analyzing <code className="text-slate-300">pancakeswap/infinity-core</code>,{" "}
            <code className="text-slate-300">pancakeswap/pancakeswap-ai</code>, and VeilSwap backend security.
          </p>
        </div>
        {sessionToken && (
          <button
            type="button"
            onClick={() => setSessionToken(null)}
            className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Lock Architect Session
          </button>
        )}
      </div>

      {/* Prioritized Modularization Plan */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {MODULARIZATION_PLAN.map((item) => (
          <div key={item.phase} className="rounded-xl border border-slate-800 bg-[#0F1624] p-5">
            <div className="text-xs font-medium text-emerald-400">
              {item.phase} · {item.target}
            </div>
            <h2 className="mt-1 font-display text-base font-semibold text-slate-100">
              {item.title}
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              {item.deliverables.map((d) => (
                <li key={d} className="leading-relaxed">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Creator-Only Auth Gate or Live Gemini Console */}
      {!sessionToken ? (
        <section className="mx-auto max-w-lg rounded-xl border border-slate-800 bg-[#0F1624] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-slate-700 bg-[#090D16] p-2.5 text-emerald-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                {authMode === "needs_setup"
                  ? "Claim Creator Architect Passcode"
                  : "Creator Authentication Required"}
              </h2>
              <p className="text-xs text-slate-400">
                {authMode === "needs_setup"
                  ? "First-run setup: set an 8+ character creator passcode (hashed with scrypt on the server)."
                  : "Enter your creator passcode to unlock the private Gemini architect console."}
              </p>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="admin-passcode-input" className="block text-xs font-medium text-slate-300">
                Creator Passcode
              </label>
              <input
                id="admin-passcode-input"
                type="password"
                required
                minLength={8}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Minimum 8 characters"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {authError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              {authMode === "needs_setup" ? "Claim & Unlock Private Agent" : "Unlock Private Agent"}
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-base font-semibold text-slate-100">
                Internal Architecture &amp; Audit Console
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => {
                    setFocusArea(qp.focusArea);
                    setPrompt(qp.prompt);
                  }}
                  className="whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleRunArchitect} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label htmlFor="arch-focus" className="block text-xs font-medium text-slate-300">
                  Analysis Focus
                </label>
                <select
                  id="arch-focus"
                  value={focusArea}
                  onChange={(e) => setFocusArea(e.target.value as FocusArea)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-sm text-slate-100"
                >
                  <option value="architecture_plan">Architecture Plan</option>
                  <option value="infinity_issues">InfinityCore Issues</option>
                  <option value="security_audit">Security Audit</option>
                  <option value="backend_refactor">Backend Refactor</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="arch-prompt" className="block text-xs font-medium text-slate-300">
                  Prompt for Private Architect
                </label>
                <textarea
                  id="arch-prompt"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-[#090D16] px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Analyzing..." : "Ask Private Architect"}
              </button>
            </div>
          </form>

          {agentError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              {agentError}
            </div>
          )}

          {responseText && (
            <div className="rounded-lg border border-slate-800 bg-[#090D16] p-5">
              <div className="mb-2 text-xs text-slate-400">
                Response from server-side Gemini ({modelUsed})
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {responseText}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
