import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { AnswerFlow } from "./answer-flow"
import { FollowAnswer } from "./follow-answer"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AnswerFlow,
    FollowAnswer,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
