import { route } from "@/lib/api"
import { searchStyles } from "@/lib/csl"

/** Citation styles for the export picker: common ones, or any by name. */
export const GET = route(async ({ request }) => ({
  styles: await searchStyles(new URL(request.url).searchParams.get("q") ?? ""),
}))
