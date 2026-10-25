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
import { NativeSelect } from "@konkyo/ui/components/native-select"
import { Skeleton } from "@konkyo/ui/components/skeleton"
import { Spinner } from "@konkyo/ui/components/spinner"
import { HardDriveIcon, MailIcon, NotebookTextIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { openKeep } from "@/components/people/keep-dialog"
import { openConnectorImport } from "@/components/shell/app-dialogs"
import {
  type ConnectionRow,
  TOOLKIT_NAME,
  type Toolkit,
  useConnectionActions,
  useConnections,
} from "@/lib/use-connections"
import { flattenTree, useFolderTree } from "@/lib/use-folders"

const ROWS: { toolkit: Toolkit; icon: typeof MailIcon; about: string }[] = [
  {
    toolkit: "gmail",
    icon: MailIcon,
    about: "Emails and their attachments, cited like any paper. Can watch a search for new ones.",
  },
  {
    toolkit: "googledrive",
    icon: HardDriveIcon,
    about: "PDFs, Word files, slides, and Google Docs, kept current when they change.",
  },
  {
    toolkit: "notion",
    icon: NotebookTextIcon,
    about: "Pages you share with Konkyo, kept current when they change.",
  },
]

function ago(iso: string | null) {
  if (!iso) return null
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}

function statusLine(row: ConnectionRow | undefined) {
  if (!row) return null
  if (row.status === "expired") return "Access ran out. Reconnect to keep imports current."
  if (row.status === "initiated") return "Waiting for you to finish signing in."
  const parts = [
    row.label ?? "Connected",
    `${row.imported} imported`,
    row.syncedAt ? `checked ${ago(row.syncedAt)}` : null,
  ]
  return parts.filter(Boolean).join(" · ")
}

/**
 * Settings → Connectors (plan F35, F42): Gmail, Google Drive and Notion through Composio's hosted
 * sign-in. Connect opens the provider's consent screen in this tab and comes back here.
 */
export function ConnectorsSection() {
  const { data, isError, refetch, isRefetching } = useConnections()
  const { connect } = useConnectionActions()
  const [leaving, setLeaving] = useState<ConnectionRow | null>(null)
  const section = useRef<HTMLDivElement>(null)

  // Back from the consent screen (?connected=gmail): say how it went, once.
  const said = useRef(false)
  useEffect(() => {
    if (!data || said.current) return
    const params = new URLSearchParams(window.location.search)
    const toolkit = params.get("connected") as Toolkit | null
    if (!toolkit || !(toolkit in TOOLKIT_NAME)) return
    said.current = true
    const row = data.connections.find((c) => c.toolkit === toolkit)
    if (row?.status === "active") toast.success(`${TOOLKIT_NAME[toolkit]} connected`)
    else toast.error(`${TOOLKIT_NAME[toolkit]} didn't finish connecting. Try again.`)
    section.current?.scrollIntoView({ block: "start" })
    window.history.replaceState(null, "", "/settings#connectors")
  }, [data])

  if (isError && !data)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
        <p className="text-snippet text-ash-gray">Your connectors didn't load.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          Try again
        </Button>
      </div>
    )
  if (!data) return <Skeleton className="h-56 w-full" />
  if (!data.available)
    return (
      <p className="border-y border-border py-4 text-snippet text-ash-gray">
        Connectors aren't set up on this server.
      </p>
    )

  return (
    <div ref={section}>
      {data.guest ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-snippet text-ash-gray">
            Connections belong to an account, not a guest session.
          </p>
          <Button
            size="sm"
            onClick={() =>
              openKeep(
                "gmail, drive and notion connect to an account: keep this library, then connect.",
                "/settings",
              )
            }
          >
            Keep this library
          </Button>
        </div>
      ) : (
        <p className="text-snippet text-ash-gray">
          Konkyo only reads. Disconnecting revokes its access; you choose whether the imports stay.
        </p>
      )}
      <ul className="mt-4 divide-y divide-border border-y border-border">
        {ROWS.map(({ toolkit, icon: Icon, about }) => {
          const row = data.connections.find((c) => c.toolkit === toolkit)
          const name = TOOLKIT_NAME[toolkit]
          const starting = connect.isPending && connect.variables === toolkit
          return (
            <li key={toolkit} className="py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Icon className="size-5 shrink-0 text-ash-gray" strokeWidth={1.5} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-ui text-bone-white">{name}</p>
                  <p className="mt-0.5 text-snippet text-pretty text-ash-gray">
                    {statusLine(row) ?? about}
                  </p>
                </div>
                <div className="flex gap-2">
                  {row?.status === "active" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openConnectorImport({ connectionId: row.id })}
                    >
                      Import
                    </Button>
                  )}
                  {row?.status !== "active" && (
                    <Button
                      size="sm"
                      variant={row ? "default" : "secondary"}
                      disabled={data.guest || connect.isPending}
                      onClick={() => connect.mutate(toolkit)}
                    >
                      {starting && <Spinner />}
                      {row ? "Reconnect" : "Connect"}
                    </Button>
                  )}
                  {row && (
                    <Button variant="ghost" size="sm" onClick={() => setLeaving(row)}>
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
              {row?.status === "active" && toolkit === "gmail" && (
                <GmailWatch key={`${row.watchQuery}:${row.folderId}`} row={row} />
              )}
            </li>
          )
        })}
      </ul>
      <DisconnectDialog row={leaving} onClose={() => setLeaving(null)} />
    </div>
  )
}

/** A Gmail search whose new matches come in by themselves, every 15 minutes, into a folder. */
function GmailWatch({ row }: { row: ConnectionRow }) {
  const { watch } = useConnectionActions()
  const { tree } = useFolderTree()
  const folders = useMemo(() => flattenTree(tree), [tree])
  const [query, setQuery] = useState(row.watchQuery ?? "")
  const [folderId, setFolderId] = useState(row.folderId ?? "")
  const watching = Boolean(row.watchQuery)
  const changed = query.trim() !== (row.watchQuery ?? "") || folderId !== (row.folderId ?? "")
  return (
    <form
      className="mt-3 ml-9 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        watch.mutate({ id: row.id, watchQuery: query.trim() || null, folderId: folderId || null })
      }}
    >
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={300}
        placeholder="Watch a search, like from:editor@journal.org"
        aria-label="Gmail search to watch"
        className="h-9 min-w-56 flex-1 rounded-lg"
      />
      <NativeSelect
        aria-label="Folder for new matches"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
      >
        <option value="">Into the library</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {`${"  ".repeat(f.depth)}${f.name}`}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="secondary" size="sm" disabled={!changed || watch.isPending}>
        {watching && !query.trim() ? "Stop watching" : watching ? "Save" : "Watch"}
      </Button>
    </form>
  )
}

/** Disconnect: access is revoked either way; the imported files stay or go to Trash. */
function DisconnectDialog({ row, onClose }: { row: ConnectionRow | null; onClose: () => void }) {
  const { disconnect } = useConnectionActions()
  const name = row ? TOOLKIT_NAME[row.toolkit] : ""
  const run = (keepFiles: boolean) =>
    row && disconnect.mutate({ id: row.id, keepFiles }, { onSuccess: onClose })
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-subhead font-normal">Disconnect {name}?</DialogTitle>
        <DialogDescription className="text-ui text-ash-gray">
          Konkyo's access is revoked and nothing new comes in.
          {row?.imported
            ? ` The ${row.imported} ${row.imported === 1 ? "file" : "files"} imported from ${name} can stay in your library, or go to Trash.`
            : ""}
        </DialogDescription>
        <DialogFooter className="mt-2 gap-2">
          <Button variant="ghost" onClick={onClose} disabled={disconnect.isPending}>
            Cancel
          </Button>
          {row?.imported ? (
            <>
              <Button
                variant="secondary"
                disabled={disconnect.isPending}
                onClick={() => run(false)}
              >
                Move files to Trash
              </Button>
              <Button disabled={disconnect.isPending} onClick={() => run(true)}>
                Keep files
              </Button>
            </>
          ) : (
            <Button variant="destructive" disabled={disconnect.isPending} onClick={() => run(true)}>
              Disconnect
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
