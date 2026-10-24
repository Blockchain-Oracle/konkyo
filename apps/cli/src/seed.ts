import { randomBytes, randomUUID } from "node:crypto"
import { isYouTube, STARTERS } from "@konkyo/config"
import { db, schema } from "@konkyo/db"
import { enqueue } from "@konkyo/jobs"
import { and, eq, isNull } from "drizzle-orm"

const { user, folders, files, fileFolders, folderShares } = schema

const DEMO_DESCRIPTION =
  "Three open-access papers on sleep and memory (CC BY). Ask anything: every quote in the answer is checked against the paper before you see it."

/**
 * A sample library to record examples against (plan S09): the onboarding starters' sources, all
 * openly licensed (three CC BY papers; OpenStax and MIT OpenCourseWare under CC BY-NC-SA), in
 * two folders. The worker reads them like any import. The account has no sign-in: it is for the
 * command line. The essay folder is published (plan F36) as the landing page's live demo.
 */
export async function seed(email: string) {
  let owner = await db.query.user.findFirst({ where: eq(user.email, email) })
  if (!owner) {
    ;[owner] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Konkyo samples", email, isAnonymous: false })
      .returning()
  }
  if (!owner) throw new Error("Couldn't create the sample account")
  let queued = 0
  let demoFolderId: string | undefined
  for (const pack of [STARTERS.write, STARTERS.study]) {
    let folder = await db.query.folders.findFirst({
      where: and(
        eq(folders.ownerId, owner.id),
        eq(folders.name, pack.folder),
        isNull(folders.deletedAt),
      ),
    })
    if (!folder)
      [folder] = await db
        .insert(folders)
        .values({ ownerId: owner.id, name: pack.folder })
        .returning()
    if (!folder) throw new Error(`Couldn't create ${pack.folder}`)
    if (pack === STARTERS.write) demoFolderId = folder.id
    for (const source of pack.files) {
      const have = await db.query.files.findFirst({
        where: and(
          eq(files.ownerId, owner.id),
          eq(files.sourceUrl, source.url),
          isNull(files.deletedAt),
        ),
      })
      if (have) continue
      const url = new URL(source.url)
      const [file] = await db
        .insert(files)
        .values({
          ownerId: owner.id,
          title: "title" in source ? source.title : url.hostname + url.pathname,
          kind: isYouTube(url.href) ? "youtube" : "web",
          sourceUrl: url.href,
          meta: { licence: source.licence },
          status: "queued",
          stage: "Waiting to be read",
        })
        .returning({ id: files.id })
      if (!file) continue
      await db.insert(fileFolders).values({ fileId: file.id, folderId: folder.id })
      await enqueue("ingest", { fileId: file.id }, file.id)
      queued++
    }
  }
  // The live demo: the essay folder, read-only by link, downloads off.
  let share = demoFolderId
    ? await db.query.folderShares.findFirst({ where: eq(folderShares.folderId, demoFolderId) })
    : undefined
  if (!share && demoFolderId)
    [share] = await db
      .insert(folderShares)
      .values({
        folderId: demoFolderId,
        ownerId: owner.id,
        slug: randomBytes(9).toString("base64url"),
        description: DEMO_DESCRIPTION,
      })
      .returning()
  return {
    ownerId: owner.id,
    queued,
    folders: [STARTERS.write.folder, STARTERS.study.folder],
    demoSlug: share?.slug,
  }
}
