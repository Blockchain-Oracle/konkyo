"use client"

import { Button } from "@konkyo/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@konkyo/ui/components/dialog"
import { Input } from "@konkyo/ui/components/input"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { openKeep } from "@/components/people/keep-dialog"
import { api } from "@/lib/fetcher"
import { useQuery } from "@/lib/use-query"

type Key = {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  createdAt: string
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

/**
 * Settings → API keys: keys for scripts calling POST /api/v1/ask. A key is shown once,
 * when it's made; afterwards only its first characters, to tell keys apart.
 */
export function ApiKeysSection({ guest }: { guest: boolean }) {
  const queryClient = useQueryClient()
  const { data, isError, refetch } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api<{ keys: Key[] }>("/api/keys"),
    enabled: !guest,
  })
  const [name, setName] = useState("")
  const [made, setMade] = useState<{ name: string; key: string } | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["api-keys"] })
  const create = useMutation({
    mutationFn: (keyName: string) =>
      api<{ name: string; key: string }>("/api/keys", { method: "POST", json: { name: keyName } }),
    onSuccess: (key) => {
      setMade(key)
      setName("")
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => toast.success("Revoked. That key stops working now."),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  })

  if (guest)
    return (
      <div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
        <p className="min-w-0 flex-1 text-snippet text-ash-gray">
          A key belongs to an account, not a guest session.
        </p>
        <Button
          size="sm"
          onClick={() =>
            openKeep("a key belongs to an account: keep this library, then make one.", "/settings")
          }
        >
          Keep this library
        </Button>
      </div>
    )

  return (
    <div>
      <p className="text-snippet text-pretty text-ash-gray">
        For scripts: <code className="text-silver-mist">POST /api/v1/ask</code> with{" "}
        <code className="text-silver-mist">Authorization: Bearer &lt;key&gt;</code> answers from
        your library, checked the same way, and the question lands in Chats.
      </p>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(name)
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="What it's for, like Zotero script"
          aria-label="Key name"
          className="h-9 min-w-56 flex-1 rounded-lg"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={create.isPending}>
          Make a key
        </Button>
      </form>
      {isError && !data ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-y border-border py-4">
          <p className="text-snippet text-ash-gray">Your keys didn't load.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : data.keys.length ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {data.keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ui text-bone-white">{k.name}</p>
                <p className="mt-0.5 text-snippet text-ash-gray">
                  <code>{k.prefix}…</code> · made {day(k.createdAt)} ·{" "}
                  {k.lastUsedAt ? `last used ${day(k.lastUsedAt)}` : "never used"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(k.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <NewKeyDialog made={made} onClose={() => setMade(null)} />
    </div>
  )
}

/** The key, once: copy it now; Konkyo keeps only its hash. */
function NewKeyDialog({
  made,
  onClose,
}: {
  made: { name: string; key: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!made) return
    try {
      await navigator.clipboard.writeText(made.key)
      setCopied(true)
    } catch {
      toast.error("Couldn't copy. Select the key and copy it yourself.")
    }
  }
  return (
    <Dialog
      open={Boolean(made)}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="text-subhead font-normal">Your new key</DialogTitle>
        <DialogDescription className="text-ui text-ash-gray">
          Copy it now: it won't be shown again. Anyone with it can ask your library, so keep it like
          a password and revoke it if it leaks.
        </DialogDescription>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-raised p-2 pl-3">
          <code className="min-w-0 flex-1 truncate text-snippet text-bone-white select-all">
            {made?.key}
          </code>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
