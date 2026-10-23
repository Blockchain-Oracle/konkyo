"use client"

import type { QuotedPassage } from "./composer-draft"
import type { Focus } from "./focus"

/** A question asked on Home, waiting for its new chat page to send it (one per chat id). */
export type PendingQuestion = {
  text: string
  quote?: QuotedPassage
  deep?: boolean
  focus?: Focus
  /** "Find sources on this topic": the deep search imports into this folder. */
  intoFolderId?: string
}

const pending = new Map<string, PendingQuestion>()

export const holdQuestion = (chatId: string, question: PendingQuestion) =>
  pending.set(chatId, question)

/** The question waiting for this chat, kept until its answer starts (a remount can't lose it). */
export const peekQuestion = (chatId: string) => pending.get(chatId)
export const releaseQuestion = (chatId: string) => pending.delete(chatId)
