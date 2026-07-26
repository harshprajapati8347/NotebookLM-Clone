import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// S3-backed file storage for production (plan §5: "Local disk (dev) /
// S3-compatible bucket (prod)"). Required whenever the app runs on a
// serverless/ephemeral-filesystem host (e.g. Vercel) — see `lib/storage/index.ts`
// for how this is selected. Same three-function surface as `local.ts` so
// callers never know which backend is active.

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    // Deliberately using our own S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY
    // names (per plan §11), not the AWS SDK's default AWS_* env vars, so
    // this app's env file has one unambiguous set of names — pass them
    // explicitly rather than relying on the SDK's default credential chain.
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    client = new S3Client({
      region: process.env.S3_REGION,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }
  return client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("S3_BUCKET is not set");
  }
  return bucket;
}

/** Saves a file under {notebookId}/{sourceId}/{filename}, returns that key as the storagePath. */
export async function saveSourceFile(
  notebookId: string,
  sourceId: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const key = `${notebookId}/${sourceId}/${filename}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: data,
    })
  );
  return key;
}

export async function readSourceFile(storagePath: string): Promise<Buffer> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: storagePath })
  );
  const body = result.Body;
  if (!body) {
    throw new Error(`S3 object has no body: ${storagePath}`);
  }
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteSourceFiles(notebookId: string, sourceId: string): Promise<void> {
  const bucket = getBucket();
  const prefix = `${notebookId}/${sourceId}/`;
  const list = await getClient().send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  const objects = (list.Contents ?? []).map((obj) => ({ Key: obj.Key! })).filter((o) => o.Key);
  if (objects.length === 0) return;

  await getClient().send(
    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } })
  );
}
