/**
 * How one answer is made and checked (plan §3), drawn in Dala's colours: amber for Zetaris (the
 * evidence store), verdant for what passed, and the Verifier's rewrite loop on the right.
 */

type Box = { y: number; title: string; lines: string[]; tone?: "zetaris" | "verified" }

const BOXES: Box[] = [
  {
    y: 16,
    title: "Planner",
    lines: ["Reads your corrections (H-MEM) first", "Plans 1–3 searches; flags comparisons"],
  },
  {
    y: 116,
    title: "Retriever",
    lines: ["pgvector + full text per query,", "fused by Reciprocal Rank Fusion"],
  },
  {
    y: 216,
    title: "Zetaris pre-check",
    lines: ["Are these documents in the evidence store?"],
    tone: "zetaris",
  },
  {
    y: 316,
    title: "Writer",
    lines: ["One finding per sentence, each with", "a citation and an exact quote"],
  },
  {
    y: 416,
    title: "Verifier",
    lines: [
      "Each quote checked in code, then all of them",
      "in ONE Zetaris statement; support judged",
    ],
    tone: "zetaris",
  },
  {
    y: 536,
    title: "Answer",
    lines: ["Only what passed. The rest is dropped,", "never shown as verified"],
    tone: "verified",
  },
  {
    y: 636,
    title: "Receipt + trace",
    lines: ["Steps, sources, SQL in the app;", "logs/<runId>.jsonl"],
  },
]

const X = 150
const W = 340
const H = 76

const stroke = { zetaris: "#ffb829", verified: "#15846e" } as const

export function AnswerFlow() {
  return (
    <figure className="not-prose my-8">
      <svg
        viewBox="0 0 700 730"
        className="h-auto w-full"
        role="img"
        aria-label="An answer's path: Planner, Retriever, Zetaris pre-check, Writer, Verifier with up to two rewrite rounds, then the answer, its receipt and trace. Comparisons also go to the Analyst, whose quotes Zetaris checks and whose stances go into the World Model."
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#bdbdbd" />
          </marker>
          <marker
            id="arrow-amber"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#ffb829" />
          </marker>
        </defs>

        {BOXES.slice(0, -1).map((box, i) => {
          const next = BOXES[i + 1] as Box
          return (
            <line
              key={box.title}
              x1={X + W / 2}
              y1={box.y + H}
              x2={X + W / 2}
              y2={next.y - 4}
              stroke="#bdbdbd"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
          )
        })}

        {BOXES.map((box) => (
          <g key={box.title}>
            <rect
              x={X}
              y={box.y}
              width={W}
              height={H}
              rx="14"
              fill="#0b0b0c"
              stroke={box.tone ? stroke[box.tone] : "rgba(255,255,255,0.22)"}
              strokeWidth="1.5"
            />
            <text x={X + 18} y={box.y + 26} fill="#ffffff" fontSize="16" fontWeight="500">
              {box.title}
            </text>
            {box.lines.map((line, j) => (
              <text key={line} x={X + 18} y={box.y + 47 + j * 17} fill="#9a9a9a" fontSize="13">
                {line}
              </text>
            ))}
          </g>
        ))}

        {/* The critique loop: rejected sentences go back to the Writer with reasons. */}
        <path
          d={`M ${X + W} ${416 + 38} C ${X + W + 90} ${416 + 38}, ${X + W + 90} ${316 + 38}, ${X + W + 6} ${316 + 38}`}
          fill="none"
          stroke="#ffb829"
          strokeWidth="1.5"
          markerEnd="url(#arrow-amber)"
        />
        <text x={X + W + 70} y="392" fill="#ffb829" fontSize="12">
          <tspan x={X + W + 74} dy="0">
            unsupported,
          </tspan>
          <tspan x={X + W + 74} dy="15">
            with reasons
          </tspan>
          <tspan x={X + W + 74} dy="15">
            (≤ 2 rewrites)
          </tspan>
        </text>

        {/* Comparisons: the Analyst, beside the Writer. */}
        <path
          d={`M ${X} ${116 + 38} C ${X - 70} ${116 + 38}, ${X - 70} 300, ${X - 70} 330`}
          fill="none"
          stroke="#bdbdbd"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
        />
        <rect
          x="8"
          y="334"
          width="128"
          height="124"
          rx="14"
          fill="#0b0b0c"
          stroke="#ffb829"
          strokeWidth="1.5"
        />
        <text x="22" y="358" fill="#ffffff" fontSize="15" fontWeight="500">
          Analyst
        </text>
        {[
          "claims × sources,",
          "quotes checked",
          "in Zetaris; stances",
          "kept in the",
          "World Model",
        ].map((line, j) => (
          <text key={line} x="22" y={378 + j * 16} fill="#9a9a9a" fontSize="12">
            {line}
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">
        Amber: checked against Zetaris. Green: only what passed reaches you.
      </figcaption>
    </figure>
  )
}
