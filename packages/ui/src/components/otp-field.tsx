"use client"

import { OTPField as OTPPrimitive } from "@base-ui/react/otp-field"
import { cn } from "@konkyo/ui/lib/utils"
import { useId } from "react"

/**
 * A code typed one character to a box (Base UI's OTP Field): pasting fills every box, and the
 * phone offers one-time codes it received. Styled as the house's slips; `otp-slot` in house.css.
 * The first box is named by `label` (Base UI names it only through a label element); the others
 * by their position.
 */
function OTPField({
  className,
  length,
  label = "Code",
  ...props
}: OTPPrimitive.Root.Props & { length: number; label?: string }) {
  const labelId = useId()
  return (
    <>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <OTPPrimitive.Root
        data-slot="otp-field"
        length={length}
        className={cn("otp-field", className)}
        {...props}
      >
        {Array.from({ length }, (_, i) => (
          <OTPPrimitive.Input
            // biome-ignore lint/suspicious/noArrayIndexKey: one box per position, fixed count
            key={i}
            className="otp-slot"
            {...(i === 0 ? { "aria-labelledby": labelId } : { "aria-label": `Character ${i + 1}` })}
          />
        ))}
      </OTPPrimitive.Root>
    </>
  )
}

export { OTPField }
