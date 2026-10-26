"use client"

import { Button } from "@konkyo/ui/components/button"
import { useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MemberFace } from "@/components/people/member-face"
import type { AgentView } from "@/lib/agents"
import { api } from "@/lib/fetcher"
import type { Member } from "@/lib/members"
import { qk } from "@/lib/query-keys"
import { useQuery } from "@/lib/use-query"
import { sessionHref, useStudyActions } from "@/lib/use-study"

/*
 * The wall's side cards (plan F46): what the space is doing besides its sources. Practice made
 * from it, the agents that watch or brief it, and the people in it, each a black sticker card
 * like "listen to this space", each with its one action.
 */

function Card({
  label,
  title,
  children,
}: {
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className="surface-sticker board-sticker-card relative p-5">
      <span className="board-pin" aria-hidden />
      <p className="font-display text-[19px] font-extrabold tracking-[-0.02em] text-white">
        {title}
      </p>
      {children}
    </section>
  )
}

const scopeOf = (spaceId: string) => ({ fileIds: [], folderIds: [spaceId] })

/** Practice from this space: how much there is, what's due, and the way in. */
export function StudyCard({ spaceId, name }: { spaceId: string; name: string }) {
  const router = useRouter()
  const study = useStudyActions()
  const { data } = useQuery({
    queryKey: ["space-study", spaceId],
    queryFn: () => api<{ items: number; due: number }>(`/api/spaces/${spaceId}/study`),
  })
  const quiz = () => void study.quizMe(scopeOf(spaceId), name, (href) => router.push(href))
  return (
    <Card label="Practice" title="practise this space">
      <p className="mt-1.5 text-[13px] text-room-muted">
        {data?.items
          ? `${data.items} question${data.items === 1 ? "" : "s"} from these sources${data.due ? ` · ${data.due} due today` : ""}.`
          : "Questions from these sources, each answer key checked against its passage."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {data?.due ? (
          <Button render={<Link href={sessionHref({ mode: "review" })} />} nativeButton={false}>
            review {data.due}
          </Button>
        ) : null}
        <Button variant={data?.due ? "secondary" : "default"} onClick={quiz}>
          {data?.items ? "quiz me" : "make practice"}
        </Button>
      </div>
    </Card>
  )
}

const KIND = { watch: "watches for new papers", quiz: "quizzes you", brief: "remakes the brief" }

/** The agents scoped to this space, or the one that's most worth starting. */
export function AgentsCard({ spaceId, name }: { spaceId: string; name: string }) {
  const queryClient = useQueryClient()
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ agents: AgentView[] }>("/api/agents").then((r) => r.agents),
  })
  const here = (agents ?? []).filter((a) => a.scope.folderIds.includes(spaceId))
  const watch = async () => {
    try {
      await api("/api/agents", {
        method: "POST",
        json: {
          name: `New papers on ${name}`,
          kind: "watch",
          instructions: name,
          scope: scopeOf(spaceId),
          schedule: { every: "week", weekday: 1, hour: 9 },
        },
      })
      void queryClient.invalidateQueries({ queryKey: ["agents"] })
      toast.success(`Watching for new papers on ${name}`, {
        description: "Weekly; each one says whether it agrees with your sources.",
      })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }
  return (
    <Card label="Agents" title="agents on this space">
      {here.length ? (
        <ul className="mt-2 space-y-1.5 text-[13px] text-room-muted">
          {here.map((a) => (
            <li key={a.id}>
              <b className="text-white">{a.name}</b> · {KIND[a.kind]}
              {a.status === "paused" ? " · paused" : ` · ${a.scheduleText.toLowerCase()}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-room-muted">
          Nothing watches this space yet. A watch brings new papers to your Inbox, each placed
          against these sources.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {here.length ? (
          <Button
            variant="secondary"
            render={<Link href={"/agents" as Route} />}
            nativeButton={false}
          >
            agents →
          </Button>
        ) : (
          <Button onClick={() => void watch()}>watch for new papers</Button>
        )}
      </div>
    </Card>
  )
}

/** Who reads this space with you (a shared space): their faces, and who's newest. */
export function PeopleCard({ spaceId }: { spaceId: string }) {
  const { data } = useQuery({
    queryKey: qk.spaces.members(spaceId),
    queryFn: () => api<{ members: Member[] }>(`/api/spaces/${spaceId}/members`),
  })
  const members = data?.members ?? []
  if (members.length < 2) return null
  return (
    <Card label="People" title={`${members.length} people in here`}>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {members.slice(0, 12).map((m) => (
          <li key={m.userId} title={m.you ? `${m.name} (you)` : m.name}>
            {m.handle ? (
              <Link href={`/u/${m.handle}` as Route} aria-label={m.name}>
                <MemberFace face={m.face} size="sm" />
              </Link>
            ) : (
              <MemberFace face={m.face} size="sm" />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-room-muted">
        {members.filter((m) => m.role !== "read").length} can add sources · the rest read and ask.
      </p>
    </Card>
  )
}
