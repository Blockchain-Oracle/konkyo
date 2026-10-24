/**
 * The landing's particle shapes (plan §8): a brain, a scattered swarm, an open book and the
 * Konkyo mark, as point clouds. Each shape is drawn on a small canvas (its silhouette filled, its
 * outline and details stroked) and sampled; the strokes get a share of the points so the shape
 * reads at a glance, the fill gives it body, and depth makes it turn in 3D.
 */

const SIZE = 256

/** A small seeded generator, so the shapes are the same on every load. */
export function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Draw = (ctx: CanvasRenderingContext2D) => void

function pixels(draw: Draw, mode: "fill" | "stroke", width = 3): [number, number][] {
  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return []
  ctx.fillStyle = "#fff"
  ctx.strokeStyle = "#fff"
  ctx.lineWidth = width
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  draw(ctx)
  if (mode === "fill") ctx.fill()
  else ctx.stroke()
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  const out: [number, number][] = []
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if ((data[(y * SIZE + x) * 4 + 3] ?? 0) > 128) out.push([x, y])
  return out
}

type ShapeSpec = {
  fill: Draw
  strokes: Draw
  /** Share of points on the strokes (the rest fill the silhouette). */
  edgeShare: number
  /** Depth for a point, from its normalised position and whether it's on a stroke. */
  depth: (x: number, y: number, edge: boolean, r: () => number) => number
}

function sample(spec: ShapeSpec, count: number, seed: number) {
  const r = random(seed)
  const fill = pixels(spec.fill, "fill")
  const edges = pixels(spec.strokes, "stroke", 2.4)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const edge = r() < spec.edgeShare && edges.length > 0
    const pool = edge ? edges : fill
    const [px, py] = pool[Math.floor(r() * pool.length)] ?? [SIZE / 2, SIZE / 2]
    // Jitter within the pixel, then to -1…1 with y up.
    const x = ((px + r()) / SIZE) * 2 - 1
    const y = -(((py + r()) / SIZE) * 2 - 1)
    out[i * 3] = x
    out[i * 3 + 1] = y
    out[i * 3 + 2] = spec.depth(x, y, edge, r)
  }
  return out
}

// ------------------------------------------------------------------ brain (side view, facing left)

const brainOutline: Draw = (c) => {
  c.moveTo(52, 150)
  c.bezierCurveTo(34, 128, 36, 92, 62, 72)
  c.bezierCurveTo(84, 52, 118, 40, 150, 44)
  c.bezierCurveTo(186, 46, 214, 62, 228, 88)
  c.bezierCurveTo(242, 112, 240, 140, 226, 156)
  c.bezierCurveTo(220, 162, 214, 164, 210, 165)
  c.bezierCurveTo(222, 176, 214, 198, 192, 200)
  c.bezierCurveTo(178, 201, 168, 196, 162, 190)
  c.lineTo(160, 214)
  c.bezierCurveTo(158, 224, 146, 226, 142, 214)
  c.lineTo(140, 184)
  c.bezierCurveTo(126, 180, 102, 182, 84, 176)
  c.bezierCurveTo(70, 172, 58, 164, 52, 150)
  c.closePath()
}

const brainDetails: Draw = (c) => {
  brainOutline(c)
  const curves: number[][] = [
    // The lateral fissure, the central sulcus, then gyri.
    [92, 150, 118, 136, 146, 132, 176, 128],
    [140, 46, 134, 72, 142, 96, 132, 124],
    [70, 96, 88, 90, 100, 104, 116, 96],
    [76, 124, 90, 116, 104, 128, 118, 118],
    [100, 66, 108, 82, 122, 76, 126, 92],
    [160, 60, 170, 80, 190, 78, 200, 96],
    [152, 96, 164, 106, 176, 98, 188, 108],
    [184, 112, 196, 124, 214, 118, 222, 134],
    [100, 162, 118, 156, 132, 164, 146, 156],
    [150, 148, 168, 154, 186, 148, 204, 154],
    [196, 172, 204, 178, 210, 184, 212, 190],
    [184, 176, 192, 184, 196, 190, 196, 198],
  ]
  for (const [x0, y0, x1, y1, x2, y2, x3, y3] of curves) {
    c.moveTo(x0 as number, y0 as number)
    c.bezierCurveTo(
      x1 as number,
      y1 as number,
      x2 as number,
      y2 as number,
      x3 as number,
      y3 as number,
    )
  }
}

const BRAIN: ShapeSpec = {
  fill: brainOutline,
  strokes: brainDetails,
  edgeShare: 0.62,
  // A rounded volume, deepest in the middle and thin at the rim. The folds lie on the surface
  // facing the viewer, so they read as lines; the fill is spread through the volume.
  depth: (x, y, edge, r) => {
    const rim = Math.max(0, 1 - (x * x) / 0.9 - ((y - 0.05) * (y - 0.05)) / 0.6)
    const z = Math.sqrt(rim) * 0.55
    if (edge) return z * (0.92 + r() * 0.08)
    return (r() < 0.5 ? -1 : 1) * z * r()
  },
}

// ------------------------------------------------------------------ open book

const pages: Draw = (c) => {
  c.moveTo(128, 196)
  c.bezierCurveTo(104, 184, 64, 182, 28, 192)
  c.lineTo(34, 84)
  c.bezierCurveTo(66, 74, 104, 78, 128, 92)
  c.closePath()
  c.moveTo(128, 196)
  c.bezierCurveTo(152, 184, 192, 182, 228, 192)
  c.lineTo(222, 84)
  c.bezierCurveTo(190, 74, 152, 78, 128, 92)
  c.closePath()
}

const bookDetails: Draw = (c) => {
  pages(c)
  c.moveTo(128, 92)
  c.lineTo(128, 196)
  // Lines of text on each page, following the page's curve.
  for (let i = 0; i < 6; i++) {
    const y = 104 + i * 14
    c.moveTo(46, y + 2)
    c.bezierCurveTo(70, y - 4, 96, y - 2, 116, y + 6)
    c.moveTo(140, y + 6)
    c.bezierCurveTo(160, y - 2, 186, y - 4, 210, y + 2)
  }
  // The page block underneath.
  c.moveTo(28, 192)
  c.bezierCurveTo(64, 186, 104, 190, 128, 204)
  c.bezierCurveTo(152, 190, 192, 186, 228, 192)
}

const BOOK: ShapeSpec = {
  fill: pages,
  strokes: bookDetails,
  edgeShare: 0.55,
  // Pages curve away from the spine.
  depth: (x, _y, _edge, r) => -0.35 * x * x + (r() - 0.5) * 0.06,
}

// ------------------------------------------------------------------ the Konkyo mark (木)

const markShape: Draw = (c) => {
  c.rect(16, 60, 224, 36)
  c.rect(110, 12, 36, 228)
  c.moveTo(96, 116)
  c.lineTo(96, 144)
  c.lineTo(40, 240)
  c.lineTo(0, 240)
  c.closePath()
  c.moveTo(160, 116)
  c.lineTo(160, 144)
  c.lineTo(216, 240)
  c.lineTo(256, 240)
  c.closePath()
}

const MARK: ShapeSpec = {
  // Filled as one union (no even-odd holes where strokes cross).
  fill: (c) => markShape(c),
  strokes: markShape,
  edgeShare: 0.45,
  depth: (_x, _y, _edge, r) => (r() - 0.5) * 0.12,
}

/** The sparse ambient field: everywhere, at many depths. */
function swarm(count: number, seed: number) {
  const r = random(seed)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    out[i * 3] = (r() * 2 - 1) * 2.6
    out[i * 3 + 1] = (r() * 2 - 1) * 1.5
    out[i * 3 + 2] = (r() * 2 - 1) * 1.4
  }
  return out
}

export type Clouds = {
  brain: Float32Array
  swarm: Float32Array
  book: Float32Array
  mark: Float32Array
}

export function makeClouds(count: number): Clouds {
  return {
    brain: sample(BRAIN, count, 11),
    swarm: swarm(count, 23),
    book: sample(BOOK, count, 37),
    mark: sample(MARK, count, 41),
  }
}

/** Places a cloud: scaled and moved (in place on a copy), so the layout can change on resize. */
export function place(cloud: Float32Array, scale: number, dx: number, dy: number) {
  const out = new Float32Array(cloud.length)
  for (let i = 0; i < cloud.length; i += 3) {
    out[i] = (cloud[i] as number) * scale + dx
    out[i + 1] = (cloud[i + 1] as number) * scale + dy
    out[i + 2] = (cloud[i + 2] as number) * scale
  }
  return out
}
