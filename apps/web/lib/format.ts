/*
 * One formatter per thing (gap #30–#32), for server and browser alike: a moment in a recording,
 * where a citation points, and the words of a failed request.
 */

/** m:ss for a moment in a recording, a brief or a round. */
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

/** Where a citation points: "p. 12" in a document, "4:05" in a recording, or nothing. */
export const whereIs = (at: { page: number | null; tStart: number | null }) =>
  at.page != null ? `p. ${at.page}` : at.tStart != null ? clock(at.tStart) : ""

/** The server's own words for a failed request (it answers `{ error }`), not the raw body. */
export function errorText(error: Error) {
  try {
    return (JSON.parse(error.message) as { error?: string }).error ?? error.message
  } catch {
    return error.message
  }
}
