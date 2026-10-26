import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/**
 * Konkyo's docs: a static export (`out/`), served by one small static container, so
 * the site costs almost no memory on the server.
 */
/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
}

export default withMDX(config)
