import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@konkyo/ui/components/empty"

/** What appears here, how it gets filled, and the action that fills it (plan §7.6). */
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
    <Empty className="items-start justify-start rounded-none border-0 p-0 text-left text-pretty md:p-0">
      <EmptyHeader className="max-w-xl items-start gap-3 text-left">
        <p className="text-micro text-saffron-spark uppercase">{label}</p>
        <EmptyTitle className="text-heading-2xs font-normal">{title}</EmptyTitle>
        <EmptyDescription className="text-reading text-ash-gray">{description}</EmptyDescription>
      </EmptyHeader>
      {children && (
        <EmptyContent className="mt-1.5 max-w-none items-start">{children}</EmptyContent>
      )}
    </Empty>
  )
}
