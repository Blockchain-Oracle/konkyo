/** Runs once when the server starts (Next.js instrumentation). */
export async function register() {
  // The edge build replaces NEXT_RUNTIME and drops this branch, with its Node-only imports.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node")
}
