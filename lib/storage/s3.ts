import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// S3-backed file storage for prod (plan §5: "Local disk (dev) / S3-compatible
// bucket (prod)"). Same 3-function contract as `./local` — callers only ever
// deal with an opaque `storagePath` string, never an S3 key/bucket directly.
const globalForS3 = globalThis as unknown as { s3Client: S3Client | undefined };

function getClient(): S3Client {
  if (!globalForS3.s3Client) {
    globalForS3.s3Client = new S3Client({
      region: process.env.S3_REGION,
      credentials: process.env.S3_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
          }
        : undefined,
    });
  }
  return globalForS3.s3Client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set");
  return bucket;
}

/** Saves a file under {notebookId}/{sourceId}/{filename}, returns the S3 key as the storagePath. */
export async function saveSourceFile(
  notebookId: string,
  sourceId: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const key = `${notebookId}/${sourceId}/${filename}`;
  await getClient().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: data }),
  );
  return key;
}

export async function readSourceFile(storagePath: string): Promise<Buffer> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: storagePath }),
  );
  const body = result.Body;
  if (!body) throw new Error(`S3 object has no body: ${storagePath}`);
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteSourceFiles(
  notebookId: string,
  sourceId: string,
): Promise<void> {
  const prefix = `${notebookId}/${sourceId}/`;
  const bucket = getBucket();
  const client = getClient();

  let continuationToken: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (listed.Contents ?? []).flatMap((obj) =>
      obj.Key ? [{ Key: obj.Key }] : [],
    );
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }),
      );
    }
    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
  } while (continuationToken);
}
