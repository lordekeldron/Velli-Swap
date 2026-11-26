import { useEffect, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

interface DevArtifact {
  id: string;
  label: string;
  language: string;
  path: string;
  content: string;
}

const MCP_CLIENTS = {
  gemini: `{
  "mcpServers": {
    "veilswap-gateway": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "env": {
        "VEILSWAP_API_URL": "http://localhost:3000"
      }
    }
  }
}`,
  claude: `claude mcp add veilswap-gateway -- npx tsx mcp/server.ts`,
  cursor: `{
  "mcpServers": {
    "veilswap-gateway": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"]
    }
  }
}`,
};

export function DevTerminalView() {
  const [artifacts, setArtifacts] = useState<DevArtifact[]>([]);
  const [selectedId, setSelectedId] = useState<string>("StealthSignerRotationModule.sol");
  const [mcpClient, setMcpClient] = useState<"gemini" | "claude" | "cursor">("gemini");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [playgroundOutput, setPlaygroundOutput] = useState<string>("");
  const [runningPlayground, setRunningPlayground] = useState(false);

  useEffect(() => {
    fetch("/api/dev/artifacts")
      .then((res) => res.json())
      .then((data) => {
        const list = (data.artifacts ?? []) as DevArtifact[];
        setArtifacts(list);
        if (list.length > 0 && !list.some((a) => a.id === selectedId)) {
          setSelectedId(list[0].id);
        }
      })
      .catch(() => {
        setArtifacts([]);
      });
  }, [selectedId]);

  const activeArtifact = artifacts.find((a) => a.id === selectedId) ?? artifacts[0];

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(id);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleRunPlaygroundIntent = async () => {
    setRunningPlayground(true);
    try {
      const idemKey = `term_${Date.now()}`;
      const res = await fetch("/api/gateway/intents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          amountExpected: "125.00",
          tokenSymbol: "USDC",
          recipientAddress: "st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2",
          settlementMode: "stealth",
          chainId: 421614,
        }),
      });
      const json = await res.json();
      setPlaygroundOutput(JSON.stringify(json, null, 2));
    } catch (err) {
      setPlaygroundOutput(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRunningPlayground(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-100">
            04. Developer Terminal, Contracts &amp; AI MCP
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Inspect Foundry Solidity modules, Noir ZK circuits, TypeScript Checkout SDK, OpenAPI 3.1, and MCP setup for Gemini, Claude Code, and Cursor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/openapi.yaml"
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            OpenAPI 3.1 Spec
          </a>
          <a
            href="/AGENTS.md"
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            AGENTS.md Rules
          </a>
        </div>
      </div>

      {/* Repository Code Explorer */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#0F1624] p-4">
          <h2 className="mb-3 px-2 font-display text-sm font-semibold text-slate-200">
            Protocol Source Modules
          </h2>
          <div className="space-y-1">
            {artifacts.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => setSelectedId(art.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  selectedId === art.id
                    ? "bg-emerald-500/15 text-emerald-300 font-medium"
                    : "text-slate-300 hover:bg-slate-800/70"
                }`}
              >
                <div className="truncate">{art.label}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                  {art.path}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#0B101B]">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div className="font-mono text-xs text-slate-300">
              {activeArtifact ? activeArtifact.path : "Loading artifact..."}
            </div>
            {activeArtifact && (
              <button
                type="button"
                onClick={() => handleCopy(activeArtifact.content, activeArtifact.id)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                {copiedKey === activeArtifact.id ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy Code
                  </>
                )}
              </button>
            )}
          </div>
          <pre className="max-h-[460px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
            <code>{activeArtifact?.content || ""}</code>
          </pre>
        </div>
      </section>

      {/* AI IDE MCP Integration + Live Sandbox */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        <section className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                MCP Integration (Gemini, Claude Code, Cursor)
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Connect your coding agent directly to <code className="text-slate-300">mcp/server.ts</code>.
              </p>
            </div>
            <div className="flex rounded-lg bg-[#090D16] p-1">
              {(["gemini", "claude", "cursor"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMcpClient(tab)}
                  className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    mcpClient === tab ? "bg-slate-800 text-slate-100" : "text-slate-400"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded-lg border border-slate-800 bg-[#090D16] p-4">
            <button
              type="button"
              onClick={() => handleCopy(MCP_CLIENTS[mcpClient], "mcp")}
              aria-label="Copy MCP config"
              className="absolute right-3 top-3 rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800"
            >
              {copiedKey === "mcp" ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <pre className="overflow-x-auto font-mono text-xs text-slate-200">
              <code>{MCP_CLIENTS[mcpClient]}</code>
            </pre>
          </div>
        </section>

        <section className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#0F1624] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Live Gateway API Sandbox
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Execute a live <code className="text-slate-300">POST /api/gateway/intents</code> call from the terminal.
              </p>
            </div>
            <button
              type="button"
              disabled={runningPlayground}
              onClick={handleRunPlaygroundIntent}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Terminal className="h-3.5 w-3.5" /> Run Test Request
            </button>
          </div>

          <pre className="min-h-[164px] max-h-60 overflow-auto rounded-lg border border-slate-800 bg-[#090D16] p-4 font-mono text-xs text-emerald-300">
            <code>
              {playgroundOutput ||
                "// Click 'Run Test Request' to invoke POST /api/gateway/intents with an idempotency key."}
            </code>
          </pre>
        </section>
      </div>
    </div>
  );
}
