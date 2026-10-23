import { warmUp } from "@konkyo/zetaris"

// Opens the Zetaris session before the first question needs it (about 15 s on a cold process).
if (!process.env.SKIP_ENV_VALIDATION) {
  void warmUp().then((ms) => console.info(`[zetaris] session ready in ${ms} ms`))
}
