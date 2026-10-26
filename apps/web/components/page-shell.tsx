import { cn } from "@konkyo/ui/lib/utils"

/**
 * A page is a room: a black kicker pill, the name huge and
 * lowercase in the wall's measured ink, sticker actions on the right; then the body on a sheet of
 * cream paper, where every word reads at 4.5:1 or better (tokens.css, "visibility").
 */
export function RoomHeader({
  title,
  kicker,
  actions,
  handles,
}: {
  title: string
  kicker?: React.ReactNode
  actions?: React.ReactNode
  /** Small chips under the name, in the wall's ink. */
  handles?: React.ReactNode
}) {
  return (
    <header className="room-header">
      <div className="space-title-block">
        {kicker ? <span className="room-pill">{kicker}</span> : null}
        <div className="space-title-row">
          <h1>
            <span className="space-title-text">{title}</span>
          </h1>
        </div>
        {handles ? <div className="flex flex-wrap items-center gap-2">{handles}</div> : null}
      </div>
      {actions ? (
        <div className="space-header-side">
          <div className="header-actions">{actions}</div>
        </div>
      ) : null}
    </header>
  )
}

export function PageShell({
  title,
  kicker,
  actions,
  wide,
  bare,
  children,
}: {
  title: string
  kicker?: React.ReactNode
  actions?: React.ReactNode
  /** Wider sheet for boards and tables. */
  wide?: boolean
  /** No sheet: the page lays its own paper and stickers on the wall. */
  bare?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pt-4 pb-28 md:px-8 md:pt-[92px]",
        wide ? "max-w-[1240px]" : "max-w-[1040px]",
      )}
    >
      <RoomHeader title={title} kicker={kicker} actions={actions} />
      {bare ? children : <section className="surface-paper paper-sheet">{children}</section>}
    </div>
  )
}
