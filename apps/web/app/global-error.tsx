"use client"

import "@konkyo/ui/globals.css"

/**
 * When the root layout itself fails, this replaces the whole document, so it carries its own
 * <html> and <body> and nothing that could fail the same way: the system page's look in plain
 * markup (its classes come with the stylesheet).
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="system-page">
          <a href="/" className="system-brand">
            konkyo
          </a>
          <div className="system-body">
            <span className="system-sticker" aria-hidden="true">
              hiccup
            </span>
            <h1>konkyo didn&apos;t load.</h1>
            <p>Your files and work are saved. Try again in a moment.</p>
            <button type="button" onClick={reset} className="claim-done system-action">
              try again <span aria-hidden="true">↻</span>
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
