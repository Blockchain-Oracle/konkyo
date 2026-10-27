/*
 * The scout: a small procedural spider that crawls a run's sources on one 2D canvas, the wait
 * on a deep search, an answer and a comparison alike.
 * Its body is the brand's outlined triangle; its eight legs are two-bone IK chains that plant
 * on the ground and step when the body leaves them behind, so it walks rather than slides.
 * Everything it does is driven by the run's real events: each source found appears as a node, the
 * scout walks to the nearest unread one and stamps its title, every screening step sends a
 * sweep across the field, the shortlist lights up and closes into a web, and in a comparison
 * each source takes the colour of where it stands (agrees, disagrees, partly).
 */

export type ScoutSource = { key: string; kind: "paper" | "web"; title: string; detail: string }

export type ScoutPhase = "plan" | "search" | "screen" | "hold" | "import"

/** Where a source stands in a comparison. */
export type ScoutTone = "agrees" | "disagrees" | "partly"

export type ScoutInput = {
  found: readonly ScoutSource[]
  phase: ScoutPhase
  /** The latest screening report: each new step sends a sweep across the field. */
  screening: { step: number; of: number; kept: number } | null
  /** Keys of the shortlist, once the Screener has chosen one. */
  shortlist: ReadonlySet<string> | null
  /** How many times the person has steered the run. */
  steers: number
  /** What the corner readout says, when the phase's own words aren't the right ones. */
  caption?: string
  /** A comparison's verdict per source, once the Analyst has one. */
  tones?: ReadonlyMap<string, ScoutTone> | null
}

export type Scout = {
  set: (input: ScoutInput) => void
  /** Back to an empty field, for a demo that plays again. */
  reset: () => void
  resize: () => void
  /** Where the pointer is over the stage (CSS pixels), or null once it leaves. */
  pointer: (x: number | null, y?: number) => void
  /** Pause the loop while the stage is off screen. */
  play: (on: boolean) => void
  destroy: () => void
}

type Node = {
  key: string
  kind: "paper" | "web"
  label: string
  /** Where it sits on the field, as a fraction of the stage, so a resize keeps the layout. */
  u: number
  v: number
  x: number
  y: number
  born: number
  /** When the scout walked to it or a sweep read it; null while still unread. */
  seen: number | null
  spin: number
}

type Leg = {
  side: number
  angle: number
  anchor: number
  reach: number
  group: number
  /** The foot, in world pixels. */
  fx: number
  fy: number
  stepping: boolean
  t: number
  dur: number
  sx: number
  sy: number
  tx: number
  ty: number
}

type Pulse = {
  x: number
  y: number
  r: number
  max: number
  speed: number
  color: string
  alpha: number
  /** A sweep reads every node it passes over. */
  hit: Set<Node> | null
}

type Edge = { a: Node; b: Node; born: number; sag: number }

type Stamp = { node: Node; born: number; width: number }

const TAU = Math.PI * 2
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const frac = (n: number) => n - Math.floor(n)
const wrap = (a: number) => {
  let r = a
  while (r > Math.PI) r -= TAU
  while (r < -Math.PI) r += TAU
  return r
}
const easeOut = (t: number) => 1 - (1 - t) ** 3
const outBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2

/** Leg angles from the heading, front pair to back pair (degrees). */
const LEG_ANGLES = [44, 80, 116, 152]
const TRAIL_LIFE = 2.2
const STAMP_LIFE = 3.6
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

export function createScout(canvas: HTMLCanvasElement): Scout | null {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const css = getComputedStyle(canvas)
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const color = {
    ground: pick("--color-sticker", "#0b0b0e"),
    lime: pick("--color-lime", "#c9ff3d"),
    paper: pick("--color-cobalt", "#3f70ff"),
    paperText: pick("--color-cobalt-text", "#7a9bff"),
    web: pick("--color-pink", "#e9369d"),
    webText: pick("--color-pink-text", "#ff5fb4"),
    soft: pick("--color-room-soft", "#dcd2d9"),
    muted: pick("--color-room-muted", "#b4a9b1"),
    ink: pick("--color-ink", "#111114"),
    // A comparison's stances, as everywhere else in the app: teal, pink, orange.
    agrees: pick("--color-verified", "#4dd9b1"),
    disagrees: pick("--color-contradicts", "#ff5fb4"),
    partly: pick("--color-partly", "#ff7c42"),
  }
  const family = css.fontFamily || "ui-monospace, monospace"
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  let w = 0
  let h = 0
  let s = 1
  let dpr = 1
  let bg: HTMLCanvasElement | null = null
  let time = 0
  let raf = 0
  let last = 0

  const order: Node[] = []
  const nodes = new Map<string, Node>()
  const edges: Edge[] = []
  const stamps: Stamp[] = []
  const pulses: Pulse[] = []
  const trail: { x: number; y: number; t: number }[] = []
  let legs: Leg[] = []
  // The shortlist's web: its nodes in a loop around their centre, drawn on once.
  let web: Node[] = []
  let webAt = 0

  let input: ScoutInput = { found: [], phase: "plan", screening: null, shortlist: null, steers: 0 }
  let seenPhase: ScoutPhase | null = null
  let seenSteps = 0
  let seenSteers = 0
  let pointerAt: { x: number; y: number; at: number } | null = null

  const spider = {
    x: 0,
    y: 0,
    heading: -0.5,
    speed: 0,
    dwell: 0,
    sonar: 0,
    trailIn: 0,
    last: null as Node | null,
  }

  const hip = (leg: Leg) => {
    const c = Math.cos(spider.heading)
    const n = Math.sin(spider.heading)
    const along = leg.anchor
    const across = leg.side * 2 * s
    return { x: spider.x + c * along - n * across, y: spider.y + n * along + c * across }
  }

  const rest = (leg: Leg) => {
    const a = spider.heading + leg.side * leg.angle
    return { x: spider.x + Math.cos(a) * leg.reach, y: spider.y + Math.sin(a) * leg.reach }
  }

  const buildLegs = () => {
    legs = []
    for (const side of [-1, 1]) {
      LEG_ANGLES.forEach((deg, i) => {
        const leg: Leg = {
          side,
          angle: (deg * Math.PI) / 180,
          anchor: (1.5 - i) * 4 * s,
          reach: (42 + (i % 2) * 5) * s,
          // Diagonal pairs step together, so there is always a leg of the other pair planted.
          group: (i + (side > 0 ? 1 : 0)) % 2,
          fx: 0,
          fy: 0,
          stepping: false,
          t: 0,
          dur: 0.2,
          sx: 0,
          sy: 0,
          tx: 0,
          ty: 0,
        }
        const r = rest(leg)
        leg.fx = r.x
        leg.fy = r.y
        legs.push(leg)
      })
    }
  }

  const layout = () => {
    for (const n of order) {
      n.x = n.u * w
      n.y = n.v * h
    }
  }

  const drawBackground = () => {
    const tile = document.createElement("canvas")
    tile.width = Math.round(w * dpr)
    tile.height = Math.round(h * dpr)
    const g = tile.getContext("2d")
    if (!g) return
    g.scale(dpr, dpr)
    g.fillStyle = color.ground
    g.fillRect(0, 0, w, h)
    // A faint dot grid, like the viewport of a node editor.
    g.fillStyle = color.soft
    g.globalAlpha = 0.07
    for (let x = 14; x < w; x += 22) for (let y = 14; y < h; y += 22) g.fillRect(x, y, 1.2, 1.2)
    bg = tile
  }

  const ping = (x: number, y: number, tint: string, max: number, alpha = 0.7) => {
    // Footfalls come thick and fast; when there are too many, the oldest goes, never a sweep.
    if (pulses.length > 80)
      pulses.splice(
        Math.max(
          0,
          pulses.findIndex((p) => !p.hit),
        ),
        1,
      )
    pulses.push({ x, y, r: 0, max, speed: max * 2.2, color: tint, alpha, hit: null })
  }

  const sweep = () => {
    const reach = Math.hypot(w, h)
    pulses.push({
      x: spider.x,
      y: spider.y,
      r: 0,
      max: reach,
      speed: reach * 0.85,
      color: color.lime,
      alpha: 0.5,
      hit: new Set(),
    })
  }

  const addNode = (f: ScoutSource) => {
    const i = order.length
    const node: Node = {
      key: f.key,
      kind: f.kind,
      label: clip(f.title, 38),
      // A low-discrepancy scatter: even across the stage, never a grid.
      u: 0.06 + frac(i * 0.618034 + 0.13) * 0.88,
      v: 0.15 + frac(i * 0.754878 + 0.31) * 0.66,
      x: 0,
      y: 0,
      born: time,
      seen: null,
      spin: (i * 47) % 360,
    }
    node.x = node.u * w
    node.y = node.v * h
    nodes.set(f.key, node)
    order.push(node)
    ping(node.x, node.y, f.kind === "paper" ? color.paperText : color.webText, 20 * s, 0.6)
  }

  const buildWeb = () => {
    const picked = input.shortlist ? order.filter((n) => input.shortlist?.has(n.key)) : []
    if (picked.length < 3) {
      web = picked
      return
    }
    const cx = picked.reduce((sum, n) => sum + n.x, 0) / picked.length
    const cy = picked.reduce((sum, n) => sum + n.y, 0) / picked.length
    web = [...picked].sort(
      (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
    )
  }

  /** Reduced motion: no loop. Every source is read, the scout sits at their middle, drawn once. */
  const settle = () => {
    for (const n of order) {
      n.seen = n.seen ?? time
      n.born = time - 1
    }
    spider.x = order.length ? order.reduce((sum, n) => sum + n.x, 0) / order.length : w / 2
    spider.y = order.length ? order.reduce((sum, n) => sum + n.y, 0) / order.length : h / 2
    stamps.length = 0
    for (const n of order.slice(-2)) stamps.push({ node: n, born: time - 1, width: 0 })
    buildLegs()
    buildWeb()
    webAt = time - 2
    draw()
  }

  const set = (next: ScoutInput) => {
    input = next
    for (const f of next.found) if (!nodes.has(f.key)) addNode(f)
    const reading = next.phase !== "plan" && next.phase !== "search"
    if (next.phase !== seenPhase) {
      if (reading && (seenPhase === "plan" || seenPhase === "search" || seenPhase === null)) sweep()
      seenPhase = next.phase
    }
    const steps = next.screening?.step ?? 0
    if (steps > seenSteps) {
      seenSteps = steps
      sweep()
    }
    if (next.steers > seenSteers) {
      seenSteers = next.steers
      ping(spider.x, spider.y, color.webText, 80 * s, 0.8)
      spider.dwell = 0.25
    }
    const had = web.length
    buildWeb()
    if (web.length && !had) webAt = time
    if (still) settle()
  }

  const reset = () => {
    order.length = 0
    nodes.clear()
    edges.length = 0
    stamps.length = 0
    pulses.length = 0
    trail.length = 0
    web = []
    webAt = 0
    input = { found: [], phase: "plan", screening: null, shortlist: null, steers: 0 }
    seenPhase = null
    seenSteps = 0
    seenSteers = 0
    spider.x = w / 2
    spider.y = h / 2
    spider.speed = 0
    spider.dwell = 0
    spider.sonar = 0
    spider.last = null
    buildLegs()
    draw()
  }

  const resize = () => {
    const bw = canvas.clientWidth
    const bh = canvas.clientHeight
    if (!bw || !bh) return
    const first = w === 0
    const fx = first ? 0.5 : spider.x / w
    const fy = first ? 0.5 : spider.y / h
    dpr = Math.min(2, window.devicePixelRatio || 1)
    w = bw
    h = bh
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    s = clamp(h / 220, 0.72, 1.1)
    spider.x = fx * w
    spider.y = fy * h
    drawBackground()
    layout()
    buildLegs()
    buildWeb()
    if (still) settle()
    else if (!raf) draw()
  }

  /** The nearest unread node, and how many are waiting. */
  const nearestUnread = () => {
    let best: Node | null = null
    let bestD = Number.POSITIVE_INFINITY
    let backlog = 0
    for (const n of order) {
      if (n.seen !== null) continue
      backlog++
      const d = (n.x - spider.x) ** 2 + (n.y - spider.y) ** 2
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return { best, backlog }
  }

  const visit = (n: Node) => {
    n.seen = time
    spider.dwell = 0.42
    if (spider.last) {
      edges.push({ a: spider.last, b: n, born: time, sag: (frac(n.u * 7.3) - 0.5) * 46 * s })
    }
    spider.last = n
    stamps.push({ node: n, born: time, width: 0 })
    if (stamps.length > 3) stamps.shift()
    ping(n.x, n.y, n.kind === "paper" ? color.paperText : color.webText, 30 * s, 0.9)
  }

  const step = (dt: number) => {
    time += dt
    const searching = input.phase === "plan" || input.phase === "search"
    const { best, backlog } = searching ? nearestUnread() : { best: null, backlog: 0 }

    let gx = w / 2
    let gy = h / 2
    let stop = 0
    let vmax = 54 * s
    if (best) {
      gx = best.x
      gy = best.y
      stop = 5 * s
      vmax = clamp(150 + backlog * 16, 150, 340) * s
    } else if (pointerAt && time - pointerAt.at < 2.5) {
      gx = pointerAt.x
      gy = pointerAt.y
      stop = 56 * s
      vmax = 130 * s
    } else {
      // Nothing to read: patrol slowly, around the shortlist once there is one.
      let cx = w / 2
      let cy = h / 2
      if (web.length) {
        cx = web.reduce((sum, n) => sum + n.x, 0) / web.length
        cy = web.reduce((sum, n) => sum + n.y, 0) / web.length
      }
      gx = clamp(cx + Math.sin(time * 0.37) * w * 0.26, 24, w - 24)
      gy = clamp(cy + Math.sin(time * 0.53 + 1.3) * h * 0.22, 24, h - 24)
    }

    const dx = gx - spider.x
    const dy = gy - spider.y
    const dist = Math.hypot(dx, dy)
    if (spider.dwell > 0) spider.dwell -= dt
    const moving = spider.dwell <= 0 && dist > stop
    const aim = Math.atan2(dy, dx)
    const off = wrap(aim - spider.heading)
    if (dist > 2) {
      const turn = (moving ? 7 : 2.5) * dt
      spider.heading += clamp(off, -turn, turn)
    }
    const want = moving ? Math.min(vmax, 40 * s + (dist - stop) * 5) : 0
    spider.speed += (want - spider.speed) * Math.min(1, dt * (want > spider.speed ? 5 : 9))
    const eff = spider.speed * (0.35 + 0.65 * Math.max(0, Math.cos(off)))
    spider.x = clamp(spider.x + Math.cos(spider.heading) * eff * dt, 8, w - 8)
    spider.y = clamp(spider.y + Math.sin(spider.heading) * eff * dt, 8, h - 8)
    if (best && dist < 9 * s) visit(best)

    // Legs: plant, and step once the body has left the foot behind.
    const vx = Math.cos(spider.heading) * eff
    const vy = Math.sin(spider.heading) * eff
    const threshold = 7 * s + eff * 0.025
    for (const leg of legs) {
      if (leg.stepping) {
        leg.t += dt / leg.dur
        if (leg.t >= 1) {
          leg.stepping = false
          leg.fx = leg.tx
          leg.fy = leg.ty
          ping(leg.fx, leg.fy, color.paperText, 9 * s, 0.5)
        } else {
          const e = easeOut(leg.t)
          leg.fx = leg.sx + (leg.tx - leg.sx) * e
          leg.fy = leg.sy + (leg.ty - leg.sy) * e
        }
        continue
      }
      const r = rest(leg)
      const away = Math.hypot(leg.fx - r.x, leg.fy - r.y)
      const h0 = hip(leg)
      const stretched = Math.hypot(leg.fx - h0.x, leg.fy - h0.y) > 53 * s
      const blocked = legs.some((o) => o.stepping && o.group !== leg.group)
      if (away > threshold && (!blocked || stretched)) {
        leg.stepping = true
        leg.t = 0
        leg.dur = clamp(0.26 - eff * 0.0006, 0.1, 0.26)
        leg.sx = leg.fx
        leg.sy = leg.fy
        // Land ahead of the rest spot, so the body has caught up by the time the foot arrives.
        leg.tx = r.x + vx * leg.dur * 0.9
        leg.ty = r.y + vy * leg.dur * 0.9
      }
    }

    // Sonar while it has nothing to read: the plan being thought through.
    spider.sonar -= dt
    if (spider.sonar <= 0 && (input.phase === "plan" || order.length === 0)) {
      spider.sonar = 1.7
      ping(spider.x, spider.y, color.lime, 96 * s, 0.28)
    }

    spider.trailIn -= dt
    if (spider.speed > 10 && spider.trailIn <= 0) {
      spider.trailIn = 0.03
      trail.push({ x: spider.x, y: spider.y, t: time })
    }
    while (trail.length && time - (trail[0]?.t ?? time) > TRAIL_LIFE) trail.shift()

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]
      if (!p) continue
      p.r += p.speed * dt
      if (p.hit) {
        for (const n of order) {
          if (p.hit.has(n) || Math.hypot(n.x - p.x, n.y - p.y) > p.r) continue
          p.hit.add(n)
          n.seen = n.seen ?? time
        }
      }
      if (p.r >= p.max) pulses.splice(i, 1)
    }
    while (stamps.length && time - (stamps[0]?.born ?? time) > STAMP_LIFE) stamps.shift()
  }

  const tri = (x: number, y: number, r: number, rot: number) => {
    ctx.beginPath()
    for (let k = 0; k < 3; k++) {
      const a = rot + (k * TAU) / 3 - Math.PI / 2
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

  const tint = (n: Node) => (n.kind === "paper" ? color.paperText : color.webText)

  const drawTrail = () => {
    ctx.lineWidth = 1.2
    ctx.strokeStyle = color.paperText
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]
      const b = trail[i]
      if (!a || !b) continue
      ctx.globalAlpha = clamp(1 - (time - b.t) / TRAIL_LIFE, 0, 1) * 0.4
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  /** Points along a sagging line from a to b, as far as `grown` (0 to 1) of it has drawn on. */
  const drawThread = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    sag: number,
    grown: number,
  ) => {
    const len = Math.hypot(bx - ax, by - ay) || 1
    const cx = (ax + bx) / 2 + (-(by - ay) / len) * sag
    const cy = (ay + by) / 2 + ((bx - ax) / len) * sag
    const n = 14
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    for (let i = 1; i <= n * grown; i++) {
      const t = i / n
      const u = 1 - t
      ctx.lineTo(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by)
    }
    ctx.stroke()
  }

  const drawThreads = () => {
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = color.soft
    for (const e of edges) {
      ctx.globalAlpha = 0.28
      drawThread(e.a.x, e.a.y, e.b.x, e.b.y, e.sag, clamp((time - e.born) / 0.5, 0, 1))
    }
    if (web.length > 2) {
      ctx.strokeStyle = color.lime
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1.2
      const grown = clamp((time - webAt) / 1.2, 0, 1) * web.length
      ctx.beginPath()
      web.forEach((n, i) => {
        if (i > grown) return
        if (i === 0) ctx.moveTo(n.x, n.y)
        else ctx.lineTo(n.x, n.y)
      })
      if (grown >= web.length) ctx.closePath()
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  const drawNodes = () => {
    const short = input.shortlist
    for (const n of order) {
      const age = time - n.born
      const pop = age < 0.4 ? outBack(age / 0.4) : 1
      const chosen = short?.has(n.key) ?? false
      const tone = input.tones?.get(n.key)
      const r = (n.seen !== null ? 5.4 : 4.4) * s * Math.max(0.01, pop)
      ctx.globalAlpha = short && !chosen ? 0.2 : 1
      tri(n.x, n.y, r, (n.spin * Math.PI) / 180)
      if (chosen || tone) {
        // Chosen sources go lime; in a comparison each takes the colour of where it stands.
        const mark = tone ? color[tone] : color.lime
        ctx.fillStyle = mark
        ctx.fill()
        ctx.strokeStyle = mark
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.arc(n.x, n.y, r + 5 + Math.sin(time * 3 + n.u * 9) * 1.2, 0, TAU)
        ctx.stroke()
      } else if (n.seen !== null) {
        ctx.fillStyle = tint(n)
        ctx.fill()
        const since = time - n.seen
        if (since < 0.7) {
          ctx.globalAlpha = (1 - since / 0.7) * 0.9
          ctx.strokeStyle = color.soft
          ctx.lineWidth = 1
          tri(n.x, n.y, r + 3 + since * 12, (n.spin * Math.PI) / 180)
          ctx.stroke()
        }
      } else {
        ctx.strokeStyle = color.muted
        ctx.globalAlpha *= 0.75
        ctx.lineWidth = 1.1
        ctx.stroke()
      }
    }
  }

  const drawPulses = () => {
    ctx.lineWidth = 1
    for (const p of pulses) {
      ctx.globalAlpha = p.alpha * (1 - p.r / p.max) ** 1.5
      ctx.strokeStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, TAU)
      ctx.stroke()
    }
  }

  const drawLeg = (leg: Leg) => {
    const hp = hip(leg)
    const dx = leg.fx - hp.x
    const dy = leg.fy - hp.y
    const d = Math.hypot(dx, dy) || 1
    const L = 27 * s
    const lift = leg.stepping ? Math.sin(Math.PI * leg.t) : 0
    const half = Math.min(d, 2 * L - 0.5) / 2
    const rise = Math.sqrt(Math.max(0, L * L - half * half)) * (1 + 0.35 * lift)
    const mx = hp.x + (dx / d) * half
    const my = hp.y + (dy / d) * half
    const px = -dy / d
    const py = dx / d
    // The knee bends away from the body.
    const outward = (kx: number, ky: number) => Math.hypot(kx - spider.x, ky - spider.y)
    const k1 = { x: mx + px * rise, y: my + py * rise }
    const k2 = { x: mx - px * rise, y: my - py * rise }
    const knee = outward(k1.x, k1.y) >= outward(k2.x, k2.y) ? k1 : k2
    const cx = 2 * knee.x - (hp.x + leg.fx) / 2
    const cy = 2 * knee.y - (hp.y + leg.fy) / 2

    ctx.globalAlpha = 0.85
    ctx.strokeStyle = color.lime
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(hp.x, hp.y)
    ctx.quadraticCurveTo(cx, cy, leg.fx, leg.fy)
    ctx.stroke()
    // Beads along the limb, like the dotted tendrils of the node editor.
    ctx.fillStyle = color.soft
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const u = 1 - t
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(
        u * u * hp.x + 2 * u * t * cx + t * t * leg.fx,
        u * u * hp.y + 2 * u * t * cy + t * t * leg.fy,
        0.9,
        0,
        TAU,
      )
      ctx.fill()
    }
    // The foot: a ring, bigger and brighter while it is in the air, aiming at where it will land.
    ctx.strokeStyle = color.paperText
    ctx.globalAlpha = 0.55 + 0.4 * lift
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(leg.fx, leg.fy, (2 + 2 * lift) * s, 0, TAU)
    ctx.stroke()
    if (leg.stepping) {
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(leg.tx, leg.ty, 3.2 * s, 0, TAU)
      ctx.stroke()
    }
  }

  const drawSpider = () => {
    for (const leg of legs) drawLeg(leg)
    // A soft glow from three stacked discs: no colour parsing, so any token format works.
    ctx.fillStyle = color.lime
    for (const [radius, alpha] of [
      [30, 0.04],
      [20, 0.06],
      [12, 0.09],
    ] as const) {
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(spider.x, spider.y, radius * s, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    const wobble = Math.sin(time * 11) * 0.05 * clamp(spider.speed / 120, 0, 1)
    tri(spider.x, spider.y, 10 * s, spider.heading + Math.PI / 2 + wobble)
    ctx.fillStyle = color.ground
    ctx.fill()
    ctx.strokeStyle = color.lime
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.fillStyle = color.lime
    ctx.beginPath()
    ctx.arc(spider.x, spider.y, 1.5 * s, 0, TAU)
    ctx.fill()
  }

  const drawStamps = () => {
    ctx.font = `500 10px ${family}`
    ctx.textBaseline = "middle"
    const newest = stamps[stamps.length - 1]
    for (const st of stamps) {
      const age = time - st.born
      const fade = clamp(age / 0.12, 0, 1) * (1 - clamp((age - (STAMP_LIFE - 1.2)) / 1.2, 0, 1))
      if (fade <= 0) continue
      if (!st.width) st.width = ctx.measureText(st.node.label).width
      const bw = st.width + 10
      const bh = 15
      const right = st.node.x + 10 + bw < w - 4
      const bx = right ? st.node.x + 10 : st.node.x - 10 - bw
      const by = st.node.y - bh - 6 < 4 ? st.node.y + 8 : st.node.y - bh - 6
      const grow = outBack(clamp(age / 0.24, 0, 1))
      const isNew = st === newest
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(st.node.x, st.node.y)
      ctx.scale(grow, grow)
      ctx.translate(-st.node.x, -st.node.y)
      ctx.fillStyle = isNew ? color.lime : st.node.kind === "paper" ? color.paper : color.web
      ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = isNew ? color.ink : "#fff"
      ctx.fillText(st.node.label, bx + 5, by + bh / 2 + 0.5)
      ctx.restore()
    }
  }

  const drawReadout = () => {
    const read = order.filter((n) => n.seen !== null).length
    const kept = input.shortlist?.size ?? 0
    const sc = input.screening
    const text =
      input.caption ??
      (input.phase === "plan"
        ? "planning the search"
        : input.phase === "search"
          ? `crawling ${read}/${order.length}`
          : input.phase === "screen"
            ? sc
              ? `screening ${sc.step}/${sc.of} · kept ${sc.kept}`
              : `screening ${order.length} sources`
            : input.phase === "hold"
              ? `shortlist ${kept} of ${order.length}`
              : `reading ${kept} sources`)
    ctx.font = `500 10px ${family}`
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = color.muted
    ctx.globalAlpha = 0.85
    ctx.fillText(text, 12, h - 11)
  }

  const draw = () => {
    if (!w || !h) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    if (bg) ctx.drawImage(bg, 0, 0, w, h)
    drawTrail()
    drawThreads()
    drawNodes()
    drawPulses()
    drawSpider()
    drawStamps()
    drawReadout()
    ctx.globalAlpha = 1
  }

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    step(dt)
    draw()
    raf = requestAnimationFrame(frame)
  }

  return {
    set,
    reset,
    resize,
    pointer: (x, y) => {
      pointerAt = x == null || y == null || still ? null : { x, y, at: time }
    },
    play: (on) => {
      if (still) return
      if (on && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else if (!on && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    },
    destroy: () => {
      cancelAnimationFrame(raf)
      raf = 0
    },
  }
}
