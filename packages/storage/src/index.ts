import {
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { STORAGE } from "@konkyo/config"
import { env } from "@konkyo/env/server"

const base = {
  region: env.S3_REGION,
  // MinIO serves buckets as paths (http://host/bucket/key), not subdomains.
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
}

/** Server-to-S3 traffic (inside Docker this is the service name). */
export const s3 = new S3Client({ ...base, endpoint: env.S3_ENDPOINT })

/** Signs URLs with the host browsers can reach; a signature covers the host, so it must match. */
const signer = new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT })

export const bucket = STORAGE.bucket

export type StoragePrefix = keyof typeof STORAGE.prefixes

export function objectKey(prefix: StoragePrefix, ...parts: string[]): string {
  return [STORAGE.prefixes[prefix], ...parts].join("/")
}

/** A one-shot PUT URL for small files. */
export function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    signer,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: STORAGE.presignExpirySeconds },
  )
}

/** A GET URL so the browser can read a private object directly. */
export function presignGet(key: string): Promise<string> {
  return getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: STORAGE.presignExpirySeconds,
  })
}

/** Starts a multipart upload (Uppy's AwsS3 plugin signs each part with `presignPart`). */
export async function createMultipart(key: string, contentType: string) {
  const out = await s3.send(
    new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
  )
  if (!out.UploadId) throw new Error("S3 returned no UploadId")
  return { uploadId: out.UploadId, key }
}

export function presignPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(
    signer,
    new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: STORAGE.presignExpirySeconds },
  )
}

/** Creates the bucket if it doesn't exist yet (idempotent; run at server start). */
export async function ensureBucket(): Promise<void> {
  if (await storageReady()) return
  await s3.send(new CreateBucketCommand({ Bucket: bucket }))
}

/** Health probe used by `pnpm services:check` and the readiness route. */
export async function storageReady(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
    return true
  } catch {
    return false
  }
}
