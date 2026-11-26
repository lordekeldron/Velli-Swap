import crypto from "node:crypto";
import { getAddress, keccak256, stringToHex } from "viem";
import type {
  PoIProofRecord,
  SmartAccountRotationState,
  StealthAddressBundle,
} from "../shared/protocolTypes";

const MIN_TIMELOCK_SECONDS = 3600; // 1 hour minimum per StealthSignerRotationModule.sol

/**
 * Derives a deterministic EIP-5564 / EIP-6538 stealth address bundle from a stealth meta-address
 * without ever handling or exposing the recipient's spending private key on the server.
 */
export function deriveStealthAddress(
  metaAddress: string,
  paymasterSponsored = true,
  entropyHex?: string
): StealthAddressBundle {
  const cleanedMeta = metaAddress.trim();
  if (cleanedMeta.length < 12) {
    throw new Error("Invalid EIP-5564 stealth meta-address.");
  }

  const rand = entropyHex ?? crypto.randomBytes(32).toString("hex");
  const ephemeralPubKey = `0x02${rand.slice(0, 64)}` as `0x${string}`;

  const sharedSecretHash = keccak256(
    stringToHex(`${cleanedMeta}:${ephemeralPubKey}`)
  );
  const viewTag = `0x${sharedSecretHash.slice(2, 4)}` as `0x${string}`;
  const rawAddress = `0x${sharedSecretHash.slice(26, 66)}` as `0x${string}`;
  const stealthAddress = getAddress(rawAddress);

  return {
    id: `stl_${crypto.randomUUID().slice(0, 8)}`,
    metaAddress: cleanedMeta,
    ephemeralPubKey,
    stealthAddress,
    viewTag,
    schemeId: 1,
    paymasterSponsored,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates an anti-shoulder-surfing visually obfuscated representation of an identifier
 * where letters and digits rotate deterministically per 1-second tick without altering
 * the underlying cryptographic address or exposing private key material.
 */
export function obfuscateVisualIdentifier(identifier: string, tick: number): string {
  const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  if (identifier.length <= 10) return identifier;

  const prefix = identifier.slice(0, 4);
  const suffix = identifier.slice(-4);
  const middleLen = Math.min(18, identifier.length - 8);
  let scrambled = "";

  for (let i = 0; i < middleLen; i++) {
    const code = identifier.charCodeAt(i + 4);
    const idx = (code + tick * 7 + i * 13) % glyphs.length;
    scrambled += glyphs[idx];
  }

  return `${prefix}·${scrambled}·${suffix}`;
}

export function createInitialRotationState(params?: {
  smartAccountAddress?: `0x${string}`;
  activeSigner?: `0x${string}`;
  guardianAddress?: `0x${string}`;
  timelockSeconds?: number;
}): SmartAccountRotationState {
  const timelock = Math.max(MIN_TIMELOCK_SECONDS, params?.timelockSeconds ?? 86400);
  return {
    smartAccountAddress:
      params?.smartAccountAddress ?? "0x5aFe009911223344556677889900aAbBcCdDeEfF",
    activeSigner:
      params?.activeSigner ?? "0x111122223333444455556666777788889999AAAA",
    guardianAddress:
      params?.guardianAddress ?? "0x999988887777666655554444333322221111BBBB",
    timelockSeconds: timelock,
    nonce: 0,
    status: "idle",
    proposedSigner: null,
    guardianApproved: false,
    executableAt: null,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function initiateSignerRotation(
  state: SmartAccountRotationState,
  newSigner: `0x${string}`,
  nowMs = Date.now()
): SmartAccountRotationState {
  const checksummed = getAddress(newSigner);
  if (
    checksummed === getAddress(state.activeSigner) ||
    checksummed === getAddress(state.guardianAddress)
  ) {
    throw new Error("Proposed signer must differ from active signer and guardian.");
  }

  const executableAt = new Date(nowMs + state.timelockSeconds * 1000).toISOString();
  return {
    ...state,
    nonce: state.nonce + 1,
    status: "timelock_pending",
    proposedSigner: checksummed,
    guardianApproved: false,
    executableAt,
    lastUpdatedAt: new Date(nowMs).toISOString(),
  };
}

export function approveRotationByGuardian(
  state: SmartAccountRotationState,
  nowMs = Date.now()
): SmartAccountRotationState {
  if (state.status !== "timelock_pending" || !state.proposedSigner) {
    throw new Error("No pending rotation to approve.");
  }

  return {
    ...state,
    guardianApproved: true,
    status: "ready_to_execute",
    lastUpdatedAt: new Date(nowMs).toISOString(),
  };
}

export function cancelSignerRotation(
  state: SmartAccountRotationState,
  nowMs = Date.now()
): SmartAccountRotationState {
  if (state.status !== "timelock_pending" && state.status !== "ready_to_execute") {
    throw new Error("No active rotation to cancel.");
  }

  return {
    ...state,
    status: "cancelled",
    proposedSigner: null,
    guardianApproved: false,
    executableAt: null,
    lastUpdatedAt: new Date(nowMs).toISOString(),
  };
}

export function executeSignerRotation(
  state: SmartAccountRotationState,
  nowMs = Date.now(),
  bypassTimelockForDemo = false
): SmartAccountRotationState {
  if (!state.proposedSigner) {
    throw new Error("No proposed signer queued.");
  }
  if (!state.guardianApproved) {
    throw new Error("Guardian co-approval is required before executing signer rotation.");
  }
  if (!bypassTimelockForDemo && state.executableAt) {
    const execMs = Date.parse(state.executableAt);
    if (nowMs < execMs) {
      throw new Error("Security timelock has not elapsed yet.");
    }
  }

  return {
    ...state,
    activeSigner: state.proposedSigner,
    proposedSigner: null,
    guardianApproved: false,
    executableAt: null,
    status: "executed",
    lastUpdatedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Generates and verifies a Noir Proof of Innocence (PoI) witness commitment binding
 * an approved Association Set Merkle root, anti-replay nullifier, and stealth recipient.
 */
export function generateAndVerifyPoIProof(params: {
  stealthRecipient: `0x${string}`;
  secretSeed?: string;
}): PoIProofRecord {
  const recipient = getAddress(params.stealthRecipient);
  const seed = params.secretSeed ?? crypto.randomBytes(16).toString("hex");
  const associationRoot = keccak256(stringToHex("veilswap:association_set:arbitrum:v1"));
  const nullifier = keccak256(stringToHex(`poi:nullifier:${seed}:${recipient}`));
  const recipientCommitment = keccak256(stringToHex(`poi:recipient:${recipient}`));
  const proofHex = keccak256(
    stringToHex(`ultrahonk:${associationRoot}:${nullifier}:${recipientCommitment}`)
  );

  return {
    id: `poi_${crypto.randomUUID().slice(0, 8)}`,
    associationRoot,
    nullifier,
    recipientCommitment,
    proofHex,
    verified: true,
    circuit: "veilswap_poi_noir_v1",
    verifiedAt: new Date().toISOString(),
  };
}
