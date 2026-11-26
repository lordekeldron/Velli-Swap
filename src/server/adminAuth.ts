import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SESSION_SIGNING_KEY =
  process.env.ADMIN_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString("hex");

interface ClaimedAdminCredential {
  saltHex: string;
  hashHex: string;
}

let claimedCredential: ClaimedAdminCredential | null = null;
const activeSessions = new Map<string, { expiresAt: number }>();

function hashPasscode(passcode: string, saltHex: string): string {
  return crypto.scryptSync(passcode, saltHex, 64).toString("hex");
}

function constantTimeMatch(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getAdminAuthStatus(): {
  mode: "env_configured" | "claimed" | "needs_setup";
} {
  if (process.env.ADMIN_PASSCODE?.trim()) {
    return { mode: "env_configured" };
  }
  if (claimedCredential) {
    return { mode: "claimed" };
  }
  return { mode: "needs_setup" };
}

export function claimInitialAdminPasscode(passcode: string): { token: string } {
  if (process.env.ADMIN_PASSCODE?.trim()) {
    throw new Error("Admin passcode is configured via environment secret.");
  }
  if (claimedCredential) {
    throw new Error("Creator passcode has already been claimed.");
  }
  const trimmed = passcode.trim();
  if (trimmed.length < 8) {
    throw new Error("Creator passcode must be at least 8 characters.");
  }

  const saltHex = crypto.randomBytes(16).toString("hex");
  const hashHex = hashPasscode(trimmed, saltHex);
  claimedCredential = { saltHex, hashHex };

  return { token: issueSessionToken() };
}

export function verifyAdminLogin(passcode: string): { token: string } {
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const trimmed = passcode.trim();

  if (envPasscode) {
    const salt = "veilswap-env-admin-salt";
    const expected = hashPasscode(envPasscode, salt);
    const provided = hashPasscode(trimmed, salt);
    if (!constantTimeMatch(expected, provided)) {
      throw new Error("Invalid creator passcode.");
    }
    return { token: issueSessionToken() };
  }

  if (!claimedCredential) {
    throw new Error("Creator passcode has not been claimed yet.");
  }

  const providedHash = hashPasscode(trimmed, claimedCredential.saltHex);
  if (!constantTimeMatch(claimedCredential.hashHex, providedHash)) {
    throw new Error("Invalid creator passcode.");
  }

  return { token: issueSessionToken() };
}

function issueSessionToken(): string {
  const nonce = crypto.randomBytes(24).toString("hex");
  const sig = crypto
    .createHmac("sha256", SESSION_SIGNING_KEY)
    .update(nonce)
    .digest("hex");
  const token = `${nonce}.${sig}`;
  activeSessions.set(token, { expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
  return token;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: "Creator authentication required for private architect agent." });
    return;
  }
  next();
}
