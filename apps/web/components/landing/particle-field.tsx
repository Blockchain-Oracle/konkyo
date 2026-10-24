"use client"

import { LANDING } from "@konkyo/config"
import { useEffect, useRef } from "react"
import { type Clouds, makeClouds, place, random } from "./shapes"

/**
 * The landing's particle field (plan §8, after Dala's): one WebGL2 field of outlined triangles that
 * morphs into a new shape per section as you scroll: a brain, a scattered swarm, an open book,
 * the Konkyo mark. Sections say which shape they want with `data-stage` (0–3) and how bright with
 * `data-dim` (0–1). It mounts after the page has painted (the headline is the LCP); with reduced
 * motion it is a still brain; without WebGL2 it isn't drawn.
 */

const VERTEX = /* glsl */ `#version 300 es
in vec3 position;
in vec3 bary;
in vec3 aBrain;
in vec3 aSwarm;
in vec3 aBook;
in vec3 aMark;
in vec4 aRand;
in vec3 aColor;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uStage;
uniform float uTime;
uniform float uSize;
uniform float uOpacity;
out vec3 vBary;
out vec3 vColor;
out float vAlpha;

vec3 shape(int i) {
  if (i <= 0) return aBrain;
  if (i == 1) return aSwarm;
  if (i == 2) return aBook;
  return aMark;
}

void main() {
  float s = clamp(uStage, 0.0, 3.0);
  int from = int(floor(s));
  int to = min(from + 1, 3);
  // Each particle leaves a little after the one before it, so a shape dissolves and gathers.
  float t = clamp(fract(s) * 1.6 - aRand.z * 0.6, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(shape(from), shape(to), s >= 3.0 ? 1.0 : t);

  // A slow drift, so the field is never still.
  float ph = aRand.w * 6.2831;
  p += 0.012 * vec3(sin(uTime * 0.55 + ph), cos(uTime * 0.47 + ph * 1.3), sin(uTime * 0.39 + ph * 0.7));

  // Each triangle turns slowly in the screen plane.
  float a = aRand.x * 6.2831 + uTime * (aRand.y - 0.5) * 0.5;
  mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 corner = r * position.xy * uSize * (0.55 + aRand.y * 0.9);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += corner;
  gl_Position = projectionMatrix * mv;

  // The mark takes its own gradient (violet over verdant) as it forms.
  float markness = smoothstep(2.35, 3.0, uStage);
  vec3 gradient = mix(vec3(0.082, 0.518, 0.431), vec3(0.502, 0.322, 1.0), clamp(aMark.y * 0.5 + 0.55, 0.0, 1.0));
  vColor = mix(aColor, gradient, markness * 0.85);
  vBary = bary;
  // Nearer triangles are a little brighter; some are faint by nature.
  vAlpha = uOpacity * (0.45 + 0.55 * aRand.w) * clamp(1.0 + mv.z * 0.08 + 0.4, 0.35, 1.0);
}`

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec3 vBary;
in vec3 vColor;
in float vAlpha;
out vec4 color;
void main() {
  // Only the triangle's outline is drawn.
  float e = min(min(vBary.x, vBary.y), vBary.z);
  float w = fwidth(e);
  float line = 1.0 - smoothstep(0.07, 0.07 + w * 1.6, e);
  if (line < 0.02) discard;
  color = vec4(vColor * line, line * vAlpha);
}`

/** Dala's particle colours: white, violet, amber, teal, with magenta and blue accents. */
const PALETTE: [number, [number, number, number]][] = [
  [0.3, [1, 1, 1]],
  [0.25, [0.502, 0.322, 1]],
  [0.15, [1, 0.722, 0.161]],
  [0.15, [0.2, 0.624, 0.529]],
  [0.08, [0.761, 0.396, 0.667]],
  [0.07, [0.176, 0.424, 0.686]],
]

function colours(count: number) {
  const r = random(7)
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    let pick = r()
    let colour = PALETTE[0]?.[1] ?? [1, 1, 1]
    for (const [share, rgb] of PALETTE) {
      if (pick < share) {
        colour = rgb
        break
      }
      pick -= share
    }
    out.set(colour, i * 3)
  }
  return out
}

/** Where each shape sits for this screen: beside the hero text on wide screens, behind it on phones. */
function layout(clouds: Clouds, wide: boolean, aspect: number) {
  const half = Math.tan((35 / 2) * (Math.PI / 180)) * 5 // visible half-height at z = 0
  const width = half * aspect
  return wide
    ? {
        brain: place(clouds.brain, 1.25, width * 0.42, 0.05),
        swarm: clouds.swarm,
        book: place(clouds.book, 1.2, width * 0.38, -0.1),
        mark: place(clouds.mark, 0.78, 0, 0.42),
      }
    : {
        brain: place(clouds.brain, 0.8, 0, 0.7),
        swarm: clouds.swarm,
        book: place(clouds.book, 0.75, 0, 0.6),
        mark: place(clouds.mark, 0.6, 0, 0.6),
      }
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const test = document.createElement("canvas").getContext("webgl2")
    if (!test) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const phone = window.matchMedia("(max-width: 767px)").matches
    let stopped = false
    let cleanup: () => void = () => {}

    // After the page has painted: the headline comes first.
    const start = async () => {
      const { Camera, Geometry, Mesh, Program, Renderer, Transform } = await import("ogl")
      if (stopped) return
      const count = phone ? LANDING.particles.phone : LANDING.particles.desktop
      const renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: true,
        webgl: 2,
        dpr: Math.min(
          window.devicePixelRatio,
          phone ? LANDING.maxPixelRatio.phone : LANDING.maxPixelRatio.desktop,
        ),
      })
      const gl = renderer.gl
      gl.clearColor(0, 0, 0, 0)
      const camera = new Camera(gl, { fov: 35, near: 0.1, far: 50 })
      camera.position.z = 5
      const scene = new Transform()

      const clouds = makeClouds(count)
      const rand = random(3)
      const extras = new Float32Array(count * 4).map(() => rand())
      const placed = layout(
        clouds,
        window.innerWidth >= 1024,
        window.innerWidth / window.innerHeight,
      )
      const h = Math.sqrt(3) / 2
      const geometry = new Geometry(gl, {
        position: {
          size: 3,
          data: new Float32Array([0, h * 0.667, 0, -0.5, -h * 0.333, 0, 0.5, -h * 0.333, 0]),
        },
        bary: { size: 3, data: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) },
        aBrain: { size: 3, instanced: 1, data: placed.brain },
        aSwarm: { size: 3, instanced: 1, data: placed.swarm },
        aBook: { size: 3, instanced: 1, data: placed.book },
        aMark: { size: 3, instanced: 1, data: placed.mark },
        aRand: { size: 4, instanced: 1, data: extras },
        aColor: { size: 3, instanced: 1, data: colours(count) },
      })
      const program = new Program(gl, {
        vertex: VERTEX,
        fragment: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        cullFace: false,
        uniforms: {
          uStage: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: phone ? 0.03 : 0.022 },
          uOpacity: { value: 0 },
        },
      })
      // Additive: overlapping outlines glow, as on Dala's black.
      program.setBlendFunc(gl.SRC_ALPHA, gl.ONE)
      new Mesh(gl, { geometry, program }).setParent(scene)

      // Positions depend on the screen's shape (and which side the text is on), so they're redone.
      const resize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight)
        camera.perspective({ aspect: gl.canvas.width / gl.canvas.height })
        const placed = layout(
          clouds,
          window.innerWidth >= 1024,
          window.innerWidth / window.innerHeight,
        )
        const targets = { aBrain: placed.brain, aBook: placed.book, aMark: placed.mark }
        for (const [name, data] of Object.entries(targets)) {
          const attribute = geometry.attributes[name]
          if (!attribute) continue
          attribute.data = data
          attribute.needsUpdate = true
        }
      }
      resize()
      window.addEventListener("resize", resize)

      // The stage and brightness the page asks for, from the section at the screen's middle.
      const sections = [...document.querySelectorAll<HTMLElement>("[data-stage]")]
      const target = { stage: 0, opacity: 1 }
      const readSection = () => {
        const middle = window.innerHeight * 0.5
        for (const section of sections) {
          const box = section.getBoundingClientRect()
          if (box.top <= middle && box.bottom >= middle) {
            target.stage = Number(section.dataset.stage ?? 0)
            // Below 1024px the field sits behind the text, so it is dimmer.
            target.opacity =
              Number(section.dataset.dim ?? 1) * (window.innerWidth >= 1024 ? 1 : 0.6)
            return
          }
        }
      }
      readSection()
      if (!still) window.addEventListener("scroll", readSection, { passive: true })

      const pointer = { x: 0, y: 0 }
      const onPointer = (e: PointerEvent) => {
        pointer.x = e.clientX / window.innerWidth - 0.5
        pointer.y = e.clientY / window.innerHeight - 0.5
      }
      if (!still) window.addEventListener("pointermove", onPointer, { passive: true })

      let frame = 0
      let last = performance.now()
      const uniforms = program.uniforms as Record<string, { value: number }>
      const draw = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        const time = now / 1000
        const ease = 1 - Math.exp(-dt * 1.8)
        const u = (name: string) => uniforms[name] as { value: number }
        u("uStage").value += (target.stage - u("uStage").value) * ease
        u("uOpacity").value += (target.opacity - u("uOpacity").value) * (1 - Math.exp(-dt * 2.5))
        u("uTime").value = time
        scene.rotation.y +=
          (pointer.x * 0.35 + Math.sin(time * 0.15) * 0.18 - scene.rotation.y) * ease
        scene.rotation.x += (pointer.y * 0.18 - scene.rotation.x) * ease
        renderer.render({ scene, camera })
        frame = requestAnimationFrame(draw)
      }

      // Development only: draw one frame at a given stage (a hidden tab runs no frames).
      if (process.env.NODE_ENV === "development")
        (window as unknown as Record<string, unknown>).konkyoField = (
          stage: number,
          opacity = 1,
        ) => {
          ;(uniforms.uStage as { value: number }).value = stage
          ;(uniforms.uOpacity as { value: number }).value = opacity
          target.stage = stage
          target.opacity = opacity
          renderer.render({ scene, camera })
        }

      if (still) {
        // One frame of the brain, redrawn only when the window changes size.
        const u = uniforms
        ;(u.uOpacity as { value: number }).value = 1
        renderer.render({ scene, camera })
        const redraw = () => {
          resize()
          renderer.render({ scene, camera })
        }
        window.addEventListener("resize", redraw)
        cleanup = () => window.removeEventListener("resize", redraw)
      } else {
        frame = requestAnimationFrame(draw)
        // Paused while the tab is hidden.
        const onVisibility = () => {
          cancelAnimationFrame(frame)
          if (!document.hidden) {
            last = performance.now()
            frame = requestAnimationFrame(draw)
          }
        }
        document.addEventListener("visibilitychange", onVisibility)
        cleanup = () => {
          cancelAnimationFrame(frame)
          document.removeEventListener("visibilitychange", onVisibility)
          window.removeEventListener("scroll", readSection)
          window.removeEventListener("pointermove", onPointer)
        }
      }
      const previous = cleanup
      cleanup = () => {
        previous()
        window.removeEventListener("resize", resize)
        gl.getExtension("WEBGL_lose_context")?.loseContext()
      }
    }

    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200))
    const handle = idle(() => void start())
    return () => {
      stopped = true
      if (window.cancelIdleCallback && typeof handle === "number") window.cancelIdleCallback(handle)
      cleanup()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-svh w-full"
    />
  )
}
