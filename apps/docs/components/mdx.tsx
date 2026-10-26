import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { AnswerFlow } from "./answer-flow"
import { Diagram } from "./diagram"
import { FollowAnswer } from "./follow-answer"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AnswerFlow,
    Diagram,
    FollowAnswer,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
