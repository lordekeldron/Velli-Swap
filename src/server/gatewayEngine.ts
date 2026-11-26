import crypto from "node:crypto";
import type {
  PaymentIntent,
  PaymentIntentStatus,
  SettlementMode,
  SupportedChainId,
  WebhookDeliveryLog,
} from "../shared/protocolTypes";
import { deriveStealthAddress } from "./stealthCrypto";

export interface CreateIntentInput {
  idempotencyKey: string;
  amountExpected: string;
  tokenSymbol: "USDC" | "ETH" | "ARB" | "WBTC";
  recipientAddress: string;
  settlementMode?: SettlementMode;
  chainId?: SupportedChainId;
  expiresInSeconds?: number;
}

export class PaymentGatewayEngine {
  private intents = new Map<string, PaymentIntent>();
  private idempotencyIndex = new Map<string, string>();
  private webhookLogs: WebhookDeliveryLog[] = [];
  private readonly hmacSecret: string;

  constructor(hmacSecret?: string) {
    this.hmacSecret =
      hmacSecret ||
      process.env.WEBHOOK_HMAC_SECRET?.trim() ||
      crypto.randomBytes(32).toString("hex");
  }

  listIntents(): PaymentIntent[] {
    return Array.from(this.intents.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  listWebhooks(): WebhookDeliveryLog[] {
    return [...this.webhookLogs].sort((a, b) => b.timestamp - a.timestamp);
  }

  getIntent(id: string): PaymentIntent | undefined {
    return this.intents.get(id);
  }

  createIntent(input: CreateIntentInput, nowMs = Date.now()): {
    intent: PaymentIntent;
    idempotentReplay: boolean;
  } {
    const key = input.idempotencyKey.trim();
    if (!key) {
      throw new Error("Idempotency-Key is required.");
    }

    const existingId = this.idempotencyIndex.get(key);
    if (existingId) {
      const existing = this.intents.get(existingId);
      if (existing) {
        return { intent: existing, idempotentReplay: true };
      }
    }

    const expectedNum = Number(input.amountExpected);
    if (!Number.isFinite(expectedNum) || expectedNum <= 0) {
      throw new Error("amountExpected must be a positive decimal number.");
    }

    const mode: SettlementMode = input.settlementMode ?? "stealth";
    const chainId: SupportedChainId = input.chainId ?? 421614;
    const ttlSeconds = Math.max(60, Math.min(86400, input.expiresInSeconds ?? 900));

    let settlementAddress: `0x${string}`;
    if (mode === "stealth") {
      const bundle = deriveStealthAddress(input.recipientAddress, true);
      settlementAddress = bundle.stealthAddress;
    } else if (input.recipientAddress.startsWith("0x") && input.recipientAddress.length === 42) {
      settlementAddress = input.recipientAddress as `0x${string}`;
    } else {
      settlementAddress = "0x5aFe009911223344556677889900aAbBcCdDeEfF";
    }

    const nowIso = new Date(nowMs).toISOString();
    const expiresIso = new Date(nowMs + ttlSeconds * 1000).toISOString();

    const intent: PaymentIntent = {
      id: `pi_${crypto.randomUUID().slice(0, 12)}`,
      idempotencyKey: key,
      status: "pending",
      amountExpected: expectedNum.toFixed(input.tokenSymbol === "USDC" ? 2 : 6),
      amountReceived: "0",
      deltaAmount: (-expectedNum).toFixed(input.tokenSymbol === "USDC" ? 2 : 6),
      tokenSymbol: input.tokenSymbol,
      chainId,
      recipientAddress: input.recipientAddress,
      settlementAddress,
      settlementMode: mode,
      confirmations: 0,
      txHash: null,
      expiresAt: expiresIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.intents.set(intent.id, intent);
    this.idempotencyIndex.set(key, intent.id);
    this.recordWebhook(intent, "payment_intent.created", nowMs);

    return { intent, idempotentReplay: false };
  }

  reconcileIntent(params: {
    id: string;
    receivedAmount: string;
    confirmations?: number;
    txHash?: string;
    forceExpire?: boolean;
    forceFail?: boolean;
    nowMs?: number;
  }): { intent: PaymentIntent; webhook: WebhookDeliveryLog } {
    const intent = this.intents.get(params.id);
    if (!intent) {
      throw new Error(`Payment intent ${params.id} not found.`);
    }

    const nowMs = params.nowMs ?? Date.now();
    const received = Number(params.receivedAmount);
    if (!Number.isFinite(received) || received < 0) {
      throw new Error("receivedAmount must be a non-negative number.");
    }

    const expected = Number(intent.amountExpected);
    const confirmations = params.confirmations ?? 2;
    const isExpired = params.forceExpire || nowMs > Date.parse(intent.expiresAt);
    const precision = intent.tokenSymbol === "USDC" ? 2 : 6;

    let status: PaymentIntentStatus;
    if (params.forceFail) {
      status = "failed";
    } else if (isExpired && received === 0) {
      status = "expired";
    } else if (received === 0) {
      status = "pending";
    } else if (confirmations < 1) {
      status = "confirming";
    } else if (Math.abs(received - expected) < 1e-8) {
      status = "paid";
    } else if (received < expected) {
      status = "underpaid";
    } else {
      status = "overpaid";
    }

    const updated: PaymentIntent = {
      ...intent,
      status,
      amountReceived: received.toFixed(precision),
      deltaAmount: (received - expected).toFixed(precision),
      confirmations,
      txHash: params.txHash ?? intent.txHash ?? `0x${crypto.randomBytes(32).toString("hex")}`,
      updatedAt: new Date(nowMs).toISOString(),
    };

    this.intents.set(intent.id, updated);
    const webhook = this.recordWebhook(updated, `payment_intent.${status}`, nowMs);
    return { intent: updated, webhook };
  }

  signWebhookPayload(rawBody: string, timestampSec: number): string {
    const digest = crypto
      .createHmac("sha256", this.hmacSecret)
      .update(`${timestampSec}.${rawBody}`)
      .digest("hex");
    return `t=${timestampSec},v1=${digest}`;
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((segment) => {
        const idx = segment.indexOf("=");
        return idx === -1 ? [segment, ""] : [segment.slice(0, idx), segment.slice(idx + 1)];
      })
    );
    const ts = Number(parts.t);
    const v1 = parts.v1;
    if (!Number.isFinite(ts) || !v1) return false;
    if (Math.abs(nowSec - ts) > 300) return false;

    const expected = crypto
      .createHmac("sha256", this.hmacSecret)
      .update(`${ts}.${rawBody}`)
      .digest("hex");

    const bufA = Buffer.from(expected, "hex");
    const bufB = Buffer.from(v1, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private recordWebhook(intent: PaymentIntent, event: string, nowMs: number): WebhookDeliveryLog {
    const timestampSec = Math.floor(nowMs / 1000);
    const deliveryId = `wh_${crypto.randomUUID().slice(0, 10)}`;
    const payload = {
      id: deliveryId,
      event,
      created: timestampSec,
      data: {
        intentId: intent.id,
        status: intent.status,
        amountExpected: intent.amountExpected,
        amountReceived: intent.amountReceived,
        deltaAmount: intent.deltaAmount,
        tokenSymbol: intent.tokenSymbol,
        settlementAddress: intent.settlementAddress,
        settlementMode: intent.settlementMode,
        chainId: intent.chainId,
      },
    };
    const payloadJson = JSON.stringify(payload);
    const signatureHeader = this.signWebhookPayload(payloadJson, timestampSec);
    const verifiedLocally = this.verifyWebhookSignature(payloadJson, signatureHeader, timestampSec);

    const log: WebhookDeliveryLog = {
      id: deliveryId,
      intentId: intent.id,
      event,
      idempotencyKey: `${intent.id}:${event}:${intent.updatedAt}`,
      signatureHeader,
      timestamp: timestampSec,
      payloadJson,
      verifiedLocally,
      dispatchedAt: new Date(nowMs).toISOString(),
    };

    this.webhookLogs.unshift(log);
    if (this.webhookLogs.length > 50) {
      this.webhookLogs.length = 50;
    }
    return log;
  }
}

export function seedInitialIntents(engine: PaymentGatewayEngine): void {
  const { intent: i1 } = engine.createIntent({
    idempotencyKey: "seed-merchant-order-1001",
    amountExpected: "450.00",
    tokenSymbol: "USDC",
    recipientAddress: "st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2",
    settlementMode: "stealth",
    chainId: 421614,
  });
  engine.reconcileIntent({
    id: i1.id,
    receivedAmount: "450.00",
    confirmations: 4,
  });

  const { intent: i2 } = engine.createIntent({
    idempotencyKey: "seed-merchant-order-1002",
    amountExpected: "0.750000",
    tokenSymbol: "ETH",
    recipientAddress: "0x5aFe009911223344556677889900aAbBcCdDeEfF",
    settlementMode: "smart_account",
    chainId: 421614,
  });
  engine.reconcileIntent({
    id: i2.id,
    receivedAmount: "0.620000",
    confirmations: 2,
  });

  engine.createIntent({
    idempotencyKey: "seed-merchant-order-1003",
    amountExpected: "1200.00",
    tokenSymbol: "USDC",
    recipientAddress: "st:arb:0x3f2e1d4c5b6a798011223344556677889900aabb",
    settlementMode: "stealth",
    chainId: 42161,
  });
}
