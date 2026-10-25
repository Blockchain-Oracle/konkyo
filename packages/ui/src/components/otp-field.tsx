"use client"

import { OTPField as OTPPrimitive } from "@base-ui/react/otp-field"
import { cn } from "@konkyo/ui/lib/utils"

/**
 * A code typed one character to a box (Base UI's OTP Field): pasting fills every box, and the
 * phone offers one-time codes it received. Styled as the house's slips; `otp-slot` in house.css.
 */
function OTPField({ className, length, ...props }: OTPPrimitive.Root.Props & { length: number }) {
  return (
    <OTPPrimitive.Root
      data-slot="otp-field"
      length={length}
      className={cn("otp-field", className)}
      {...props}
    >
      {Array.from({ length }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one box per position, fixed count
        <OTPPrimitive.Input key={i} className="otp-slot" aria-label={`Character ${i + 1}`} />
      ))}
    </OTPPrimitive.Root>
  )
}

export { OTPField }
