import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/crypto";

/**
 * Private file storage. Local disk in development (FILE_STORAGE_DIR); swap the
 * three functions for Supabase Storage private buckets in production. Keys are
 * generated server-side, never taken from user input, so paths cannot traverse.
 */
const root = path.resolve(env.FILE_STORAGE_DIR);

function resolveKey(key: string) {
  if (!/^[a-z0-9/-]+(\.[a-z0-9]+)?$/i.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export type StoredFile = { key: string; sha256: string; size: number };

export async function putFile(data: Uint8Array, opts: { prefix: string; ext: string }): Promise<StoredFile> {
  const now = new Date();
  const safePrefix = opts.prefix.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "files";
  const safeExt = opts.ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "bin";
  const key = `${safePrefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${safeExt}`;
  const p = resolveKey(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data, { flag: "wx" });
  return { key, sha256: sha256(data), size: data.byteLength };
}

export async function getFile(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function deleteFile(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}
