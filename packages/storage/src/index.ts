import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { STORAGE } from "@konkyo/config"
import { env } from "@konkyo/env/server"

const base = {
  region: env.S3_REGION,
  // RustFS serves buckets as paths (http://host/bucket/key), not subdomains.
  forcePathStyle: true,
  // The SDK's default checksums would sign an empty body's CRC32 into presigned URLs, so the
  // browser's real bytes fail with BadDigest. Checksums only where an operation demands them.
  requestChecksumCalculation: "WHEN_REQUIRED" as const,
  responseChecksumValidation: "WHEN_REQUIRED" as const,
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

export type S3Operation = {
  method: "PUT" | "POST" | "GET" | "DELETE"
  key: string
  uploadId?: string
  partNumber?: number
}

/**
 * Presigns whichever S3 call Uppy 6's `signRequest` asks for: a single PUT, or one step of a
 * multipart upload (create, part, list, complete, abort). Uppy then makes the call itself.
 */
export function presignOperation(op: S3Operation, contentType?: string): Promise<string> {
  const Bucket = bucket
  const Key = op.key
  const expiresIn = STORAGE.presignExpirySeconds
  const { method, uploadId: UploadId, partNumber: PartNumber } = op
  if (method === "PUT" && UploadId && PartNumber) {
    return getSignedUrl(signer, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber }), {
      expiresIn,
    })
  }
  if (method === "PUT") {
    return getSignedUrl(signer, new PutObjectCommand({ Bucket, Key, ContentType: contentType }), {
      expiresIn,
    })
  }
  if (method === "POST" && !UploadId) {
    return getSignedUrl(
      signer,
      new CreateMultipartUploadCommand({ Bucket, Key, ContentType: contentType }),
      {
        expiresIn,
      },
    )
  }
  if (method === "POST" && UploadId) {
    return getSignedUrl(signer, new CompleteMultipartUploadCommand({ Bucket, Key, UploadId }), {
      expiresIn,
    })
  }
  if (method === "GET" && UploadId) {
    return getSignedUrl(signer, new ListPartsCommand({ Bucket, Key, UploadId }), { expiresIn })
  }
  if (method === "DELETE" && UploadId) {
    return getSignedUrl(signer, new AbortMultipartUploadCommand({ Bucket, Key, UploadId }), {
      expiresIn,
    })
  }
  throw new Error(`Unsupported S3 operation: ${method}${UploadId ? " (multipart)" : ""}`)
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

/** Reads a whole object (documents are processed in memory; the upload cap bounds the size). */
export async function getBytes(key: string): Promise<Uint8Array> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!out.Body) throw new Error(`Object ${key} has no body`)
  return out.Body.transformToByteArray()
}

export async function putBytes(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  )
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function headObject(
  key: string,
): Promise<{ size: number; contentType?: string } | null> {
  try {
    const out = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { size: out.ContentLength ?? 0, contentType: out.ContentType }
  } catch {
    return null
  }
}

/** Uppy's AwsS3 plugin resumes an interrupted upload by listing the parts S3 already has. */
export async function listParts(key: string, uploadId: string) {
  const out = await s3.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId }))
  return (out.Parts ?? []).map((p) => ({ PartNumber: p.PartNumber, Size: p.Size, ETag: p.ETag }))
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
) {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
    }),
  )
}

export async function abortMultipart(key: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }))
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
