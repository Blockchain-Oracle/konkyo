import { embed, embeddingKey } from "@konkyo/models"

/** Cache key for a passage's vector: the same text with the same model is never embedded twice. */
export const embeddingHash = (text: string) => embeddingKey(text, "passage")

/** Embeds passages for the index with Nemotron (asked as passages, not queries). */
export const embedTexts = (texts: string[]) => embed(texts, "passage")
