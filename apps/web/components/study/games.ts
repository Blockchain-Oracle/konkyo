import type { SpaceWall } from "@konkyo/config"

/**
 * Each game has its own colour and wall, so a round
 * looks like the game it is. The accent marks the game's tile, tape and kicker dot; the wall is the
 * room the round is played in (light walls, so the black chrome stands off them, R15).
 */
export type GameId = "recall" | "fix" | "evidence" | "order" | "compare"

export const GAME_LOOK: Record<GameId, { accent: string; wall: SpaceWall; label: string }> = {
  recall: { accent: "#ffb02e", wall: "butter", label: "recall sprint" },
  fix: { accent: "#e9369d", wall: "blush", label: "fix the false statement" },
  evidence: { accent: "#7853ff", wall: "violet", label: "find the evidence" },
  order: { accent: "#13b8a6", wall: "mint", label: "order the steps" },
  compare: { accent: "#3f70ff", wall: "cobalt", label: "compare the sources" },
}

/** The game an item plays as, from its kind (a mixed round changes colour item by item). */
export function gameOfKind(kind: string): GameId {
  if (kind === "recall" || kind === "cloze") return "recall"
  if (kind === "truefalse") return "fix"
  if (kind === "evidence") return "evidence"
  if (kind === "order") return "order"
  return "compare"
}

/** The wall a round is played on: its game's, or lagoon for a mixed round and today's review. */
export function wallOfMode(mode: string): SpaceWall {
  return mode in GAME_LOOK ? GAME_LOOK[mode as GameId].wall : "lagoon"
}
