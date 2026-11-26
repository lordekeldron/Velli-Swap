import test from "node:test";
import assert from "node:assert/strict";
import { PaymentGatewayEngine } from "./gatewayEngine";
import {
  approveRotationByGuardian,
  cancelSignerRotation,
  createInitialRotationState,
  deriveStealthAddress,
  executeSignerRotation,
  generateAndVerifyPoIProof,
  initiateSignerRotation,
  obfuscateVisualIdentifier,
} from "./stealthCrypto";
import { getHybridDexQuote } from "./zeroXClient";

test("PaymentGatewayEngine enforces idempotency and handles paid/underpaid/overpaid/expired states", () => {
  const engine = new PaymentGatewayEngine("test-hmac-secret-32bytes-minimum!!");
  const now = 1_760_000_000_000;

  const first = engine.createIntent(
    {
      idempotencyKey: "order-abc-1",
      amountExpected: "100.00",
      tokenSymbol: "USDC",
      recipientAddress: "st:arb:0x1234567890abcdef1234567890abcdef12345678",
      settlementMode: "stealth",
      chainId: 421614,
    },
    now
  );
  const second = engine.createIntent(
    {
      idempotencyKey: "order-abc-1",
      amountExpected: "100.00",
      tokenSymbol: "USDC",
      recipientAddress: "st:arb:0x1234567890abcdef1234567890abcdef12345678",
    },
    now + 1000
  );

  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(first.intent.id, second.intent.id);
  assert.equal(first.intent.status, "pending");

  // Underpaid
  const under = engine.reconcileIntent({
    id: first.intent.id,
    receivedAmount: "65.00",
    confirmations: 2,
    nowMs: now + 5000,
  });
  assert.equal(under.intent.status, "underpaid");
  assert.equal(under.intent.deltaAmount, "-35.00");
  assert.equal(under.webhook.verifiedLocally, true);

  // Tampered webhook fails verification
  assert.equal(
    engine.verifyWebhookSignature('{"tampered":true}', under.webhook.signatureHeader, Math.floor((now + 5000) / 1000)),
    false
  );

  // Exact paid
  const paid = engine.reconcileIntent({
    id: first.intent.id,
    receivedAmount: "100.00",
    confirmations: 2,
    nowMs: now + 10_000,
  });
  assert.equal(paid.intent.status, "paid");

  // Overpaid on new intent
  const overIntent = engine.createIntent(
    {
      idempotencyKey: "order-abc-2",
      amountExpected: "50.00",
      tokenSymbol: "USDC",
      recipientAddress: "0x5aFe009911223344556677889900aAbBcCdDeEfF",
      settlementMode: "smart_account",
    },
    now
  );
  const over = engine.reconcileIntent({
    id: overIntent.intent.id,
    receivedAmount: "54.25",
    confirmations: 3,
    nowMs: now + 2000,
  });
  assert.equal(over.intent.status, "overpaid");
  assert.equal(over.intent.deltaAmount, "4.25");

  // Expired
  const expIntent = engine.createIntent(
    {
      idempotencyKey: "order-abc-3",
      amountExpected: "25.00",
      tokenSymbol: "USDC",
      recipientAddress: "0x5aFe009911223344556677889900aAbBcCdDeEfF",
      expiresInSeconds: 60,
    },
    now
  );
  const exp = engine.reconcileIntent({
    id: expIntent.intent.id,
    receivedAmount: "0",
    nowMs: now + 120_000,
  });
  assert.equal(exp.intent.status, "expired");
});

test("EIP-5564 stealth derivation, 1s visual obfuscation, and ERC-7579 timelock + guardian rotation", () => {
  const bundle = deriveStealthAddress("st:arb:0x8a9c44e2b1d7f09a230019c7b3f5e4d2a1c908b2", true, "aa".repeat(32));
  assert.equal(bundle.stealthAddress.startsWith("0x"), true);
  assert.equal(bundle.stealthAddress.length, 42);
  assert.equal(bundle.paymasterSponsored, true);

  const obf1 = obfuscateVisualIdentifier(bundle.stealthAddress, 1);
  const obf2 = obfuscateVisualIdentifier(bundle.stealthAddress, 2);
  assert.notEqual(obf1, obf2);
  assert.equal(obf1.slice(0, 4), bundle.stealthAddress.slice(0, 4));
  assert.equal(obf1.slice(-4), bundle.stealthAddress.slice(-4));

  const init = createInitialRotationState({ timelockSeconds: 3600 });
  const newSigner = "0x3333444455556666777788889999000011112222" as const;
  const now = 1_760_000_000_000;

  const pending = initiateSignerRotation(init, newSigner, now);
  assert.equal(pending.status, "timelock_pending");
  assert.equal(pending.nonce, 1);

  // Cannot execute without guardian approval
  assert.throws(() => executeSignerRotation(pending, now + 4000_000));

  const approved = approveRotationByGuardian(pending, now + 1000);
  assert.equal(approved.status, "ready_to_execute");

  // Cannot execute before timelock elapses
  assert.throws(() => executeSignerRotation(approved, now + 100_000));

  // Succeeds after timelock elapses
  const executed = executeSignerRotation(approved, now + 3700_000);
  assert.equal(executed.status, "executed");
  assert.equal(executed.activeSigner.toLowerCase(), newSigner.toLowerCase());

  // Guardian veto / cancel works
  const pending2 = initiateSignerRotation(executed, "0x4444555566667777888899990000111122223333", now + 4000_000);
  const cancelled = cancelSignerRotation(pending2, now + 4001_000);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.proposedSigner, null);

  // Noir PoI witness check
  const poi = generateAndVerifyPoIProof({ stealthRecipient: bundle.stealthAddress });
  assert.equal(poi.verified, true);
  assert.equal(poi.circuit, "veilswap_poi_noir_v1");
});

test("Hybrid DEX quote produces deterministic Arbitrum Sepolia InfinityCore quote", async () => {
  const quote = await getHybridDexQuote({
    chainId: 421614,
    sellSymbol: "ETH",
    buySymbol: "USDC",
    sellTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    buyTokenAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    sellDecimals: 18,
    buyDecimals: 6,
    sellPriceUsd: 3420,
    buyPriceUsd: 1,
    sellAmountHuman: "2",
    taker: "0x5aFe009911223344556677889900aAbBcCdDeEfF",
    usePrivacyHook: true,
  });

  assert.equal(quote.source, "infinity_core_pool");
  assert.equal(quote.gasSponsoredByPaymaster, true);
  assert.ok(Number(quote.buyAmountHuman) > 6500);
  assert.equal(quote.transaction.to.startsWith("0x"), true);
});
