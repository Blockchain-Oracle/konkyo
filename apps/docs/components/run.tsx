import { CheckIcon, DatabaseIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"

/*
 * One of Konkyo's answers as the app shows it (apps/web/components/chat/run-receipt.tsx): the
 * question, the answer, then its receipt: one line saying what was checked, the agents' steps,
 * the models that ran them and the Zetaris statement. The runs in these docs are real, copied
 * from the app and from the recorded examples.
 */

export type RunStep = { label: string; detail?: string; failed?: boolean }

export function Run({
  ask,
  steps,
  checked,
  models,
  sql,
  children,
}: {
  ask: string
  steps: RunStep[]
  /** The receipt's line, e.g. "Checked 10 quotes against 3 sources in Zetaris · 19 s". */
  checked: string
  models?: string
  sql?: string
  children?: ReactNode
}) {
  return (
    <figure className="not-prose my-8 overflow-hidden rounded-[20px] border border-fd-border bg-[#fffaf7] text-[#111114]">
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <p className="ms-auto max-w-[85%] rounded-[16px] bg-lime px-4 py-2.5 text-[15px] leading-snug font-semibold text-ink shadow-[0_3px_0_#111114]">
          {ask}
        </p>
        {children ? (
          <div className="text-[15px] leading-relaxed [&_p]:my-2 [&_sup]:ms-0.5 [&_sup]:rounded-full [&_sup]:border [&_sup]:border-[#111114]/25 [&_sup]:px-1.5 [&_sup]:text-[11px]">
            {children}
          </div>
        ) : null}
        <p className="flex items-center gap-1.5 text-[13px] text-[#5d5a5c]">
          <CheckIcon className="size-3.5 text-[#0f6656]" strokeWidth={2.5} />
          {checked}
        </p>
        <div className="rounded-[16px] bg-[#111114] p-4 text-[#fffaf7] sm:p-5">
          <ol className="flex flex-col gap-1.5" aria-label="The agents' steps">
            {steps.map((step) => (
              <li key={step.label} className="flex items-start gap-2 text-[13px]">
                {step.failed ? (
                  <XIcon className="mt-0.5 size-3.5 shrink-0 text-[#ff5fb4]" strokeWidth={2.25} />
                ) : (
                  <CheckIcon
                    className="mt-0.5 size-3.5 shrink-0 text-[#4dd9b1]"
                    strokeWidth={2.25}
                  />
                )}
                <span className="text-[#d8d4d2]">
                  {step.label}
                  {step.detail ? (
                    <span className="ms-1.5 text-[#a7a4a3]">· {step.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {models ? <p className="mt-3 font-mono text-[11px] text-[#a7a4a3]">{models}</p> : null}
          {sql ? (
            <div className="mt-4">
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold">
                <DatabaseIcon className="size-3.5" /> SQL
              </p>
              <pre className="overflow-x-auto rounded-[10px] bg-black p-3 font-mono text-[11.5px] leading-[1.55] text-[#d8d4d2]">
                {sql}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </figure>
  )
}
