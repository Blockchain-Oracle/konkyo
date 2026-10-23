"use client"

import type { CitationMatch, ClaimResult } from "@konkyo/agents"
import { Button } from "@konkyo/ui/components/button"
import { Sheet, SheetContent, SheetTitle } from "@konkyo/ui/components/sheet"
import { SidebarTrigger } from "@konkyo/ui/components/sidebar"
import { ToggleGroup, ToggleGroupItem } from "@konkyo/ui/components/toggle-group"
import { cn } from "@konkyo/ui/lib/utils"
import type { Editor } from "@tiptap/core"
import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import {
  BoldIcon,
  ChevronLeftIcon,
  CloudOffIcon,
  DownloadIcon,
  Heading2Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  PanelRightIcon,
  QuoteIcon,
  SearchIcon,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/fetcher"
import type { NoteDetail } from "@/lib/notes"
import { readBackup, useAutosave, useDraftCheck } from "@/lib/use-note"
import { CheckPanel } from "./check-panel"
import { Citation, type CitationAttrs } from "./citation-node"
import { ClaimMarks, sentenceEnd } from "./claim-marks"
import { ExportDialog, exportToGoogle, openDocToast } from "./export-dialog"
import { RecordPanel, VersionsPanel } from "./history-panels"
import { SourcesPanel } from "./sources-panel"

type Tab = "sources" | "check" | "versions" | "record"

const TABS: { id: Tab; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "check", label: "Check" },
  { id: "versions", label: "Versions" },
  { id: "record", label: "Record" },
]

const plainText = (editor: Editor) => editor.getText({ blockSeparator: "\n\n" })

function Tool({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "text-ash-gray hover:text-bone-white [&_svg]:stroke-[1.75]",
        active && "bg-white/8 text-bone-white",
      )}
    >
      {children}
    </Button>
  )
}

/**
 * A note (plan F21–F25): the writing on the left, the library on the right. Sources finds a
 * passage for what you've selected and inserts it as a citation; Check marks every claim
 * supported, partly or not found; Versions and Record keep the history of the draft.
 */
export function NoteEditor({ note }: { note: NoteDetail }) {
  const [backup] = useState(() => readBackup(note.id, note.updatedAt))
  const [title, setTitle] = useState(backup?.title ?? note.title)
  const { state: saveState, schedule } = useAutosave(note.id)
  const [tab, setTab] = useState<Tab>("sources")
  const [sheet, setSheet] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lookup, setLookup] = useState<{ text: string; nonce: number } | null>(null)
  const [activeClaim, setActiveClaim] = useState<string | null>(null)
  const [empty, setEmpty] = useState(true)
  const editorRef = useRef<Editor | null>(null)

  const showTab = useCallback((next: Tab) => {
    setTab(next)
    if (window.matchMedia("(max-width: 1023px)").matches) setSheet(true)
  }, [])

  const onCheckChange = useCallback(
    (run: Parameters<Parameters<typeof useDraftCheck>[1]>[0]) =>
      editorRef.current?.commands.setClaims(
        [...run.results.values()].map((r) => ({
          id: r.id,
          sentence: r.sentence,
          verdict: r.verdict,
        })),
      ),
    [],
  )
  const { run, start } = useDraftCheck(note.id, onCheckChange)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Citation,
      ClaimMarks.configure({
        onClick: (id) => {
          setActiveClaim(id)
          showTab("check")
        },
      }),
    ],
    content: (backup?.content as object | undefined) ?? note.content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-prose min-h-[55svh] pb-40",
        "aria-label": "Note",
        spellcheck: "true",
      },
    },
    onCreate: ({ editor }) => setEmpty(!plainText(editor).trim()),
    onUpdate: ({ editor }) => {
      const text = plainText(editor)
      setEmpty(!text.trim())
      schedule({ content: editor.getJSON(), text })
    },
  })
  editorRef.current = editor

  // Back from Google with Drive access granted: finish the Google Docs export.
  const params = useSearchParams()
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on return from Google
  useEffect(() => {
    if (params.get("export") !== "google") return
    window.history.replaceState(null, "", `/write/${note.id}`)
    exportToGoogle(note.id, params.get("style") ?? "apa")
      .then((url) => url && openDocToast(url))
      .catch((error: Error) => toast.error(error.message))
  }, [])

  // An unsaved copy from this browser goes to the server first thing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on open
  useEffect(() => {
    if (backup) schedule(backup)
  }, [])

  useEffect(() => {
    editor?.commands.setActiveClaim(activeClaim)
  }, [editor, activeClaim])

  const log = (type: "cited", data: Record<string, unknown>) =>
    void api(`/api/notes/${note.id}/events`, { method: "POST", json: { type, data } }).catch(
      () => undefined,
    )

  const insertCitation = (attrs: CitationAttrs, at?: number | null) => {
    if (!editor) return
    const pos = at ?? editor.state.selection.to
    // The same passage already cited right here (a double click): once is enough.
    const before = editor.state.doc.resolve(pos).nodeBefore
    const after = editor.state.doc.resolve(pos).nodeAfter
    if (
      [before, after].some(
        (n) => n?.type.name === "citation" && n.attrs.passageId === attrs.passageId,
      )
    )
      return
    editor.chain().focus().insertContentAt(pos, { type: "citation", attrs }).run()
    log("cited", { title: attrs.title, page: attrs.page, quote: attrs.quote, fileId: attrs.fileId })
  }

  const fromMatch = (m: CitationMatch): CitationAttrs => ({
    fileId: m.fileId,
    passageId: m.passageId,
    title: m.title,
    kind: m.kind,
    page: m.page,
    tStart: m.tStart,
    byline: m.byline ?? null,
    quote: m.quote,
  })

  const citeClaim = (r: ClaimResult) => {
    if (!editor || !r.passage || !r.quote) return
    insertCitation(
      {
        fileId: r.passage.fileId,
        passageId: r.passage.passageId,
        title: r.passage.title,
        kind: r.passage.kind,
        page: r.passage.page,
        tStart: r.passage.tStart,
        byline: r.passage.byline ?? null,
        quote: r.quote,
      },
      sentenceEnd(editor.state.doc, r.sentence),
    )
  }

  const findSource = (text: string) => {
    setLookup({ text, nonce: Date.now() })
    showTab("sources")
  }

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-3 py-2.5">
        <ToggleGroup
          value={[tab]}
          onValueChange={(v: string[]) => v[0] && setTab(v[0] as Tab)}
          aria-label="Panel"
          className="w-full"
        >
          {TABS.map((t) => (
            <ToggleGroupItem
              key={t.id}
              value={t.id}
              className="h-7 flex-1 rounded-full px-2.5 text-snippet"
            >
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "sources" && (
          <SourcesPanel
            noteId={note.id}
            request={lookup}
            onInsert={(m) => insertCitation(fromMatch(m))}
          />
        )}
        {tab === "check" && (
          <CheckPanel
            run={run}
            active={activeClaim}
            empty={empty}
            onActivate={(id) => {
              setActiveClaim(id)
              const r = run.results.get(id)
              if (editor && r) {
                const end = sentenceEnd(editor.state.doc, r.sentence)
                if (end != null) editor.commands.setTextSelection(end)
              }
            }}
            onCheck={() => editor && void start(plainText(editor))}
            onCite={citeClaim}
            onFindSource={findSource}
          />
        )}
        {tab === "versions" && (
          <VersionsPanel
            noteId={note.id}
            onRestore={(content) => {
              editor?.commands.setContent(content as object, { emitUpdate: true })
            }}
          />
        )}
        {tab === "record" && <RecordPanel noteId={note.id} />}
      </div>
    </div>
  )

  return (
    <div className="flex h-svh min-h-0 max-md:h-[calc(100svh-3.5rem)]">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-1 bg-background/95 px-3 md:px-4">
          <SidebarTrigger className="text-ash-gray md:hidden" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-snippet text-ash-gray hover:text-bone-white"
            render={<Link href="/write" />}
            nativeButton={false}
          >
            <ChevronLeftIcon strokeWidth={1.75} />
            Write
          </Button>
          <span
            className={cn(
              "ml-1 inline-flex items-center gap-1 text-meta",
              saveState === "retrying" ? "text-partly" : "text-ash-gray",
            )}
            aria-live="polite"
          >
            {saveState === "retrying" && <CloudOffIcon className="size-3.5" strokeWidth={1.5} />}
            {saveState === "saved"
              ? "Saved"
              : saveState === "saving"
                ? "Saving…"
                : "Not saved, retrying"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-snippet text-ash-gray hover:text-bone-white"
              onClick={() => setExporting(true)}
            >
              <DownloadIcon strokeWidth={1.5} />
              Export
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sources, check and history"
              className="text-ash-gray hover:text-bone-white lg:hidden"
              onClick={() => setSheet(true)}
            >
              <PanelRightIcon strokeWidth={1.5} />
            </Button>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[68ch] px-6 pt-6 md:pt-10">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              schedule({ title: e.target.value })
            }}
            maxLength={300}
            placeholder="Untitled note"
            aria-label="Title"
            className="w-full bg-transparent text-heading-2xs font-normal text-bone-white outline-none placeholder:text-ash-gray"
          />
          <div className="sticky top-12 z-10 -mx-2 mt-4 mb-6 flex flex-wrap items-center gap-0.5 bg-background/95 py-1">
            <Tool
              label="Heading"
              active={editor?.isActive("heading", { level: 2 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2Icon />
            </Tool>
            <Tool
              label="Bold"
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <BoldIcon />
            </Tool>
            <Tool
              label="Italic"
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <ItalicIcon />
            </Tool>
            <Tool
              label="List"
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <ListIcon />
            </Tool>
            <Tool
              label="Numbered list"
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrderedIcon />
            </Tool>
            <Tool
              label="Quote"
              active={editor?.isActive("blockquote")}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <QuoteIcon />
            </Tool>
            <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-snippet text-ash-gray hover:text-bone-white"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                showTab("check")
                if (editor && !run.running && !empty) void start(plainText(editor))
              }}
              disabled={empty}
            >
              Check my draft
            </Button>
          </div>
          {editor && (
            <BubbleMenu
              editor={editor}
              shouldShow={({ state }) =>
                !state.selection.empty &&
                state.doc.textBetween(state.selection.from, state.selection.to).trim().length > 3
              }
            >
              <div className="flex items-center gap-0.5 rounded-full border border-border bg-overlay p-1 shadow-lg">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-2.5 text-snippet text-silver-mist hover:text-bone-white"
                  onClick={() => {
                    const { from, to } = editor.state.selection
                    findSource(editor.state.doc.textBetween(from, to, " "))
                  }}
                >
                  <SearchIcon strokeWidth={1.5} />
                  Find a source
                </Button>
                <Tool
                  label="Bold"
                  active={editor.isActive("bold")}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                >
                  <BoldIcon />
                </Tool>
                <Tool
                  label="Italic"
                  active={editor.isActive("italic")}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                  <ItalicIcon />
                </Tool>
              </div>
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      <aside
        aria-label="Sources, check and history"
        className="hidden w-[22rem] shrink-0 border-l border-border bg-panel lg:block"
      >
        {panel}
      </aside>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md lg:hidden">
          <SheetTitle className="sr-only">Sources, check and history</SheetTitle>
          <div className="h-full pt-10">{panel}</div>
        </SheetContent>
      </Sheet>
      {exporting && (
        <ExportDialog noteId={note.id} title={title} onClose={() => setExporting(false)} />
      )}
    </div>
  )
}
