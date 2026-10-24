import { APP } from "@konkyo/config"
import type { MetadataRoute } from "next"

/** Crawl the public pages; the API is for the app. Public spaces carry their own `noindex`. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${APP.url}/sitemap.xml`,
  }
}
