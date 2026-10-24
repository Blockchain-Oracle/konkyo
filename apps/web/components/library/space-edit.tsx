"use client"

import { SPACES, type SpaceColor, type SpaceWall } from "@konkyo/config"
import { Popover, PopoverContent, PopoverTrigger } from "@konkyo/ui/components/popover"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import { qk } from "@/lib/query-keys"
import { sound } from "@/lib/sounds"
import type { SpaceRow } from "@/lib/use-spaces"

type Edit = Partial<{ name: string; color: SpaceColor; wall: SpaceWall; symbol: string }>

/**
 * The room's "✎ edit" (OurSpaces' space-edit-button under the name): its name, colour, wall and
 * symbol, each saved as it's picked so the wall repaints under you. Rows reuse the space maker's.
 */
export function SpaceEdit({ space }: { space: SpaceRow }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(space.name)
  const save = useMutation({
    mutationFn: (edit: Edit) => api(`/api/spaces/${space.id}`, { method: "PATCH", json: edit }),
    // The rail, the wall and the header all read the spaces list: patch it at once, then settle.
    onMutate: async (edit) => {
      await queryClient.cancelQueries({ queryKey: qk.spaces.list() })
      const previous = queryClient.getQueryData<SpaceRow[]>(qk.spaces.list())
      queryClient.setQueryData<SpaceRow[]>(qk.spaces.list(), (rows) =>
        rows?.map((row) => (row.id === space.id ? { ...row, ...edit } : row)),
      )
      return { previous }
    },
    onError: (error: Error, _edit, context) => {
      queryClient.setQueryData(qk.spaces.list(), context?.previous)
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces.list() })
      void queryClient.invalidateQueries({ queryKey: ["folders"] })
    },
  })
  const pick = (edit: Edit) => {
    sound("tap")
    save.mutate(edit)
  }
  const saveName = () => {
    const next = name.trim()
    if (next && next !== space.name) save.mutate({ name: next })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className="space-edit-button" aria-label={`Edit ${space.name}`} />
        }
      >
        <span className="space-edit-mark" aria-hidden="true">
          ✎
        </span>
        <span className="space-edit-label">edit</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="space-maker w-[min(440px,calc(100vw-24px))] rounded-[20px] border-0 bg-rail p-5"
      >
        <label className="block">
          <span className="space-maker-custom-label">name</span>
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                saveName()
              }
            }}
            className="mt-2 h-11 w-full rounded-xl border border-white/16 bg-white/6 px-3.5 font-display text-[19px] font-extrabold text-white outline-none focus-visible:border-lime"
          />
        </label>
        <div className="space-maker-custom-options mt-4 grid gap-3.5">
          <div className="space-maker-custom-row">
            <span className="space-maker-custom-label">colour</span>
            <span className="space-maker-swatches">
              {(Object.keys(SPACES.colors) as SpaceColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === space.color ? "is-picked" : ""}
                  style={{ background: SPACES.colors[c].hex }}
                  aria-label={c}
                  aria-pressed={c === space.color}
                  onClick={() => pick({ color: c })}
                />
              ))}
            </span>
          </div>
          <div className="space-maker-custom-row">
            <span className="space-maker-custom-label">wall</span>
            <span className="space-maker-swatches">
              {(Object.keys(SPACES.walls) as SpaceWall[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={w === space.wall ? "is-picked" : ""}
                  style={{ background: SPACES.walls[w].bg }}
                  aria-label={`${w} wall`}
                  aria-pressed={w === space.wall}
                  onClick={() => pick({ wall: w })}
                />
              ))}
            </span>
          </div>
          <div className="space-maker-custom-row">
            <span className="space-maker-custom-label">symbol</span>
            <span className="space-maker-marks">
              {SPACES.symbols.map((mark) => (
                <button
                  key={mark}
                  type="button"
                  className={mark === space.symbol ? "is-picked" : ""}
                  aria-pressed={mark === space.symbol}
                  onClick={() => pick({ symbol: mark })}
                >
                  {`${mark}︎`}
                </button>
              ))}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
