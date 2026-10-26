import { APP, SPACES } from "@konkyo/config"
import { readableInk } from "@konkyo/ui/lib/space"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { CSSProperties } from "react"
import { BrandMark } from "@/components/brand-mark"
import { CodeLink } from "@/components/landing/code-link"
import { MadeWithExample } from "@/components/landing/made-with-example"
import { VendorLogo } from "@/components/landing/vendor-logo"
import { PARTNERS, type Partner, partnerOf } from "@/lib/made-with"

type Props = { params: Promise<{ partner: string }> }

const DOCS = APP.docs ?? "https://docs.konkyo.xyz"

// Six pages, all known at build time, each static HTML. Blocking on purpose (Next's documented
// form for a fixed set): any other name renders on request and gets a real 404 status, which a
// page streamed from inside Suspense can't (Cache Components has no `dynamicParams`).
export const instant = false
export function generateStaticParams() {
  return PARTNERS.map((p) => ({ partner: p.id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const partner = partnerOf((await params).partner)
  if (!partner) return {}
  return {
    title: `Made with ${partner.name}`,
    description: `${partner.name} in Konkyo: ${partner.role}. ${partner.intro}`,
  }
}

/** A partner's colour on black: the fill, a text shade that reads on black, and ink for the fill. */
function colors(partner: Partner) {
  const { hex, text } = SPACES.colors[partner.color]
  return { "--vendor-color": hex, "--vendor-text": text, "--vendor-ink": readableInk(hex) }
}

/**
 * A partner's made-with page, told
 * with what the partner really does in Konkyo. Each step opens the function that does it.
 */
export default async function MadeWithPage({ params }: Props) {
  const partner = partnerOf((await params).partner)
  if (!partner) notFound()
  const next = PARTNERS[(PARTNERS.indexOf(partner) + 1) % PARTNERS.length] as Partner
  return (
    <div className="about-page vendor-page" style={colors(partner) as CSSProperties}>
      <header className="about-wrap about-bar">
        {/* named by what it shows ("konkyo made with"): the mark is decorative */}
        <Link href="/" className="about-brand">
          <BrandMark small className="size-[30px]" />
          <span>{APP.name.toLowerCase()}</span>
          <small>made with</small>
        </Link>
        <Link href="/" className="about-back">
          <span aria-hidden>←</span> back to konkyo
        </Link>
      </header>
      <nav className="vendor-nav about-wrap" aria-label="Partners">
        {PARTNERS.map((p) => (
          <Link
            key={p.id}
            href={`/made-with/${p.id}`}
            className={p.id === partner.id ? "is-selected" : ""}
            aria-current={p.id === partner.id ? "page" : undefined}
            style={
              {
                "--nav-color": SPACES.colors[p.color].hex,
                "--nav-text": SPACES.colors[p.color].text,
                "--nav-ink": readableInk(SPACES.colors[p.color].hex),
              } as CSSProperties
            }
          >
            {p.name}
            <span aria-hidden>↗</span>
          </Link>
        ))}
      </nav>

      <main>
        <section className="vendor-hero about-wrap">
          <div className="vendor-hero-copy">
            <div className="vendor-identity">
              <VendorLogo vendor={partner.id} />
              <p className="vendor-credit">{partner.role}</p>
            </div>
            <h1>
              {partner.headline[0]}
              <br />
              <span>{partner.headline[1]}</span>
            </h1>
            <p className="vendor-intro">{partner.intro}</p>
            <Link href={partner.cta.href as Route} className="about-button is-lime">
              {partner.cta.label} <span aria-hidden>↗</span>
            </Link>
            <span className="vendor-hero-footnote">{partner.cta.note}</span>
          </div>
          <MadeWithExample partner={partner.id} caption={partner.example} />
        </section>

        <section className="vendor-journey about-wrap" aria-labelledby="journey-title">
          <div className="about-section-heading">
            <h2 id="journey-title">{partner.journeyTitle}</h2>
            <p>
              From one small action to what you see,
              <br />
              each step opened in the code.
            </p>
          </div>
          <ol>
            {partner.journey.map((step, i) => (
              <li key={step.title}>
                <span className="vendor-step-number">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <CodeLink partner={partner.id} code={step.code} className="vendor-code-link">
                  follow it in the code <span aria-hidden>↗</span>
                </CodeLink>
              </li>
            ))}
          </ol>
        </section>

        <section className="vendor-capabilities about-wrap" aria-labelledby="where-title">
          <div className="vendor-section-title">
            <span>{partner.name} in Konkyo</span>
            <h2 id="where-title">
              Where it <br />
              shows up.
            </h2>
            <p>
              Specific jobs in the app.
              <br />
              Each one has a place you can point to.
            </p>
          </div>
          <div>
            {partner.capabilities.map((c) => (
              <article key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <CodeLink partner={partner.id} code={c.code} className="vendor-code-link">
                  see the implementation <span aria-hidden>↗</span>
                </CodeLink>
              </article>
            ))}
          </div>
        </section>

        <section className="vendor-technical about-wrap" aria-labelledby="closer-title">
          <div className="about-section-heading">
            <h2 id="closer-title">A closer look.</h2>
            <p>
              The choices behind the behaviour.
              <br />
              Open whichever part you're curious about.
            </p>
          </div>
          {partner.technical.map((t) => (
            <details key={t.title} className="about-under-hood">
              <summary>
                {t.title}
                <span aria-hidden>+</span>
              </summary>
              <div className="about-tech">
                <p>{t.body}</p>
                <CodeLink partner={partner.id} code={t.code} className="vendor-code-link">
                  {t.code.file} <span aria-hidden>↗</span>
                </CodeLink>
              </div>
            </details>
          ))}
        </section>
      </main>

      <footer className="vendor-footer about-wrap">
        <div>
          <span>One part of Konkyo: everything you study, in one library.</span>
          <h2>Meet the rest.</h2>
        </div>
        <Link
          className="vendor-next"
          href={`/made-with/${next.id}`}
          style={
            {
              "--next-color": SPACES.colors[next.color].hex,
              "--next-ink": readableInk(SPACES.colors[next.color].hex),
            } as CSSProperties
          }
        >
          <span>up next</span>
          <strong>{next.name}</strong>
          <span aria-hidden>↗</span>
        </Link>
        <nav className="vendor-footer-links" aria-label="More">
          <Link href="/">← the konkyo story</Link>
          <a href={`${DOCS}/${partner.docs}`}>{partner.name} in the docs ↗</a>
          <Link href="/sign-in">step into the library ↗</Link>
        </nav>
      </footer>
    </div>
  )
}
