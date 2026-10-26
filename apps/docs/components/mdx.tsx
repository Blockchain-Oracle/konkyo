import { Accordion, Accordions } from "fumadocs-ui/components/accordion"
import { File, Files, Folder } from "fumadocs-ui/components/files"
import { ImageZoom } from "fumadocs-ui/components/image-zoom"
import { Step, Steps } from "fumadocs-ui/components/steps"
import * as TabsComponents from "fumadocs-ui/components/tabs"
import { TypeTable } from "fumadocs-ui/components/type-table"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import type { ComponentProps } from "react"
import { AnswerFlow } from "./answer-flow"
import { Diagram } from "./diagram"
import { FollowAnswer } from "./follow-answer"
import { LogoRow } from "./logo-row"
import { Phone, Phones, Shot } from "./phone"
import { Run } from "./run"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...TabsComponents,
    Accordion,
    Accordions,
    Step,
    Steps,
    TypeTable,
    File,
    Files,
    Folder,
    // Every Markdown image can be clicked to zoom.
    img: (props: ComponentProps<"img">) => (
      <ImageZoom {...(props as ComponentProps<typeof ImageZoom>)} />
    ),
    AnswerFlow,
    Diagram,
    FollowAnswer,
    LogoRow,
    Phone,
    Phones,
    Shot,
    Run,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
