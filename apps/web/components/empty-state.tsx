/**
 * What appears here, how it gets filled, and the action that fills it: a slip of
 * paper with a black tag, so it reads on a wall or a sheet alike (words never sit on the wall).
 */
export function EmptyState({
  label,
  title,
  description,
  children,
}: {
  label: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="empty-slip">
      <span className="empty-slip-tag">{label.toLowerCase()}</span>
      <h2>{title.toLowerCase()}</h2>
      <p>{description}</p>
      {children && <div className="empty-slip-actions">{children}</div>}
    </div>
  )
}
