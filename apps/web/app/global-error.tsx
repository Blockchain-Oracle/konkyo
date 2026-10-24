"use client"

import "@konkyo/ui/globals.css"

/**
 * When the root layout itself fails, this replaces the whole document, so it carries its own
 * <html> and <body>, and nothing that could fail the same way.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="grid min-h-svh place-items-center bg-void px-6 font-sans text-bone-white">
        <main className="w-full max-w-[30rem]">
          <p className="text-micro text-saffron-spark uppercase">Something went wrong</p>
          <h1 className="mt-3 text-subheading font-normal">Konkyo didn't load</h1>
          <p className="mt-4.5 text-body font-extralight">
            Your files and work are saved. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-9 h-11 rounded-full bg-electric-iris px-6 text-ui text-bone-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
