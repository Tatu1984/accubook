import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/backend/database/client";
import type { ApiScope } from "@/backend/utils/api-scope";
import { isValidScopes } from "@/backend/utils/api-scope";

/** Visible prefix of every accubook API key. Used as a grep marker + identifier. */
export const KEY_PREFIX = "acb_live_";
/** Length of the visible prefix stored in the DB (after the underscore). */
export const STORED_PREFIX_LENGTH = 12;
/** Number of random bytes (each byte → 2 hex chars). 32 bytes = 256 bits = ample. */
const KEY_RANDOM_BYTES = 32;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Generate a fresh API key. Returned `token` is shown to the user once; the
 *  `keyHash` + `keyPrefix` go into the DB. */
export function generateApiKey(): { token: string; keyHash: string; keyPrefix: string } {
  const randomHex = randomBytes(KEY_RANDOM_BYTES).toString("hex");
  const token = `${KEY_PREFIX}${randomHex}`;
  const keyPrefix = randomHex.slice(0, STORED_PREFIX_LENGTH); // first 12 hex chars
  const keyHash = sha256Hex(token);
  return { token, keyHash, keyPrefix };
}

export interface VerifiedApiKey {
  id: string;
  organizationId: string;
  createdById: string;
  scopes: ApiScope[];
  keyPrefix: string;
}

/** Extract `Authorization: Bearer acb_live_…` from a request. Returns null if
 *  not an API-key auth attempt. */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (!m) return null;
  const token = m[1];
  if (!token.startsWith(KEY_PREFIX)) return null;
  return token;
}

/**
 * Verify a bearer token against the api_keys table. Returns the parsed key
 * record on success, null on any failure (unknown prefix, hash mismatch,
 * expired, revoked).
 *
 * Records `lastUsedAt` and `lastUsedIp` fire-and-forget so a slow update
 * doesn't gate the request.
 */
export async function verifyApiKey(
  token: string,
  ip?: string
): Promise<VerifiedApiKey | null> {
  if (!token.startsWith(KEY_PREFIX)) return null;
  const random = token.slice(KEY_PREFIX.length);
  if (random.length < STORED_PREFIX_LENGTH) return null;
  const keyPrefix = random.slice(0, STORED_PREFIX_LENGTH);

  const row = await prisma.apiKey.findUnique({ where: { keyPrefix } });
  if (!row) return null;
  if (!row.isActive) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  // Constant-time hash compare. SHA-256 hex is fixed-width so we can
  // compare strings directly without timing safety risk for high-entropy
  // tokens, but use a constant-time helper anyway.
  const candidateHash = sha256Hex(token);
  if (!constantTimeEqual(candidateHash, row.keyHash)) return null;

  if (!isValidScopes(row.scopes)) return null;

  // Fire-and-forget last-used update.
  prisma.apiKey
    .update({
      where: { id: row.id },
      data: { lastUsedAt: new Date(), lastUsedIp: ip ?? null },
    })
    .catch(() => {});

  return {
    id: row.id,
    organizationId: row.organizationId,
    createdById: row.createdById,
    scopes: row.scopes as ApiScope[],
    keyPrefix: row.keyPrefix,
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
