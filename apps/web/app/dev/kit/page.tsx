"use client"

import { SPACES, type SpaceColor, type SpaceWall, type UiSound } from "@konkyo/config"
import { Button } from "@konkyo/ui/components/button"
import { Checkbox } from "@konkyo/ui/components/checkbox"
import {
  BrutalCard,
  Kicker,
  PaperCard,
  Slip,
  StickerPill,
  Tape,
  Wall,
} from "@konkyo/ui/components/house"
import { Input } from "@konkyo/ui/components/input"
import { Switch } from "@konkyo/ui/components/switch"
import { Tabs, TabsList, TabsTrigger } from "@konkyo/ui/components/tabs"
import { useState } from "react"
import { BrandLockup } from "@/components/brand-mark"
import { interfaceSoundsOn, setInterfaceSounds, sound } from "@/lib/sounds"
import { CheckIcon, CircleDashedIcon, CircleHelpIcon, HalfIcon, XIcon } from "./icons"

/**
 * The design kit: every token, house object, wall and sound on one page,
 * so the system can be checked in one look. Development only.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") return null
  return <Kit />
}

const STATES = [
  {
    key: "verified",
    label: "verified",
    Icon: CheckIcon,
    dark: "text-verified",
    ink: "text-verified-ink",
  },
  { key: "partly", label: "partly", Icon: HalfIcon, dark: "text-partly", ink: "text-partly-ink" },
  {
    key: "contradicts",
    label: "contradicts",
    Icon: XIcon,
    dark: "text-contradicts",
    ink: "text-contradicts-ink",
  },
  {
    key: "not-found",
    label: "not found",
    Icon: CircleHelpIcon,
    dark: "text-not-found",
    ink: "text-not-found-ink",
  },
  {
    key: "checking",
    label: "checking",
    Icon: CircleDashedIcon,
    dark: "text-butter",
    ink: "text-partly-ink",
  },
] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 border-t border-room-line py-10">
      <h2 className="font-display text-title-sm font-extrabold">{title}</h2>
      {children}
    </section>
  )
}

function Kit() {
  const [on, setOn] = useState(interfaceSoundsOn())
  const [replay, setReplay] = useState(0)
  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      <header className="flex items-center justify-between py-8">
        <BrandLockup />
        <StickerPill tilt={-1.6}>design kit · dev only</StickerPill>
      </header>

      <Kicker>a library that checks itself, together.</Kicker>
      <h1 className="mt-3 font-display text-hero font-extrabold lowercase">
        your sources.
        <br />
        your questions.
        <br />
        <span className="text-pink-text">your grounds.</span>
      </h1>

      <Section title="colours">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {(Object.keys(SPACES.colors) as SpaceColor[]).map((c) => (
            <div key={c} className="rounded-card p-4" style={{ background: SPACES.colors[c].hex }}>
              <p
                className="font-display text-xl font-extrabold"
                style={{
                  color: c === "orange" || c === "teal" || c === "butter" ? "#111114" : "#fff",
                }}
              >
                {c}
              </p>
              <p
                className="mt-6 text-meta"
                style={{
                  color: c === "orange" || c === "teal" || c === "butter" ? "#111114" : "#fff",
                }}
              >
                {SPACES.colors[c].hex}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-ui">
          <span className="rounded-full bg-lime px-3 py-1 font-bold text-ink">lime · the pop</span>
          <span className="rounded-full bg-sticker px-3 py-1">sticker</span>
          <span className="rounded-full bg-rail px-3 py-1">rail</span>
          <span className="rounded-full bg-paper-card px-3 py-1 text-ink">paper</span>
          <span className="rounded-full bg-mat px-3 py-1 text-ink">kraft</span>
          <span className="text-room-muted">muted text</span>
          <span className="text-room-soft">soft text</span>
        </div>
      </Section>

      <Section title="buttons and pills">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => sound("place")}>enter →</Button>
          <Button variant="sticker" onClick={() => sound("tap")}>
            + add
          </Button>
          <Button variant="white" size="lg" onClick={() => sound("tap")}>
            step into the library ↗
          </Button>
          <Button variant="outline">outline</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="destructive">move to trash</Button>
          <Button variant="link">a link</Button>
          <StickerPill>
            this space knows <span className="rounded-full bg-lime px-1.5 text-ink">14</span>
          </StickerPill>
          <StickerPill tilt={2}>ziggy said it</StickerPill>
          <button type="button" className="sticker-cta" onClick={() => sound("tap")}>
            come on in ↗
          </button>
          <button type="button" className="lime-pill" onClick={() => sound("promote")}>
            pin to space
          </button>
        </div>
      </Section>

      <Section title="evidence states">
        <div className="flex flex-wrap gap-2">
          {STATES.map(({ key, label, Icon, dark }) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-full bg-sticker px-3 py-1.5 text-ui font-semibold ${dark}`}
            >
              <Icon /> {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 rounded-card bg-paper-card p-4">
          {STATES.map(({ key, label, Icon, ink }) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-ui font-semibold ${ink}`}
            >
              <Icon /> {label}
            </span>
          ))}
          <p className="w-full text-reading text-ink">
            The study found that{" "}
            <mark className="bg-highlight text-ink">sleep spindles predicted consolidation</mark> in
            older adults.
          </p>
        </div>
      </Section>

      <Section title="walls">
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(SPACES.walls) as SpaceWall[]).map((w, i) => {
            const color = (Object.keys(SPACES.colors) as SpaceColor[])[i % 6] ?? "violet"
            return (
              <Wall key={w} color={color} wall={w} className="relative min-h-56 rounded-card p-5">
                <p className="text-kicker" style={{ color: "var(--wall-muted)" }}>
                  ongoing · {w} wall
                </p>
                <h3
                  className="font-display text-title-sm font-extrabold lowercase"
                  style={{ color: "var(--wall-ink)" }}
                >
                  sleep and memory
                </h3>
                <div className="mt-4 flex gap-4">
                  <PaperCard id={`${w}-a`} className="relative w-36 p-3">
                    <Tape className="-top-2 left-8" />
                    <div className="aspect-[3/4] rounded-md bg-mat/50" />
                    <p className="mt-2 text-meta font-semibold">Mander et al. 2013</p>
                  </PaperCard>
                  <PaperCard id={`${w}-b`} className="w-44 p-3">
                    <p className="text-kicker" style={{ color: "var(--space-accent)" }}>
                      pinned answer
                    </p>
                    <p className="mt-1 text-snippet">
                      Spindles predict how much is kept overnight.
                    </p>
                  </PaperCard>
                </div>
              </Wall>
            )
          })}
        </div>
      </Section>

      <Section title="slips and knows cards">
        <div className="flex flex-wrap items-start gap-8 rounded-card bg-[#bfe9dc] p-8">
          <Slip tab="the space knows" className="max-w-xs">
            <p className="font-display text-2xl font-extrabold">spindles, not total sleep</p>
            <p className="mt-2 text-meta text-ink-muted">from Mander 2013, p. 4</p>
          </Slip>
          <Slip tab="can't find that" tone="cant" className="max-w-xs">
            <p className="font-display text-2xl font-extrabold">not in this space yet</p>
          </Slip>
          <BrutalCard className="w-64">
            <p className="text-kicker text-ink-muted">where your sources agree</p>
            <p className="mt-2 font-display text-2xl leading-tight font-extrabold">
              sleep helps memory
            </p>
            <p className="mt-2 text-meta">
              said in <b>3</b> sources
            </p>
          </BrutalCard>
        </div>
      </Section>

      <Section title="fields and controls">
        <div className="grid max-w-xl gap-4">
          <Input placeholder="your name" defaultValue="wren" />
          <Tabs defaultValue="exam">
            <TabsList>
              <TabsTrigger value="exam">exam prep</TabsTrigger>
              <TabsTrigger value="essay">essay or IA</TabsTrigger>
              <TabsTrigger value="review">literature review</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-3 text-ui">
            <Switch
              aria-label="interface sounds"
              checked={on}
              onCheckedChange={(v) => {
                setOn(v)
                setInterfaceSounds(v)
              }}
            />{" "}
            interface sounds
          </div>
          <div className="flex items-center gap-3 text-ui">
            <Checkbox defaultChecked aria-label="import without asking" /> import without asking
          </div>
        </div>
      </Section>

      <Section title="sounds">
        <div className="flex flex-wrap gap-3">
          {(["tap", "place", "check", "promote"] as UiSound[]).map((s) => (
            <Button key={s} variant="sticker" onClick={() => sound(s)}>
              ▶ {s}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="motion">
        <Button variant="sticker" onClick={() => setReplay((n) => n + 1)}>
          replay
        </Button>
        <div key={replay} className="flex flex-wrap items-end gap-6">
          <span className="sticker-pill animate-pill-in">pill-in</span>
          <PaperCard id="m1" className="animate-card-land p-4">
            card-land
          </PaperCard>
          <PaperCard id="m2" className="animate-widget-added p-4">
            widget-added
          </PaperCard>
          <span className="animate-slip-in rounded-full bg-lime px-3 py-1 font-bold text-ink">
            slip-in
          </span>
          <span className="inline-flex items-center gap-2 text-ui">
            <span className="size-2.5 animate-blink rounded-full bg-lime" /> listening
          </span>
          <span className="rounded-full bg-sticker px-3 py-1 animate-lime-pulse">live</span>
          <span className="font-display text-3xl font-extrabold">
            {"say what you want".split(" ").map((w, i) => (
              <span
                key={w}
                className="mr-2 inline-block animate-word-in"
                style={{ animationDelay: `${i * 160}ms` }}
              >
                {w}
              </span>
            ))}
            <span
              className="inline-block animate-word-in text-lime"
              style={{ animationDelay: "640ms" }}
            >
              sources
            </span>
          </span>
        </div>
      </Section>
    </main>
  )
}
