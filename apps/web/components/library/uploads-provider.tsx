"use client"

import { ACCEPT } from "@konkyo/config"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react"
import { filesFromInput, type PickedFile, type UploadState, useUploader } from "@/lib/use-uploader"

type Uploads = {
  /**
   * Opens the file picker; the files go into `folderId`, or the library's top level. `onAdded`
   * hears the new files' ids once they're registered (the composer attaches them).
   */
  pickFiles: (folderId?: string, onAdded?: (fileIds: string[]) => void) => void
  pickFolder: (folderId?: string) => void
  upload: (picked: PickedFile[], folderId?: string) => Promise<string[]>
  uploads: Record<string, UploadState>
  retryUpload: (fileId: string) => void
}

const UploadsContext = createContext<Uploads | null>(null)

/**
 * One uploader for the whole app, in the shell: uploads keep going while the person moves to
 * another page, and Upload works from anywhere (the Create menu, ⌘K, Home), because the picker
 * opens inside the click that asked for it, as browsers require.
 */
export function UploadsProvider({ children }: { children: React.ReactNode }) {
  const { upload, uploads, retryUpload } = useUploader()
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const target = useRef<string | undefined>(undefined)
  const added = useRef<((fileIds: string[]) => void) | undefined>(undefined)

  // Folder picking needs the non-standard attribute, which React doesn't type.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "")
  }, [])

  const pickFiles = useCallback((folderId?: string, onAdded?: (fileIds: string[]) => void) => {
    target.current = folderId
    added.current = onAdded
    filesInput.current?.click()
  }, [])
  const pickFolder = useCallback((folderId?: string) => {
    target.current = folderId
    added.current = undefined
    folderInput.current?.click()
  }, [])
  const onPicked = (input: HTMLInputElement) => {
    const onAdded = added.current
    added.current = undefined
    void upload(filesFromInput(input.files), target.current).then((ids) => onAdded?.(ids))
    input.value = ""
  }

  const value = useMemo(
    () => ({ pickFiles, pickFolder, upload, uploads, retryUpload }),
    [pickFiles, pickFolder, upload, uploads, retryUpload],
  )
  return (
    <UploadsContext.Provider value={value}>
      <input
        ref={filesInput}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => onPicked(e.currentTarget)}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        onChange={(e) => onPicked(e.currentTarget)}
      />
      {children}
    </UploadsContext.Provider>
  )
}

export function useUploads() {
  const value = useContext(UploadsContext)
  if (!value) throw new Error("useUploads needs <UploadsProvider>")
  return value
}
