# VeilSwap Protocol — AI Coding Agent Instructions (Gemini, Claude Code, Cursor)

## Security Invariants (Mandatory)
1. **Never Expose Secrets Client-Side**:
   - `ZERO_X_API_KEY`, `PIMLICO_API_KEY`, `WEBHOOK_HMAC_SECRET`, `ADMIN_PASSCODE`, and `GEMINI_API_KEY` MUST stay exclusively in server-side `process.env`.
   - Never use `VITE_` or `NEXT_PUBLIC_` prefixes for secret credentials.
2. **Mandatory Webhook HMAC-SHA256 Verification**:
   - Every incoming webhook from VeilSwap includes `X-VeilSwap-Signature` (`t=<unix_ts>,v1=<hex_hmac_sha256>`) and `X-VeilSwap-Idempotency-Key`.
   - Compute `HMAC_SHA256(secret, "${timestamp}.${rawBody}")` and verify using `crypto.timingSafeEqual`. Reject requests older than 300 seconds.
3. **Self-Custody & Private Keys**:
   - Never ask the user to paste private keys or seed phrases into prompts, logs, or API requests.
   - Dynamic stealth addresses (EIP-5564 / EIP-6538) must be derived from public stealth meta-addresses (`st:arb:0x...`) using ephemeral pubkeys.
4. **Smart Account Signer Rotation**:
   - Always route signer changes through `StealthSignerRotationModule.sol` (ERC-7579) with an active timelock (`>= 1 hour`) and Guardian approval.
   - Sponsor sweeping gas via Pimlico ERC-4337 Paymaster so the user's main gas wallet is never linked on-chain to stealth addresses.
5. **Payment Gateway Reconciliation**:
   - Explicitly handle all terminal and partial states: `pending`, `confirming`, `paid`, `underpaid`, `overpaid`, `expired`, `failed`.
   - Always pass an `Idempotency-Key` header on `POST /api/gateway/intents`.
