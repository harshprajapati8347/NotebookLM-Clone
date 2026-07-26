import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Local-disk file storage for dev (plan §5: "Local disk (dev) / S3-compatible
// bucket (prod)"). Swapping to S3 later only requires replacing this module —
// callers only deal with an opaque `storagePath` string.
const STORAGE_ROOT = path.join(process.cwd(), "storage");

function resolveStoragePath(storagePath: string): string {
  const resolved = path.join(STORAGE_ROOT, storagePath);
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

/** Saves a file under storage/{notebookId}/{sourceId}/{filename}, returns the relative storagePath. */
export async function saveSourceFile(
  notebookId: string,
  sourceId: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const relativeDir = path.join(notebookId, sourceId);
  const dir = resolveStoragePath(relativeDir);
  await mkdir(dir, { recursive: true });
  const relativePath = path.join(relativeDir, filename);
  await writeFile(resolveStoragePath(relativePath), data);
  return relativePath.split(path.sep).join("/");
}

export async function readSourceFile(storagePath: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storagePath));
}

export async function deleteSourceFiles(notebookId: string, sourceId: string): Promise<void> {
  const dir = resolveStoragePath(path.join(notebookId, sourceId));
  await rm(dir, { recursive: true, force: true });
}
