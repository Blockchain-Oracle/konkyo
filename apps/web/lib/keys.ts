import type { KeyboardEvent } from "react"

/**
 * In a message box, Enter sends and Shift+Enter is a new line; never mid-IME composition (a
 * Japanese or Chinese keyboard's Enter picks a word). One rule for every multi-line composer.
 */
export const isSendKey = (event: KeyboardEvent) =>
  event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing
