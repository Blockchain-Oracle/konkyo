import { cn } from "@konkyo/ui/lib/utils"
import { ChevronDownIcon } from "lucide-react"
import type * as React from "react"

/**
 * The one select (gap #25): the browser's own (the phone's picker on a phone), styled on the
 * theme's tokens so it reads on paper and on black alike, with a chevron.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("native-select", className)}>
      <select data-slot="native-select" {...props} />
      <ChevronDownIcon aria-hidden className="native-select-chevron" strokeWidth={2.25} />
    </span>
  )
}

export { NativeSelect }
