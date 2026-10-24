import { llms, loader } from "fumadocs-core/source"
import { metaSchema, pageSchema } from "fumadocs-core/source/schema"
import { defineDocs } from "fumadocs-mdx/macro"

const docs = defineDocs({
  dir: "content/docs",
  docs: { schema: pageSchema, postprocess: { includeProcessedMarkdown: true } },
  meta: { schema: metaSchema },
})

/** Every page in content/docs, at the site's root. */
export const source = loader({ baseUrl: "/", source: docs.toFumadocsSource(), plugins: [] })

/** The same pages as plain text for language models (/llms.txt). */
export const docsLlms = llms(source, {
  renderPage: async (page) =>
    `# ${page.data.title} (${page.url})\n\n${await page.data.getText("processed")}`,
})
