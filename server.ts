import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import {
  approveRotationByGuardian,
  cancelSignerRotation,
  createInitialRotationState,
  deriveStealthAddress,
  executeSignerRotation,
  generateAndVerifyPoIProof,
  initiateSignerRotation,
} from "./src/server/stealthCrypto";
import { PaymentGatewayEngine, seedInitialIntents } from "./src/server/gatewayEngine";
import { getHybridDexQuote } from "./src/server/zeroXClient";
import {
  claimInitialAdminPasscode,
  getAdminAuthStatus,
  requireAdminAuth,
  verifyAdminLogin,
} from "./src/server/adminAuth";
import { runPrivateArchitectQuery } from "./src/server/geminiAgent";
import { ARBITRUM_TOKENS, CHAIN_CONFIGS } from "./src/data/protocolCatalog";
import type { PoIProofRecord, StealthAddressBundle, SupportedChainId } from "./src/shared/protocolTypes";

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // In-memory server state for MVP preview
  const gateway = new PaymentGatewayEngine();
  seedInitialIntents(gateway);

  let rotationState = createInitialRotationState();
  const stealthHistory: StealthAddressBundle[] = [
    deriveStealthAddress("st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2", true),
  ];
  const poiRecords: PoIProofRecord[] = [
    generateAndVerifyPoIProof({ stealthRecipient: stealthHistory[0].stealthAddress }),
  ];

  // 1. DEX Hybrid Quote (0x Swap API v2 proxy + InfinityCore Pool)
  app.post("/api/swap/quote", async (req, res) => {
    try {
      const { chainId, sellSymbol, buySymbol, sellAmountHuman, taker, usePrivacyHook } = req.body as {
        chainId: SupportedChainId;
        sellSymbol: "ETH" | "USDC" | "ARB" | "WBTC";
        buySymbol: "ETH" | "USDC" | "ARB" | "WBTC";
        sellAmountHuman: string;
        taker?: `0x${string}`;
        usePrivacyHook?: boolean;
      };

      const chain = CHAIN_CONFIGS.find((c) => c.chainId === Number(chainId));
      const sellToken = ARBITRUM_TOKENS.find((t) => t.symbol === sellSymbol);
      const buyToken = ARBITRUM_TOKENS.find((t) => t.symbol === buySymbol);

      if (!chain || !sellToken || !buyToken) {
        res.status(400).json({ error: "Unsupported chain or token pair." });
        return;
      }

      const quote = await getHybridDexQuote({
        chainId: chain.chainId,
        sellSymbol: sellToken.symbol,
        buySymbol: buyToken.symbol,
        sellTokenAddress: sellToken.addresses[chain.chainId],
        buyTokenAddress: buyToken.addresses[chain.chainId],
        sellDecimals: sellToken.decimals,
        buyDecimals: buyToken.decimals,
        sellPriceUsd: sellToken.referencePriceUsd,
        buyPriceUsd: buyToken.referencePriceUsd,
        sellAmountHuman: String(sellAmountHuman ?? ""),
        taker: taker && taker.startsWith("0x") ? taker : "0x5aFe009911223344556677889900aAbBcCdDeEfF",
        usePrivacyHook: Boolean(usePrivacyHook),
      });

      res.json(quote);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to quote swap." });
    }
  });

  // 2. Stealth Vault, ERC-7579 Rotation & Noir ZK PoI
  app.get("/api/stealth/state", (_req, res) => {
    res.json({
      rotationState,
      stealthHistory,
      poiRecords,
      paymasterProvider: process.env.PIMLICO_API_KEY?.trim() ? "Pimlico Live Bundler" : "Pimlico ERC-4337 Sandbox",
    });
  });

  app.post("/api/stealth/derive", (req, res) => {
    try {
      const { metaAddress, paymasterSponsored } = req.body as {
        metaAddress?: string;
        paymasterSponsored?: boolean;
      };
      const bundle = deriveStealthAddress(
        metaAddress || "st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2",
        paymasterSponsored ?? true
      );
      stealthHistory.unshift(bundle);
      if (stealthHistory.length > 12) stealthHistory.length = 12;
      res.status(201).json(bundle);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to derive stealth address." });
    }
  });

  app.post("/api/stealth/rotation/initiate", (req, res) => {
    try {
      const { newSigner } = req.body as { newSigner?: `0x${string}` };
      if (!newSigner) {
        res.status(400).json({ error: "newSigner address is required." });
        return;
      }
      rotationState = initiateSignerRotation(rotationState, newSigner);
      res.json(rotationState);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to initiate rotation." });
    }
  });

  app.post("/api/stealth/rotation/approve", (_req, res) => {
    try {
      rotationState = approveRotationByGuardian(rotationState);
      res.json(rotationState);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to approve rotation." });
    }
  });

  app.post("/api/stealth/rotation/cancel", (_req, res) => {
    try {
      rotationState = cancelSignerRotation(rotationState);
      res.json(rotationState);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to cancel rotation." });
    }
  });

  app.post("/api/stealth/rotation/execute", (req, res) => {
    try {
      const { simulateTimelockElapsed } = req.body as { simulateTimelockElapsed?: boolean };
      rotationState = executeSignerRotation(
        rotationState,
        Date.now(),
        Boolean(simulateTimelockElapsed)
      );
      res.json(rotationState);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to execute rotation." });
    }
  });

  app.post("/api/zk/poi/prove", (req, res) => {
    try {
      const { stealthRecipient } = req.body as { stealthRecipient?: `0x${string}` };
      const target = stealthRecipient || stealthHistory[0]?.stealthAddress;
      if (!target) {
        res.status(400).json({ error: "Stealth recipient address is required." });
        return;
      }
      const record = generateAndVerifyPoIProof({ stealthRecipient: target });
      poiRecords.unshift(record);
      if (poiRecords.length > 10) poiRecords.length = 10;
      res.status(201).json(record);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "PoI verification failed." });
    }
  });

  // 3. Crypto Payment Gateway & Webhooks
  app.get("/api/gateway/intents", (_req, res) => {
    res.json({
      intents: gateway.listIntents(),
      webhooks: gateway.listWebhooks(),
    });
  });

  app.post("/api/gateway/intents", (req, res) => {
    try {
      const headerKey = req.header("Idempotency-Key");
      const { amountExpected, tokenSymbol, recipientAddress, settlementMode, chainId, expiresInSeconds, idempotencyKey } =
        req.body as {
          amountExpected: string;
          tokenSymbol: "USDC" | "ETH" | "ARB" | "WBTC";
          recipientAddress: string;
          settlementMode?: "stealth" | "smart_account" | "direct";
          chainId?: SupportedChainId;
          expiresInSeconds?: number;
          idempotencyKey?: string;
        };

      const resolvedKey = (headerKey || idempotencyKey || "").trim();
      if (!resolvedKey) {
        res.status(400).json({ error: "Idempotency-Key header or body field is required." });
        return;
      }

      const result = gateway.createIntent({
        idempotencyKey: resolvedKey,
        amountExpected,
        tokenSymbol,
        recipientAddress,
        settlementMode,
        chainId,
        expiresInSeconds,
      });

      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create intent." });
    }
  });

  app.post("/api/gateway/intents/:id/reconcile", (req, res) => {
    try {
      const { receivedAmount, confirmations, forceExpire, forceFail } = req.body as {
        receivedAmount: string;
        confirmations?: number;
        forceExpire?: boolean;
        forceFail?: boolean;
      };

      const result = gateway.reconcileIntent({
        id: req.params.id,
        receivedAmount: String(receivedAmount ?? "0"),
        confirmations,
        forceExpire,
        forceFail,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Reconciliation failed." });
    }
  });

  app.post("/api/gateway/webhooks/verify", (req, res) => {
    try {
      const { rawBody, signatureHeader, timestamp } = req.body as {
        rawBody: string;
        signatureHeader: string;
        timestamp?: number;
      };
      const valid = gateway.verifyWebhookSignature(
        rawBody,
        signatureHeader,
        timestamp ?? Math.floor(Date.now() / 1000)
      );
      res.json({ valid });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Verification failed." });
    }
  });

  // 4. Developer Artifacts Browser (allowlisted repository files)
  const ARTIFACT_FILES: Record<string, { label: string; language: string; relPath: string }> = {
    "StealthSignerRotationModule.sol": {
      label: "ERC-7579 Signer Rotation Module (Solidity)",
      language: "solidity",
      relPath: "contracts/src/StealthSignerRotationModule.sol",
    },
    "InfinityPrivacyHook.sol": {
      label: "PancakeSwap Infinity Privacy Hook (Solidity)",
      language: "solidity",
      relPath: "contracts/src/InfinityPrivacyHook.sol",
    },
    "PoIVerifier.sol": {
      label: "Proof of Innocence Registry (Solidity)",
      language: "solidity",
      relPath: "contracts/src/PoIVerifier.sol",
    },
    "main.nr": {
      label: "Noir ZK Proof of Innocence Circuit",
      language: "rust",
      relPath: "circuits/poi/src/main.nr",
    },
    "zeroXClient.ts": {
      label: "0x Swap API v2 Client (TypeScript)",
      language: "typescript",
      relPath: "src/server/zeroXClient.ts",
    },
    "veilpay-sdk.ts": {
      label: "VeilPay Merchant Checkout SDK (TypeScript)",
      language: "typescript",
      relPath: "sdk/veilpay-sdk.ts",
    },
    "mcp-server.ts": {
      label: "MCP Server for Gemini / Claude Code / Cursor",
      language: "typescript",
      relPath: "mcp/server.ts",
    },
    "openapi.yaml": {
      label: "Gateway OpenAPI 3.1 Specification",
      language: "yaml",
      relPath: "public/openapi.yaml",
    },
    "AGENTS.md": {
      label: "AI Coding Agent Security Rules (AGENTS.md)",
      language: "markdown",
      relPath: "public/AGENTS.md",
    },
  };

  app.get("/api/dev/artifacts", (_req, res) => {
    const rootDir = process.cwd();
    const items = Object.entries(ARTIFACT_FILES).map(([id, meta]) => {
      const resolved = path.resolve(rootDir, meta.relPath);
      const safe = resolved.startsWith(rootDir + path.sep);
      const content = safe && fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : "";
      return {
        id,
        label: meta.label,
        language: meta.language,
        path: meta.relPath,
        content,
      };
    });
    res.json({ artifacts: items });
  });

  // 5. Creator-Only Private AI Architect Routes
  app.get("/api/admin/status", (_req, res) => {
    res.json(getAdminAuthStatus());
  });

  app.post("/api/admin/claim", (req, res) => {
    try {
      const { passcode } = req.body as { passcode?: string };
      const result = claimInitialAdminPasscode(passcode ?? "");
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to claim passcode." });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    try {
      const { passcode } = req.body as { passcode?: string };
      const result = verifyAdminLogin(passcode ?? "");
      res.json(result);
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : "Unauthorized." });
    }
  });

  app.post("/api/admin/architect", requireAdminAuth, async (req, res) => {
    try {
      const { prompt, focusArea } = req.body as {
        prompt?: string;
        focusArea?: "architecture_plan" | "infinity_issues" | "security_audit" | "backend_refactor";
      };
      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: "Prompt is required." });
        return;
      }

      const result = await runPrivateArchitectQuery({
        prompt: prompt.trim(),
        focusArea: focusArea ?? "architecture_plan",
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Private Architect request failed.";
      res.status(502).json({ error: message });
    }
  });

  // Mount Vite in development, static dist in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VeilSwap server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
