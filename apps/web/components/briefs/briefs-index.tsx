"use client"

import { LIME, SPACES } from "@konkyo/config"
import { colorFor } from "@konkyo/ui/lib/space"
import { PlayIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { CSSProperties } from "react"
import { RoomHeader } from "@/components/page-shell"
import { api } from "@/lib/fetcher"
import { clock } from "@/lib/format"
import { useQuery } from "@/lib/use-query"

type BriefRow = {
  id: string
  title: string
  status: "making" | "ready" | "failed"
  durationSeconds: number | null
  createdAt: string
  spaceId: string | null
  spaceName: string | null
  spaceColor: keyof typeof SPACES.colors | null
}

const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" })

/**
 * The briefs index (gap #3): every brief as a radio card in its space's colour, newest first,
 * with the ones still being made saying so. A brief is made from a space's add menu.
 */
export function BriefsIndex() {
  const { data, isPending } = useQuery({
    queryKey: ["briefs"],
    queryFn: () => api<{ briefs: BriefRow[] }>("/api/briefs").then((r) => r.briefs),
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === "making") ? 3_000 : false),
  })
  const count = data?.length ?? 0
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 pb-32 md:px-8 md:pt-[92px]">
      <RoomHeader
        title="briefs"
        kicker={
          <>
            <b>{count}</b> audio brief{count === 1 ? "" : "s"} · two hosts, every line cited
          </>
        }
      />
      {isPending ? (
        <div className="briefs-grid" aria-busy>
          {Array.from({ length: 3 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
            <div key={i} className="brief-card animate-pulse" />
          ))}
        </div>
      ) : !count ? (
        <p className="public-note">
          No briefs yet. Open a space, press + add, and choose “audio brief”: two hosts talk through
          its sources in a few minutes, and every fact they say is cited.
        </p>
      ) : (
        <ul className="briefs-grid">
          {data?.map((b) => {
            // a space without a chosen colour has the one the rest of the app hashes from its id
            const color = b.spaceId ? SPACES.colors[b.spaceColor ?? colorFor(b.spaceId)].hex : LIME
            return (
              <li key={b.id}>
                <Link
                  href={`/briefs/${b.id}` as Route}
                  className="brief-card"
                  style={{ "--brief": color } as CSSProperties}
                >
                  <span className="brief-card-play" aria-hidden>
                    <PlayIcon className="size-5 translate-x-px fill-current" />
                  </span>
                  <strong>{b.title}</strong>
                  <small>
                    {b.status === "making"
                      ? "being made…"
                      : b.status === "failed"
                        ? "couldn't be made"
                        : b.durationSeconds
                          ? clock(b.durationSeconds)
                          : "ready"}{" "}
                    · {day.format(new Date(b.createdAt)).toLowerCase()}
                  </small>
                  {b.spaceName && (
                    <span className="brief-card-space">
                      <i aria-hidden /> {b.spaceName.toLowerCase()}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
