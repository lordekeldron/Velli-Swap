import crypto from "node:crypto";

export type GatewayStatus =
  | "pending"
  | "confirming"
  | "paid"
  | "underpaid"
  | "overpaid"
  | "expired"
  | "failed";

export interface CreateIntentParams {
  amountExpected: string;
  tokenSymbol: "USDC" | "ETH" | "ARB" | "WBTC";
  recipientAddress: string;
  settlementMode?: "stealth" | "smart_account" | "direct";
  chainId?: 42161 | 421614 | 31337;
  expiresInSeconds?: number;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentRecord {
  id: string;
  status: GatewayStatus;
  amountExpected: string;
  amountReceived: string;
  tokenSymbol: string;
  chainId: number;
  settlementAddress: string;
  settlementMode: "stealth" | "smart_account" | "direct";
  expiresAt: string;
  createdAt: string;
}

export class VeilPayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: { baseUrl: string; apiKey: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  async createPaymentIntent(params: CreateIntentParams): Promise<PaymentIntentRecord> {
    const res = await fetch(`${this.baseUrl}/api/gateway/intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-key": this.apiKey,
        "Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`VeilPay API error (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as PaymentIntentRecord;
  }

  static verifyWebhookSignature(params: {
    rawBody: string;
    signatureHeader: string;
    webhookSecret: string;
    toleranceSeconds?: number;
  }): boolean {
    const parts = Object.fromEntries(
      params.signatureHeader.split(",").map((kv) => kv.split("="))
    );
    const timestamp = Number(parts.t);
    const receivedHex = parts.v1;
    if (!Number.isFinite(timestamp) || !receivedHex) return false;

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSeconds > (params.toleranceSeconds ?? 300)) return false;

    const expectedHex = crypto
      .createHmac("sha256", params.webhookSecret)
      .update(`${timestamp}.${params.rawBody}`)
      .digest("hex");

    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(receivedHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
