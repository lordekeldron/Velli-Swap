/**
 * VeilSwap Model Context Protocol (MCP) Server in TypeScript
 * Compatible with Gemini CLI, Claude Code, and Cursor.
 *
 * Exposes JSON-RPC 2.0 over stdio for:
 *  - create_test_payment_intent
 *  - simulate_webhook_event
 *  - get_checkout_snippet
 *  - fetch_swap_quote_preview
 */

import readline from "node:readline";
import crypto from "node:crypto";

const GATEWAY_BASE_URL = process.env.VEILSWAP_API_URL || "http://localhost:3000";
const GATEWAY_API_KEY = process.env.VEILSWAP_GATEWAY_KEY || "vs_test_dev_key";

interface McpRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "create_test_payment_intent",
    description: "Create an idempotent crypto payment intent on Arbitrum Sepolia / Anvil.",
    inputSchema: {
      type: "object",
      required: ["amountExpected", "tokenSymbol", "recipientAddress"],
      properties: {
        amountExpected: { type: "string", description: "Decimal amount, e.g. '250.00'" },
        tokenSymbol: { type: "string", enum: ["USDC", "ETH", "ARB", "WBTC"] },
        recipientAddress: { type: "string", description: "0x address or EIP-5564 stealth meta-address" },
        settlementMode: { type: "string", enum: ["stealth", "smart_account", "direct"] },
      },
    },
  },
  {
    name: "simulate_webhook_event",
    description: "Trigger an HMAC-SHA256 signed webhook test event for a payment intent.",
    inputSchema: {
      type: "object",
      required: ["intentId", "receivedAmount"],
      properties: {
        intentId: { type: "string" },
        receivedAmount: { type: "string" },
      },
    },
  },
  {
    name: "get_checkout_snippet",
    description: "Generate a custom TypeScript + React checkout snippet using VeilPayClient.",
    inputSchema: {
      type: "object",
      required: ["tokenSymbol", "amountExpected"],
      properties: {
        tokenSymbol: { type: "string" },
        amountExpected: { type: "string" },
      },
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>) {
  if (name === "create_test_payment_intent") {
    const idempotencyKey = `mcp_${crypto.randomUUID()}`;
    const res = await fetch(`${GATEWAY_BASE_URL}/api/gateway/intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-key": GATEWAY_API_KEY,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        amountExpected: String(args.amountExpected ?? "100.00"),
        tokenSymbol: String(args.tokenSymbol ?? "USDC"),
        recipientAddress: String(args.recipientAddress ?? "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"),
        settlementMode: String(args.settlementMode ?? "stealth"),
        chainId: 421614,
      }),
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  if (name === "simulate_webhook_event") {
    const res = await fetch(
      `${GATEWAY_BASE_URL}/api/gateway/intents/${String(args.intentId)}/reconcile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gateway-key": GATEWAY_API_KEY,
        },
        body: JSON.stringify({
          receivedAmount: String(args.receivedAmount ?? "100.00"),
          confirmations: 2,
        }),
      }
    );
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  if (name === "get_checkout_snippet") {
    const snippet = `import { VeilPayClient } from "./sdk/veilpay-sdk";

const veilpay = new VeilPayClient({
  baseUrl: process.env.VEILSWAP_API_URL!,
  apiKey: process.env.VEILSWAP_GATEWAY_KEY!,
});

const intent = await veilpay.createPaymentIntent({
  amountExpected: "${String(args.amountExpected ?? "100.00")}",
  tokenSymbol: "${String(args.tokenSymbol ?? "USDC")}",
  recipientAddress: "0xYourStealthOrSafeAddress",
  settlementMode: "stealth",
  chainId: 421614,
  idempotencyKey: crypto.randomUUID(),
});`;
    return { content: [{ type: "text", text: snippet }] };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let req: McpRequest;
  try {
    req = JSON.parse(line) as McpRequest;
  } catch {
    return;
  }

  try {
    if (req.method === "initialize") {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "veilswap-mcp", version: "1.0.0" },
            capabilities: { tools: {} },
          },
        }) + "\n"
      );
      return;
    }

    if (req.method === "tools/list") {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } }) + "\n"
      );
      return;
    }

    if (req.method === "tools/call") {
      const params = req.params as { name: string; arguments?: Record<string, unknown> };
      const result = await handleToolCall(params.name, params.arguments ?? {});
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n");
      return;
    }

    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: req.id, result: {} }) + "\n"
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal MCP error" },
      }) + "\n"
    );
  }
});
