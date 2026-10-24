// Who can read and add what in a shared space (access.ts), against a real Postgres: run with
// `pnpm --filter @konkyo/db test` (loads the repo's .env). Everything it makes is deleted after.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { inArray } from "drizzle-orm"
import { canFileInto, fileAccess, folderRole, resolveReach, spaceRole } from "./access"
import { db } from "./index"
import { fileFolders, files, folders, spaceMembers, user } from "./schema"

const people = { owner: "", adder: "", reader: "", stranger: "" }
const ids = { space: "", sub: "", other: "", ownerFile: "", adderFile: "", loose: "", gone: "" }

before(async () => {
  for (const who of Object.keys(people) as (keyof typeof people)[]) {
    people[who] = `access-test-${who}-${randomUUID()}`
    await db
      .insert(user)
      .values({ id: people[who], name: who, email: `${people[who]}@check.invalid` })
  }
  const [space] = await db
    .insert(folders)
    .values({ ownerId: people.owner, name: "shared space" })
    .returning()
  const [sub] = await db
    .insert(folders)
    .values({ ownerId: people.owner, name: "chapter one", parentId: space?.id })
    .returning()
  const [other] = await db
    .insert(folders)
    .values({ ownerId: people.owner, name: "private space" })
    .returning()
  ids.space = space?.id ?? ""
  ids.sub = sub?.id ?? ""
  ids.other = other?.id ?? ""
  const file = async (ownerId: string, title: string, folderId?: string, deleted = false) => {
    const [row] = await db
      .insert(files)
      .values({
        ownerId,
        title,
        kind: "pdf",
        status: "ready",
        ...(deleted ? { deletedAt: new Date() } : {}),
      })
      .returning()
    if (folderId && row) await db.insert(fileFolders).values({ fileId: row.id, folderId })
    return row?.id ?? ""
  }
  ids.ownerFile = await file(people.owner, "owner's paper", ids.sub)
  ids.adderFile = await file(people.adder, "adder's paper", ids.space)
  ids.loose = await file(people.owner, "owner's private paper", ids.other)
  ids.gone = await file(people.owner, "trashed paper", ids.space, true)
  await db.insert(spaceMembers).values([
    { spaceId: ids.space, userId: people.adder, role: "add" },
    { spaceId: ids.space, userId: people.reader, role: "read" },
  ])
})

after(async () => {
  // Folders and files cascade with their owners.
  await db.delete(user).where(inArray(user.id, Object.values(people)))
  process.exit(0)
})

describe("roles", () => {
  it("knows the owner, each member's role, and nobody else", async () => {
    assert.equal(await spaceRole(people.owner, ids.space), "owner")
    assert.equal(await spaceRole(people.adder, ids.space), "add")
    assert.equal(await spaceRole(people.reader, ids.space), "read")
    assert.equal(await spaceRole(people.stranger, ids.space), null)
    // a subfolder carries its space's roles
    assert.equal(await folderRole(people.reader, ids.sub), "read")
    // a space nobody shared is the owner's alone
    assert.equal(await folderRole(people.adder, ids.other), null)
  })

  it("lets only the owner and adders file into the space", async () => {
    assert.equal(await canFileInto(people.owner, ids.sub), true)
    assert.equal(await canFileInto(people.adder, ids.sub), true)
    assert.equal(await canFileInto(people.reader, ids.space), false)
    assert.equal(await canFileInto(people.stranger, ids.space), false)
  })
})

describe("fileAccess", () => {
  it("opens a file filed in the space to its members, read-only", async () => {
    const seen = await fileAccess(people.reader, ids.ownerFile)
    assert.equal(seen?.own, false)
    assert.deepEqual(seen?.spaceIds, [ids.space])
    assert.equal((await fileAccess(people.owner, ids.adderFile))?.own, false)
    assert.equal((await fileAccess(people.adder, ids.adderFile))?.own, true)
  })

  it("hides files outside the space, trashed files, and everything from strangers", async () => {
    assert.equal(await fileAccess(people.adder, ids.loose), null)
    assert.equal(await fileAccess(people.reader, ids.gone), null)
    assert.equal(await fileAccess(people.stranger, ids.ownerFile), null)
  })
})

describe("resolveReach", () => {
  it("keeps today's owner-only search when nothing is scoped", async () => {
    assert.deepEqual(await resolveReach(people.owner), {
      userId: people.owner,
      fileIds: null,
      crossOwner: false,
    })
  })

  it("covers everyone's live files in the space, for the owner and for members", async () => {
    for (const who of [people.owner, people.reader, people.adder]) {
      const reach = await resolveReach(who, { folderIds: [ids.space] })
      assert.deepEqual(new Set(reach.fileIds), new Set([ids.ownerFile, ids.adderFile]), who)
      assert.equal(reach.crossOwner, true)
      assert.equal(reach.spaceId, ids.space)
    }
  })

  it("stays owner-only for a space nobody else has filed into", async () => {
    const reach = await resolveReach(people.owner, { folderIds: [ids.other] })
    assert.deepEqual(reach.fileIds, [ids.loose])
    assert.equal(reach.crossOwner, false)
  })

  it("drops what the asker can't read", async () => {
    const stranger = await resolveReach(people.stranger, {
      folderIds: [ids.space],
      fileIds: [ids.ownerFile],
    })
    assert.deepEqual(stranger.fileIds, [])
    const member = await resolveReach(people.reader, { fileIds: [ids.loose, ids.ownerFile] })
    assert.deepEqual(member.fileIds, [ids.ownerFile])
  })
})
