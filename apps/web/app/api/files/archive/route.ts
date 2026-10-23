import { db, schema } from "@konkyo/db"
import { streamObject } from "@konkyo/storage"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Zip, ZipPassThrough } from "fflate"
import { NextResponse } from "next/server"
import { z } from "zod"
import { downloadName } from "@/lib/library"
import { getSession } from "@/lib/session"

const { files, folders, fileFolders } = schema

type Entry = { path: string; key: string }

/** The file's own upload, or the saved PDF for web pages and links. */
function entryFor(f: { title: string; originalKey: string | null; renditionKey: string | null }) {
  if (f.originalKey) return { name: downloadName(f.title, f.originalKey), key: f.originalKey }
  if (f.renditionKey) return { name: `${f.title.replace(/\.pdf$/i, "")}.pdf`, key: f.renditionKey }
  return null
}

const safe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180) || "file"

/** "notes.pdf", "notes (2).pdf"…: two files with one name both survive in the archive. */
function unique(paths: Set<string>, path: string) {
  if (!paths.has(path)) return path
  const dot = path.lastIndexOf(".")
  const [stem, ext] =
    dot > path.lastIndexOf("/") ? [path.slice(0, dot), path.slice(dot)] : [path, ""]
  for (let n = 2; ; n++) if (!paths.has(`${stem} (${n})${ext}`)) return `${stem} (${n})${ext}`
}

async function folderEntries(
  ownerId: string,
  folderId: string,
): Promise<{ name: string; entries: Entry[] }> {
  const tree = await db.execute<{ id: string; path: string }>(sql`
    with recursive tree as (
      select id, name::text as path from ${folders}
      where id = ${folderId} and owner_id = ${ownerId} and deleted_at is null
      union all
      select f.id, tree.path || '/' || f.name from ${folders} f join tree on f.parent_id = tree.id
      where f.deleted_at is null
    )
    select id, path from tree
  `)
  if (!tree.length) return { name: "folder", entries: [] }
  const pathOf = new Map(tree.map((t) => [t.id, t.path]))
  const rows = await db
    .select({
      folderId: fileFolders.folderId,
      title: files.title,
      originalKey: files.originalKey,
      renditionKey: files.renditionKey,
    })
    .from(fileFolders)
    .innerJoin(files, eq(files.id, fileFolders.fileId))
    .where(and(inArray(fileFolders.folderId, [...pathOf.keys()]), isNull(files.deletedAt)))
  const entries = rows.flatMap((r) => {
    const e = entryFor(r)
    return e
      ? [
          {
            path: `${(pathOf.get(r.folderId) ?? "").split("/").map(safe).join("/")}/${safe(e.name)}`,
            key: e.key,
          },
        ]
      : []
  })
  return { name: tree[0]?.path ?? "folder", entries }
}

/**
 * A .zip of chosen files (`?ids=a,b`) or of a folder with its subfolders (`?folder=id`), streamed:
 * each stored file is read only as the browser takes the archive, so memory stays flat.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const ownerId = session.user.id
  const params = new URL(request.url).searchParams
  let name = "Konkyo files"
  let entries: Entry[] = []
  const folder = params.get("folder")
  if (folder) {
    const found = await folderEntries(ownerId, z.uuid().parse(folder))
    name = found.name
    entries = found.entries
  } else {
    const ids = z
      .array(z.uuid())
      .min(1)
      .max(1000)
      .parse(params.get("ids")?.split(",") ?? [])
    const rows = await db
      .select({
        title: files.title,
        originalKey: files.originalKey,
        renditionKey: files.renditionKey,
      })
      .from(files)
      .where(and(eq(files.ownerId, ownerId), inArray(files.id, ids), isNull(files.deletedAt)))
    entries = rows.flatMap((r) => {
      const e = entryFor(r)
      return e ? [{ path: safe(e.name), key: e.key }] : []
    })
  }
  if (!entries.length) return NextResponse.json({ error: "Nothing to download" }, { status: 404 })
  const seen = new Set<string>()
  for (const e of entries) {
    e.path = unique(seen, e.path)
    seen.add(e.path)
  }

  let zip: Zip
  let current: { reader: ReadableStreamDefaultReader<Uint8Array>; file: ZipPassThrough } | null =
    null
  let next = 0
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((error, chunk, final) => {
        if (error) return controller.error(error)
        controller.enqueue(chunk)
        if (final) controller.close()
      })
    },
    // One stored chunk per pull: the browser's pace sets ours.
    async pull() {
      if (!current) {
        const entry = entries[next++]
        if (!entry) return zip.end()
        const file = new ZipPassThrough(entry.path) // already-compressed PDFs and media: store
        zip.add(file)
        current = { reader: (await streamObject(entry.key)).body.getReader(), file }
      }
      const { done, value } = await current.reader.read()
      if (done) {
        current.file.push(new Uint8Array(0), true)
        current = null
      } else current.file.push(value)
    },
    cancel() {
      void current?.reader.cancel()
    },
  })
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safe(name)}.zip`)}`,
      "Cache-Control": "no-store",
    },
  })
}
