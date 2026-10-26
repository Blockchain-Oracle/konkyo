/**
 * Every model call Konkyo makes goes through here: OpenAI's API and Nemotron on NVIDIA's (or a
 * self-hosted NIM), a rate limit per model in each process, and the tape for sample mode.
 */
export { type EmbedAs, embed, embeddingKey } from "./embed"
export { inOrder, isBusy, markBusy, markOutOfCredit, outOfCredit } from "./health"
export { limiterFor } from "./limiter"
export {
  baseURL,
  ModelBusyError,
  ModelTimeoutError,
  model,
  modelTrouble,
  noFallback,
  nvidia,
  OutOfCreditError,
  openai,
  reasoning,
} from "./provider"
