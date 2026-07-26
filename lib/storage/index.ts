import * as localStorage from "./local";
import * as s3Storage from "./s3";

/**
 * Dispatches to the S3 backend when `S3_BUCKET` is configured, otherwise
 * falls back to local disk (dev default). This is the only storage module
 * the rest of the app should import — see plan §5's "Local disk (dev) /
 * S3-compatible bucket (prod)" tech-stack line and Phase 2's original
 * `local.ts` comment ("swapping to S3 later only requires replacing this
 * module"). Required for any deploy where the filesystem isn't persistent
 * across requests (e.g. Vercel serverless functions).
 */
const backend = process.env.S3_BUCKET ? s3Storage : localStorage;

export const saveSourceFile = backend.saveSourceFile;
export const readSourceFile = backend.readSourceFile;
export const deleteSourceFiles = backend.deleteSourceFiles;
