/**
 * Every model call Konkyo makes goes through here: Nemotron on NVIDIA's API (or a self-hosted
 * NIM with the same ids), a rate limit per model in each process, and the tape for sample mode.
 */
export { type EmbedAs, embed, embeddingKey } from "./embed"
export { isBusy, markBusy, ordered } from "./health"
export { limiterFor } from "./limiter"
export {
  baseURL,
  ModelBusyError,
  ModelTimeoutError,
  model,
  noFallback,
  nvidia,
  OutOfCreditError,
  reasoning,
} from "./provider"
