import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Where the original file lives.
 *
 * The original is the evidence — a reading can be re-run, a disputed figure
 * can only be settled against the picture the vendor actually sent — so it is
 * stored whole and never overwritten.
 *
 * Two drivers: Cloudflare R2 (S3-compatible object storage) in deployment,
 * and the local filesystem for development so the feature works before any
 * storage account exists. Neither URL is ever handed to a browser: files are
 * served through an org-scoped API route, so a leaked link cannot cross a
 * tenant boundary.
 */

export type StorageDriver = "r2" | "local";

export function storageDriver(): StorageDriver {
  return process.env.R2_ACCOUNT_ID ? "r2" : "local";
}

let r2Client: S3Client | undefined;

function r2(): { client: S3Client; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME must all be set"
    );
  }
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return { client: r2Client, bucket };
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
  if (storageDriver() === "r2") {
    const { client, bucket } = r2();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return;
  }

  const path = localPathFor(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function getDocument(key: string): Promise<Buffer> {
  if (storageDriver() === "r2") {
    const { client, bucket } = r2();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return streamToBuffer(result.Body);
  }

  return readFile(localPathFor(key));
}

export async function deleteDocument(key: string): Promise<void> {
  if (storageDriver() === "r2") {
    const { client, bucket } = r2();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
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
