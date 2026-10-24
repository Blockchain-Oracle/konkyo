"use client"

import { Input } from "@konkyo/ui/components/input"
import { cn } from "@konkyo/ui/lib/utils"
import { CheckIcon, SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { api } from "@/lib/fetcher"
import { useQuery } from "@/lib/use-query"

export type CitationStyle = { id: string; name: string }

/**
 * The searchable list of citation styles (plan §7.5: common ones pinned, 2,000+ from the CSL
 * repository), shared by Export and Settings.
 */
export function CitationStyleList({
  chosen,
  defaultId,
  onChoose,
}: {
  chosen: string
  /** Marked "Default" in the list. */
  defaultId?: string
  onChoose: (style: CitationStyle) => void
}) {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])
  const { data: styles, isFetching } = useQuery({
    queryKey: ["csl", debounced],
    queryFn: () =>
      api<{ styles: CitationStyle[] }>(`/api/csl?q=${encodeURIComponent(debounced)}`).then(
        (r) => r.styles,
      ),
    staleTime: 5 * 60_000,
  })
  return (
    <>
      <div className="relative mt-1">
        <SearchIcon
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ash-gray"
          strokeWidth={1.5}
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 2,000+ citation styles"
          aria-label="Search citation styles"
          className="h-10 rounded-lg pl-9"
        />
      </div>
      <div
        role="listbox"
        aria-label="Citation style"
        className={cn(
          "max-h-64 overflow-y-auto rounded-xl border border-border",
          isFetching && "opacity-70",
        )}
      >
        {(styles ?? []).map((s) => (
          <div key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={s.id === chosen}
              onClick={() => onChoose(s)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-snippet text-silver-mist hover:bg-white/5 aria-selected:text-bone-white"
            >
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.id === defaultId && <span className="text-meta text-ash-gray">Default</span>}
              {s.id === chosen && <CheckIcon className="size-3.5 text-supports" strokeWidth={2} />}
            </button>
          </div>
        ))}
        {styles && !styles.length && (
          <p className="px-3 py-3 text-snippet text-ash-gray">No style by that name.</p>
        )}
      </div>
    </>
  )
}
