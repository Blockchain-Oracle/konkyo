"use client"

import { STORAGE } from "@konkyo/config"
import { useQueryClient } from "@tanstack/react-query"
import AwsS3 from "@uppy/aws-s3"
import Uppy, { type Meta, type UppyFile } from "@uppy/core"
import { useUppyEvent, useUppyState } from "@uppy/react"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { api } from "./fetcher"
import { qk } from "./query-keys"

type UploadMeta = Meta & { fileId: string; key: string; relativePath?: string }

/** Files at or above this size upload in parts (resumable); smaller ones in one request. */
const MULTIPART_FROM_BYTES = 32 * 1024 * 1024

export type PickedFile = { file: File; relativePath?: string }

export type UploadState = { percent: number; failed: boolean }

/**
 * Direct-to-storage uploads (plan F01): each file is registered first, so it appears in the library
 * at once and its storage key is fixed by the server; Uppy then uploads straight to S3 with
 * presigned URLs, resumably for large files, and the worker starts reading it on arrival.
 */
export function useUploader() {
  const queryClient = useQueryClient()
  const [uppy] = useState(() =>
    new Uppy<UploadMeta>({
      autoProceed: true,
      restrictions: { maxFileSize: STORAGE.maxUploadBytes },
    }).use(AwsS3, {
      shouldUseMultipart: (file) => (file.size ?? 0) >= MULTIPART_FROM_BYTES,
      getChunkSize: () => STORAGE.multipartPartBytes,
      generateObjectKey: (file) => (file.meta as unknown as UploadMeta).key,
      signRequest: (request) =>
        api<{ url: string; headers?: Record<string, string> }>("/api/uploads/sign", {
          method: "POST",
          json: {
            method: request.method,
            key: request.key,
            uploadId: "uploadId" in request ? request.uploadId : undefined,
            partNumber: "partNumber" in request ? request.partNumber : undefined,
          },
        }),
    }),
  )

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.files.all }),
    [queryClient],
  )

  useUppyEvent(
    uppy,
    "upload-success",
    async (file: UppyFile<UploadMeta, Record<string, never>> | undefined) => {
      if (!file) return
      try {
        await api(`/api/files/${file.meta.fileId}/uploaded`, { method: "POST" })
      } catch (error) {
        toast.error((error as Error).message)
      }
      uppy.removeFile(file.id)
      void refresh()
    },
  )
  useUppyEvent(
    uppy,
    "upload-error",
    (file: UppyFile<UploadMeta, Record<string, never>> | undefined) => {
      toast.error(`${file?.name ?? "A file"} didn't upload`, {
        description: "Check your connection, then choose Try again on its row.",
      })
    },
  )

  /** Each in-flight upload by library file id, so its row can show a bar or a failure. */
  const uploads = useUppyState(uppy, (state) => {
    const out: Record<string, UploadState> = {}
    for (const f of Object.values(state.files)) {
      const fileId = (f.meta as unknown as UploadMeta).fileId
      if (fileId) out[fileId] = { percent: f.progress.percentage ?? 0, failed: Boolean(f.error) }
    }
    return out
  })

  /** Resumes a failed upload from the copy Uppy still holds (parts already sent are kept). */
  const retryUpload = useCallback(
    (fileId: string) => {
      const file = uppy.getFiles().find((f) => f.meta.fileId === fileId)
      if (file) void uppy.retryUpload(file.id)
    },
    [uppy],
  )

  const upload = useCallback(
    async (picked: PickedFile[], folderId?: string) => {
      if (!picked.length) return
      const registered = await Promise.allSettled(
        picked.map(async ({ file, relativePath }) => {
          const { fileId, key } = await api<{ fileId: string | null; key: string | null }>(
            "/api/files",
            {
              method: "POST",
              json: {
                name: file.name,
                size: file.size,
                type: file.type || undefined,
                relativePath,
                folderId,
              },
            },
          )
          return { file, relativePath, fileId, key }
        }),
      )
      void refresh() // the new rows ("Uploading") appear straight away
      const ready = registered.flatMap((r) =>
        r.status === "fulfilled" && r.value.fileId && r.value.key ? [r.value] : [],
      )
      const failed = registered.filter((r) => r.status === "rejected")
      if (failed.length)
        toast.error(
          (failed[0] as PromiseRejectedResult).reason?.message ?? "Some files weren't added",
        )
      uppy.addFiles(
        ready.map(({ file, relativePath, fileId, key }) => ({
          name: file.name,
          type: file.type,
          data: file,
          meta: { fileId: fileId as string, key: key as string, relativePath },
        })),
      )
    },
    [uppy, refresh],
  )

  return { upload, uploads, retryUpload }
}

/** Every file in a drop, walking into dropped folders and keeping each file's path inside them. */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e))
  if (!entries.length) return [...dataTransfer.files].map((file) => ({ file }))
  const out: PickedFile[] = []
  const walk = async (entry: FileSystemEntry, path: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      )
      if (!file.name.startsWith("."))
        out.push({ file, relativePath: path ? `${path}/${file.name}` : undefined })
      return
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children: FileSystemEntry[] = []
    // readEntries returns at most 100 entries per call, so read until it comes back empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      )
      if (!batch.length) break
      children.push(...batch)
    }
    for (const child of children) await walk(child, path ? `${path}/${entry.name}` : entry.name)
  }
  for (const entry of entries) await walk(entry, "")
  return out
}

/** Files from an <input type="file" webkitdirectory>, keeping their folder paths. */
export const filesFromInput = (list: FileList | null): PickedFile[] =>
  [...(list ?? [])].map((file) => ({ file, relativePath: file.webkitRelativePath || undefined }))
