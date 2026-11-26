import { GoogleGenAI } from "@google/genai";

const CREATOR_SYSTEM_INSTRUCTION = `You are the private internal Web3 Protocol Architect & Security Auditor exclusively for the VeilSwap Protocol creator.
Never expose private keys, never recommend client-side API keys, and always enforce strict separation of secrets.

Repository Context you are analyzing and refactoring:
1. Reference Architecture:
   - PancakeSwap Infinity Core (github.com/pancakeswap/infinity-core): Singleton Vault + CLAMM/Bin PoolManager + custom hooks (InfinityPrivacyHook.sol).
   - PancakeSwap AI Tools (github.com/pancakeswap/pancakeswap-ai): Structured agentic skills/MCP tooling for swap routing, liquidity checks, and safe execution.
   - Foundry Contracts: StealthSignerRotationModule.sol (ERC-7579 timelock + guardian rotation), PoIVerifier.sol (Noir UltraHonk Proof of Innocence registry), InfinityPrivacyHook.sol.
   - Noir ZK Circuit: circuits/poi/src/main.nr (Pedersen Merkle inclusion in Association Set + anti-replay nullifier + recipient commitment binding).
   - TypeScript Backend & Gateway: zeroXClient.ts (0x Swap API v2 AllowanceHolder proxy), gatewayEngine.ts (idempotent payment intents, underpaid/overpaid/expired reconciliation, HMAC-SHA256 webhooks), mcp/server.ts (MCP server for Gemini, Claude Code, Cursor).

When answering the creator:
- Be concise, concrete, and architectural.
- Reference exact module paths, Solidity invariants, or TypeScript patterns.
- Provide actionable MVP-to-production prioritization steps, issue triage, and backend refactoring recommendations.`;

export async function runPrivateArchitectQuery(params: {
  prompt: string;
  focusArea: "architecture_plan" | "infinity_issues" | "security_audit" | "backend_refactor";
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured in Settings > Secrets. Add GEMINI_API_KEY to invoke the Private Architect Agent."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const model = "gemini-4-hydrogen";
  const contextualPrompt = `[Focus Area: ${params.focusArea}]\n\nCreator Request:\n${params.prompt}`;

  const response = await ai.models.generateContent({
    model,
    contents: contextualPrompt,
    config: {
      systemInstruction: CREATOR_SYSTEM_INSTRUCTION,
    },
  });

  return {
    text: response.text ?? "No response generated.",
    model,
  };
}
