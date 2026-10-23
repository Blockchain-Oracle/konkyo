import { MobileHeader } from "./page-header"

/** The standard page frame: mobile header + a centred column on the void. */
export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <MobileHeader title={title} />
      <div className="mx-auto w-full max-w-5xl px-6 pt-12 pb-24 md:pt-15">
        <h1 className="hidden text-heading-2xs font-normal md:block">{title}</h1>
        <div className="md:mt-15">{children}</div>
      </div>
    </>
  )
}
