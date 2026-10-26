"use client"

import { Button } from "@konkyo/ui/components/button"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { cn } from "@konkyo/ui/lib/utils"
import { api } from "@/lib/fetcher"
import type { UsageLine } from "@/lib/usage"
import { useQuery } from "@/lib/use-query"

/** The meter's state, carried by the fill colour and always said in words beside it. */
function stateOf(line: UsageLine) {
  const share = line.used / Math.max(1, line.limit)
  if (line.used >= line.limit) return "out" as const
  return share >= 0.8 ? ("near" as const) : ("ok" as const)
}

const FILL = { ok: "bg-electric-iris", near: "bg-saffron-spark", out: "bg-contradicts" }
const TRACK = { ok: "bg-electric-iris/20", near: "bg-saffron-spark/20", out: "bg-contradicts/20" }

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })

/**
 * Settings → Usage: no paywall, only fair-use allowances over the last 24 hours,
 * each a sentence, a number and a thin meter.
 */
export function UsageSection() {
  const { data, isError, refetch, isRefetching } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api<{ guest: boolean; lines: UsageLine[] }>("/api/usage"),
    refetchOnWindowFocus: true,
  })
  if (isError && !data)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
        <p className="text-snippet text-ash-gray">Your usage didn't load.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          Try again
        </Button>
      </div>
    )
  if (!data) return <Skeleton className="h-64 w-full" />
  return (
    <div>
      <p className="text-snippet text-ash-gray">
        Konkyo is free. These limits count the last 24 hours, so each use frees up a day after it.
        {data.guest && " Guest limits are lower; continue with Google for the full ones."}
      </p>
      <ul className="mt-4 divide-y divide-border border-y border-border">
        {data.lines.map((line) => {
          const state = stateOf(line)
          const share = Math.min(1, line.used / Math.max(1, line.limit))
          return (
            <li key={line.key} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[1fr_14rem]">
              <div className="min-w-0">
                <p className="text-ui text-bone-white">{line.label}</p>
                <p className="mt-0.5 text-snippet text-ash-gray">{line.about}</p>
              </div>
              <div className="self-center">
                <p className="flex items-baseline justify-between gap-3 text-snippet">
                  <span className="text-bone-white tabular-nums">
                    {line.used} <span className="text-ash-gray">of {line.limit}</span>
                  </span>
                  <span className={cn("text-ash-gray", state === "out" && "text-bone-white")}>
                    {state === "out"
                      ? line.nextFreeAt
                        ? `All used · more at ${time(line.nextFreeAt)}`
                        : "All used"
                      : `${line.limit - line.used} left`}
                  </span>
                </p>
                {/* The real meter for assistive tech; the drawn bar beside it is decoration. */}
                <meter
                  className="sr-only"
                  min={0}
                  max={line.limit}
                  value={Math.min(line.used, line.limit)}
                  aria-label={`${line.label}: ${line.used} of ${line.limit} used`}
                />
                <div
                  aria-hidden
                  className={cn("mt-2 h-1.5 overflow-hidden rounded-full", TRACK[state])}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500",
                      FILL[state],
                    )}
                    // A used allowance still shows a sliver, so an empty bar never reads as broken.
                    style={{ width: `${line.used ? Math.max(2, share * 100) : 0}%` }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
