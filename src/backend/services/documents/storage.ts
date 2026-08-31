import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Where the original file lives.
 *
 * The original is the evidence — a reading can be re-run, a disputed figure
 * can only be settled against the picture the vendor actually sent — so it is
 * stored whole and never overwritten.
 *
 * Two drivers: Pinata (IPFS pinning) in deployment, and the local filesystem
 * for development so the feature works before any storage account exists.
 * Neither URL is ever handed to a browser: files are served through an
 * org-scoped API route, so a leaked link cannot cross a tenant boundary.
 *
 * For the Pinata driver, the "storage key" stored in the database is the
 * IPFS CID returned by the pin — content-addressed, so it also happens to
 * be a de-duplication key across identical uploads.
 */

export type StorageDriver = "pinata" | "local";

export function storageDriver(): StorageDriver {
  return process.env.PINATA_JWT ? "pinata" : "local";
}

const PINATA_API_BASE = "https://api.pinata.cloud";

function pinataGatewayUrl(cid: string): string {
  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  return `https://${gateway}/ipfs/${cid}`;
}

function pinataJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT is not set");
  return jwt;
}

const LOCAL_ROOT = resolve(process.cwd(), ".uploads");

/** `orgId/uuid.ext` — the org prefix keeps a listing scannable per tenant. */
export function buildStorageKey(orgId: string, fileName: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "bin";
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
  return `documents/${orgId}/${randomUUID()}.${safeExtension}`;
}

/** A key from the database is only ever ours; still refuse anything that escapes the root. */
function localPathFor(key: string): string {
  const path = resolve(LOCAL_ROOT, key);
  if (!path.startsWith(LOCAL_ROOT + "/")) {
    throw new Error("Refusing to resolve a storage key outside the upload root");
  }
  return path;
}

/**
 * Stores the file and returns the key to persist in the database.
 *
 * `key` is a hint (the local driver uses it verbatim as the file's path);
 * the Pinata driver ignores it as an address and returns the pinned CID
 * instead, since that's the only key that can address the file on IPFS.
 */
export async function putDocument(
  key: string,
  body: Buffer,
  contentType: string,
  fileName?: string
): Promise<string> {
  if (storageDriver() === "pinata") {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(body)], { type: contentType }),
      fileName || key
    );
    form.append("pinataMetadata", JSON.stringify({ name: fileName || key }));

    const response = await fetch(`${PINATA_API_BASE}/pinning/pinFileToIPFS`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pinataJwt()}` },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Pinata upload failed (${response.status}): ${await response.text()}`);
    }
    const result = (await response.json()) as { IpfsHash: string };
    return result.IpfsHash;
  }

  const path = localPathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return key;
}

export async function getDocument(key: string): Promise<Buffer> {
  if (storageDriver() === "pinata") {
    const response = await fetch(pinataGatewayUrl(key));
    if (!response.ok) throw new Error(`Stored file could not be read (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  return readFile(localPathFor(key));
}

export async function deleteDocument(key: string): Promise<void> {
  if (storageDriver() === "pinata") {
    await fetch(`${PINATA_API_BASE}/pinning/unpin/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${pinataJwt()}` },
    }).catch(() => undefined);
    return;
  }
  await unlink(localPathFor(key)).catch(() => undefined);
}

/** Files bigger than this are refused at the door — a page photo is ~2-6 MB. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
] as const;

export function isAcceptedMimeType(mimeType: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Only used for the local driver's own bookkeeping in tests. */
export const localUploadRoot = LOCAL_ROOT;
export const localPathForKey = (key: string) => join(LOCAL_ROOT, key);
