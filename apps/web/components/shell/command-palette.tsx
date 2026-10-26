"use client"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@konkyo/ui/components/command"
import {
  BotIcon,
  DownloadCloudIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderUpIcon,
  LinkIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  PlugIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { KindIcon } from "@/components/library/kind-icon"
import { useUploads } from "@/components/library/uploads-provider"
import { api } from "@/lib/fetcher"
import { FOOTER_NAV, MAIN_NAV } from "@/lib/navigation"
import type { Person } from "@/lib/people"
import { openFile } from "@/lib/preview"
import { qk } from "@/lib/query-keys"
import { sortChats, useChats } from "@/lib/use-chats"
import { useFolders } from "@/lib/use-folders"
import { useFileActions, useFiles } from "@/lib/use-library"
import { useQuery } from "@/lib/use-query"
import { MemberFace } from "../people/member-face"
import { importable, openConnectorImport, openImport, openNewFolder } from "./app-dialogs"

const GO_TO = [...MAIN_NAV, ...FOOTER_NAV]

/** Settings sections ⌘K can jump to (their anchors on the Settings page). */
const SETTINGS: { label: string; href: Route }[] = [
  { label: "You: name, look, photo, your page", href: "/settings#you" as Route },
  { label: "Sounds and voice", href: "/settings#sounds" as Route },
  { label: "Connectors: Gmail, Drive, Notion", href: "/settings#connectors" as Route },
  { label: "Notifications and reminders", href: "/settings#notifications" as Route },
  { label: "API keys", href: "/settings#api-keys" as Route },
  { label: "Usage and limits", href: "/settings#usage" as Route },
  { label: "What Konkyo knows (memory, sources)", href: "/knows" as Route },
]
const RECENT = 5
const MATCHES = 20

/** Every word typed appears in the title, in any order ("sleep memory" finds "Memory and sleep"). */
const matches = (title: string, words: string[]) => {
  const t = title.toLowerCase()
  return words.every((w) => t.includes(w))
}

/**
 * ⌘K / Ctrl+K anywhere: find a file, space, chat or note, jump to a setting, run
 * an action, or paste a URL or DOI to import it. It opens with no animation: it's used many times a
 * day.
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const { data: files } = useFiles()
  const { data: folders } = useFolders()
  const { data: chats } = useChats()
  // Notes come from the same list Write shows (fetched only once the palette has been opened).
  const { data: notes } = useQuery({
    queryKey: ["notes"],
    queryFn: () =>
      api<{ notes: { id: string; title: string }[] }>("/api/notes").then((r) => r.notes),
    enabled: open,
  })
  // People (F55): kept accounts with a page, by handle or name, asked once typing settles.
  const who = useDeferredValue(search.trim().replace(/^@/, ""))
  const { data: people } = useQuery({
    queryKey: qk.people.search(who),
    queryFn: () =>
      api<{ people: Person[] }>(`/api/people?q=${encodeURIComponent(who)}`).then((r) => r.people),
    enabled: open && who.length >= 2,
    staleTime: 30_000,
  })
  const { importUrl } = useFileActions()
  const { pickFiles, pickFolder } = useUploads()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const pasted = importable(search)
  const fileHits = useMemo(() => {
    const ready = (files ?? []).filter((f) => f.status === "ready")
    return words.length
      ? ready.filter((f) => matches(f.title, words)).slice(0, MATCHES)
      : ready.slice(0, RECENT)
  }, [files, words])
  const folderHits = useMemo(
    () => (words.length ? (folders ?? []).filter((f) => matches(f.name, words)).slice(0, 8) : []),
    [folders, words],
  )
  const chatHits = useMemo(() => {
    const all = sortChats(chats ?? [])
    return words.length ? all.filter((c) => matches(c.title, words)).slice(0, 8) : all.slice(0, 3)
  }, [chats, words])
  const noteHits = useMemo(
    () =>
      words.length
        ? (notes ?? []).filter((n) => matches(n.title || "Untitled", words)).slice(0, 6)
        : [],
    [notes, words],
  )
  const say = (label: string) => !words.length || matches(label, words)

  const close = () => {
    setOpen(false)
    setSearch("")
  }
  const run = (action: () => void) => () => {
    close()
    action()
  }
  const go = (href: Route) => run(() => router.push(href))

  const actions = [
    { label: "Upload files", icon: UploadIcon, onSelect: run(() => pickFiles()) },
    { label: "Upload a folder", icon: FolderUpIcon, onSelect: run(() => pickFolder()) },
    { label: "New space", icon: FolderPlusIcon, onSelect: run(() => openNewFolder(null)) },
    { label: "New note", icon: NotebookPenIcon, onSelect: go("/write" as Route) },
    { label: "New agent", icon: BotIcon, onSelect: go("/agents?new=1" as Route) },
    { label: "Import by URL", icon: LinkIcon, onSelect: run(() => openImport()) },
    {
      label: "Import from Gmail, Drive or Notion",
      icon: PlugIcon,
      onSelect: run(() => openConnectorImport()),
    },
  ].filter((a) => say(a.label))

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      title="Search and go"
      description="Find a file, space, chat, note or person, run an action, or paste a link to import"
    >
      {/* Our own filtering: a big library must not render thousands of hidden rows. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search files, spaces, chats, notes… or paste a link or DOI"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          {pasted && (
            <CommandGroup heading="Import">
              <CommandItem
                value={`import:${pasted.url}`}
                onSelect={run(() =>
                  importUrl.mutate(
                    { url: pasted.url },
                    { onSuccess: () => toast.success("Importing. It'll be ready in a moment.") },
                  ),
                )}
              >
                <DownloadCloudIcon strokeWidth={1.5} />
                <span className="truncate">Import {pasted.label}</span>
              </CommandItem>
            </CommandGroup>
          )}
          {!pasted && fileHits.length > 0 && (
            <CommandGroup heading={words.length ? "Files" : "Recent files"}>
              {fileHits.map((file) => (
                <CommandItem
                  key={file.id}
                  value={`file:${file.id}`}
                  onSelect={run(() => openFile(file, (href) => router.push(href as Route)))}
                >
                  <KindIcon kind={file.kind} className="shrink-0" />
                  <span className="truncate">{file.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && folderHits.length > 0 && (
            <CommandGroup heading="Spaces and folders">
              {folderHits.map((folder) => (
                <CommandItem
                  key={folder.id}
                  value={`folder:${folder.id}`}
                  onSelect={go(`/library/folders/${folder.id}` as Route)}
                >
                  <FolderIcon strokeWidth={1.5} />
                  <span className="truncate">{folder.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && chatHits.length > 0 && (
            <CommandGroup heading={words.length ? "Chats" : "Recent chats"}>
              {chatHits.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={`chat:${chat.id}`}
                  onSelect={go(`/chats/${chat.id}` as Route)}
                >
                  <MessageSquareIcon strokeWidth={1.5} />
                  <span className="truncate">{chat.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && words.length > 0 && (people?.length ?? 0) > 0 && (
            <CommandGroup heading="People">
              {people?.map((person) => (
                <CommandItem
                  key={person.handle}
                  value={`person:${person.handle}`}
                  onSelect={go(`/u/${person.handle}` as Route)}
                >
                  <MemberFace face={person.face} size="xs" />
                  <span className="truncate">{person.name}</span>
                  <span className="ml-auto text-snippet text-muted-foreground">
                    @{person.handle}
                    {person.relation.friends
                      ? " · friends"
                      : person.relation.following
                        ? " · following"
                        : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && noteHits.length > 0 && (
            <CommandGroup heading="Notes">
              {noteHits.map((note) => (
                <CommandItem
                  key={note.id}
                  value={`note:${note.id}`}
                  onSelect={go(`/write/${note.id}` as Route)}
                >
                  <FileTextIcon strokeWidth={1.5} />
                  <span className="truncate">{note.title || "Untitled"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && words.length > 0 && SETTINGS.some((item) => say(item.label)) && (
            <CommandGroup heading="Settings">
              {SETTINGS.filter((item) => say(item.label)).map((item) => (
                <CommandItem
                  key={item.href}
                  value={`settings:${item.href}`}
                  onSelect={go(item.href)}
                >
                  <SettingsIcon strokeWidth={1.5} />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && actions.length > 0 && (
            <CommandGroup heading="Actions">
              {actions.map((action) => (
                <CommandItem
                  key={action.label}
                  value={`action:${action.label}`}
                  onSelect={action.onSelect}
                >
                  <action.icon strokeWidth={1.5} />
                  {action.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!pasted && GO_TO.some((item) => say(item.label)) && (
            <CommandGroup heading="Go to">
              {GO_TO.filter((item) => say(item.label)).map((item) => (
                <CommandItem key={item.href} value={`go:${item.href}`} onSelect={go(item.href)}>
                  <item.icon strokeWidth={1.5} />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
