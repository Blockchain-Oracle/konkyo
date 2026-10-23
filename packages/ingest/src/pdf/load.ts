import { getDocumentProxy } from "unpdf"
import type { PDFDocumentProxy } from "unpdf/pdfjs"

export class LockedPdfError extends Error {
  constructor() {
    super("This PDF is password-protected")
    this.name = "LockedPdfError"
  }
}

/** Opens a PDF; a password-protected file becomes a LockedPdfError (the "Locked PDF" state). */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    // pdf.js transfers the buffer it is given, so it gets its own copy.
    // verbosity 0: errors only (pdf.js otherwise logs every font-hinting quirk it meets).
    return await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 })
  } catch (error) {
    if ((error as { name?: string })?.name === "PasswordException") throw new LockedPdfError()
    throw error
  }
}
