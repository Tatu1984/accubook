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
 * Two drivers: Vercel Blob in deployment (the app already runs there, and blob
 * URLs carry an unguessable suffix), and the local filesystem for development
 * so the feature works before any storage account exists. Neither URL is ever
 * handed to a browser: files are served through an org-scoped API route, so a
 * leaked link cannot cross a tenant boundary.
 */

export type StorageDriver = "vercel-blob" | "local";

export function storageDriver(): StorageDriver {
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
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

export async function putDocument(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (storageDriver() === "vercel-blob") {
    const { put } = await import("@vercel/blob");
    await put(key, body, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return;
  }

  const path = localPathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function getDocument(key: string): Promise<Buffer> {
  if (storageDriver() === "vercel-blob") {
    const { head } = await import("@vercel/blob");
    const meta = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const response = await fetch(meta.url);
    if (!response.ok) throw new Error(`Stored file could not be read (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  return readFile(localPathFor(key));
}

export async function deleteDocument(key: string): Promise<void> {
  if (storageDriver() === "vercel-blob") {
    const { del } = await import("@vercel/blob");
    await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
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
