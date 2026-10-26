"use client"

import { sound } from "@/lib/sounds"
import { useSpaceList } from "@/lib/use-spaces"
import { openNewFolder } from "../shell/app-dialogs"
import { SpaceFolder } from "./space-folder"

/** Your spaces as folders on the wall, and a dashed one to make the next. */
export function SpaceShelf({ width = 280 }: { width?: number }) {
  const { data: spaces } = useSpaceList()
  if (!spaces) return null
  return (
    <section aria-label="Your spaces" className="mb-12">
      <div className="board-label">
        <span className="room-pill">
          <b>{spaces.length}</b> space{spaces.length === 1 ? "" : "s"} · tap one to fan it open
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-x-9 gap-y-6">
        {spaces.map((space, i) => (
          <SpaceFolder key={space.id} space={space} width={width} appearDelay={i * 90} />
        ))}
        <button
          type="button"
          onClick={() => {
            sound("tap")
            openNewFolder(null)
          }}
          className="board-polaroid board-object is-new mb-2"
          style={{ width: width * 0.62 }}
        >
          <span>
            <b aria-hidden>+</b>
            make a space
          </span>
        </button>
      </div>
    </section>
  )
}
