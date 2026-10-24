import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/source"

export const revalidate = false

/** The search index, built once at export time. */
export const { staticGET: GET } = createFromSource(source, { language: "english" })
