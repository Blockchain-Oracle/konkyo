import { execFile } from "node:child_process"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { INGEST } from "@konkyo/config"
import type { Word } from "./transcript"
import { UnreachableError } from "./web"

const exec = promisify(execFile)

export { isYouTube } from "@konkyo/config"

type Json3 = {
  events?: {
    tStartMs?: number
    dDurationMs?: number
    segs?: { utf8?: string; tOffsetMs?: number }[]
  }[]
}

/**
 * YouTube by URL: yt-dlp fetches the existing captions (manual first, then auto-generated) with
 * timestamps. With no captions it returns the audio for Scribe. YouTube sometimes refuses
 * datacenter IPs; that becomes "Couldn't reach" with "Upload the video file instead".
 */
export async function fetchYouTube(url: string): Promise<{
  title: string
  duration: number
  words?: Word[]
  audio?: { bytes: Uint8Array; name: string }
}> {
  const dir = await mkdtemp(join(tmpdir(), "konkyo-yt-"))
  try {
    const base = ["--no-playlist", "--no-warnings", "--user-agent", INGEST.userAgent]
    let info: { title?: string; duration?: number }
    try {
      const { stdout } = await exec(
        "yt-dlp",
        [...base, "--dump-single-json", "--skip-download", url],
        {
          maxBuffer: 64 * 1024 * 1024,
          timeout: INGEST.fetchTimeoutMs * 2,
        },
      )
      info = JSON.parse(stdout)
    } catch (error) {
      throw new UnreachableError(
        `YouTube refused the request: ${(error as Error).message.slice(0, 200)}`,
      )
    }
    const title = info.title ?? "YouTube video"
    const duration = info.duration ?? 0
    await exec(
      "yt-dlp",
      [
        ...base,
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "en.*,en",
        "--sub-format",
        "json3",
        "-o",
        join(dir, "v.%(ext)s"),
        url,
      ],
      { timeout: INGEST.fetchTimeoutMs * 2 },
    ).catch(() => undefined)
    const subs = (await readdir(dir)).filter((f) => f.endsWith(".json3"))
    // Prefer manual captions (no ".en-orig"/auto markers) over automatic ones.
    const pick = subs.sort((a, b) => Number(a.includes("orig")) - Number(b.includes("orig")))[0]
    if (pick) {
      const json: Json3 = JSON.parse(await readFile(join(dir, pick), "utf8"))
      const words: Word[] = []
      for (const event of json.events ?? []) {
        const start = (event.tStartMs ?? 0) / 1000
        const end = start + (event.dDurationMs ?? 0) / 1000
        for (const seg of event.segs ?? []) {
          const text = seg.utf8?.replace(/\s+/g, " ").trim()
          if (!text) continue
          const at = start + (seg.tOffsetMs ?? 0) / 1000
          for (const token of text.split(" ")) words.push({ text: token, start: at, end })
        }
      }
      if (words.length) return { title, duration, words }
    }
    await exec(
      "yt-dlp",
      [...base, "-f", "bestaudio[ext=m4a]/bestaudio", "-o", join(dir, "a.%(ext)s"), url],
      {
        timeout: INGEST.fetchTimeoutMs * 10,
      },
    ).catch((error) => {
      throw new UnreachableError(
        `YouTube refused the audio download: ${(error as Error).message.slice(0, 200)}`,
      )
    })
    const audioName = (await readdir(dir)).find((f) => f.startsWith("a."))
    if (!audioName) throw new UnreachableError("YouTube returned no audio")
    return {
      title,
      duration,
      audio: { bytes: new Uint8Array(await readFile(join(dir, audioName))), name: audioName },
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
