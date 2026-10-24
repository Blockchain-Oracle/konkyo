import "server-only"
import { db, schema } from "@konkyo/db"
import { readableFileSql } from "@konkyo/db/access"
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm"
import { readableFolderSql } from "./library"
import { todaySummary } from "./study"

const { files, folders, fileFolders, inboxItems, runs, userSettings } = schema

/** Where a line's chip goes: a page, or a file opened where it's read. */
export type CatchupChip = {
  label: string
  href?: string
  file?: { id: string; title: string; kind: string }
}

export type CatchupLine = {
  id: string
  /** Waiting on you (practice due, files that need you, finds to review) leads the list. */
  waiting: boolean
  text: string
  chips: CatchupChip[]
  /** The space it happened in, so the space you're in sorts first. */
  spaceId: string | null
  at: string
  /** New since you last looked: what the dock's badge counts (waiting lines stay listed). */
  fresh: boolean
}

export type Catchup = { since: string; lines: CatchupLine[]; fresh: number }

/** A first look covers the last week. */
const FIRST_LOOK_DAYS = 7
const MAX_LINES = 8
const MAX_CHIPS = 3

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Catch me up (plan F50, OurSpaces' "what moved"): what is waiting on you, then what moved since
 * you last closed it, built from rows (sources, the inbox, deep searches, practice), never a model,
 * so it opens at once and says nothing that didn't happen.
 */
export async function catchup(ownerId: string, here?: string | null): Promise<Catchup> {
  const prefs = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, ownerId),
    columns: { catchupFrom: true },
  })
  const since = prefs?.catchupFrom ?? new Date(Date.now() - FIRST_LOOK_DAYS * 86_400_000)

  const [today, stuck, landed, inbox, awaiting, answered] = await Promise.all([
    todaySummary(ownerId),
    // Files that need the person (a fix-it each), whenever they arrived.
    db
      .select({
        id: files.id,
        title: files.title,
        kind: files.kind,
        spaceId: folders.spaceId,
        at: files.updatedAt,
      })
      .from(files)
      .leftJoin(fileFolders, eq(fileFolders.fileId, files.id))
      // only folders this person can see name a space here
      .leftJoin(folders, and(eq(folders.id, fileFolders.folderId), readableFolderSql(ownerId)))
      .where(
        and(
          eq(files.ownerId, ownerId),
          eq(files.status, "needs_you"),
          ne(files.problem, "duplicate"),
          isNull(files.deletedAt),
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(20),
    // Sources that became ready since, with the space each is filed in.
    db
      .select({
        id: files.id,
        title: files.title,
        kind: files.kind,
        createdAt: files.createdAt,
        spaceId: folders.spaceId,
        spaceName: sql<
          string | null
        >`(select name from ${folders} s where s.id = ${folders.spaceId})`,
      })
      .from(files)
      .leftJoin(fileFolders, eq(fileFolders.fileId, files.id))
      .leftJoin(folders, eq(folders.id, fileFolders.folderId))
      .where(
        and(
          // mine, and what others added to spaces I'm in (catch me up says who)
          readableFileSql(ownerId, "files"),
          eq(files.status, "ready"),
          ne(files.kind, "note"),
          isNull(files.deletedAt),
          gt(files.createdAt, since),
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(60),
    db
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.ownerId, ownerId), isNull(inboxItems.dismissedAt)))
      .orderBy(desc(inboxItems.createdAt))
      .limit(40),
    db
      .select({ id: runs.id, chatId: runs.chatId, question: runs.question, at: runs.createdAt })
      .from(runs)
      .where(and(eq(runs.ownerId, ownerId), eq(runs.kind, "deep"), eq(runs.status, "awaiting")))
      .orderBy(desc(runs.createdAt))
      .limit(3),
    db
      .select({ id: runs.id, chatId: runs.chatId, question: runs.question, at: runs.finishedAt })
      .from(runs)
      .where(
        and(
          eq(runs.ownerId, ownerId),
          eq(runs.kind, "deep"),
          inArray(runs.status, ["answered", "not-found"]),
          gt(runs.finishedAt, since),
        ),
      )
      .orderBy(desc(runs.finishedAt))
      .limit(3),
  ])

  const lines: Omit<CatchupLine, "fresh">[] = []
  const now = new Date().toISOString()

  // ---------------------------------------------------------------- waiting on you
  if (today.due > 0)
    lines.push({
      id: "due",
      waiting: true,
      text: `${plural(today.due, "question")} to practise today, from ${plural(today.files, "source")}`,
      chips: [{ label: "practise", href: "/study/session?mode=review" }],
      spaceId: null,
      at: now,
    })

  const stuckFiles = [...new Map(stuck.map((f) => [f.id, f])).values()]
  if (stuckFiles.length)
    lines.push({
      // Its newest file names it, so a new problem counts as new on the badge.
      id: "needs-you",
      waiting: true,
      text: `${plural(stuckFiles.length, "file needs", "files need")} you before ${stuckFiles.length === 1 ? "it" : "they"} can be read`,
      chips: stuckFiles.slice(0, MAX_CHIPS).map((f) => ({
        label: f.title,
        href: f.spaceId ? `/spaces/${f.spaceId}` : "/library",
      })),
      spaceId: stuckFiles[0]?.spaceId ?? null,
      at: stuckFiles.reduce((a, f) => (f.at > a ? f.at : a), new Date(0)).toISOString(),
    })

  for (const run of awaiting)
    lines.push({
      id: `awaiting-${run.id}`,
      waiting: true,
      text: `Deep search on “${run.question}” found sources for you to pick`,
      chips: [{ label: "pick sources", href: `/chats/${run.chatId}` }],
      spaceId: null,
      at: run.at.toISOString(),
    })

  const finds = inbox.filter((i) => i.kind === "new-source" && !i.readAt)
  if (finds.length)
    lines.push({
      id: "finds",
      waiting: true,
      text: `Your watches found ${plural(finds.length, "new paper")}`,
      chips: [{ label: "review finds", href: "/inbox" }],
      spaceId: null,
      at: finds[0]?.createdAt.toISOString() ?? now,
    })

  // ---------------------------------------------------------------- what moved
  const bySpace = new Map<string, typeof landed>()
  for (const f of landed) {
    const key = f.spaceId ?? ""
    const group = bySpace.get(key) ?? []
    if (!group.some((g) => g.id === f.id)) group.push(f)
    bySpace.set(key, group)
  }
  for (const [spaceId, group] of bySpace) {
    const name = group[0]?.spaceName
    lines.push({
      id: `landed-${spaceId || "library"}`,
      waiting: false,
      text: `${plural(group.length, "source")} landed in ${name ? name.toLowerCase() : "your library"}`,
      chips: [
        ...group
          .slice(0, MAX_CHIPS)
          .map((f) => ({ label: f.title, file: { id: f.id, title: f.title, kind: f.kind } })),
        ...(group.length > MAX_CHIPS
          ? [{ label: "see all", href: spaceId ? `/spaces/${spaceId}` : "/library" }]
          : []),
      ],
      spaceId: spaceId || null,
      at: group[0]?.createdAt.toISOString() ?? now,
    })
  }

  for (const run of answered)
    lines.push({
      id: `answered-${run.id}`,
      waiting: false,
      text: `Deep search answered “${run.question}”`,
      chips: [{ label: "read it", href: `/chats/${run.chatId}` }],
      spaceId: null,
      at: run.at?.toISOString() ?? now,
    })

  const CHIP: Partial<Record<string, string>> = {
    brief: "listen",
    practice: "practise",
    "agent-run": "open",
    system: "open",
  }
  for (const item of inbox) {
    const label = CHIP[item.kind]
    if (!label || item.createdAt <= since) continue
    lines.push({
      id: `inbox-${item.id}`,
      waiting: false,
      text: item.title,
      chips: item.href ? [{ label, href: item.href }] : [],
      spaceId: null,
      at: item.createdAt.toISOString(),
    })
  }

  // Practice due is news once a day; everything else when it happened after you last looked.
  const newDay = since.toDateString() !== new Date().toDateString()
  const all: CatchupLine[] = lines.map((l) => ({
    ...l,
    fresh: l.id === "due" ? newDay : new Date(l.at) > since,
  }))
  const order = (l: CatchupLine) => (l.waiting ? 0 : 2) - (here && l.spaceId === here ? 1 : 0)
  all.sort((a, b) => order(a) - order(b) || b.at.localeCompare(a.at))
  const shown = all.slice(0, MAX_LINES)
  return {
    since: since.toISOString(),
    lines: shown,
    fresh: shown.filter((l) => l.fresh).length,
  }
}

/** Closing catch me up moves its start to now. */
export async function markCaughtUp(ownerId: string) {
  const at = new Date()
  await db
    .insert(userSettings)
    .values({ userId: ownerId, catchupFrom: at })
    .onConflictDoUpdate({ target: userSettings.userId, set: { catchupFrom: at } })
}
