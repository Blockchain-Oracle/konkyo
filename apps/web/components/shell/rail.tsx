"use client"

import { SPACES } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type CSSProperties, useMemo } from "react"
import { sound } from "@/lib/sounds"
import { useFolders } from "@/lib/use-folders"
import { type SpaceRow, useSpaceList } from "@/lib/use-spaces"
import { BrandMark } from "../brand-mark"
import { AccountMenu, type ShellUser } from "./account-menu"
import { openNewFolder } from "./app-dialogs"

/** The space a page belongs to: the top of the folder it shows (`/library/folders/:id`). */
export function useCurrentSpaceId() {
  const pathname = usePathname()
  const { data } = useFolders()
  return useMemo(() => {
    const match = /^\/library\/folders\/([^/]+)/.exec(pathname)
    if (!match) return null
    const byId = new Map((data ?? []).map((f) => [f.id, f]))
    let folder = byId.get(match[1] ?? "")
    while (folder?.parentId) folder = byId.get(folder.parentId)
    return folder?.id ?? match[1] ?? null
  }, [pathname, data])
}

/** Kept for callers that only need the list of spaces. */
export function useSpaces() {
  return useSpaceList().data ?? []
}

const spaceHref = (id: string) => `/library/folders/${id}` as Route

/** One space on the rail: its cover photo (a real page one) or its colour and glyph. */
function SpaceLink({ space, active, index }: { space: SpaceRow; active: boolean; index: number }) {
  const hex = SPACES.colors[space.color].hex
  return (
    <div className="space-link-wrap" style={{ "--i": index } as CSSProperties}>
      <Link
        href={spaceHref(space.id)}
        onClick={() => sound("tap")}
        className={`space-link ${active ? "is-active" : ""} ${space.cover ? "has-photo" : ""}`}
        style={
          {
            backgroundColor: hex,
            backgroundImage: space.cover ? `url('${space.cover}')` : undefined,
            color: readableInk(hex),
            "--space-accent": hex,
          } as CSSProperties
        }
        aria-label={space.name}
        aria-current={active ? "page" : undefined}
      >
        {!space.cover && <span>{`${space.symbol}︎`}</span>}
      </Link>
      <span className="space-tooltip">
        {space.name.toLowerCase()} · {space.sources} source{space.sources === 1 ? "" : "s"}
      </span>
    </div>
  )
}

/**
 * The rail: OurSpaces' Rail, ported (markup and CSS in house.css). The mark goes home; your spaces
 * are sticker tiles with their cover photos, tilted like they were stuck on; the dashed + makes a
 * new space; your face opens your account. Nothing else lives here, as in OurSpaces.
 */
export function Rail({ user }: { user: ShellUser }) {
  const spaces = useSpaces()
  const current = useCurrentSpaceId()

  return (
    <aside className="space-rail" aria-label="Your spaces">
      <Link
        className="rail-brand"
        href="/home"
        aria-label="Konkyo home"
        title="home"
        onClick={() => sound("tap")}
      >
        <BrandMark small className="size-8" />
      </Link>

      <div className="space-list">
        {spaces.map((space, i) => (
          <SpaceLink key={space.id} space={space} active={current === space.id} index={i} />
        ))}
        <div className="space-link-wrap" style={{ "--i": spaces.length } as CSSProperties}>
          <button
            type="button"
            className="create-space-button"
            onClick={() => {
              sound("tap")
              openNewFolder(null)
            }}
            aria-label="Make a space"
          >
            <span>+</span>
          </button>
          <span className="space-tooltip">make a space</span>
        </div>
      </div>

      <div className="rail-you-wrap">
        <AccountMenu user={user} />
      </div>
    </aside>
  )
}
